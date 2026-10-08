// Asistente: análisis automáticos (sin IA) y chat con IA que responde en directo.
import { Router, type Request, type Response } from 'express';
import { h, inTenant } from '../http.js';
import { HttpError } from '../lib/util.js';
import { aiEnabled, assistantErrorMessage, chatSchema, runAssistant, type AssistantEvent } from '../services/assistant.js';
import { ingredientForecast, productionPlan, productProfitability } from '../services/insights.js';

export const assistantRouter = Router();

const days = (req: Request, def: number, max: number) => Math.min(max, Math.max(1, Number(req.query.days) || def));

assistantRouter.get('/assistant/status', h(() => ({ ai: aiEnabled() })));
assistantRouter.get('/assistant/forecast', h((req) => ingredientForecast(days(req, 14, 60))));
assistantRouter.get('/assistant/profitability', h((req) => productProfitability(days(req, 90, 365))));
assistantRouter.get('/assistant/plan', h((req) => productionPlan(days(req, 7, 21))));

// Límite de preguntas por pastelería y día (en memoria de cada servidor): evita gastos sin control.
const DAILY_LIMIT = Number(process.env.ASSISTANT_DAILY_LIMIT) || 60;
const usage = new Map<number, { day: string; n: number }>();
function countQuestion(tenantId: number) {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(tenantId);
  if (!u || u.day !== day) usage.set(tenantId, { day, n: 1 });
  else if (++u.n > DAILY_LIMIT) throw new HttpError(429, `Has llegado al máximo de ${DAILY_LIMIT} preguntas por hoy. Mañana podrás seguir.`);
}

assistantRouter.post('/assistant/chat', async (req: Request, res: Response, next) => {
  try {
    if (!aiEnabled()) throw new HttpError(503, 'El asistente con IA no está activado todavía.');
    const input = chatSchema.parse(req.body);
    const tenant = req.tenant!;
    countQuestion(tenant.id);

    // Respuesta en directo (eventos del servidor): el texto aparece mientras se escribe.
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const emit = (e: AssistantEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    try {
      await runAssistant(input, (fn) => inTenant(tenant, () => fn()), emit, abort.signal);
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error('Asistente', err);
        emit({ type: 'error', message: assistantErrorMessage(err) });
      }
    }
    res.end();
  } catch (e) {
    next(e);
  }
});
