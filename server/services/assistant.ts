// Asistente con IA (Claude): responde preguntas sobre el negocio consultando los datos
// reales con herramientas de solo lectura. Las cifras salen siempre de las herramientas.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { all, get } from '../db/db.js';
import { addDays, monthRange, today } from '../lib/clock.js';
import { round2 } from '../lib/util.js';
import { getSettings } from './settings.js';
import { listOrders, PAID_SQL } from './orders.js';
import { expensesBetween, pendingToCollect, revenueBetween } from './finance.js';
import { listItems } from './inventory.js';
import { Catalog, recipeCost } from './catalog.js';
import { ingredientForecast, productionPlan, productProfitability } from './insights.js';
import { STATUS_LABELS, type OrderStatus } from '../../shared/constants.js';

export const AI_MODEL = 'claude-opus-5-5';
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const DELIVERED_DAY = `COALESCE(substr(o.delivered_at, 1, 10), o.delivery_date)`;
const ORDER_STATUSES = Object.keys(STATUS_LABELS) as [OrderStatus, ...OrderStatus[]];

// ---------------------------------------------------------------------------
// Herramientas (todas de solo lectura)
// ---------------------------------------------------------------------------

interface ToolDef {
  label: string; // lo que ve el usuario mientras se consulta
  description: string;
  schema: z.ZodTypeAny;
  input_schema: Anthropic.Beta.BetaTool['input_schema'];
  run: (input: any) => Promise<unknown>;
}

const daysSchema = (def: number, max: number) => z.object({ dias: z.number().int().min(1).max(max).default(def) });

