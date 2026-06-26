import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Invite } from './pages/Invite';
import { Home } from './pages/Home';
import { MisPronosticos } from './pages/MisPronosticos';
import { Clasificacion } from './pages/Clasificacion';
import { Ranking } from './pages/Ranking';
import { Comunidad } from './pages/Comunidad';
import { Chat } from './pages/Chat';
import { Admin } from './pages/Admin';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invite" element={<Invite />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/pronosticos" element={<MisPronosticos />} />
            <Route path="/clasificacion" element={<Clasificacion />} />
            <Route path="/ranking" element={<Ranking />} />
            <Route path="/comunidad" element={<Comunidad />} />
            <Route path="/chat" element={<Chat />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <Admin />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
