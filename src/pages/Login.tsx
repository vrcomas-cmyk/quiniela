import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthCtx } from '../hooks/AuthContext';

export function Login() {
  const { signIn, signUp } = useAuthCtx();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        navigate('/');
      } else {
        if (nombre.trim().length < 3) {
          throw new Error('El nombre completo debe tener al menos 3 caracteres.');
        }
        await signUp(email, password, nombre.trim());
        setInfo('Cuenta creada. Si está habilitada la confirmación por email, revisa tu correo. Después inicia sesión.');
        setMode('login');
      }
    } catch (err: any) {
      setError(err.message ?? 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ink-900">
      <div className="absolute inset-0 opacity-30 pointer-events-none"
           style={{ backgroundImage: "radial-gradient(circle at 30% 30%, rgba(249,115,22,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(22,128,60,0.4) 0%, transparent 50%)" }}/>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">⚽</div>
          <h1 className="font-display text-4xl text-white tracking-wider">QUINIELA MUNDIAL</h1>
          <div className="text-fire-400 font-display text-2xl tracking-widest">2026</div>
          <div className="text-pitch-100 text-xs mt-2 tracking-widest">MÉXICO · USA · CANADÁ</div>
        </div>

        <div className="card p-6">
          <div className="flex gap-2 mb-4 p-1 bg-pitch-50 rounded-lg">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-md font-semibold text-sm transition ${
                mode === 'login' ? 'bg-white shadow text-pitch-700' : 'text-ink-700'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 rounded-md font-semibold text-sm transition ${
                mode === 'register' ? 'bg-white shadow text-pitch-700' : 'text-ink-700'
              }`}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label">Nombre completo</label>
                <input
                  type="text"
                  className="input"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Como aparecerá en el ranking"
                  required
                />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="text-sm bg-red-50 text-red-700 p-2 rounded">{error}</div>
            )}
            {info && (
              <div className="text-sm bg-green-50 text-green-700 p-2 rounded">{info}</div>
            )}

            <button type="submit" className="btn-accent w-full" disabled={loading}>
              {loading ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-pitch-100 text-xs mt-4">
          DEGASA · Quiniela #23 en la historia
        </p>
      </div>
    </div>
  );
}
