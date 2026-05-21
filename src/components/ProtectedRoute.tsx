import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuthCtx } from '../hooks/AuthContext';

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, profile, loading, isAdmin } = useAuthCtx();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-pitch-600 font-display text-2xl">Cargando…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/login" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
