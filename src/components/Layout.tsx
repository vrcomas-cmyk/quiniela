import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthCtx } from '../hooks/AuthContext';

export function Layout() {
  const { profile, isAdmin, signOut } = useAuthCtx();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
      isActive
        ? 'bg-pitch-600 text-white'
        : 'text-pitch-100 hover:bg-pitch-700 hover:text-white'
    }`;

  return (
    <div className="min-h-screen">
      <header className="bg-ink-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fire-500 to-pitch-600 flex items-center justify-center font-display text-white text-lg">
                ⚽
              </div>
              <div>
                <h1 className="font-display text-xl leading-none tracking-wider">
                  QUINIELA MUNDIAL <span className="text-fire-500">2026</span>
                </h1>
                <div className="text-[10px] text-pitch-100 tracking-widest">DEGASA · MEX · USA · CAN</div>
              </div>
            </div>

            <nav className="hidden md:flex gap-1">
              <NavLink to="/" end className={linkClass}>Inicio</NavLink>
              <NavLink to="/pronosticos" className={linkClass}>Mis Pronósticos</NavLink>
              <NavLink to="/clasificacion" className={linkClass}>Clasificación</NavLink>
              <NavLink to="/ranking" className={linkClass}>Ranking</NavLink>
              <NavLink to="/comunidad" className={linkClass}>Comunidad</NavLink>
              <NavLink to="/chat" className={linkClass}>💬 Chat</NavLink>
              {isAdmin && <NavLink to="/admin" className={linkClass}>Admin</NavLink>}
            </nav>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold">{profile?.nombre_completo}</div>
                <div className="text-[10px] text-pitch-100 uppercase tracking-widest">
                  {isAdmin ? 'Administrador' : 'Jugador'}
                </div>
              </div>
              <button onClick={handleSignOut} className="btn-ghost text-white hover:bg-pitch-700">
                Salir
              </button>
            </div>
          </div>

          {/* Nav móvil */}
          <nav className="md:hidden flex flex-wrap gap-1 pb-2 -mx-1">
            <NavLink to="/" end className={linkClass}>Inicio</NavLink>
            <NavLink to="/pronosticos" className={linkClass}>Pronósticos</NavLink>
            <NavLink to="/clasificacion" className={linkClass}>Clasificación</NavLink>
            <NavLink to="/ranking" className={linkClass}>Ranking</NavLink>
            <NavLink to="/comunidad" className={linkClass}>Comunidad</NavLink>
              <NavLink to="/chat" className={linkClass}>💬 Chat</NavLink>
            {isAdmin && <NavLink to="/admin" className={linkClass}>Admin</NavLink>}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-pitch-100 py-6 text-center text-xs text-ink-700">
        Quiniela Mundial 2026 · DEGASA · 23º Mundial de la historia
      </footer>
    </div>
  );
}
