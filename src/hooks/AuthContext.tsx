import { createContext, useContext, ReactNode } from 'react';
import { useAuth } from './useAuth';

type AuthValue = ReturnType<typeof useAuth>;

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuth();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthCtx(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthCtx debe usarse dentro de <AuthProvider>');
  return ctx;
}
