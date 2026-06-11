import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthCtx } from '../hooks/AuthContext';
import { supabase } from '../lib/supabase';

export function Restablecer() {
  const { actualizarPassword } = useAuthCtx();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sesionLista, setSesionLista] = useState(false);

  // Cuando el usuario llega del link del correo, Supabase crea una sesión
  // temporal de recuperación. Esperamos a que esté disponible.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesionLista(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setSesionLista(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await actualizarPassword(password);
      setInfo('✓ Tu contraseña fue actualizada. Redirigiendo…');
      setTimeout(() => navigate('/'), 1500);
    } catch (err: any) {
      setError(err.message ?? 'Error al actualizar la contraseña.');
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
          <div className="text-5xl mb-2">🔒</div>
          <h1 className="font-display text-3xl text-white tracking-wider">RESTABLECER CONTRASEÑA</h1>
        </div>

        <div className="card p-6">
          {!sesionLista ? (
            <div className="text-sm text-ink-700">
              <p className="mb-2">Validando tu enlace de recuperación…</p>
              <p className="text-xs">
                Si llegaste aquí sin usar el enlace del correo, vuelve a
                {' '}<a href="/login" className="text-pitch-700 underline">iniciar sesión</a>{' '}
                y usa "¿Olvidaste tu contraseña?".
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-ink-700">Escribe tu nueva contraseña.</p>
              <div>
                <label className="label">Nueva contraseña</label>
                <input type="password" className="input" value={password}
                  onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div>
                <label className="label">Confirmar contraseña</label>
                <input type="password" className="input" value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)} required minLength={6} />
              </div>

              {error && <div className="text-sm bg-red-50 text-red-700 p-2 rounded">{error}</div>}
              {info && <div className="text-sm bg-green-50 text-green-700 p-2 rounded">{info}</div>}

              <button type="submit" className="btn-accent w-full" disabled={loading}>
                {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
