import type { OrderStatus, ProductCategory, Stage, Unit } from '@shared/constants';

export interface User {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'employee';
}

export interface Permissions {
  finances: boolean;
  costs: boolean;
  inventory: boolean;
  catalog: boolean;
  delete: boolean;
  admin: boolean;
}

export interface Extra {
  name: string;
  price: number;
}

export interface OrderSummary {
  id: number;
  number: number;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  delivery_date: string;
  delivery_time: string | null;
  delivery_type: 'pickup' | 'delivery';
  delivery_address: string | null;
  status: OrderStatus;
  total: number;
  paid: number;
  pending: number;
  summary: string;
  allergens: string[];
  notes: string | null;
  tasks_total: number;
  tasks_done: number;
  image_id: number | null;
  production_day: string;
}

export interface OrderLine {
  id?: number;
  product_id: number | null;
  product_name: string;
  size_id: number | null;
  size_name?: string | null;
  quantity: number;
  servings: number | null;
  flavor: string | null;
  filling: string | null;
  coverage: string | null;
  decoration: string | null;
  custom_text: string | null;
  notes: string | null;
  extras: Extra[];
  unit_price: number;
  line_total?: number;
  contains?: string[];
  product_photo_id?: number | null;
}

export interface Payment {
  id: number;
  order_id: number | null;
  kind: 'deposit' | 'payment' | 'refund' | 'direct_sale';
  amount: number;
  method: string;
  description: string | null;
  paid_at: string;
  user_id: number | null;
}

export interface Task {
  id: number;
  order_id: number;
  order_item_id: number | null;
  stage: Stage;
  title: string;
  done: boolean | number;
  done_at: string | null;
  done_by_name?: string | null;
}

export interface Requirement {
  item_id: number;
  name: string;
  kind: 'ingredient' | 'material';
  unit: Unit;
  needed: number;
  stock: number;
  missing: number;
  cost?: number;
}

export interface Order {
  id: number;
  number: number;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string | null;
  order_date: string;
  delivery_date: string;
  delivery_time: string | null;
  production_date: string | null;
  production_day: string;
  delivery_type: 'pickup' | 'delivery';
  delivery_address: string | null;
  delivery_fee: number;
  discount: number;
  total: number;
  paid: number;
  pending: number;
  payment_method: string | null;
  status: OrderStatus;
  allergens: string[];
  notes: string | null;
  items: OrderLine[];
  payments: Payment[];
  images: number[];
  tasks: Task[];
  requirements: Requirement[];
  allergen_warnings: string[];
  customer: { id: number; name: string; phone: string | null; email: string | null; address: string | null } | null;
  quote: { id: number; number: number } | null;
  estimated_cost: number | null;
  stock_consumed_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface ProductSize {
  id: number;
  name: string;
  servings: number;
  price: number;
}

export interface ProductComponent {
  id: number;
  recipe_id: number | null;
  item_id: number | null;
  quantity: number;
  unit: Unit | null;
  per_serving: number;
  size_id: number | null;
  name: string;
  kind: 'recipe' | 'ingredient' | 'material';
  recipe_servings: number | null;
  item_unit: Unit | null;
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
  sizes: ProductSize[];
  components: ProductComponent[];
  allergens: string[];
  costs: { size_id: number | null; cost: number; price: number; profit: number; margin: number; recommended_price: number }[] | null;
}

export interface InventoryItem {
  id: number;
  name: string;
  kind: 'ingredient' | 'material';
  category: string | null;
  unit: Unit;
  quantity: number;
  min_stock: number;
  cost_per_unit: number | null;
  pack_size: number | null;
  supplier: string | null;
  allergens: string[];
  notes: string | null;
  low: boolean;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthday: string | null;
  allergens: string[];
  preferences: string | null;
  notes: string | null;
  orders_count: number;
  total_spent: number;
  last_order_date: string | null;
}

export interface Reminder {
  id: string;
  type: string;
  severity: 'urgent' | 'warning' | 'info';
  text: string;
  link?: string;
  date?: string | null;
  manual_id?: number;
}
