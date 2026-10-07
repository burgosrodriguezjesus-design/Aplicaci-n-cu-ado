// Carga de recetas/productos y cálculo de costes (escandallos) y necesidades de ingredientes.
import { all, get } from '../db/db.js';
import { parseJson, round2 } from '../lib/util.js';
import { getSettings } from './settings.js';
import {
  convertUnit,
  DEFAULT_STAGES,
  type ProductCategory,
  type Stage,
  type Unit,
} from '../../shared/constants.js';

export interface InventoryItem {
  id: number;
  name: string;
  kind: 'ingredient' | 'material';
  category: string | null;
  unit: Unit;
  quantity: number;
  min_stock: number;
  cost_per_unit: number;
  pack_size: number | null;
  supplier: string | null;
  allergens: string[];
  notes: string | null;
  active: number;
}

export interface RecipeIngredient {
  id: number;
  item_id: number;
  quantity: number;
  unit: Unit;
  sort: number;
  item: InventoryItem;
}

export interface Recipe {
  id: number;
  name: string;
  category: string | null;
  photo_id: number | null;
  servings: number;
  prep_minutes: number | null;
  bake_minutes: number | null;
  temperature: number | null;
  steps: string[];
  notes: string | null;
  sale_price: number | null;
  ingredients: RecipeIngredient[];
}

export interface ProductSize {
  id: number;
  product_id: number;
  name: string;
  servings: number;
  price: number;
  sort: number;
}

export interface ProductComponent {
  id: number;
  product_id: number;
  recipe_id: number | null;
  item_id: number | null;
  quantity: number;
  unit: Unit | null;
  /** Artículos: true = cantidad por ración (p. ej. 1 cápsula por cupcake); false = por unidad vendida. */
  per_serving: number;
  size_id: number | null;
  sort: number;
}

export interface Extra {
  name: string;
  price: number;
}

export interface Product {
  id: number;
  name: string;
  category: ProductCategory;
  description: string | null;
  photo_id: number | null;
  base_price: number;
  pricing: 'unit' | 'serving';
  unit_label: string;
  servings: number;
  flavors: string[];
  fillings: string[];
  coverings: string[];
  extras: Extra[];
  labor_minutes: number;
  other_costs: number;
  stages: Stage[];
  custom_stages: boolean;
  active: number;
  sort: number;
  sizes: ProductSize[];
  components: ProductComponent[];
}

export function mapItem(r: any): InventoryItem {
  return { ...r, allergens: parseJson<string[]>(r.allergens, []) };
}

export function mapProductRow(r: any): Omit<Product, 'sizes' | 'components'> {
  const stages = parseJson<Stage[] | null>(r.stages, null);
  return {
    ...r,
    flavors: parseJson<string[]>(r.flavors, []),
    fillings: parseJson<string[]>(r.fillings, []),
    coverings: parseJson<string[]>(r.coverings, []),
    extras: parseJson<Extra[]>(r.extras, []),
    stages: stages ?? DEFAULT_STAGES[r.category as ProductCategory] ?? DEFAULT_STAGES.otros,
    custom_stages: !!stages,
  };
}

/**
 * Caché de catálogo para una operación: evita repetir consultas cuando se calculan
 * muchos pedidos a la vez (lista de la compra, producción...).
 */
export class Catalog {
  private items = new Map<number, InventoryItem | null>();
  private recipes = new Map<number, Recipe | null>();
  private products = new Map<number, Product | null>();

  item(id: number): InventoryItem | null {
    if (!this.items.has(id)) {
      const r = get('SELECT * FROM inventory_items WHERE id = ?', [id]);
      this.items.set(id, r ? mapItem(r) : null);
    }
    return this.items.get(id)!;
  }

