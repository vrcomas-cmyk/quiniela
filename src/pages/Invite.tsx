import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function Invite() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [invitacion, setInvitacion] = useState<{ email: string; nombre_completo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Falta el token de invitación en la URL.');
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error: err } = await supabase
        .from('invitaciones')
        .select('email, nombre_completo, usada_en, expira_en')
        .eq('token', token)
        .maybeSingle();
      if (err || !data) {
        setError('Invitación inválida o no encontrada.');
      } else if (data.usada_en) {
        setError('Esta invitación ya fue usada. Inicia sesión con tu email y contraseña.');
      } else if (new Date(data.expira_en) < new Date()) {
        setError('Esta invitación ya expiró. Pide al administrador que te envíe una nueva.');
      } else {
        setInvitacion({ email: data.email, nombre_completo: data.nombre_completo });
      }
      setLoading(false);
    })();
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (password !== password2) { setError('Las contraseñas no coinciden.'); return; }
    setSubmitting(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'activar', token, password }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) {
        setError(result.error ?? 'Error al activar la cuenta.');
      } else {
        // Iniciar sesión automáticamente
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email: result.email, password,
        });
        if (signErr) {
          setDone(true); // mostrar mensaje "ya puedes iniciar sesión"
        } else {
          navigate('/');
        }
      }
    } catch (err: any) {
      setError(err.message ?? 'Error de red');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-ink-900">
      <div className="absolute inset-0 opacity-30 pointer-events-none"
           style={{ backgroundImage: "radial-gradient(circle at 30% 30%, rgba(249,115,22,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(22,128,60,0.4) 0%, transparent 50%)" }}/>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">⚽</div>
          <h1 className="font-display text-4xl text-white tracking-wider">ACTIVA TU CUENTA</h1>
          <div className="text-fire-400 font-display text-2xl tracking-widest">QUINIELA 2026</div>
        </div>

        <div className="card p-6">
          {loading && <div className="text-center text-pitch-700">Verificando invitación…</div>}

          {!loading && error && (
            <>
              <div className="text-sm bg-red-50 text-red-700 p-3 rounded mb-4">{error}</div>
              <button onClick={() => navigate('/login')} className="btn-ghost w-full">
                Ir a iniciar sesión
              </button>
            </>
          )}

          {!loading && done && (
            <>
              <div className="text-sm bg-green-50 text-green-700 p-3 rounded mb-4">
                ✓ Cuenta activada. Ya puedes iniciar sesión.
              </div>
              <button onClick={() => navigate('/login')} className="btn-primary w-full">
                Iniciar sesión
              </button>
            </>
          )}

          {!loading && invitacion && !done && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-sm bg-pitch-50 text-pitch-700 p-3 rounded">
                <div><b>Hola, {invitacion.nombre_completo.split(' ')[0]}!</b></div>
                <div className="text-xs mt-1">Tu cuenta: <span className="font-mono">{invitacion.email}</span></div>
                <div className="text-xs mt-1">Crea tu contraseña para empezar a pronosticar.</div>
              </div>
              <div>
                <label className="label">Contraseña</label>
                <input type="password" className="input" value={password}
                  onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div>
                <label className="label">Confirma tu contraseña</label>
                <input type="password" className="input" value={password2}
                  onChange={(e) => setPassword2(e.target.value)} required minLength={6} />
              </div>
              {error && <div className="text-sm bg-red-50 text-red-700 p-2 rounded">{error}</div>}
              <button type="submit" className="btn-accent w-full" disabled={submitting}>
                {submitting ? 'Activando…' : 'Activar cuenta y entrar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
