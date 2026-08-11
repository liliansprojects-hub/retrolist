import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { LocalAuthProvider } from '@/lib/LocalAuthContext';
import ScrollToTop from './components/ScrollToTop';
import { ThemeProvider } from '@/lib/theme';
import { SyncProvider } from '@/lib/SyncContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import FolderDetail from '@/pages/FolderDetail';
import Journal from '@/pages/Journal';
import Alarms from '@/pages/Alarms';
import MapPage from '@/pages/MapPage';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import Register from '@/pages/Register';

const AuthenticatedApp = () => {
  return (
    <SyncProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/folder/:id" element={<FolderDetail />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/alarms" element={<Alarms />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </SyncProvider>
  );
};

function App() {

  return (
    <AuthProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <LocalAuthProvider>
              <AuthenticatedApp />
            </LocalAuthProvider>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}

export default App