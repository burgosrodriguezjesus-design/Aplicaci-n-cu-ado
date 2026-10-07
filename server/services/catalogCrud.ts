// Alta y edición de recetas y productos del catálogo.
import { z } from 'zod';
import { all, get, insert, run, tx, update } from '../db/db.js';
import { nowIso } from '../lib/clock.js';
import { badRequest, notFound } from '../lib/util.js';
import {
  Catalog,
  productAllergens,
  productCost,
  recipeAllergens,
  recipeCost,
} from './catalog.js';
import { PRODUCT_CATEGORIES, STAGES, UNITS, UNIT_INFO, type Unit } from '../../shared/constants.js';

const optText = z
  .string()
  .trim()
  .max(5000)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));
const optInt = z.number().int().min(0).nullable().optional();

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------

export const recipeSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  category: optText,
  photo_id: z.number().int().positive().nullable().optional(),
  servings: z.number().positive('Las raciones deben ser mayores que 0'),
  prep_minutes: optInt,
  bake_minutes: optInt,
  temperature: optInt,
  steps: z.array(z.string().trim()).default([]),
  notes: optText,
  sale_price: z.number().min(0).nullable().optional(),
  ingredients: z
    .array(
      z.object({
        item_id: z.number().int().positive(),
        quantity: z.number().positive('Cantidad no válida'),
        unit: z.enum(UNITS),
      }),
    )
    .default([]),
});

function checkUnit(itemId: number, unit: Unit) {
  const item = get('SELECT name, unit FROM inventory_items WHERE id = ?', [itemId]);
  if (!item) throw badRequest('Uno de los ingredientes ya no existe');
  if (UNIT_INFO[item.unit as Unit].family !== UNIT_INFO[unit].family) {
    throw badRequest(`La unidad de "${item.name}" no es compatible (en inventario está en ${item.unit})`);
  }
}

export function saveRecipe(raw: unknown, id?: number) {
  const input = recipeSchema.parse(raw);
  return tx(() => {
    input.ingredients.forEach((i) => checkUnit(i.item_id, i.unit));
    const { ingredients, steps, ...data } = input;
    const row = {
      ...data,
      photo_id: data.photo_id ?? null,
      prep_minutes: data.prep_minutes ?? null,
      bake_minutes: data.bake_minutes ?? null,
      temperature: data.temperature ?? null,
      sale_price: data.sale_price ?? null,
      steps: JSON.stringify(steps.filter(Boolean)),
    };
    if (id) {
      if (!get('SELECT id FROM recipes WHERE id = ?', [id])) throw notFound('Receta');
      update('recipes', id, { ...row, updated_at: nowIso() });
      run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
    } else {
      id = insert('recipes', row);
    }
    ingredients.forEach((ing, i) => insert('recipe_ingredients', { recipe_id: id, ...ing, sort: i }));
    return id!;
  });
}

export function listRecipes(costs: boolean) {
  const cat = new Catalog();
  return all('SELECT id FROM recipes ORDER BY name COLLATE NOCASE').map((r) => {
    const recipe = cat.recipe(r.id)!;
    const c = costs ? recipeCost(recipe) : null;
    return {
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      photo_id: recipe.photo_id,
      servings: recipe.servings,
      prep_minutes: recipe.prep_minutes,
      bake_minutes: recipe.bake_minutes,
      temperature: recipe.temperature,
      ingredients_count: recipe.ingredients.length,
      allergens: recipeAllergens(recipe),
      cost: c?.total ?? null,
      recommended_price: c?.recommended_price ?? null,
    };
  });
}

export function getRecipe(id: number, servings: number | null, costs: boolean) {
  const cat = new Catalog();
  const recipe = cat.recipe(id);
  if (!recipe) throw notFound('Receta');
  const target = servings && servings > 0 ? servings : recipe.servings;
  const scaled = recipeCost(recipe, target);
  const base = recipeCost(recipe);
  const usedIn = all(
    `SELECT DISTINCT p.id, p.name FROM product_components pc JOIN products p ON p.id = pc.product_id WHERE pc.recipe_id = ? ORDER BY p.name`,
    [id],
  );
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((i) => ({
      id: i.id,
      item_id: i.item_id,
      name: i.item.name,
      kind: i.item.kind,
      quantity: i.quantity,
      unit: i.unit,
      item_unit: i.item.unit,
      stock: i.item.quantity,
      cost_per_unit: costs ? i.item.cost_per_unit : null,
    })),
    allergens: recipeAllergens(recipe),
    used_in: usedIn,
    scaled: {
      servings: target,
      factor: scaled.factor,
      ingredients: scaled.lines.map((l) => ({
        item_id: l.item_id,
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        cost: costs ? l.cost : null,
      })),
      cost: costs ? scaled.total : null,
    },
    costing: costs ? base : null,
  };
}

