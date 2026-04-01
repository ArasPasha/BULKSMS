import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import Layout from './components/layout/Layout';
import SignIn from './pages/auth/SignIn';
import SignUp from './pages/auth/SignUp';
import ForgotPassword from './pages/auth/ForgotPassword';
import MyStuff from './pages/MyStuff';
import AddItem from './pages/AddItem';
import ItemDetail from './pages/ItemDetail';
import Market from './pages/Market';
import Friends from './pages/Friends';
import Messages from './pages/Messages';
import Conversation from './pages/Conversation';
import Profile from './pages/Profile';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-screen">
        <span className="spinner" />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    );
  }
  return user ? children : <Navigate to="/sign-in" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/my-stuff" replace /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/sign-in" element={<PublicRoute><SignIn /></PublicRoute>} />
      <Route path="/sign-up" element={<PublicRoute><SignUp /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />

      {/* Protected — wrapped in Layout (bottom nav) */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/my-stuff" element={<MyStuff />} />
        <Route path="/add-item" element={<AddItem />} />
        <Route path="/item/:itemId" element={<ItemDetail />} />
        <Route path="/market" element={<Market />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:convId" element={<Conversation />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/my-stuff" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-shell">
          <AppRoutes />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
