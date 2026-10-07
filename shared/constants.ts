// Constantes compartidas entre servidor y aplicación web.

export const ORDER_STATUSES = [
  'nuevo',
  'confirmado',
  'pendiente',
  'en_preparacion',
  'terminado',
  'entregado',
  'cancelado',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  nuevo: 'Nuevo',
  confirmado: 'Confirmado',
  pendiente: 'Pendiente de preparar',
  en_preparacion: 'En preparación',
  terminado: 'Terminado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export const STATUS_SHORT: Record<OrderStatus, string> = {
  nuevo: 'Nuevo',
  confirmado: 'Confirmado',
  pendiente: 'Por preparar',
  en_preparacion: 'Preparando',
  terminado: 'Terminado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Orden lógico del flujo (cancelado queda fuera). */
export const STATUS_RANK: Record<OrderStatus, number> = {
  nuevo: 0,
  confirmado: 1,
  pendiente: 2,
  en_preparacion: 3,
  terminado: 4,
  entregado: 5,
  cancelado: -1,
};

export const OPEN_STATUSES: OrderStatus[] = ['nuevo', 'confirmado', 'pendiente', 'en_preparacion', 'terminado'];
/** Pedidos que ya están confirmados y siguen en curso. */
export const ACTIVE_STATUSES: OrderStatus[] = ['confirmado', 'pendiente', 'en_preparacion', 'terminado'];

export const STAGES = ['preparar', 'hornear', 'rellenar', 'decorar', 'empaquetar', 'entregar'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  preparar: 'Preparar',
  hornear: 'Hornear',
  rellenar: 'Rellenar',
  decorar: 'Decorar',
  empaquetar: 'Empaquetar',
  entregar: 'Entregar',
};
export const PRODUCT_CATEGORIES = [
  'tartas',
  'tartas_personalizadas',
  'cupcakes',
  'galletas',
  'brownies',
  'cheesecakes',
  'packs',
  'otros',
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  tartas: 'Tartas',
  tartas_personalizadas: 'Tartas personalizadas',
  cupcakes: 'Cupcakes',
  galletas: 'Galletas',
  brownies: 'Brownies',
  cheesecakes: 'Cheesecakes',
  packs: 'Packs',
  otros: 'Otros',
};
/** Fases de producción por defecto según la categoría (sin "entregar", que es por pedido). */
export const DEFAULT_STAGES: Record<ProductCategory, Stage[]> = {
  tartas: ['preparar', 'hornear', 'rellenar', 'decorar', 'empaquetar'],
  tartas_personalizadas: ['preparar', 'hornear', 'rellenar', 'decorar', 'empaquetar'],
  cupcakes: ['preparar', 'hornear', 'rellenar', 'decorar', 'empaquetar'],
  galletas: ['preparar', 'hornear', 'decorar', 'empaquetar'],
  brownies: ['preparar', 'hornear', 'empaquetar'],
  cheesecakes: ['preparar', 'hornear', 'decorar', 'empaquetar'],
  packs: ['preparar', 'empaquetar'],
  otros: ['preparar', 'hornear', 'empaquetar'],
};

export const UNITS = ['g', 'kg', 'ml', 'l', 'ud'] as const;
export type Unit = (typeof UNITS)[number];
export const UNIT_LABELS: Record<Unit, string> = {
  g: 'gramos',
  kg: 'kilos',
  ml: 'mililitros',
  l: 'litros',
  ud: 'unidades',
};
/** Familia y factor a la unidad base (g, ml, ud). */
export const UNIT_INFO: Record<Unit, { family: 'mass' | 'volume' | 'count'; factor: number }> = {
  g: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  ud: { family: 'count', factor: 1 },
};
export function compatibleUnits(unit: Unit): Unit[] {
  const fam = UNIT_INFO[unit].family;
  return UNITS.filter((u) => UNIT_INFO[u].family === fam);
}
export function convertUnit(qty: number, from: Unit, to: Unit): number {
  if (from === to) return qty;
  const a = UNIT_INFO[from];
  const b = UNIT_INFO[to];
  if (!a || !b || a.family !== b.family) return qty;
  return (qty * a.factor) / b.factor;
}

/** Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011). */
export const ALLERGENS = [
  'gluten',
  'huevo',
  'leche',
  'frutos_secos',
  'cacahuete',
  'soja',
  'sesamo',
  'sulfitos',
  'apio',
  'mostaza',
  'pescado',
  'crustaceos',
  'moluscos',
  'altramuces',
] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: 'Gluten',
  huevo: 'Huevo',
  leche: 'Lácteos',
  frutos_secos: 'Frutos secos',
  cacahuete: 'Cacahuete',
  soja: 'Soja',
  sesamo: 'Sésamo',
  sulfitos: 'Sulfitos',
  apio: 'Apio',
  mostaza: 'Mostaza',
  pescado: 'Pescado',
  crustaceos: 'Crustáceos',
  moluscos: 'Moluscos',
  altramuces: 'Altramuces',
};
/** Los más habituales en repostería, para mostrarlos primero. */
export const COMMON_ALLERGENS: Allergen[] = ['gluten', 'huevo', 'leche', 'frutos_secos', 'cacahuete', 'soja', 'sesamo'];

