import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStoreLoaded } from './lib/hooks';

import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Compose from './pages/Compose';
import Contacts from './pages/Contacts';
import History from './pages/History';
import Settings from './pages/Settings';

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/compose" element={<Compose />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  const loaded = useStoreLoaded();
  if (!loaded) {
    return (
      <div className="w-full max-w-app mx-auto bg-bg min-h-dvh flex flex-col items-center justify-center gap-4 text-primary">
        <span className="spinner spinner-lg" />
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }
  return (
    <BrowserRouter>
      <div className="w-full max-w-app bg-bg min-h-dvh relative overflow-x-hidden mx-auto">
        <AppRoutes />
      </div>
    </BrowserRouter>
  );
}