  recipe(id: number): Recipe | null {
    if (!this.recipes.has(id)) {
      const r = get('SELECT * FROM recipes WHERE id = ?', [id]);
      if (!r) {
        this.recipes.set(id, null);
      } else {
        const ings = all('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort, id', [id]);
        const ingredients: RecipeIngredient[] = [];
        for (const i of ings) {
          const item = this.item(i.item_id);
          if (item) ingredients.push({ ...i, item });
        }
        this.recipes.set(id, { ...r, steps: parseJson<string[]>(r.steps, []), ingredients });
      }
    }
    return this.recipes.get(id)!;
  }

  product(id: number): Product | null {
    if (!this.products.has(id)) {
      const r = get('SELECT * FROM products WHERE id = ?', [id]);
      if (!r) {
        this.products.set(id, null);
      } else {
        const sizes = all<ProductSize>('SELECT * FROM product_sizes WHERE product_id = ? ORDER BY sort, id', [id]);
        const components = all<ProductComponent>(
          'SELECT * FROM product_components WHERE product_id = ? ORDER BY sort, id',
          [id],
        );
        this.products.set(id, { ...mapProductRow(r), sizes, components });
      }
    }
    return this.products.get(id)!;
  }
}

// ---------------------------------------------------------------------------
// Raciones y precios
// ---------------------------------------------------------------------------

export interface LineLike {
  product_id: number | null;
  size_id: number | null;
  quantity: number;
  servings: number | null;
}

/** Raciones por unidad de una línea de pedido. */
export function servingsPerUnit(product: Product | null, line: LineLike): number {
  if (line.servings && line.servings > 0) return line.servings;
  const size = product?.sizes.find((s) => s.id === line.size_id);
  if (size) return size.servings;
  return product?.servings ?? 1;
}

/** Precio unitario sugerido para una línea (sin extras). */
export function suggestedUnitPrice(product: Product, sizeId: number | null, servings: number | null): number {
  const size = product.sizes.find((s) => s.id === sizeId);
  if (size) {
    if (servings && servings !== size.servings && product.pricing === 'serving') {
      return round2((size.price / size.servings) * servings);
    }
    return size.price;
  }
  if (product.pricing === 'serving') return round2(product.base_price * (servings || product.servings));
  return product.base_price;
}

// ---------------------------------------------------------------------------
// Necesidades de ingredientes y materiales
// ---------------------------------------------------------------------------

export type Requirements = Map<number, number>; // item_id -> cantidad en la unidad del inventario

function addReq(req: Requirements, item: InventoryItem, qty: number, unit: Unit) {
  const q = convertUnit(qty, unit, item.unit);
  req.set(item.id, (req.get(item.id) || 0) + q);
}

/** Ingredientes de una receta multiplicados por `batches` tandas. */
export function addRecipeRequirements(req: Requirements, recipe: Recipe, batches: number) {
  for (const ing of recipe.ingredients) addReq(req, ing.item, ing.quantity * batches, ing.unit);
}

/** Necesidades de una línea de pedido (todas sus unidades). */
export function addLineRequirements(cat: Catalog, req: Requirements, line: LineLike) {
  if (!line.product_id) return;
  const product = cat.product(line.product_id);
  if (!product) return;
  const units = line.quantity || 0;
  const totalServings = servingsPerUnit(product, line) * units;
  for (const comp of product.components) {
    if (comp.size_id && comp.size_id !== line.size_id) continue;
    if (comp.recipe_id) {
      const recipe = cat.recipe(comp.recipe_id);
      if (!recipe) continue;
      addRecipeRequirements(req, recipe, (comp.quantity * totalServings) / recipe.servings);
    } else if (comp.item_id) {
      const item = cat.item(comp.item_id);
      if (!item) continue;
      addReq(req, item, comp.quantity * (comp.per_serving ? totalServings : units), comp.unit || item.unit);
    }
  }
}

export function requirementsForLines(lines: LineLike[], cat = new Catalog()): Requirements {
  const req: Requirements = new Map();
  for (const l of lines) addLineRequirements(cat, req, l);
  return req;
}

