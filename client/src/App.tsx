import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { SessionView } from './pages/SessionView';
import { JoinSession } from './pages/JoinSession';
import { SwipeSession } from './pages/SwipeSession';
import { Results } from './pages/Results';
import QuickSession from './pages/QuickSession';
import { ShareSession } from './pages/ShareSession';
import { WeekPlan } from './pages/WeekPlan';
import { ShoppingList } from './pages/ShoppingList';
import { CookingRecipe } from './pages/CookingRecipe';
import { FamilyNav } from './components/FamilyNav';
import { FamilyHeader } from './components/FamilyHeader';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Opening your kitchen…</div>;
  return user ? <Navigate to="/week" replace /> : <QuickSession />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/week" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  const location = useLocation();
  const familyPage = ['/week', '/shopping', '/recipes'].includes(location.pathname);
  return (
    <div className={user ? "family-content" : undefined}>
    {user && familyPage && <FamilyHeader />}
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Home />} />
      <Route path="/quick" element={<QuickSession />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      {/* Participant routes (no auth required) */}
      <Route path="/join/:inviteCode" element={<JoinSession />} />
      <Route path="/session/:sessionId/share" element={<ShareSession />} />
      <Route path="/session/:sessionId/swipe" element={<SwipeSession />} />
      <Route path="/results/:sessionId" element={<Results />} />

      {/* Protected routes */}
      <Route path="/week" element={<ProtectedRoute><WeekPlan /></ProtectedRoute>} />
      <Route path="/recipes" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/shopping" element={<ProtectedRoute><ShoppingList /></ProtectedRoute>} />
      <Route path="/cook/:mealId" element={<ProtectedRoute><CookingRecipe /></ProtectedRoute>} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/session/:sessionId"
        element={
          <ProtectedRoute>
            <SessionView />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    {user && <FamilyNav />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
