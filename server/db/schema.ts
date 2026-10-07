// Esquema de la base de datos. Cada entrada de MIGRATIONS se aplica una sola vez
// (se controla con PRAGMA user_version), así las bases existentes se actualizan solas.

export const MIGRATIONS: string[] = [
  /* 1: esquema inicial */ `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','employee')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE images (
    id INTEGER PRIMARY KEY,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    birthday TEXT,
    allergens TEXT NOT NULL DEFAULT '[]',
    preferences TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_customers_phone ON customers(phone);
  CREATE INDEX idx_customers_name ON customers(name COLLATE NOCASE);

  CREATE TABLE inventory_items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('ingredient','material')),
    category TEXT,
    unit TEXT NOT NULL CHECK (unit IN ('g','kg','ml','l','ud')),
    quantity REAL NOT NULL DEFAULT 0,
    min_stock REAL NOT NULL DEFAULT 0,
    cost_per_unit REAL NOT NULL DEFAULT 0,
    pack_size REAL,
    supplier TEXT,
    allergens TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE recipes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    photo_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
    servings REAL NOT NULL DEFAULT 10 CHECK (servings > 0),
    prep_minutes INTEGER,
    bake_minutes INTEGER,
    temperature INTEGER,
    steps TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    sale_price REAL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE recipe_ingredients (
    id INTEGER PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('g','kg','ml','l','ud')),
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    photo_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
    base_price REAL NOT NULL DEFAULT 0,
    pricing TEXT NOT NULL DEFAULT 'unit' CHECK (pricing IN ('unit','serving')),
    unit_label TEXT NOT NULL DEFAULT 'ud',
    servings REAL NOT NULL DEFAULT 1 CHECK (servings > 0),
    flavors TEXT NOT NULL DEFAULT '[]',
    fillings TEXT NOT NULL DEFAULT '[]',
    coverings TEXT NOT NULL DEFAULT '[]',
    extras TEXT NOT NULL DEFAULT '[]',
    labor_minutes REAL NOT NULL DEFAULT 0,
    other_costs REAL NOT NULL DEFAULT 0,
    stages TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE product_sizes (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    servings REAL NOT NULL CHECK (servings > 0),
    price REAL NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_product_sizes_product ON product_sizes(product_id);

  CREATE TABLE product_components (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT CHECK (unit IS NULL OR unit IN ('g','kg','ml','l','ud')),
    per_serving INTEGER NOT NULL DEFAULT 0,
    size_id INTEGER REFERENCES product_sizes(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0,
    CHECK ((recipe_id IS NULL) <> (item_id IS NULL))
  );
  CREATE INDEX idx_product_components_product ON product_components(product_id);

  CREATE TABLE quotes (
    id INTEGER PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    date TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    delivery_date TEXT,
    delivery_time TEXT,
    delivery_type TEXT NOT NULL DEFAULT 'pickup' CHECK (delivery_type IN ('pickup','delivery')),
    delivery_address TEXT,
    delivery_fee REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    allergens TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    order_date TEXT NOT NULL,
    delivery_date TEXT NOT NULL,
    delivery_time TEXT,
    production_date TEXT,
    delivery_type TEXT NOT NULL DEFAULT 'pickup' CHECK (delivery_type IN ('pickup','delivery')),
    delivery_address TEXT,
    delivery_fee REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    payment_method TEXT,
    status TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo','confirmado','pendiente','en_preparacion','terminado','entregado','cancelado')),
    allergens TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
    stock_consumed_at TEXT,
    confirmed_at TEXT,
    delivered_at TEXT,
    cancelled_at TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_orders_delivery ON orders(delivery_date, delivery_time);
  CREATE INDEX idx_orders_status ON orders(status);
  CREATE INDEX idx_orders_customer ON orders(customer_id);

  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    size_id INTEGER REFERENCES product_sizes(id) ON DELETE SET NULL,
    size_name TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    servings REAL,
    flavor TEXT,
    filling TEXT,
    coverage TEXT,
    decoration TEXT,
    custom_text TEXT,
    extras TEXT NOT NULL DEFAULT '[]',
    unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0,
    notes TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_order_items_order ON order_items(order_id);

  CREATE TABLE quote_items (
    id INTEGER PRIMARY KEY,
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    size_id INTEGER REFERENCES product_sizes(id) ON DELETE SET NULL,
    size_name TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    servings REAL,
    flavor TEXT,
    filling TEXT,
    coverage TEXT,
    decoration TEXT,
    custom_text TEXT,
    extras TEXT NOT NULL DEFAULT '[]',
    unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0,
    notes TEXT,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);

  CREATE TABLE order_images (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_order_images_order ON order_images(order_id);

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('deposit','payment','refund','direct_sale')),
    amount REAL NOT NULL CHECK (amount >= 0),
    method TEXT NOT NULL,
    description TEXT,
    paid_at TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_payments_order ON payments(order_id);
  CREATE INDEX idx_payments_paid ON payments(paid_at);

  CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount >= 0),
    supplier TEXT,
    payment_method TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_expenses_date ON expenses(date);

  CREATE TABLE inventory_movements (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('purchase','consumption','adjustment','waste')),
    quantity REAL NOT NULL,
    unit_cost REAL,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
    note TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_movements_item ON inventory_movements(item_id, created_at);
  CREATE INDEX idx_movements_order ON inventory_movements(order_id);
  CREATE INDEX idx_movements_expense ON inventory_movements(expense_id);

  CREATE TABLE production_tasks (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
    stage TEXT NOT NULL CHECK (stage IN ('preparar','hornear','rellenar','decorar','empaquetar','entregar')),
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    done_at TEXT,
    done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_tasks_order ON production_tasks(order_id);

  CREATE TABLE shopping_extras (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    quantity TEXT,
    item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
    done INTEGER NOT NULL DEFAULT 0,
    done_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE shopping_checks (
    item_id INTEGER PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
    checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE reminders (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    due_date TEXT,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    done INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,
];
