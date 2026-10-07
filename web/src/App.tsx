import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { Login, Setup } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Orders } from './pages/Orders';
import { OrderDetail } from './pages/OrderDetail';
import { OrderForm } from './pages/OrderForm';
import { CalendarPage } from './pages/Calendar';
import { Production } from './pages/Production';
import { More } from './pages/More';
import { Customers, CustomerDetail } from './pages/Customers';
import { Recipes } from './pages/Recipes';
import { RecipeDetail } from './pages/RecipeDetail';
import { RecipeForm } from './pages/RecipeForm';
import { Inventory, InventoryItemPage } from './pages/Inventory';
import { Shopping } from './pages/Shopping';
import { Finance } from './pages/Finance';
import { Catalog, ProductDetail } from './pages/Catalog';
import { ProductForm } from './pages/ProductForm';
import { Costing } from './pages/Costing';
import { Quotes, QuoteDetail } from './pages/Quotes';
import { Reminders } from './pages/Reminders';
import { SettingsPage } from './pages/Settings';

export function App() {
  const { loading, user, needsSetup, permissions } = useAuth();
  if (loading) return <Loading text="Abriendo el obrador…" />;
  if (!user) return needsSetup ? <Setup /> : <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="pedidos" element={<Orders />} />
        <Route path="pedidos/nuevo" element={<OrderForm mode="order" />} />
        <Route path="pedidos/:id" element={<OrderDetail />} />
        <Route path="pedidos/:id/editar" element={<OrderForm mode="order" />} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="produccion" element={<Production />} />
        <Route path="mas" element={<More />} />
        <Route path="clientes" element={<Customers />} />
        <Route path="clientes/:id" element={<CustomerDetail />} />
        <Route path="recetas" element={<Recipes />} />
        <Route path="recetas/nueva" element={<RecipeForm />} />
        <Route path="recetas/:id" element={<RecipeDetail />} />
        <Route path="recetas/:id/editar" element={<RecipeForm />} />
        <Route path="inventario" element={<Inventory />} />
        <Route path="inventario/:id" element={<InventoryItemPage />} />
        <Route path="compras" element={<Shopping />} />
        <Route path="finanzas" element={permissions.finances ? <Finance /> : <Navigate to="/" replace />} />
        <Route path="catalogo" element={<Catalog />} />
        <Route path="catalogo/nuevo" element={<ProductForm />} />
        <Route path="catalogo/:id" element={<ProductDetail />} />
        <Route path="catalogo/:id/editar" element={<ProductForm />} />
        <Route path="catalogo/:id/escandallo" element={permissions.costs ? <Costing /> : <Navigate to="/catalogo" replace />} />
        <Route path="presupuestos" element={<Quotes />} />
        <Route path="presupuestos/nuevo" element={<OrderForm mode="quote" />} />
        <Route path="presupuestos/:id" element={<QuoteDetail />} />
        <Route path="presupuestos/:id/editar" element={<OrderForm mode="quote" />} />
        <Route path="avisos" element={<Reminders />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
