// Datos iniciales: artículos básicos o un negocio de ejemplo completo para probar la aplicación.
import { all, get, insert, run } from './db.js';
import { addDays, addMonths, today } from '../lib/clock.js';
import { adjustStock, createItem } from '../services/inventory.js';
import { saveProduct, saveRecipe } from '../services/catalogCrud.js';
import { createCustomer } from '../services/customers.js';
import { addPayment, createOrder, setStatus, toggleTask } from '../services/orders.js';
import { saveQuote } from '../services/quotes.js';
import { Catalog } from '../services/catalog.js';
import { lineSchema, linesTotal, normalizeLines, saveLines } from '../services/lines.js';
import type { OrderStatus, Unit } from '../../shared/constants.js';

type ItemDef = [
  name: string,
  kind: 'ingredient' | 'material',
  unit: Unit,
  quantity: number,
  min: number,
  cost: number,
  pack: number | null,
  allergens: string[],
  supplier?: string,
];

const ITEMS: ItemDef[] = [
  ['Harina de trigo', 'ingredient', 'kg', 12, 3, 0.9, 1, ['gluten'], 'Makro'],
  ['Azúcar', 'ingredient', 'kg', 10, 3, 1.1, 1, [], 'Makro'],
  ['Azúcar glas', 'ingredient', 'kg', 5, 1, 1.8, 1, [], 'Makro'],
  ['Huevos', 'ingredient', 'ud', 90, 24, 0.25, 12, ['huevo'], 'Granja Los Robles'],
  ['Mantequilla', 'ingredient', 'kg', 5, 1, 9.5, 0.25, ['leche'], 'Makro'],
  ['Leche entera', 'ingredient', 'l', 6, 2, 0.95, 1, ['leche'], 'Mercadona'],
  ['Nata para montar 35%', 'ingredient', 'l', 5, 2, 4.2, 1, ['leche'], 'Makro'],
  ['Chocolate negro 70%', 'ingredient', 'kg', 4, 1, 12, 0.5, ['leche', 'soja'], 'Chocolates Valor'],
  ['Cacao en polvo', 'ingredient', 'kg', 1.5, 0.5, 8.5, 0.5, [], 'Makro'],
  ['Queso crema', 'ingredient', 'kg', 6, 1, 7.8, 1, ['leche'], 'Makro'],
  ['Levadura química', 'ingredient', 'g', 500, 100, 0.012, 100, [], 'Mercadona'],
  ['Esencia de vainilla', 'ingredient', 'ml', 250, 50, 0.08, 100, [], 'Amazon'],
  ['Aceite de girasol', 'ingredient', 'l', 3, 1, 2.2, 1, [], 'Mercadona'],
  ['Suero de mantequilla', 'ingredient', 'l', 2, 0.5, 2.5, 1, ['leche'], 'Makro'],
  ['Colorante rojo', 'ingredient', 'ml', 80, 20, 0.15, 30, [], 'Amazon'],
  ['Galletas digestive', 'ingredient', 'kg', 2, 0.5, 3.5, 0.4, ['gluten'], 'Mercadona'],
  ['Fondant blanco', 'ingredient', 'kg', 2.5, 0.5, 8, 1, [], 'Amazon'],
  ['Nueces', 'ingredient', 'kg', 0.8, 0.3, 14, 0.2, ['frutos_secos'], 'Makro'],
  ['Fresas', 'ingredient', 'kg', 1, 0, 4.5, 0.5, [], 'Frutería Paqui'],
  ['Mermelada de frambuesa', 'ingredient', 'kg', 1, 0.3, 6, 0.5, [], 'Makro'],
  ['Sal', 'ingredient', 'kg', 1, 0, 0.5, 1, [], 'Mercadona'],
  ['Caja tarta pequeña', 'material', 'ud', 15, 5, 0.9, 10, [], 'Envases Pastry'],
  ['Caja tarta grande', 'material', 'ud', 8, 5, 1.6, 10, [], 'Envases Pastry'],
  ['Base de cartón dorada', 'material', 'ud', 30, 10, 0.45, 10, [], 'Envases Pastry'],
  ['Cápsulas de cupcake', 'material', 'ud', 300, 100, 0.03, 100, [], 'Envases Pastry'],
  ['Caja 6 cupcakes', 'material', 'ud', 20, 6, 1.1, 10, [], 'Envases Pastry'],
  ['Bolsa galleta individual', 'material', 'ud', 200, 50, 0.06, 100, [], 'Envases Pastry'],
  ['Velas', 'material', 'ud', 60, 20, 0.15, 24, [], 'Amazon'],
  ['Topper personalizado', 'material', 'ud', 6, 2, 1.5, 1, [], 'Imprenta Rápida'],
];

export async function seedBasics() {
  // Artículos más habituales, sin stock: el negocio solo tiene que poner cantidades y precios.
  for (const [name, kind, unit, , , cost, pack, allergens] of ITEMS) {
    await createItem({ name, kind, unit, quantity: 0, min_stock: 0, cost_per_unit: cost, pack_size: pack, allergens }, null);
  }
}