export function deleteRecipe(id: number) {
  const used = get('SELECT COUNT(*) AS n FROM product_components WHERE recipe_id = ?', [id])!.n;
  if (used) throw badRequest('Esta receta se usa en productos del catálogo. Quítala de ellos primero.');
  run('DELETE FROM recipes WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export const productSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  category: z.enum(PRODUCT_CATEGORIES),
  description: optText,
  photo_id: z.number().int().positive().nullable().optional(),
  base_price: z.number().min(0).default(0),
  pricing: z.enum(['unit', 'serving']).default('unit'),
  unit_label: z.string().trim().min(1).max(30).default('ud'),
  servings: z.number().positive().default(1),
  flavors: z.array(z.string().trim().min(1)).default([]),
  fillings: z.array(z.string().trim().min(1)).default([]),
  coverings: z.array(z.string().trim().min(1)).default([]),
  extras: z.array(z.object({ name: z.string().trim().min(1), price: z.number().min(0) })).default([]),
  labor_minutes: z.number().min(0).default(0),
  other_costs: z.number().min(0).default(0),
  stages: z.array(z.enum(STAGES)).nullable().optional(),
  active: z.boolean().default(true),
  sizes: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().trim().min(1, 'Cada tamaño necesita un nombre'),
        servings: z.number().positive('Raciones del tamaño no válidas'),
        price: z.number().min(0),
      }),
    )
    .default([]),
  components: z
    .array(
      z
        .object({
          recipe_id: z.number().int().positive().nullable().optional(),
          item_id: z.number().int().positive().nullable().optional(),
          quantity: z.number().positive('Cantidad no válida'),
          unit: z.enum(UNITS).nullable().optional(),
          per_serving: z.boolean().default(false),
          size_index: z.number().int().min(0).nullable().optional(),
        })
        .refine((c) => !!c.recipe_id !== !!c.item_id, 'Cada componente debe ser una receta o un artículo'),
    )
    .default([]),
});

export function saveProduct(raw: unknown, id?: number) {
  const input = productSchema.parse(raw);
  return tx(() => {
    const { sizes, components, flavors, fillings, coverings, extras, stages, active, ...data } = input;
    const row = {
      ...data,
      photo_id: data.photo_id ?? null,
      flavors: JSON.stringify(flavors),
      fillings: JSON.stringify(fillings),
      coverings: JSON.stringify(coverings),
      extras: JSON.stringify(extras),
      stages: stages && stages.length ? JSON.stringify(stages.filter((s) => s !== 'entregar')) : null,
      active: active ? 1 : 0,
    };
    if (id) {
      if (!get('SELECT id FROM products WHERE id = ?', [id])) throw notFound('Producto');
      update('products', id, { ...row, updated_at: nowIso() });
    } else {
      id = insert('products', row);
    }
    // Tamaños (se conservan los id para no romper pedidos existentes)
    const existing = new Set(all<{ id: number }>('SELECT id FROM product_sizes WHERE product_id = ?', [id]).map((r) => r.id));
    const sizeIds: number[] = [];
    sizes.forEach((s, i) => {
      if (s.id && existing.has(s.id)) {
        update('product_sizes', s.id, { name: s.name, servings: s.servings, price: s.price, sort: i });
        sizeIds.push(s.id);
      } else {
        sizeIds.push(insert('product_sizes', { product_id: id, name: s.name, servings: s.servings, price: s.price, sort: i }));
      }
    });
    run('DELETE FROM product_components WHERE product_id = ?', [id]);
    for (const sid of existing) if (!sizeIds.includes(sid)) run('DELETE FROM product_sizes WHERE id = ?', [sid]);
    components.forEach((c, i) => {
      if (c.item_id && c.unit) checkUnit(c.item_id, c.unit);
      if (c.recipe_id && !get('SELECT id FROM recipes WHERE id = ?', [c.recipe_id])) throw badRequest('Una de las recetas ya no existe');
      insert('product_components', {
        product_id: id,
        recipe_id: c.recipe_id ?? null,
        item_id: c.item_id ?? null,
        quantity: c.quantity,
        unit: c.item_id ? (c.unit ?? get('SELECT unit FROM inventory_items WHERE id = ?', [c.item_id])?.unit ?? 'ud') : null,
        per_serving: c.item_id && c.per_serving ? 1 : 0,
        size_id: c.size_index != null ? (sizeIds[c.size_index] ?? null) : null,
        sort: i,
      });
    });
    return id!;
  });
}

export function listProducts(opts: { costs: boolean; includeInactive?: boolean }) {
  const cat = new Catalog();
  const rows = all(
    `SELECT id FROM products ${opts.includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort, category, name COLLATE NOCASE`,
  );
  return rows.map((r) => productView(cat, r.id, opts.costs));
}

export function productView(cat: Catalog, id: number, costs: boolean) {
  const p = cat.product(id);
  if (!p) throw notFound('Producto');
  const sizeCosts = costs
    ? (p.sizes.length ? p.sizes : [null]).map((s) => {
        const c = productCost(cat, p, { sizeId: s?.id ?? null });
        return {
          size_id: s?.id ?? null,
          cost: c.total,
          price: c.price,
          profit: c.profit,
          margin: c.margin,
          recommended_price: c.recommended_price,
        };
      })
    : null;
  return {
    ...p,
    components: p.components.map((c) => ({
      ...c,
      name: c.recipe_id ? (cat.recipe(c.recipe_id)?.name ?? '¿?') : (cat.item(c.item_id!)?.name ?? '¿?'),
      kind: c.recipe_id ? 'recipe' : cat.item(c.item_id!)?.kind,
      recipe_servings: c.recipe_id ? cat.recipe(c.recipe_id)?.servings : null,
      item_unit: c.item_id ? cat.item(c.item_id)?.unit : null,
    })),
    allergens: productAllergens(cat, id),
    costs: sizeCosts,
  };
}

export function deleteProduct(id: number) {
  const used = get('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?', [id])!.n;
  if (used) {
    run('UPDATE products SET active = 0 WHERE id = ?', [id]);
    return { archived: true };
  }
  run('DELETE FROM products WHERE id = ?', [id]);
  return { archived: false };
}

export function productCosting(id: number, sizeId: number | null, servings: number | null) {
  const cat = new Catalog();
  const p = cat.product(id);
  if (!p) throw notFound('Producto');
  return productCost(cat, p, { sizeId, servings });
}

