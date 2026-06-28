import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Fase } from '../types';
import { Countdown } from '../components/Countdown';
import { Markdown } from '../components/Markdown';
import { useAuthCtx } from '../hooks/AuthContext';
import { useConfig } from '../hooks/useConfig';
import { fmtFecha, antesDeAbrir } from '../lib/fechas';
import { faseCorrienteId, faseTieneAbierto, ultimoCierreFase } from '../lib/faseActual';
import { Bandera } from '../lib/banderas';

export function Home() {
  const { profile } = useAuthCtx();
  const { valor: reglas } = useConfig('reglas_puntuacion');
  const { valor: bienvenida } = useConfig('texto_bienvenida');
  const { valor: premios } = useConfig('texto_premios');
  const [fases, setFases] = useState<Fase[]>([]);
  const [misPuntos, setMisPuntos] = useState<number | null>(null);
  const [miPosicion, setMiPosicion] = useState<number | null>(null);
  const [totalJugadores, setTotalJugadores] = useState(0);
  const [siguientePartido, setSiguientePartido] = useState<any>(null);
  const [partidosAll, setPartidosAll] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: fasesData } = await supabase
        .from('fases').select('*').order('orden');
      setFases((fasesData ?? []) as Fase[]);

      // Traer todos los partidos (para calcular fase corriente y estados por partido)
      const ahora = new Date().toISOString();
      const { data: prox } = await supabase
        .from('partidos')
        .select('*, fases!inner(nombre, fecha_cierre, orden)')
        .order('fecha_partido', { ascending: true });
      const todos = (prox ?? []) as any[];
      setPartidosAll(todos);

      // Siguiente partido cuyo pronóstico aún NO cierra (cierre más próximo)
      const candidato = todos
        .map(p => ({ ...p, cierreEf: p.cierre_pronostico ?? p.fases?.fecha_cierre ?? null }))
        .filter(p => p.cierreEf && p.cierreEf > ahora)
        .sort((a, b) => (a.cierreEf < b.cierreEf ? -1 : 1))[0];
      setSiguientePartido(candidato ?? null);

      const { data: ranking } = await supabase
        .from('ranking').select('user_id, puntos_totales');
      if (ranking && profile) {
        setTotalJugadores(ranking.length);
        const idx = ranking.findIndex((r: any) => r.user_id === profile.id);
        if (idx >= 0) {
          setMiPosicion(idx + 1);
          setMisPuntos(ranking[idx].puntos_totales);
        }
      }
    })();
  }, [profile]);

  // Fase corriente (según partidos abiertos) y orden con la corriente primero
  const corrienteId = faseCorrienteId(
    fases.map(f => ({ id: f.id, orden: f.orden, fecha_cierre: f.fecha_cierre })),
    partidosAll
  );
  const fasesOrdenadas = [...fases].sort((a, b) => {
    if (a.id === corrienteId) return -1;
    if (b.id === corrienteId) return 1;
    return a.orden - b.orden;
  });

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-br from-pitch-700 to-pitch-900 text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 text-[200px] opacity-10">⚽</div>
        <div className="relative">
          <h2 className="font-display text-3xl tracking-wider">
            ¡HOLA, {profile?.nombre_completo.split(' ')[0].toUpperCase()}!
          </h2>
          <p className="text-pitch-100 mt-2 max-w-2xl">{bienvenida}</p>
          <div className="grid grid-cols-3 gap-4 mt-6 max-w-md">
            <div>
              <div className="text-3xl font-display text-fire-400">{misPuntos ?? 0}</div>
              <div className="text-xs text-pitch-100 uppercase tracking-widest">Mis Puntos</div>
            </div>
            <div>
              <div className="text-3xl font-display text-fire-400">
                {miPosicion ? `#${miPosicion}` : '—'}
              </div>
              <div className="text-xs text-pitch-100 uppercase tracking-widest">Mi Lugar</div>
            </div>
            <div>
              <div className="text-3xl font-display text-fire-400">{totalJugadores}</div>
              <div className="text-xs text-pitch-100 uppercase tracking-widest">Jugadores</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-pitch-100">
            <Markdown text={premios} />
          </div>
        </div>
      </div>

      {siguientePartido && (
        <Link to="/pronosticos" className="block">
          <div className="card p-4 border-2 border-fire-400 bg-fire-50/50 hover:bg-fire-50 transition">
            <div className="text-xs uppercase tracking-widest text-fire-600 font-semibold mb-1">
              ⏰ Próximo cierre de pronóstico
            </div>
            <div className="font-display text-lg text-ink-900">
              <Bandera equipo={siguientePartido.equipo_local} /> {siguientePartido.equipo_local}
              {' vs '}
              <Bandera equipo={siguientePartido.equipo_visitante} /> {siguientePartido.equipo_visitante}
            </div>
            <div className="text-sm mt-1">
              <Countdown fechaCierre={siguientePartido.cierreEf} />
            </div>
            <div className="text-[11px] text-ink-700/70 mt-1">
              {fmtFecha(siguientePartido.fecha_partido)}
              {siguientePartido.sede ? ` · ${siguientePartido.sede}` : ''} · Toca para pronosticar ›
            </div>
          </div>
        </Link>
      )}

      <div>
        <h3 className="font-display text-2xl text-ink-900 mb-3">FASES DEL TORNEO</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fasesOrdenadas.map((f) => {
            const tieneAbierto = faseTieneAbierto(f.id, partidosAll, f.fecha_cierre ?? null);
            const tienePartidos = partidosAll.some(p => p.fase_id === f.id);
            const ultCierre = ultimoCierreFase(f.id, partidosAll, f.fecha_cierre ?? null);
            const futura = antesDeAbrir(f.fecha_apertura);
            const esCorriente = f.id === corrienteId;
            return (
              <div key={f.id} className={`card p-4 flex flex-col gap-2 ${esCorriente ? 'ring-2 ring-fire-400' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg">{f.nombre}</span>
                  {tieneAbierto && <span className="badge-open">● ABIERTA</span>}
                  {!tieneAbierto && tienePartidos && <span className="badge-closed">CERRADA</span>}
                  {!tienePartidos && futura && <span className="badge-pending">PRÓXIMAMENTE</span>}
                </div>
                {esCorriente && (
                  <span className="text-[10px] uppercase tracking-widest text-fire-600 font-semibold">Fase actual</span>
                )}
                <div className="text-xs text-ink-700">
                  <div>Marcador exacto: <b>{f.pts_marcador_exacto} pts</b></div>
                  <div>Acierto resultado: <b>{f.pts_acierto_resultado} pts</b></div>
                </div>
                {ultCierre && (
                  <div className="text-xs text-ink-700">
                    Último cierre: {fmtFecha(ultCierre)}
                  </div>
                )}
                {tieneAbierto && ultCierre && (
                  <Countdown fechaCierre={ultCierre} prefix="La fase cierra en" />
                )}
                <Link
                  to="/pronosticos"
                  className={tieneAbierto ? 'btn-accent text-sm mt-1' : 'btn-ghost text-sm mt-1'}
                >
                  {tieneAbierto ? 'Pronosticar' : 'Ver detalles'}
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-display text-2xl text-ink-900 mb-3">CÓMO SE GANAN LOS PUNTOS</h3>
        <Markdown text={reglas} className="text-sm text-ink-700" />
      </div>
    </div>
  );
}