// Generador pseudoaleatorio determinista para que la demo sea siempre igual.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export async function seedDemo(userId: number) {
  const ids: Record<string, number> = {};
  for (const [name, kind, unit, quantity, min, cost, pack, allergens, supplier] of ITEMS) {
    ids[name] = await createItem(
      { name, kind, unit, quantity, min_stock: min, cost_per_unit: cost, pack_size: pack, allergens, supplier },
      userId,
    );
  }
  const ing = (name: string, quantity: number, unit: Unit) => ({ item_id: ids[name], quantity, unit });

  // ---------------- Recetas ----------------
  const R: Record<string, number> = {};
  R.choco = await saveRecipe({
    name: 'Bizcocho de chocolate',
    category: 'Bizcochos',
    servings: 10,
    prep_minutes: 25,
    bake_minutes: 40,
    temperature: 175,
    sale_price: 28,
    ingredients: [
      ing('Harina de trigo', 250, 'g'),
      ing('Azúcar', 250, 'g'),
      ing('Cacao en polvo', 60, 'g'),
      ing('Huevos', 4, 'ud'),
      ing('Mantequilla', 150, 'g'),
      ing('Leche entera', 200, 'ml'),
      ing('Levadura química', 10, 'g'),
      ing('Sal', 2, 'g'),
    ],
    steps: [
      'Precalentar el horno a 175 °C y engrasar el molde.',
      'Batir la mantequilla con el azúcar hasta que blanquee.',
      'Añadir los huevos de uno en uno, batiendo bien.',
      'Tamizar la harina, el cacao, la levadura y la sal.',
      'Incorporar los secos alternando con la leche, sin batir en exceso.',
      'Hornear 40 minutos o hasta que el palillo salga limpio. Enfriar sobre rejilla.',
    ],
  });
  R.ganache = await saveRecipe({
    name: 'Ganache de chocolate',
    category: 'Rellenos y coberturas',
    servings: 10,
    prep_minutes: 15,
    ingredients: [ing('Chocolate negro 70%', 300, 'g'), ing('Nata para montar 35%', 300, 'ml'), ing('Mantequilla', 30, 'g')],
    steps: [
      'Calentar la nata hasta que empiece a hervir.',
      'Verter sobre el chocolate troceado y esperar 1 minuto.',
      'Remover desde el centro hasta emulsionar y añadir la mantequilla.',
      'Dejar templar antes de rellenar o cubrir.',
    ],
  });
  R.redvelvet = await saveRecipe({
    name: 'Bizcocho Red Velvet',
    category: 'Bizcochos',
    servings: 10,
    prep_minutes: 30,
    bake_minutes: 35,
    temperature: 170,
    ingredients: [
      ing('Harina de trigo', 300, 'g'),
      ing('Azúcar', 300, 'g'),
      ing('Cacao en polvo', 15, 'g'),
      ing('Huevos', 3, 'ud'),
      ing('Aceite de girasol', 250, 'ml'),
      ing('Suero de mantequilla', 240, 'ml'),
      ing('Colorante rojo', 15, 'ml'),
      ing('Esencia de vainilla', 5, 'ml'),
      ing('Levadura química', 8, 'g'),
    ],
    steps: [
      'Precalentar el horno a 170 °C.',
      'Mezclar los huevos con el azúcar y el aceite.',
      'Añadir el suero, la vainilla y el colorante.',
      'Incorporar la harina, el cacao y la levadura tamizados.',
      'Repartir en 2 moldes y hornear 35 minutos.',
    ],
  });
  R.frosting = await saveRecipe({
    name: 'Frosting de queso crema',
    category: 'Rellenos y coberturas',
    servings: 10,
    prep_minutes: 10,
    ingredients: [
      ing('Queso crema', 400, 'g'),
      ing('Mantequilla', 100, 'g'),
      ing('Azúcar glas', 250, 'g'),
      ing('Esencia de vainilla', 5, 'ml'),
    ],
    steps: ['Batir la mantequilla a punto pomada con el azúcar glas.', 'Añadir el queso crema frío y batir solo hasta integrar.'],
  });
  R.cupcakes = await saveRecipe({
    name: 'Cupcakes de vainilla',
    category: 'Cupcakes',
    servings: 12,
    prep_minutes: 20,
    bake_minutes: 20,
    temperature: 180,
    ingredients: [
      ing('Harina de trigo', 200, 'g'),
      ing('Azúcar', 180, 'g'),
      ing('Mantequilla', 120, 'g'),
      ing('Huevos', 2, 'ud'),
      ing('Leche entera', 120, 'ml'),
      ing('Esencia de vainilla', 5, 'ml'),
      ing('Levadura química', 8, 'g'),
    ],
    steps: [
      'Precalentar el horno a 180 °C y poner las cápsulas en la bandeja.',
      'Batir mantequilla y azúcar, añadir huevos y vainilla.',
      'Añadir harina y levadura alternando con la leche.',
      'Llenar las cápsulas 2/3 y hornear 20 minutos.',
    ],
  });
  R.buttercream = await saveRecipe({
    name: 'Buttercream de vainilla',
    category: 'Rellenos y coberturas',
    servings: 12,
    prep_minutes: 10,
    ingredients: [
      ing('Mantequilla', 250, 'g'),
      ing('Azúcar glas', 400, 'g'),
      ing('Leche entera', 30, 'ml'),
      ing('Esencia de vainilla', 5, 'ml'),
    ],
    steps: ['Batir la mantequilla 5 minutos.', 'Añadir el azúcar glas poco a poco y la leche hasta que quede cremosa.'],
  });
  R.galletas = await saveRecipe({
    name: 'Galletas de mantequilla',
    category: 'Galletas',
    servings: 30,
    prep_minutes: 40,
    bake_minutes: 12,
    temperature: 180,
    ingredients: [
      ing('Harina de trigo', 500, 'g'),
      ing('Mantequilla', 250, 'g'),
      ing('Azúcar glas', 180, 'g'),
      ing('Huevos', 1, 'ud'),
      ing('Esencia de vainilla', 5, 'ml'),
    ],
    steps: [
      'Mezclar la mantequilla con el azúcar glas, añadir el huevo y la vainilla.',
      'Añadir la harina y formar una masa. Refrigerar 30 minutos.',
      'Estirar a 5 mm, cortar con los cortadores y hornear 12 minutos a 180 °C.',
    ],
  });
  R.glasa = await saveRecipe({
    name: 'Glasa real',
    category: 'Rellenos y coberturas',
    servings: 30,
    prep_minutes: 20,
    ingredients: [ing('Azúcar glas', 400, 'g'), ing('Huevos', 1, 'ud')],
    steps: ['Batir la clara con el azúcar glas hasta conseguir picos firmes.', 'Colorear y ajustar la consistencia con agua.'],
  });
  R.brownie = await saveRecipe({
    name: 'Brownie de chocolate y nueces',
    category: 'Brownies',
    servings: 12,
    prep_minutes: 20,
    bake_minutes: 25,
    temperature: 180,
    sale_price: 28,
    ingredients: [
      ing('Chocolate negro 70%', 250, 'g'),
      ing('Mantequilla', 200, 'g'),
      ing('Azúcar', 250, 'g'),
      ing('Huevos', 4, 'ud'),
      ing('Harina de trigo', 100, 'g'),
      ing('Nueces', 100, 'g'),
    ],
    steps: [
      'Fundir el chocolate con la mantequilla.',
      'Batir los huevos con el azúcar e incorporar el chocolate.',
      'Añadir la harina y las nueces troceadas.',
      'Hornear 25 minutos a 180 °C: el centro debe quedar jugoso.',
    ],
  });
  R.cheesecake = await saveRecipe({
    name: 'Tarta de queso al horno',
    category: 'Cheesecakes',
    servings: 10,
    prep_minutes: 25,
    bake_minutes: 60,
    temperature: 160,
    ingredients: [
      ing('Queso crema', 750, 'g'),
      ing('Nata para montar 35%', 200, 'ml'),
      ing('Azúcar', 200, 'g'),
      ing('Huevos', 4, 'ud'),
      ing('Harina de trigo', 30, 'g'),
      ing('Galletas digestive', 200, 'g'),
      ing('Mantequilla', 80, 'g'),
    ],
    steps: [
      'Triturar las galletas con la mantequilla fundida y forrar la base del molde.',
      'Batir el queso con el azúcar, añadir los huevos, la nata y la harina.',
      'Hornear 60 minutos a 160 °C y dejar enfriar dentro del horno.',
      'Refrigerar al menos 6 horas.',
    ],
  });

  // ---------------- Catálogo ----------------
  const P: Record<string, number> = {};
  const recipe = (id: number, quantity = 1) => ({ recipe_id: id, quantity });
  const mat = (name: string, quantity: number, size_index: number | null = null, per_serving = false, unit?: Unit) => ({
    item_id: ids[name],
    quantity,
    unit: unit ?? (ITEMS.find((i) => i[0] === name)![2] as Unit),
    size_index,
    per_serving,
  });
  const extrasTarta = [
    { name: 'Velas', price: 1 },
    { name: 'Topper personalizado', price: 6 },
    { name: 'Mensaje en chocolate', price: 3 },
  ];
  P.choco = await saveProduct({
    name: 'Tarta de chocolate',
    category: 'tartas',
    description: 'Bizcocho húmedo de chocolate relleno y cubierto de ganache. La favorita de la casa.',
    unit_label: 'tarta',
    servings: 12,
    labor_minutes: 30,
    other_costs: 0.5,
    flavors: ['Chocolate negro', 'Chocolate con leche'],
    fillings: ['Ganache', 'Crema de avellana', 'Frambuesa'],
    coverings: ['Ganache', 'Buttercream', 'Naked (sin cobertura)'],
    extras: extrasTarta,
    sizes: [
      { name: 'Pequeña (6-8 pers.)', servings: 8, price: 24 },
      { name: 'Mediana (10-12 pers.)', servings: 12, price: 34 },
      { name: 'Grande (18-20 pers.)', servings: 20, price: 52 },
    ],
    components: [
      recipe(R.choco),
      recipe(R.ganache),
      mat('Caja tarta pequeña', 1, 0),
      mat('Caja tarta pequeña', 1, 1),
      mat('Caja tarta grande', 1, 2),
      mat('Base de cartón dorada', 1),
    ],
  });
  P.redvelvet = await saveProduct({
    name: 'Tarta Red Velvet',
    category: 'tartas',
    description: 'Bizcocho rojo aterciopelado con frosting de queso crema.',
    unit_label: 'tarta',
    servings: 12,
    labor_minutes: 35,
    other_costs: 0.5,
    flavors: ['Red Velvet'],
    fillings: ['Frosting de queso', 'Frosting de queso y frutos rojos'],
    coverings: ['Frosting de queso', 'Semi-naked'],
    extras: extrasTarta,
    sizes: [
      { name: 'Mediana (10-12 pers.)', servings: 12, price: 38 },
      { name: 'Grande (18-20 pers.)', servings: 20, price: 58 },
    ],
    components: [
      recipe(R.redvelvet),
      recipe(R.frosting),
      mat('Caja tarta pequeña', 1, 0),
      mat('Caja tarta grande', 1, 1),
      mat('Base de cartón dorada', 1),
    ],
  });
  P.custom = await saveProduct({
    name: 'Tarta personalizada',
    category: 'tartas_personalizadas',
    description: 'Diseño a medida en fondant o buttercream: cumpleaños, bautizos, comuniones… Precio por ración.',
    unit_label: 'tarta',
    pricing: 'serving',
    base_price: 4.5,
    servings: 15,
    labor_minutes: 120,
    other_costs: 1,
    flavors: ['Chocolate', 'Vainilla', 'Red Velvet', 'Limón'],
    fillings: ['Ganache', 'Buttercream', 'Frosting de queso', 'Frambuesa', 'Dulce de leche'],
    coverings: ['Fondant', 'Buttercream', 'Naked'],
    extras: [
      { name: 'Figura de fondant', price: 10 },
      { name: 'Foto comestible', price: 8 },
      { name: 'Topper personalizado', price: 6 },
      { name: 'Velas', price: 1 },
    ],
    components: [
      recipe(R.choco),
      recipe(R.buttercream),
      mat('Fondant blanco', 20, null, true, 'g'),
      mat('Caja tarta grande', 1),
      mat('Base de cartón dorada', 1),
    ],
  });
  P.cupcakes = await saveProduct({
    name: 'Cupcakes',
    category: 'cupcakes',
    description: 'Cupcakes esponjosos con buttercream. Sueltos o en caja.',
    unit_label: 'ud',
    servings: 1,
    flavors: ['Vainilla', 'Chocolate', 'Red Velvet', 'Limón'],
    coverings: ['Buttercream de vainilla', 'Buttercream de chocolate', 'Frosting de queso'],
    extras: [
      { name: 'Decoración temática', price: 6 },
      { name: 'Toppers', price: 4 },
    ],
    labor_minutes: 2,
    sizes: [
      { name: 'Unidad', servings: 1, price: 3 },
      { name: 'Caja de 6', servings: 6, price: 16 },
      { name: 'Caja de 12', servings: 12, price: 30 },
    ],
    components: [
      recipe(R.cupcakes),
      recipe(R.buttercream),
      mat('Cápsulas de cupcake', 1, null, true),
      mat('Caja 6 cupcakes', 1, 1),
      mat('Caja 6 cupcakes', 2, 2),
    ],
  });
  P.galletas = await saveProduct({
    name: 'Galletas personalizadas',
    category: 'galletas',
    description: 'Galletas de mantequilla decoradas con glasa, en bolsita individual.',
    unit_label: 'ud',
    base_price: 2.5,
    servings: 1,
    labor_minutes: 3,
    flavors: ['Mantequilla', 'Chocolate', 'Limón'],
    extras: [{ name: 'Caja regalo', price: 3 }],
    components: [recipe(R.galletas), recipe(R.glasa), mat('Bolsa galleta individual', 1)],
  });
  P.brownie = await saveProduct({
    name: 'Brownie',
    category: 'brownies',
    description: 'Brownie jugoso de chocolate negro con nueces.',
    unit_label: 'ud',
    servings: 1,
    labor_minutes: 1.5,
    flavors: ['Chocolate y nueces', 'Chocolate (sin nueces)'],
    sizes: [
      { name: 'Porción', servings: 1, price: 2.8 },
      { name: 'Bandeja 12 porciones', servings: 12, price: 28 },
    ],
    components: [recipe(R.brownie)],
  });
  P.cheesecake = await saveProduct({
    name: 'Tarta de queso',
    category: 'cheesecakes',
    description: 'Tarta de queso al horno, cremosa por dentro, con base de galleta.',
    unit_label: 'tarta',
    servings: 10,
    labor_minutes: 20,
    flavors: ['Clásica', 'Con frutos rojos'],
    coverings: ['Sin cobertura', 'Mermelada de frambuesa'],
    sizes: [
      { name: 'Mediana (8-10 pers.)', servings: 10, price: 30 },
      { name: 'Grande (14-16 pers.)', servings: 16, price: 45 },
    ],
    components: [recipe(R.cheesecake), mat('Caja tarta pequeña', 1, 0), mat('Caja tarta grande', 1, 1), mat('Base de cartón dorada', 1)],
  });
  P.pack = await saveProduct({
    name: 'Pack desayuno sorpresa',
    category: 'packs',
    description: '4 cupcakes, 4 brownies y 6 galletas decoradas en caja regalo. Ideal para regalar.',
    unit_label: 'pack',
    base_price: 35,
    servings: 14,
    labor_minutes: 30,
    other_costs: 2,
    components: [
      { recipe_id: R.cupcakes, quantity: 0.29 },
      { recipe_id: R.buttercream, quantity: 0.29 },
      { recipe_id: R.brownie, quantity: 0.29 },
      { recipe_id: R.galletas, quantity: 0.43 },
      mat('Caja tarta grande', 1),
    ],
  });

  // ---------------- Clientes ----------------
  const t = today();
  const bday = (offset: number) => `--${addDays(t, offset).slice(5)}`;
  const C: Record<string, number> = {};
  const customers: [string, string, Record<string, unknown>][] = [
    ['marta', 'Marta García', { phone: '612 345 678', email: 'marta.garcia@email.com', address: 'C/ Mayor 12, 2ºB', birthday: bday(3), preferences: 'Le encanta el chocolate negro. Siempre pide velas.' }],
    ['laura', 'Laura Sánchez', { phone: '623 456 789', email: 'laura.s@email.com', preferences: 'Prefiere decoraciones sencillas, tonos pastel.' }],
    ['javier', 'Javier López', { phone: '634 567 890', address: 'Av. de la Constitución 45' }],
    ['ana', 'Ana Martín', { phone: '645 678 901', allergens: ['frutos_secos'], notes: 'Su hijo es alérgico a los frutos secos. ¡Cuidado con la contaminación cruzada!' }],
    ['carmen', 'Carmen Ruiz', { phone: '656 789 012', birthday: '1975-' + addDays(t, 40).slice(5) }],
    ['pablo', 'Pablo Fernández', { phone: '667 890 123', email: 'pablo.f@email.com' }],
    ['lucia', 'Lucía Gómez', { phone: '678 901 234', address: 'C/ Rosales 8' }],
    ['olivo', 'Restaurante El Olivo', { phone: '952 123 456', email: 'pedidos@elolivo.es', address: 'Plaza del Carmen 3', notes: 'Cliente de empresa. Factura a fin de mes.' }],
  ];
  for (const [key, name, extra] of customers) {
    C[key] = await createCustomer({
      name,
      phone: null,
      email: null,
      address: null,
      birthday: null,
      allergens: [],
      preferences: null,
      notes: null,
      ...extra,
    } as any);
  }
  const customerRows = new Map((await all('SELECT id, name, phone, address FROM customers')).map((c) => [c.id, c]));
  const cust = (k: string) => customerRows.get(C[k]);
  const sizeRows = await all<{ id: number; product_id: number }>('SELECT id, product_id FROM product_sizes ORDER BY product_id, sort, id');
  const size = (productId: number, index: number) => sizeRows.filter((r) => r.product_id === productId)[index].id;

  // ---------------- Pedidos ----------------
  interface DemoOrder {
    history?: boolean;
    c: string;
    day: number;
    time?: string;
    status: OrderStatus;
    items: Record<string, unknown>[];
    delivery?: boolean;
    deposit?: number;
    paidAll?: boolean;
    allergens?: string[];
    notes?: string;
    tasksDone?: string[];
  }

  const demo: DemoOrder[] = [
    { c: 'carmen', day: -20, time: '12:00', status: 'entregado', paidAll: true, items: [{ product_id: P.cheesecake, size_id: size(P.cheesecake, 0), quantity: 1, flavor: 'Clásica' }] },
    { c: 'javier', day: -12, time: '18:00', status: 'entregado', paidAll: true, items: [{ product_id: P.cupcakes, size_id: size(P.cupcakes, 2), quantity: 2, flavor: 'Chocolate', coverage: 'Buttercream de chocolate' }] },
    { c: 'lucia', day: -7, time: '13:00', status: 'entregado', deposit: 40, items: [{ product_id: P.custom, quantity: 1, servings: 20, flavor: 'Vainilla', filling: 'Frambuesa', coverage: 'Fondant', decoration: 'Tema selva con animales de fondant', custom_text: 'Feliz cumple Hugo', extras: [{ name: 'Figura de fondant', price: 10 }] }] },
    { c: 'olivo', day: -5, time: '10:00', status: 'entregado', paidAll: true, delivery: true, items: [{ product_id: P.cheesecake, size_id: size(P.cheesecake, 1), quantity: 2, flavor: 'Con frutos rojos', coverage: 'Mermelada de frambuesa' }] },
    { c: 'pablo', day: -3, time: '17:00', status: 'entregado', paidAll: true, items: [{ product_id: P.brownie, size_id: size(P.brownie, 1), quantity: 1, flavor: 'Chocolate y nueces' }] },
    { c: 'carmen', day: -2, time: '12:00', status: 'cancelado', deposit: 10, notes: 'Cancelado por la clienta. Se queda la señal.', items: [{ product_id: P.choco, size_id: size(P.choco, 0), quantity: 1 }] },
    { c: 'ana', day: -1, time: '19:00', status: 'terminado', deposit: 10, allergens: ['frutos_secos'], items: [{ product_id: P.choco, size_id: size(P.choco, 0), quantity: 1, flavor: 'Chocolate con leche', filling: 'Ganache', coverage: 'Ganache' }] },
    { c: 'laura', day: 0, time: '11:00', status: 'terminado', deposit: 15, items: [{ product_id: P.redvelvet, size_id: size(P.redvelvet, 0), quantity: 1, flavor: 'Red Velvet', filling: 'Frosting de queso', coverage: 'Semi-naked', decoration: 'Flores naturales y frutos rojos', custom_text: 'Feliz 30, Laura', extras: [{ name: 'Velas', price: 1 }] }] },
    { c: 'carmen', day: 0, time: '17:30', status: 'en_preparacion', deposit: 30, delivery: true, tasksDone: ['preparar', 'hornear'], items: [{ product_id: P.galletas, quantity: 30, flavor: 'Mantequilla', decoration: 'Bautizo: patucos y nubes en azul y blanco', custom_text: 'Leo 12·10' }] },
    { c: 'marta', day: 1, time: '17:00', status: 'en_preparacion', deposit: 20, tasksDone: ['preparar', 'hornear', 'rellenar'], notes: 'Recoge su marido.', items: [{ product_id: P.choco, size_id: size(P.choco, 2), quantity: 1, flavor: 'Chocolate negro', filling: 'Crema de avellana', coverage: 'Ganache', decoration: 'Virutas de chocolate y frambuesas', custom_text: 'Felicidades papá', extras: [{ name: 'Velas', price: 1 }, { name: 'Mensaje en chocolate', price: 3 }] }] },
    { c: 'javier', day: 1, time: '10:00', status: 'confirmado', items: [{ product_id: P.cupcakes, size_id: size(P.cupcakes, 2), quantity: 1, flavor: 'Chocolate', coverage: 'Buttercream de chocolate', decoration: 'Tema fútbol' , extras: [{ name: 'Decoración temática', price: 6 }] }] },
    { c: 'pablo', day: 2, time: '12:30', status: 'confirmado', deposit: 40, delivery: true, items: [{ product_id: P.custom, quantity: 1, servings: 25, flavor: 'Chocolate', filling: 'Dulce de leche', coverage: 'Fondant', decoration: 'Unicornio con melena de colores pastel', custom_text: 'Sofía 6 años', extras: [{ name: 'Figura de fondant', price: 10 }, { name: 'Velas', price: 1 }] }] },
    { c: 'lucia', day: 3, time: '18:00', status: 'nuevo', items: [{ product_id: P.brownie, size_id: size(P.brownie, 1), quantity: 2, flavor: 'Chocolate y nueces' }] },
    { c: 'olivo', day: 4, time: '09:30', status: 'confirmado', delivery: true, notes: 'Entregar por la puerta de cocina.', items: [{ product_id: P.cheesecake, size_id: size(P.cheesecake, 1), quantity: 3, flavor: 'Clásica' }] },
    { c: 'ana', day: 6, time: '17:00', status: 'confirmado', deposit: 10, allergens: ['frutos_secos'], notes: 'SIN frutos secos. Usar utensilios limpios.', items: [{ product_id: P.cupcakes, size_id: size(P.cupcakes, 1), quantity: 2, flavor: 'Vainilla', coverage: 'Buttercream de vainilla', decoration: 'Tonos rosa y dorado' }] },
    { c: 'laura', day: 9, time: '10:00', status: 'nuevo', delivery: true, items: [{ product_id: P.pack, quantity: 1, notes: 'Es un regalo: no poner precio en la caja.' }] },
  ];

  // Histórico de meses anteriores para las gráficas de finanzas.
  const rand = rng(42);
  const pastProducts: [number, number | null][] = [
    [P.choco, size(P.choco, 1)],
    [P.choco, size(P.choco, 2)],
    [P.redvelvet, size(P.redvelvet, 0)],
    [P.cheesecake, size(P.cheesecake, 0)],
    [P.cheesecake, size(P.cheesecake, 1)],
    [P.cupcakes, size(P.cupcakes, 2)],
    [P.brownie, size(P.brownie, 1)],
    [P.galletas, null],
    [P.custom, null],
    [P.pack, null],
  ];
  const keys = Object.keys(C);
  const pastOrder = (day: number): DemoOrder => {
    const [pid, sid] = pastProducts[Math.floor(rand() * pastProducts.length)];
    return {
      history: true,
      c: keys[Math.floor(rand() * keys.length)],
      day,
      time: ['11:00', '13:00', '17:30', '19:00'][Math.floor(rand() * 4)],
      status: 'entregado',
      paidAll: true,
      items: [
        {
          product_id: pid,
          size_id: sid,
          quantity: pid === P.galletas ? 20 + Math.floor(rand() * 20) : 1,
          servings: pid === P.custom ? 15 + Math.floor(rand() * 15) : undefined,
        },
      ],
    };
  };
  // Meses anteriores: el negocio va creciendo poco a poco.
  for (let m = 5; m >= 1; m--) {
    const month = addMonths(t.slice(0, 7), -m);
    const n = 24 + Math.floor(rand() * 8) + (5 - m) * 2;
    for (let i = 0; i < n; i++) {
      const day = String(1 + Math.floor(rand() * 27)).padStart(2, '0');
      demo.push(pastOrder(Math.round((Date.parse(`${month}-${day}`) - Date.parse(t)) / 86400000)));
    }
  }
  // Lo que va de mes (hasta anteayer).
  for (let d = Number(t.slice(8, 10)) - 1; d >= 3; d--) {
    for (let i = 0; i < 1 + Math.floor(rand() * 2); i++) demo.push(pastOrder(-d + 1));
  }
  demo.sort((a, b) => a.day - b.day);

  // Los pedidos del histórico (ya entregados y cobrados) se insertan directamente;
  // los de estos días pasan por todo el flujo real (tareas, stock, estados…).
  const cat = await Catalog.load();
  let number = 1;
  for (const d of demo) {
    const c = cust(d.c);
    const date = addDays(t, d.day);
    const when = `${date}T${d.time ?? '12:00'}`;
    if (d.history) {
      const lines = normalizeLines(d.items.map((i) => lineSchema.parse(i)), cat);
      const total = linesTotal(lines);
      const id = await insert('orders', {
        number: number++,
        customer_id: c.id,
        customer_name: c.name,
        customer_phone: c.phone,
        order_date: addDays(date, -7),
        delivery_date: date,
        delivery_time: d.time ?? null,
        delivery_type: 'pickup',
        total,
        payment_method: 'efectivo',
        status: 'entregado',
        stock_consumed_at: `${addDays(date, -1)}T09:00:00.000Z`,
        confirmed_at: `${addDays(date, -6)}T10:00`,
        delivered_at: when,
        created_by: userId,
      });
      await saveLines('order_items', id, lines);
      await insert('payments', { order_id: id, kind: 'payment', amount: total, method: rand() < 0.5 ? 'efectivo' : 'bizum', paid_at: when, user_id: userId });
      continue;
    }
    const id = await createOrder(
      {
        customer_id: c.id,
        customer_name: c.name,
        customer_phone: c.phone,
        order_date: addDays(date, -7) < t ? addDays(date, -7) : t,
        delivery_date: date,
        delivery_time: d.time ?? null,
        delivery_type: d.delivery ? 'delivery' : 'pickup',
        delivery_address: d.delivery ? (c.address ?? 'C/ Nueva 1') : null,
        delivery_fee: d.delivery ? 5 : 0,
        allergens: d.allergens ?? [],
        notes: d.notes ?? null,
        payment_method: 'bizum',
        deposit: d.deposit ? { amount: d.deposit, method: 'bizum' } : null,
        items: d.items,
      },
      userId,
    );
    number++;
    const stamp = `${addDays(date, -5) < t ? addDays(date, -5) : t}T10:00`;
    await run('UPDATE payments SET paid_at = ? WHERE order_id = ?', [stamp, id]);
    if (d.tasksDone) {
      await setStatus(id, 'pendiente', userId);
      for (const tk of await all('SELECT id, stage FROM production_tasks WHERE order_id = ?', [id])) {
        if (d.tasksDone.includes(tk.stage)) await toggleTask(tk.id, true, userId);
      }
    } else if (d.status !== 'nuevo') {
      await setStatus(id, d.status, userId);
    }
    const order = await get('SELECT total FROM orders WHERE id = ?', [id]);
    if (d.paidAll) {
      const paid = (await get('SELECT COALESCE(SUM(amount),0) AS p FROM payments WHERE order_id = ?', [id])).p;
      if (order.total - paid > 0) await addPayment(id, { kind: 'payment', amount: order.total - paid, method: 'efectivo' }, userId);
    }
    if (d.status === 'entregado') {
      await run('UPDATE orders SET delivered_at = ?, confirmed_at = ? WHERE id = ?', [when, `${addDays(date, -6)}T10:00`, id]);
      await run("UPDATE payments SET paid_at = ? WHERE order_id = ? AND kind = 'payment'", [when, id]);
      await run('UPDATE inventory_movements SET created_at = ? WHERE order_id = ?', [`${addDays(date, -1)}T09:00:00.000Z`, id]);
    }
  }

  // ---------------- Ventas de mostrador ----------------
  const sales: [string, number][] = [
    ['3 brownies', 8.4],
    ['Caja de 6 cupcakes', 16],
    ['2 porciones de tarta de queso', 7],
    ['Galletas sueltas', 9],
    ['Tarta de chocolate pequeña (escaparate)', 24],
    ['4 cupcakes', 12],
  ];
  for (let i = 0; i < 70; i++) {
    const [description, amount] = sales[Math.floor(rand() * sales.length)];
    const day = addDays(t, -1 - Math.floor(rand() * 150));
    await insert('payments', {
      kind: 'direct_sale',
      amount,
      method: rand() < 0.5 ? 'tarjeta' : 'efectivo',
      description,
      paid_at: `${day}T${rand() < 0.5 ? '11' : '18'}:30`,
      user_id: userId,
    });
  }

  // ---------------- Gastos ----------------
  for (let m = 5; m >= 0; m--) {
    const month = addMonths(t.slice(0, 7), -m);
    const exp = async (day: number, category: string, description: string, amount: number, supplier: string | null = null) => {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      if (date > t) return;
      await insert('expenses', { date, category, description, amount, supplier, payment_method: 'transferencia', user_id: userId });
    };
    await exp(1, 'alquiler', 'Alquiler del obrador', 400, 'Inmobiliaria Sur');
    await exp(5, 'suministros', 'Luz', 95 + Math.round(rand() * 40), 'Iberdrola');
    await exp(6, 'suministros', 'Agua y gas', 38 + Math.round(rand() * 15));
    await exp(3, 'ingredientes', 'Compra semanal Makro', 120 + Math.round(rand() * 60), 'Makro');
    await exp(10, 'ingredientes', 'Compra semanal Makro', 110 + Math.round(rand() * 60), 'Makro');
    await exp(17, 'ingredientes', 'Compra semanal Makro', 100 + Math.round(rand() * 70), 'Makro');
    await exp(12, 'materiales', 'Cajas, bases y cápsulas', 60 + Math.round(rand() * 40), 'Envases Pastry');
    await exp(20, 'impuestos', 'Cuota autónomos', 230, 'Seguridad Social');
    if (m % 2 === 0) await exp(15, 'marketing', 'Publicidad en Instagram', 30);
  }

  // ---------------- Presupuestos ----------------
  await saveQuote(
    {
      customer_id: C.olivo,
      customer_name: 'Restaurante El Olivo',
      customer_phone: '952 123 456',
      date: addDays(t, -2),
      valid_until: addDays(t, 2),
      delivery_date: addDays(t, 14),
      delivery_time: '10:00',
      delivery_type: 'delivery',
      delivery_address: 'Plaza del Carmen 3',
      delivery_fee: 5,
      discount: 0,
      notes: 'Evento de empresa para 100 personas. Descuento por volumen.',
      items: [
        { product_id: P.cheesecake, size_id: size(P.cheesecake, 1), quantity: 4, flavor: 'Clásica' },
        { product_id: P.brownie, size_id: size(P.brownie, 1), quantity: 3 },
      ],
    },
    userId,
  );
  await saveQuote(
    {
      customer_name: 'Elena Torres',
      customer_phone: '689 012 345',
      date: addDays(t, -1),
      delivery_date: addDays(t, 20),
      notes: 'Primera comunión. Quiere ver bocetos.',
      items: [
        { product_id: P.custom, quantity: 1, servings: 40, flavor: 'Vainilla', filling: 'Frambuesa', coverage: 'Fondant', decoration: 'Cáliz y flores blancas', custom_text: 'Mi Primera Comunión · Elena', extras: [{ name: 'Figura de fondant', price: 10 }] },
        { product_id: P.galletas, quantity: 40, decoration: 'A juego con la tarta' },
      ],
    },
    userId,
  );

  // ---------------- Recordatorios y compra ----------------
  await insert('reminders', { text: 'Llamar a Envases Pastry para pedir cajas grandes', due_date: t, created_by: userId });
  await insert('reminders', { text: 'Revisar la temperatura de la cámara frigorífica', due_date: addDays(t, 2), created_by: userId });
  await insert('shopping_extras', { name: 'Papel de horno', quantity: '2 rollos' });

  // El histórico no debe vaciar el almacén actual: solo cuentan los pedidos de estos días.
  await run(
    "DELETE FROM inventory_movements WHERE type = 'consumption' AND order_id IN (SELECT id FROM orders WHERE delivery_date < ?)",
    [addDays(t, -1)],
  );
  await run('UPDATE inventory_items SET quantity = (SELECT COALESCE(SUM(m.quantity), 0) FROM inventory_movements m WHERE m.item_id = inventory_items.id)');

  // Situaciones de stock bajo para que se vean los avisos.
  await adjustStock(ids['Huevos'], { set: 12, note: 'Recuento' }, userId);
  await adjustStock(ids['Caja tarta grande'], { set: 2, note: 'Recuento' }, userId);
  await adjustStock(ids['Nata para montar 35%'], { set: 0.5, note: 'Recuento' }, userId);
}
