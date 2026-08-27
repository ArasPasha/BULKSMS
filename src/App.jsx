import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useStoreLoaded } from './lib/hooks';
import { startInboxPolling } from './lib/sms';

import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Compose from './pages/Compose';
import Contacts from './pages/Contacts';
import Conversations from './pages/Conversations';
import Conversation from './pages/Conversation';
import Templates from './pages/Templates';
import History from './pages/History';
import Settings from './pages/Settings';

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/compose" element={<Compose />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/chats" element={<Conversations />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      {/* Conversation detail is outside the Layout so the chat can go full-height */}
      <Route path="/chats/:contactId" element={<Conversation />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  const loaded = useStoreLoaded();

  // Start inbox polling once the store is ready — this drives the whole
  // inbound/auto-reply loop. Safe to call multiple times; the poller
  // dedupes on message id.
  useEffect(() => {
    if (!loaded) return;
    const stop = startInboxPolling();
    return () => stop?.();
  }, [loaded]);

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
