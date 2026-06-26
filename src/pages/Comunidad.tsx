import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Fase, Partido, Profile, PronosticoPartido } from '../types';
import { fmtFechaCorta, estaCerrado } from '../lib/fechas';
import { Bandera } from '../lib/banderas';
import { nombresCortos } from '../lib/nombresCortos';

interface CelaCell {
  goles_local: number;
  goles_visitante: number;
  puntos: number;
}

export function Comunidad() {
  const [fases, setFases] = useState<Fase[]>([]);
  const [faseSel, setFaseSel] = useState<string | null>(null);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [jugadores, setJugadores] = useState<Profile[]>([]);
  const [matriz, setMatriz] = useState<Record<string, Record<string, CelaCell>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('fases').select('*').order('orden');
      const arr = (data ?? []) as Fase[];
      setFases(arr);
      setFaseSel(arr[0]?.id ?? null);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!faseSel) return;
    (async () => {
      setLoading(true);
      const { data: pData } = await supabase
        .from('partidos').select('*').eq('fase_id', faseSel).order('fecha_partido', { nullsFirst: false }).order('numero');
      const partidosArr = (pData ?? []) as Partido[];
      setPartidos(partidosArr);

      const ids = partidosArr.map(p => p.id);
      if (ids.length === 0) {
        setMatriz({}); setJugadores([]); setLoading(false); return;
      }

      // Traer TODOS los pronósticos en bloques de 1000 (Supabase corta a 1000 por consulta).
      // Una fase de grupos tiene 72 partidos x ~100 jugadores = 7000+ filas.
      const pronosData: any[] = [];
      const TAM = 1000;
      let desde = 0;
      while (true) {
        const { data: bloque, error } = await supabase
          .from('pronosticos_partido')
          .select('user_id, partido_id, goles_local, goles_visitante, puntos_obtenidos')
          .in('partido_id', ids)
          .range(desde, desde + TAM - 1);
        if (error) break;
        const arr = bloque ?? [];
        pronosData.push(...arr);
        if (arr.length < TAM) break;
        desde += TAM;
      }

      // Cargar TODOS los jugadores desde profiles (no deducirlos de los pronósticos),
      // para que todas las columnas aparezcan aunque a alguien le falte un pronóstico.
      const { data: profData } = await supabase
        .from('profiles').select('*').eq('rol', 'jugador');
      setJugadores(((profData ?? []) as Profile[]).sort((a, b) =>
        a.nombre_completo.localeCompare(b.nombre_completo)
      ));

      const mat: Record<string, Record<string, CelaCell>> = {};
      pronosData.forEach((p: any) => {
        if (!mat[p.partido_id]) mat[p.partido_id] = {};
        mat[p.partido_id][p.user_id] = {
          goles_local: p.goles_local,
          goles_visitante: p.goles_visitante,
          puntos: p.puntos_obtenidos,
        };
      });
      setMatriz(mat);
      setLoading(false);
    })();
  }, [faseSel]);

  const fase = fases.find(f => f.id === faseSel);

  const nombresMap = nombresCortos(
    jugadores.map(j => ({ id: j.id, nombre_completo: j.nombre_completo, email: (j as any).email }))
  );

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="font-display text-2xl">PRONÓSTICOS DE LA COMUNIDAD</h2>
        <p className="text-sm text-ink-700">
          Una vez cerrada cada fase/partido, podrás ver lo que pronosticaron todos.
        </p>
      </div>

      <div className="card p-4">
        <label className="label">Selecciona la fase</label>
        <div className="flex flex-wrap gap-2">
          {fases.map(f => (
            <button
              key={f.id}
              onClick={() => setFaseSel(f.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
                f.id === faseSel ? 'bg-pitch-600 text-white' : 'bg-pitch-50 text-pitch-700'
              }`}
            >
              {f.nombre}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-center py-8 text-pitch-700">Cargando…</div>}

      {!loading && partidos.length > 0 && (
        <div className="card overflow-auto" style={{ maxHeight: '75vh' }}>
          <table className="text-xs border-separate" style={{ borderSpacing: 0 }}>
            <thead>
              <tr>
                <th className="text-left px-3 py-2 whitespace-nowrap sticky left-0 top-0 z-40 bg-pitch-100 text-pitch-700"
                    style={{ minWidth: 150 }}>
                  Partido
                </th>
                <th className="text-center px-2 py-2 sticky top-0 z-30 bg-pitch-100 text-pitch-700"
                    style={{ left: 150, minWidth: 60 }}>
                  Oficial
                </th>
                {jugadores.map(j => (
                  <th key={j.id} className="text-center px-2 py-2 whitespace-nowrap sticky top-0 z-20 bg-pitch-50 text-pitch-700">
                    {nombresMap[j.id] ?? j.nombre_completo.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {partidos.map(p => {
                const cierreP = p.cierre_pronostico ?? fase?.fecha_cierre ?? null;
                const cerrado = estaCerrado(cierreP);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2 sticky left-0 z-10 bg-white border-t border-pitch-100" style={{ minWidth: 150 }}>
                      <div className="font-semibold"><Bandera equipo={p.equipo_local} /> {p.equipo_local} vs <Bandera equipo={p.equipo_visitante} /> {p.equipo_visitante}</div>
                      <div className="text-[10px] text-ink-700">{fmtFechaCorta(p.fecha_partido)}</div>
                    </td>
                    <td className="px-2 py-2 text-center font-mono sticky z-10 bg-white border-t border-pitch-100"
                        style={{ left: 150, minWidth: 60 }}>
                      {p.goles_local_oficial !== null && p.goles_visitante_oficial !== null
                        ? `${p.goles_local_oficial}–${p.goles_visitante_oficial}`
                        : '—'}
                    </td>
                    {jugadores.map(j => {
                      if (!cerrado) {
                        return <td key={j.id} className="px-2 py-2 text-center text-gray-400 border-t border-pitch-100">🔒</td>;
                      }
                      const c = matriz[p.id]?.[j.id];
                      if (!c) return <td key={j.id} className="px-2 py-2 text-center text-gray-300 border-t border-pitch-100">—</td>;
                      const acerto = c.puntos > 0;
                      return (
                        <td key={j.id} className={`px-2 py-2 text-center font-mono border-t border-pitch-100 ${
                          acerto ? 'bg-fire-500/10 text-pitch-700 font-bold' : ''
                        }`}>
                          {c.goles_local}–{c.goles_visitante}
                          {c.puntos > 0 && <div className="text-[9px] text-fire-600">+{c.puntos}</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && partidos.length === 0 && (
        <div className="card p-8 text-center text-ink-700">
          No hay partidos en esta fase todavía.
        </div>
      )}
    </div>
  );
}