export const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

export const PAYMENT_KINDS = ['deposit', 'payment', 'refund', 'direct_sale'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  deposit: 'Señal',
  payment: 'Cobro',
  refund: 'Devolución',
  direct_sale: 'Venta directa',
};

export const EXPENSE_CATEGORIES = [
  'ingredientes',
  'materiales',
  'alquiler',
  'suministros',
  'sueldos',
  'impuestos',
  'equipamiento',
  'transporte',
  'marketing',
  'otros',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  ingredientes: 'Ingredientes',
  materiales: 'Envases y materiales',
  alquiler: 'Alquiler',
  suministros: 'Luz, agua, gas',
  sueldos: 'Sueldos',
  impuestos: 'Impuestos y cuotas',
  equipamiento: 'Equipamiento',
  transporte: 'Transporte',
  marketing: 'Publicidad',
  otros: 'Otros',
};

export const QUOTE_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteStatus | 'expired', string> = {
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Caducado',
};

/** Permisos configurables para empleados (el administrador siempre puede todo). */
export const EMPLOYEE_PERMISSIONS = {
  perm_finances: 'Ver dinero facturado, gastos, beneficios y finanzas',
  perm_costs: 'Ver costes, escandallos y márgenes',
  perm_inventory: 'Modificar inventario y registrar compras',
  perm_catalog: 'Editar catálogo y recetas',
  perm_delete: 'Borrar pedidos, clientes y otros datos',
} as const;
export type Permission = keyof typeof EMPLOYEE_PERMISSIONS;

export interface Settings {
  business_name: string;
  business_phone: string;
  business_address: string;
  timezone: string;
  production_lead_days: number;
  shopping_horizon_days: number;
  labor_cost_per_hour: number;
  overhead_percent: number;
  target_margin_percent: number;
  default_delivery_fee: number;
  deposit_percent: number;
  quote_validity_days: number;
  low_stock_include_orders: boolean;
  perm_finances: boolean;
  perm_costs: boolean;
  perm_inventory: boolean;
  perm_catalog: boolean;
  perm_delete: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  business_name: 'Mi Pastelería',
  business_phone: '',
  business_address: '',
  timezone: 'Europe/Madrid',
  production_lead_days: 1,
  shopping_horizon_days: 7,
  labor_cost_per_hour: 12,
  overhead_percent: 10,
  target_margin_percent: 60,
  default_delivery_fee: 5,
  deposit_percent: 30,
  quote_validity_days: 15,
  low_stock_include_orders: true,
  perm_finances: false,
  perm_costs: false,
  perm_inventory: true,
  perm_catalog: false,
  perm_delete: false,
};
