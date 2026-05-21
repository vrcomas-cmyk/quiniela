import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Fase } from '../types';
import { Countdown } from '../components/Countdown';
import { useAuthCtx } from '../hooks/AuthContext';
import { fmtFecha, estaAbierto, estaCerrado, antesDeAbrir } from '../lib/fechas';

export function Home() {
  const { profile } = useAuthCtx();
  const [fases, setFases] = useState<Fase[]>([]);
  const [misPuntos, setMisPuntos] = useState<number | null>(null);
  const [miPosicion, setMiPosicion] = useState<number | null>(null);
  const [totalJugadores, setTotalJugadores] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: fasesData } = await supabase
        .from('fases').select('*').order('orden');
      setFases((fasesData ?? []) as Fase[]);

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

  return (
    <div className="space-y-6">
      {/* Hero / saludo */}
      <div className="card p-6 bg-gradient-to-br from-pitch-700 to-pitch-900 text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-10 text-[200px] opacity-10">⚽</div>
        <div className="relative">
          <h2 className="font-display text-3xl tracking-wider">
            ¡HOLA, {profile?.nombre_completo.split(' ')[0].toUpperCase()}!
          </h2>
          <p className="text-pitch-100 mt-2 max-w-2xl">
            Tus pronósticos te esperan. Acumula puntos en cada fase, conserva tu lugar en el ranking,
            y al final del torneo presume que lo viste venir.
          </p>
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
        </div>
      </div>

      {/* Fases */}
      <div>
        <h3 className="font-display text-2xl text-ink-900 mb-3">FASES DEL TORNEO</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fases.map((f) => {
            const abierta = estaAbierto(f.fecha_apertura, f.fecha_cierre);
            const cerrada = estaCerrado(f.fecha_cierre);
            const futura = antesDeAbrir(f.fecha_apertura);
            return (
              <div key={f.id} className="card p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg">{f.nombre}</span>
                  {abierta && <span className="badge-open">● ABIERTA</span>}
                  {cerrada && !abierta && <span className="badge-closed">CERRADA</span>}
                  {futura && <span className="badge-pending">PRÓXIMAMENTE</span>}
                </div>
                <div className="text-xs text-ink-700">
                  <div>Marcador exacto: <b>{f.pts_marcador_exacto} pts</b></div>
                  <div>Acierto resultado: <b>{f.pts_acierto_resultado} pts</b></div>
                </div>
                {f.fecha_cierre && (
                  <div className="text-xs text-ink-700">
                    Cierra: {fmtFecha(f.fecha_cierre)}
                  </div>
                )}
                {abierta && f.fecha_cierre && (
                  <Countdown fechaCierre={f.fecha_cierre} />
                )}
                <Link
                  to="/pronosticos"
                  className={abierta ? 'btn-accent text-sm mt-1' : 'btn-ghost text-sm mt-1'}
                >
                  {abierta ? 'Pronosticar' : 'Ver detalles'}
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reglas resumen */}
      <div className="card p-6">
        <h3 className="font-display text-2xl text-ink-900 mb-3">CÓMO SE GANAN PUNTOS</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <b className="text-pitch-700">Fase de Grupos</b>
            <ul className="mt-1 space-y-1 text-ink-700">
              <li>• Marcador exacto: <b>4 puntos</b></li>
              <li>• Acierto a ganador/empate: <b>2 puntos</b></li>
              <li>• 1° y 2° de cada grupo (posición exacta): <b>4 pts</b>; sin posición: <b>2 pts</b></li>
              <li>• 8 mejores terceros (sin importar grupo): <b>2 pts</b> c/u</li>
            </ul>
          </div>
          <div>
            <b className="text-pitch-700">Eliminatorias (16vos → Semifinales)</b>
            <ul className="mt-1 space-y-1 text-ink-700">
              <li>• Marcador exacto: <b>6 puntos</b></li>
              <li>• Acierto a ganador/empate: <b>3 puntos</b></li>
            </ul>
            <b className="text-pitch-700 mt-3 block">Final + Top 4</b>
            <ul className="mt-1 space-y-1 text-ink-700">
              <li>• Campeón (posición exacta): <b>8 pts</b></li>
              <li>• 2°, 3°, 4° (posición exacta): <b>5 pts</b> c/u</li>
              <li>• Equipo en top 4, posición errada: <b>3 pts</b></li>
              <li>• <b>Bono</b> 4 finalistas en orden exacto: <b>+5 pts</b></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