export function requirementsForOrders(orderIds: number[], cat = new Catalog()) {
  const req: Requirements = new Map();
  const byItemOrders = new Map<number, Set<number>>();
  for (const id of orderIds) {
    const lines = all<LineLike>('SELECT product_id, size_id, quantity, servings FROM order_items WHERE order_id = ?', [
      id,
    ]);
    const r = requirementsForLines(lines, cat);
    for (const [itemId, q] of r) {
      req.set(itemId, (req.get(itemId) || 0) + q);
      if (!byItemOrders.has(itemId)) byItemOrders.set(itemId, new Set());
      byItemOrders.get(itemId)!.add(id);
    }
  }
  return { req, byItemOrders };
}

/** Lista legible de necesidades con stock actual. */
export function describeRequirements(req: Requirements, cat: Catalog) {
  const out = [];
  for (const [itemId, qty] of req) {
    const item = cat.item(itemId);
    if (!item) continue;
    out.push({
      item_id: itemId,
      name: item.name,
      kind: item.kind,
      unit: item.unit,
      needed: qty,
      stock: item.quantity,
      missing: Math.max(0, qty - item.quantity),
      cost: round2(qty * item.cost_per_unit),
    });
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'es') : a.kind === 'ingredient' ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Alérgenos
// ---------------------------------------------------------------------------

export function productAllergens(cat: Catalog, productId: number): string[] {
  const product = cat.product(productId);
  if (!product) return [];
  const set = new Set<string>();
  for (const comp of product.components) {
    if (comp.recipe_id) {
      const recipe = cat.recipe(comp.recipe_id);
      recipe?.ingredients.forEach((i) => i.item.allergens.forEach((a) => set.add(a)));
    } else if (comp.item_id) {
      cat.item(comp.item_id)?.allergens.forEach((a) => set.add(a));
    }
  }
  return [...set];
}

export function recipeAllergens(recipe: Recipe): string[] {
  const set = new Set<string>();
  recipe.ingredients.forEach((i) => i.item.allergens.forEach((a) => set.add(a)));
  return [...set];
}

// ---------------------------------------------------------------------------
// Costes (escandallo)
// ---------------------------------------------------------------------------

export interface CostLine {
  type: 'recipe' | 'ingredient' | 'material';
  name: string;
  item_id?: number;
  recipe_id?: number;
  component_id?: number;
  quantity: number;
  unit: string;
  unit_cost?: number;
  cost: number;
  children?: CostLine[];
}

export interface CostBreakdown {
  servings: number;
  price: number;
  ingredients: number;
  materials: number;
  labor: number;
  labor_minutes: number;
  other: number;
  overhead: number;
  total: number;
  profit: number;
  margin: number; // 0..1
  recommended_price: number;
  cost_per_serving: number;
  lines: CostLine[];
}

function laborRate() {
  return getSettings().labor_cost_per_hour || 0;
}

/** Coste de una receta escalada a `servings` raciones (por defecto, sus raciones base). */
export function recipeCost(recipe: Recipe, servings = recipe.servings) {
  const factor = servings / recipe.servings;
  const lines: CostLine[] = recipe.ingredients.map((ing) => {
    const qty = ing.quantity * factor;
    const qtyInItemUnit = convertUnit(qty, ing.unit, ing.item.unit);
    return {
      type: ing.item.kind === 'material' ? 'material' : 'ingredient',
      name: ing.item.name,
      item_id: ing.item.id,
      quantity: qty,
      unit: ing.unit,
      unit_cost: ing.item.cost_per_unit,
      cost: qtyInItemUnit * ing.item.cost_per_unit,
    };
  });
  const ingredients = lines.filter((l) => l.type === 'ingredient').reduce((s, l) => s + l.cost, 0);
  const materials = lines.filter((l) => l.type === 'material').reduce((s, l) => s + l.cost, 0);
  const laborMinutes = (recipe.prep_minutes || 0) * factor;
  const labor = (laborMinutes / 60) * laborRate();
  const s = getSettings();
  const overhead = ((ingredients + materials) * (s.overhead_percent || 0)) / 100;
  const total = ingredients + materials + labor + overhead;
  const target = Math.min(Math.max(s.target_margin_percent || 0, 0), 95) / 100;
  const price = recipe.sale_price ? recipe.sale_price * factor : 0;
  return {
    servings,
    factor,
    ingredients: round2(ingredients),
    materials: round2(materials),
    labor: round2(labor),
    labor_minutes: Math.round(laborMinutes),
    overhead: round2(overhead),
    total: round2(total),
    cost_per_serving: round2(total / servings),
    recommended_price: round2(total / (1 - target)),
    price: round2(price),
    profit: price ? round2(price - total) : null,
    margin: price ? (price - total) / price : null,
    lines: lines.map((l) => ({ ...l, cost: round2(l.cost) })),
  };
}

/** Escandallo de una unidad de producto (en un tamaño concreto o con unas raciones concretas). */
export function productCost(
  cat: Catalog,
  product: Product,
  opts: { sizeId?: number | null; servings?: number | null; price?: number | null } = {},
): CostBreakdown {
  const s = getSettings();
  const rate = laborRate();
  const size = product.sizes.find((x) => x.id === opts.sizeId) ?? null;
  const servings = opts.servings || size?.servings || product.servings;
  const price = opts.price ?? suggestedUnitPrice(product, size?.id ?? null, opts.servings ?? null);

  let ingredients = 0;
  let materials = 0;
  // Tiempo de trabajo del producto: se indica para sus raciones de referencia y se ajusta al tamaño.
  const laborMinutes = ((product.labor_minutes || 0) * servings) / (product.servings || 1);
  const lines: CostLine[] = [];

  for (const comp of product.components) {
    if (comp.size_id && comp.size_id !== (size?.id ?? null)) continue;
    if (comp.recipe_id) {
      const recipe = cat.recipe(comp.recipe_id);
      if (!recipe) continue;
      const rc = recipeCost(recipe, comp.quantity * servings);
      ingredients += rc.lines.filter((l) => l.type === 'ingredient').reduce((a, l) => a + l.cost, 0);
      materials += rc.lines.filter((l) => l.type === 'material').reduce((a, l) => a + l.cost, 0);
      lines.push({
        type: 'recipe',
        name: recipe.name,
        recipe_id: recipe.id,
        component_id: comp.id,
        quantity: rc.factor,
        unit: 'receta',
        cost: round2(rc.ingredients + rc.materials),
        children: rc.lines,
      });
    } else if (comp.item_id) {
      const item = cat.item(comp.item_id);
      if (!item) continue;
      const unit = comp.unit || item.unit;
      const qty = comp.quantity * (comp.per_serving ? servings : 1);
      const cost = convertUnit(qty, unit, item.unit) * item.cost_per_unit;
      if (item.kind === 'material') materials += cost;
      else ingredients += cost;
      lines.push({
        type: item.kind === 'material' ? 'material' : 'ingredient',
        name: item.name,
        item_id: item.id,
        component_id: comp.id,
        quantity: qty,
        unit,
        unit_cost: item.cost_per_unit,
        cost: round2(cost),
      });
    }
  }

  const labor = (laborMinutes / 60) * rate;
  const other = product.other_costs || 0;
  const overhead = ((ingredients + materials) * (s.overhead_percent || 0)) / 100;
  const total = ingredients + materials + labor + other + overhead;
  const target = Math.min(Math.max(s.target_margin_percent || 0, 0), 95) / 100;
  return {
    servings,
    price: round2(price),
    ingredients: round2(ingredients),
    materials: round2(materials),
    labor: round2(labor),
    labor_minutes: Math.round(laborMinutes),
    other: round2(other),
    overhead: round2(overhead),
    total: round2(total),
    profit: round2(price - total),
    margin: price > 0 ? (price - total) / price : 0,
    recommended_price: round2(total / (1 - target)),
    cost_per_serving: round2(total / servings),
    lines,
  };
}