export const TOOLS: Record<string, ToolDef> = {
  resumen_negocio: {
    label: 'Mirando el resumen del negocio',
    description:
      'Resumen del día y del mes en curso: pedidos de hoy, mañana, semana y atrasados; facturado, gastos y beneficio del mes; pendiente de cobrar; artículos con poco stock.',
    schema: z.object({}),
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      const t = today();
      const { from, to } = monthRange(t.slice(0, 7));
      const count = async (where: string, params: unknown[]) =>
        (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM orders o WHERE o.status NOT IN ('cancelado','entregado') AND ${where}`, params))!.n;
      const revenue = await revenueBetween(from, to);
      const expenses = await expensesBetween(from, to);
      const low = (await listItems()).filter((i) => i.low);
      return {
        hoy: t,
        pedidos_hoy: await count('o.delivery_date = ?', [t]),
        pedidos_manana: await count('o.delivery_date = ?', [addDays(t, 1)]),
        pedidos_proximos_7_dias: await count('o.delivery_date BETWEEN ? AND ?', [t, addDays(t, 6)]),
        pedidos_atrasados: await count('o.delivery_date < ?', [t]),
        sin_confirmar: (await get<{ n: number }>("SELECT COUNT(*) AS n FROM orders WHERE status = 'nuevo'"))!.n,
        mes: { desde: from, hasta: to, facturado: revenue.total, pedidos_entregados: revenue.orders_count, ventas_mostrador: revenue.direct_sales, gastos: expenses, beneficio: round2(revenue.total - expenses) },
        pendiente_de_cobrar: await pendingToCollect(),
        poco_stock: low.map((i) => `${i.name}: ${round2(i.quantity)} ${i.unit} (mínimo ${i.min_stock})`),
      };
    },
  },

  buscar_pedidos: {
    label: 'Buscando pedidos',
    description:
      'Lista pedidos filtrando por fecha de entrega, estado, cliente, producto o si deben dinero. Devuelve número, cliente, fecha y hora de entrega, estado, productos, total, pagado y pendiente.',
    schema: z.object({
      desde: DATE.optional(),
      hasta: DATE.optional(),
      estado: z.enum(ORDER_STATUSES).optional(),
      cliente: z.string().max(100).optional(),
      producto: z.string().max(100).optional(),
      solo_pendientes_de_cobro: z.boolean().optional(),
      limite: z.number().int().min(1).max(100).default(40),
    }),
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'Fecha de entrega desde (AAAA-MM-DD)' },
        hasta: { type: 'string', description: 'Fecha de entrega hasta (AAAA-MM-DD)' },
        estado: { type: 'string', enum: ORDER_STATUSES, description: 'Estado del pedido' },
        cliente: { type: 'string', description: 'Parte del nombre o teléfono del cliente' },
        producto: { type: 'string', description: 'Parte del nombre de un producto' },
        solo_pendientes_de_cobro: { type: 'boolean', description: 'Solo pedidos con dinero pendiente' },
        limite: { type: 'integer', description: 'Máximo de pedidos (por defecto 40)' },
      },
      additionalProperties: false,
    },
    run: async (i) => {
      const where: string[] = ['1=1'];
      const params: unknown[] = [];
      if (i.desde) (where.push('o.delivery_date >= ?'), params.push(i.desde));
      if (i.hasta) (where.push('o.delivery_date <= ?'), params.push(i.hasta));
      if (i.estado) (where.push('o.status = ?'), params.push(i.estado));
      if (i.cliente) (where.push('(norm(o.customer_name) LIKE norm(?) OR digits(o.customer_phone) LIKE ?)'), params.push(`%${i.cliente}%`, `%${i.cliente.replace(/\D/g, '') || '¬'}%`));
      if (i.producto) (where.push('EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id AND norm(x.product_name) LIKE norm(?))'), params.push(`%${i.producto}%`));
      if (i.solo_pendientes_de_cobro) where.push(`o.status <> 'cancelado' AND o.total - ${PAID_SQL} > 0.005`);
      const rows = await listOrders(where.join(' AND '), params, 'o.delivery_date DESC, o.delivery_time DESC');
      return {
        total_encontrados: rows.length,
        pedidos: rows.slice(0, i.limite).map((o) => ({
          numero: o.number,
          cliente: o.customer_name,
          entrega: `${o.delivery_date}${o.delivery_time ? ` ${o.delivery_time}` : ''}`,
          tipo: o.delivery_type === 'delivery' ? 'a domicilio' : 'recogida',
          estado: STATUS_LABELS[o.status as OrderStatus],
          productos: o.summary,
          total: o.total,
          pagado: o.paid,
          pendiente: o.pending,
          alergias: o.allergens,
        })),
      };
    },
  },

  ventas: {
    label: 'Calculando ventas',
    description:
      'Ventas (pedidos entregados) en un periodo, agrupadas por producto, categoría, cliente, día o mes. Incluye el total facturado del periodo con ventas de mostrador.',
    schema: z.object({ desde: DATE, hasta: DATE, agrupar_por: z.enum(['producto', 'categoria', 'cliente', 'dia', 'mes']).default('producto') }),
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'AAAA-MM-DD' },
        hasta: { type: 'string', description: 'AAAA-MM-DD' },
        agrupar_por: { type: 'string', enum: ['producto', 'categoria', 'cliente', 'dia', 'mes'] },
      },
      required: ['desde', 'hasta'],
      additionalProperties: false,
    },
    run: async (i) => {
      const range = [i.desde, i.hasta];
      const base = `FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'entregado' AND ${DELIVERED_DAY} BETWEEN ? AND ?`;
      let rows: unknown[];
      if (i.agrupar_por === 'producto')
        rows = await all(`SELECT oi.product_name AS producto, SUM(oi.quantity) AS unidades, ROUND(SUM(oi.line_total)::numeric, 2) AS importe ${base} GROUP BY 1 ORDER BY 3 DESC LIMIT 50`, range);
      else if (i.agrupar_por === 'categoria')
        rows = await all(`SELECT COALESCE(p.category, 'otros') AS categoria, SUM(oi.quantity) AS unidades, ROUND(SUM(oi.line_total)::numeric, 2) AS importe FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id WHERE o.status = 'entregado' AND ${DELIVERED_DAY} BETWEEN ? AND ? GROUP BY 1 ORDER BY 3 DESC`, range);
      else if (i.agrupar_por === 'cliente')
        rows = await all(`SELECT o.customer_name AS cliente, COUNT(*) AS pedidos, ROUND(SUM(o.total)::numeric, 2) AS importe FROM orders o WHERE o.status = 'entregado' AND ${DELIVERED_DAY} BETWEEN ? AND ? GROUP BY 1 ORDER BY 3 DESC LIMIT 50`, range);
      else {
        const key = i.agrupar_por === 'mes' ? `substr(${DELIVERED_DAY}, 1, 7)` : DELIVERED_DAY;
        rows = await all(`SELECT ${key} AS periodo, COUNT(*) AS pedidos, ROUND(SUM(o.total)::numeric, 2) AS importe FROM orders o WHERE o.status = 'entregado' AND ${DELIVERED_DAY} BETWEEN ? AND ? GROUP BY 1 ORDER BY 1`, range);
      }
      const total = await revenueBetween(i.desde, i.hasta);
      return {
        periodo: { desde: i.desde, hasta: i.hasta },
        facturado_total: total.total,
        pedidos_entregados: total.orders_count,
        ventas_mostrador: total.direct_sales,
        nota: 'Por producto/categoría se suman los importes de las líneas (sin envío).',
        filas: rows,
      };
    },
  },

  gastos: {
    label: 'Revisando gastos',
    description: 'Gastos de un periodo: total, por tipo y los mayores.',
    schema: z.object({ desde: DATE, hasta: DATE }),
    input_schema: {
      type: 'object',
      properties: { desde: { type: 'string', description: 'AAAA-MM-DD' }, hasta: { type: 'string', description: 'AAAA-MM-DD' } },
      required: ['desde', 'hasta'],
      additionalProperties: false,
    },
    run: async (i) => ({
      total: await expensesBetween(i.desde, i.hasta),
      por_tipo: await all('SELECT category AS tipo, ROUND(SUM(amount)::numeric, 2) AS importe FROM expenses WHERE date BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC', [i.desde, i.hasta]),
      mayores: await all('SELECT date AS fecha, description AS concepto, category AS tipo, amount AS importe, supplier AS proveedor FROM expenses WHERE date BETWEEN ? AND ? ORDER BY amount DESC LIMIT 15', [i.desde, i.hasta]),
    }),
  },

  inventario: {
    label: 'Consultando el inventario',
    description: 'Stock actual de ingredientes y materiales (cantidad, unidad, mínimo, precio, proveedor). Se puede buscar por nombre o pedir solo lo que está bajo mínimos.',
    schema: z.object({ buscar: z.string().max(100).optional(), solo_bajo_stock: z.boolean().optional() }),
    input_schema: {
      type: 'object',
      properties: { buscar: { type: 'string', description: 'Parte del nombre' }, solo_bajo_stock: { type: 'boolean' } },
      additionalProperties: false,
    },
    run: async (i) => {
      const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      let items = await listItems();
      if (i.buscar) items = items.filter((x) => norm(x.name).includes(norm(i.buscar)));
      if (i.solo_bajo_stock) items = items.filter((x) => x.low);
      return {
        articulos: items.slice(0, 80).map((x) => ({
          nombre: x.name,
          tipo: x.kind === 'material' ? 'material' : 'ingrediente',
          stock: round2(x.quantity),
          unidad: x.unit,
          minimo: x.min_stock,
          precio_por_unidad: x.cost_per_unit,
          proveedor: x.supplier,
          bajo_minimo: x.low,
        })),
      };
    },
  },

  clientes: {
    label: 'Mirando los clientes',
    description: 'Clientes con número de pedidos, dinero gastado, deuda y último pedido. Se puede buscar por nombre y ordenar.',
    schema: z.object({ buscar: z.string().max(100).optional(), ordenar_por: z.enum(['gasto', 'pedidos', 'deuda', 'reciente']).default('gasto'), limite: z.number().int().min(1).max(50).default(15) }),
    input_schema: {
      type: 'object',
      properties: {
        buscar: { type: 'string' },
        ordenar_por: { type: 'string', enum: ['gasto', 'pedidos', 'deuda', 'reciente'] },
        limite: { type: 'integer' },
      },
      additionalProperties: false,
    },
    run: async (i) => {
      const order = { gasto: 'gastado DESC', pedidos: 'pedidos DESC', deuda: 'deuda DESC', reciente: 'ultimo_pedido DESC NULLS LAST' }[i.ordenar_por as 'gasto'];
      return {
        clientes: await all(
          `SELECT * FROM (
             SELECT c.name AS nombre, c.phone AS telefono, c.birthday AS cumpleanos,
                    COUNT(o.id) FILTER (WHERE o.status <> 'cancelado') AS pedidos,
                    ROUND(COALESCE(SUM(o.total) FILTER (WHERE o.status = 'entregado'), 0)::numeric, 2) AS gastado,
                    ROUND(COALESCE(SUM(GREATEST(o.total - ${PAID_SQL}, 0)) FILTER (WHERE o.status <> 'cancelado'), 0)::numeric, 2) AS deuda,
                    MAX(o.delivery_date) AS ultimo_pedido
               FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
              WHERE (? = '' OR norm(c.name) LIKE norm(?))
              GROUP BY c.id) t
            ORDER BY ${order} LIMIT ?`,
          [i.buscar ?? '', `%${i.buscar ?? ''}%`, i.limite],
        ),
      };
    },
  },

  recetas: {
    label: 'Consultando recetas',
    description: 'Recetas con raciones, tiempos, ingredientes y coste.',
    schema: z.object({ buscar: z.string().max(100).optional() }),
    input_schema: { type: 'object', properties: { buscar: { type: 'string' } }, additionalProperties: false },
    run: async (i) => {
      const cat = await Catalog.load();
      const recipes = await all<{ id: number }>('SELECT id FROM recipes WHERE (? = \'\' OR norm(name) LIKE norm(?)) ORDER BY name LIMIT 20', [i.buscar ?? '', `%${i.buscar ?? ''}%`]);
      return {
        recetas: recipes.map(({ id }) => {
          const r = cat.recipe(id)!;
          const c = recipeCost(r);
          return {
            nombre: r.name,
            raciones: r.servings,
            preparacion_min: r.prep_minutes,
            horno_min: r.bake_minutes,
            ingredientes: r.ingredients.map((x) => `${x.quantity} ${x.unit} ${x.item.name}`),
            coste: c.total,
            coste_por_racion: c.cost_per_serving,
          };
        }),
      };
    },
  },

  prevision_ingredientes: {
    label: 'Calculando qué ingredientes harán falta',
    description:
      'Previsión de ingredientes y materiales para los próximos días: lo que piden los pedidos apuntados, el consumo medio de las últimas 8 semanas, cuántos días dura el stock, qué faltará y cuánto comprar.',
    schema: daysSchema(14, 60),
    input_schema: { type: 'object', properties: { dias: { type: 'integer', description: 'Días a prever (por defecto 14)' } }, additionalProperties: false },
    run: async (i) => ingredientForecast(i.dias),
  },

  rentabilidad_productos: {
    label: 'Analizando la rentabilidad de los productos',
    description:
      'Coste, precio, beneficio y margen de cada producto y tamaño, ventas del periodo y avisos (pierde dinero, margen bajo, precio por debajo del recomendado, sin escandallo, no se vende).',
    schema: daysSchema(90, 365),
    input_schema: { type: 'object', properties: { dias: { type: 'integer', description: 'Días de ventas a mirar (por defecto 90)' } }, additionalProperties: false },
    run: async (i) => productProfitability(i.dias),
  },

  plan_produccion: {
    label: 'Preparando el plan de producción',
    description:
      'Plan día a día para los próximos días: pedidos a producir, productos, minutos de trabajo estimados, recetas que se pueden hacer juntas para varios pedidos y faltas de ingredientes por día.',
    schema: daysSchema(7, 21),
    input_schema: { type: 'object', properties: { dias: { type: 'integer', description: 'Días a planificar (por defecto 7)' } }, additionalProperties: false },
    run: async (i) => productionPlan(i.dias),
  },
};

const API_TOOLS: Anthropic.Beta.BetaTool[] = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  input_schema: t.input_schema,
  eager_input_streaming: true,
}));

function systemPrompt(businessName: string, date: string, timezone: string) {
  return `Eres el asistente de gestión de «${businessName}», una pequeña repostería. Hablas con la persona que la lleva, en español de España, de tú, con un tono cercano y profesional.

Hoy es ${date} (zona horaria ${timezone}).

Cómo trabajas:
- Para cualquier dato del negocio (pedidos, ventas, clientes, inventario, costes, producción) consulta primero las herramientas. No inventes cifras, nombres ni fechas: si un dato no está en las herramientas, dilo.
- Si la pregunta es ambigua sobre fechas («este mes», «la semana pasada»), interprétala tú con la fecha de hoy y di qué periodo has usado.
- Para prever ingredientes usa prevision_ingredientes; para productos poco rentables, rentabilidad_productos; para organizar el trabajo, plan_produccion. Combina herramientas si hace falta.
- Al proponer un plan de producción, ordénalo por días, empieza por lo que se entrega antes, agrupa las recetas que se repiten en varios pedidos, avisa de lo que hay que comprar antes y del día más cargado.
- Al hablar de rentabilidad, explica por qué un producto rinde poco (coste alto, precio bajo, poca venta) y propone algo concreto (subir el precio a una cifra, revisar el escandallo, empujar los que más dejan).
- No puedes crear ni cambiar datos: si te piden hacerlo, explica dónde se hace en la aplicación.

Formato de las respuestas (se leen en el móvil):
- Breves y al grano: primero la respuesta, después el detalle.
- Importes en euros con coma decimal (12,50 €) y fechas en lenguaje natural (jueves 9 de octubre).
- Usa listas con guiones y **negrita** para lo importante. No uses tablas ni encabezados grandes.`;
}

// ---------------------------------------------------------------------------
// Bucle del asistente
// ---------------------------------------------------------------------------

export type AssistantEvent =
  | { type: 'tool'; label: string }
  | { type: 'text'; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export const chatSchema = z.object({
  question: z.string().trim().min(1, 'Escribe una pregunta').max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8000) }))
    .max(20)
    .default([]),
});

const MAX_ROUNDS = 8;
const MAX_RESULT_CHARS = 40_000;

/**
 * Responde una pregunta. `withData` ejecuta una función con acceso a los datos de la
 * pastelería (cada consulta en su propia transacción, para no tenerla abierta mientras
 * la IA piensa).
 */
export async function runAssistant(
  input: z.infer<typeof chatSchema>,
  withData: <T>(fn: () => Promise<T>) => Promise<T>,
  emit: (e: AssistantEvent) => void,
  signal?: AbortSignal,
) {
  const client = new Anthropic();
  const { business_name, timezone } = await withData(async () => getSettings());
  const date = await withData(async () => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone }).format(new Date()) + ` (${today()})`);
  const system = systemPrompt(business_name, date, timezone);

  // Turnos anteriores solo como texto; dentro de esta pregunta el historial es de solo añadir.
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...input.history.filter((m) => m.text.trim()).map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: input.question },
  ];

  let jsonRetries = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = client.beta.messages.stream(
      {
        model: AI_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system,
        tools: API_TOOLS,
        messages,
      },
      { signal },
    );
    stream.on('text', (delta) => emit({ type: 'text', delta }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError || signal?.aborted || jsonRetries++ >= 2) throw err;
      continue; // entrada de herramienta ilegible: se repite el turno
    }

    if (message.stop_reason === 'refusal') {
      emit({ type: 'text', delta: '\n\nNo puedo ayudarte con esa petición.' });
      break;
    }
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }
    const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!uses.length) break;
    if (message.stop_reason === 'max_tokens') throw new Error('Respuesta demasiado larga');

    messages.push({ role: 'assistant', content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const tool = TOOLS[use.name];
      if (!tool) {
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Herramienta desconocida: ${use.name}` });
        continue;
      }
      const parsed = tool.schema.safeParse(use.input ?? {});
      if (!parsed.success) {
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: `Datos no válidos: ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}` });
        continue;
      }
      emit({ type: 'tool', label: tool.label });
      try {
        let text = JSON.stringify(await withData(() => tool.run(parsed.data)));
        if (text.length > MAX_RESULT_CHARS) text = `${text.slice(0, MAX_RESULT_CHARS)}… (recortado)`;
        results.push({ type: 'tool_result', tool_use_id: use.id, content: text });
      } catch (e) {
        console.error('Herramienta del asistente', use.name, e);
        results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: 'Error al consultar los datos' });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  emit({ type: 'done' });
}

/** Mensaje comprensible para los errores de la API. */
export function assistantErrorMessage(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return 'La clave de la IA no es válida. Revísala en la configuración del servidor.';
  if (err instanceof Anthropic.RateLimitError) return 'La IA está saturada en este momento. Prueba otra vez en un minuto.';
  if (err instanceof Anthropic.APIConnectionError) return 'No se ha podido conectar con la IA. Prueba otra vez.';
  if (err instanceof Anthropic.APIError) return 'La IA no ha podido responder. Prueba otra vez en un momento.';
  return 'No se ha podido completar la respuesta.';
}
