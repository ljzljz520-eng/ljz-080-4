import { Routes, Route } from 'react-router-dom';
import AppShell from './components/AppShell';
import Toasts from './components/Toasts';
import Dashboard from './pages/Dashboard';
import SyncPage from './pages/SyncPage';
import OrdersPage from './pages/OrdersPage';
import TechPage from './pages/TechPage';
import CustomerPage from './pages/CustomerPage';

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="sync" element={<SyncPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="tech" element={<TechPage />} />
          <Route path="tech/orders/:id" element={<TechPage />} />
          <Route path="customer" element={<CustomerPage />} />
          <Route path="customer/:id" element={<CustomerPage />} />
        </Route>
      </Routes>
      <Toasts />
    </>
  );
}
