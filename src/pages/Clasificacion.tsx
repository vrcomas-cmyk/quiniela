import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Fase, Grupo, PronosticoClasificacion } from '../types';
import { useAuthCtx } from '../hooks/AuthContext';
import { Countdown } from '../components/Countdown';
import { estaCerrado, antesDeAbrir } from '../lib/fechas';

const POSICIONES_FINALES = ['Campeón', 'Subcampeón', '3er Lugar', '4to Lugar'];

export function Clasificacion() {
  const { user } = useAuthCtx();
  const [faseGrupos, setFaseGrupos] = useState<Fase | null>(null);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [pronos, setPronos] = useState<PronosticoClasificacion[]>([]);
  const [todosEquipos, setTodosEquipos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  // Estado local de selecciones
  const [clasifGrupo, setClasifGrupo] = useState<Record<string, { p1: string; p2: string }>>({});
  const [terceros, setTerceros] = useState<string[]>(new Array(8).fill(''));
  const [top4, setTop4] = useState<string[]>(new Array(4).fill(''));

  const cargar = async () => {
    setLoading(true);
    const [fasesRes, gruposRes, partidosRes] = await Promise.all([
      supabase.from('fases').select('*').eq('codigo', 'grupos').single(),
      supabase.from('grupos').select('*').order('codigo'),
      supabase.from('partidos').select('equipo_local, equipo_visitante, grupo_id'),
    ]);
    setFaseGrupos(fasesRes.data as Fase);
    setGrupos((gruposRes.data ?? []) as Grupo[]);

    // Extraer todos los equipos únicos del torneo (de los partidos de fase de grupos)
    const setEq = new Set<string>();
    (partidosRes.data ?? []).forEach((p: any) => {
      setEq.add(p.equipo_local);
      setEq.add(p.equipo_visitante);
    });
    setTodosEquipos(Array.from(setEq).sort());

    if (user) {
      const { data: pronosData } = await supabase
        .from('pronosticos_clasificacion')
        .select('*')
        .eq('user_id', user.id);
      const arr = (pronosData ?? []) as PronosticoClasificacion[];
      setPronos(arr);

      // Inicializar estado
      const cg: Record<string, { p1: string; p2: string }> = {};
      (gruposRes.data ?? []).forEach((g: any) => {
        const p1 = arr.find(x => x.tipo === 'clasif_grupo' && x.grupo_id === g.id && x.posicion === 1)?.equipo ?? '';
        const p2 = arr.find(x => x.tipo === 'clasif_grupo' && x.grupo_id === g.id && x.posicion === 2)?.equipo ?? '';
        cg[g.id] = { p1, p2 };
      });
      setClasifGrupo(cg);

      const ts = new Array(8).fill('');
      arr.filter(x => x.tipo === 'tercero').slice(0, 8).forEach((x, i) => { ts[i] = x.equipo; });
      setTerceros(ts);

      const t4 = new Array(4).fill('');
      [1, 2, 3, 4].forEach((pos, i) => {
        const x = arr.find(y => y.tipo === 'top4' && y.posicion === pos);
        if (x) t4[i] = x.equipo;
      });
      setTop4(t4);
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [user]);

  const equiposPorGrupo = (grupoId: string): string[] => {
    // Aquí podríamos filtrar equipos por grupo, pero al inicio usamos todos
    return todosEquipos;
  };

  const guardar = async () => {
    if (!user || !faseGrupos) return;
    setMsg(null);

    // Validar que estemos en periodo
    if (antesDeAbrir(faseGrupos.fecha_apertura)) {
      setMsg({ tipo: 'err', texto: 'Los pronósticos de clasificación todavía no abren.' });
      return;
    }
    if (estaCerrado(faseGrupos.fecha_cierre)) {
      setMsg({ tipo: 'err', texto: 'La fase ya está cerrada.' });
      return;
    }

    // Borrar pronósticos previos
    await supabase.from('pronosticos_clasificacion').delete().eq('user_id', user.id);

    const rows: any[] = [];

    // 1° y 2° por grupo
    Object.entries(clasifGrupo).forEach(([grupoId, val]) => {
      if (val.p1) rows.push({ user_id: user.id, tipo: 'clasif_grupo', grupo_id: grupoId, posicion: 1, equipo: val.p1 });
      if (val.p2) rows.push({ user_id: user.id, tipo: 'clasif_grupo', grupo_id: grupoId, posicion: 2, equipo: val.p2 });
    });

    // 8 terceros
    terceros.forEach((eq) => {
      if (eq) rows.push({ user_id: user.id, tipo: 'tercero', equipo: eq });
    });

    // Top 4
    top4.forEach((eq, i) => {
      if (eq) rows.push({ user_id: user.id, tipo: 'top4', posicion: i + 1, equipo: eq });
    });

    if (rows.length === 0) {
      setMsg({ tipo: 'err', texto: 'No hay nada para guardar.' });
      return;
    }

    const { error } = await supabase.from('pronosticos_clasificacion').insert(rows);
    if (error) {
      setMsg({ tipo: 'err', texto: `Error: ${error.message}` });
    } else {
      setMsg({ tipo: 'ok', texto: `✓ Guardadas ${rows.length} selecciones.` });
      cargar();
    }
  };

  if (loading) return <div className="text-center py-12 text-pitch-700">Cargando…</div>;

  const noAbierta = antesDeAbrir(faseGrupos?.fecha_apertura ?? null);
  // "bloqueada" = no se puede editar (ni antes de abrir, ni después de cerrar)
  const cerrada = noAbierta || estaCerrado(faseGrupos?.fecha_cierre ?? null);

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-gradient-to-r from-pitch-700 to-pitch-900 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl">PRONÓSTICOS DE CLASIFICACIÓN</h3>
            <p className="text-sm text-pitch-100 mt-1">
              Esta sección se llena en la fase de grupos: 1° y 2° de cada grupo, los 8 mejores terceros,
              y tu top 4 final del Mundial. Tiene puntos adicionales sobre los pronósticos de partido.
            </p>
          </div>
          {noAbierta && faseGrupos?.fecha_apertura && (
            <div className="text-right">
              <span className="badge-pending">AÚN NO ABRE</span>
              <div className="mt-1">
                <Countdown fechaCierre={faseGrupos.fecha_apertura} prefix="Abre en" />
              </div>
            </div>
          )}
          {!noAbierta && !cerrada && faseGrupos?.fecha_cierre && (
            <Countdown fechaCierre={faseGrupos.fecha_cierre} />
          )}
          {!noAbierta && cerrada && <span className="badge-closed">CERRADA</span>}
        </div>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${
          msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>{msg.texto}</div>
      )}

      {noAbierta && faseGrupos?.fecha_apertura && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-amber-800 text-sm flex items-center gap-2">
          <span className="text-xl">🔒</span>
          <span>
            Los pronósticos de clasificación todavía no abren. Podrás capturarlos a partir
            del <b>{new Date(faseGrupos.fecha_apertura).toLocaleString('es-MX')}</b>.
          </span>
        </div>
      )}

      {/* 1° y 2° por grupo */}
      <div className="card p-4">
        <h4 className="font-display text-xl text-pitch-700 mb-3">1° y 2° de cada grupo (4 pts exacto / 2 pts sin posición)</h4>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {grupos.map(g => (
            <div key={g.id} className="border border-pitch-100 rounded-lg p-3">
              <div className="font-semibold text-pitch-700 mb-2">{g.nombre}</div>
              <label className="label">1° lugar</label>
              <select
                className="input mb-2"
                value={clasifGrupo[g.id]?.p1 ?? ''}
                disabled={cerrada}
                onChange={(e) => setClasifGrupo(s => ({ ...s, [g.id]: { ...s[g.id], p1: e.target.value } }))}
              >
                <option value="">— elige —</option>
                {equiposPorGrupo(g.id).map(eq => <option key={eq} value={eq}>{eq}</option>)}
              </select>
              <label className="label">2° lugar</label>
              <select
                className="input"
                value={clasifGrupo[g.id]?.p2 ?? ''}
                disabled={cerrada}
                onChange={(e) => setClasifGrupo(s => ({ ...s, [g.id]: { ...s[g.id], p2: e.target.value } }))}
              >
                <option value="">— elige —</option>
                {equiposPorGrupo(g.id).map(eq => <option key={eq} value={eq}>{eq}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* 8 terceros */}
      <div className="card p-4">
        <h4 className="font-display text-xl text-pitch-700 mb-3">Los 8 mejores terceros (2 pts c/u por acierto)</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {terceros.map((eq, i) => (
            <div key={i}>
              <label className="label">Tercero #{i + 1}</label>
              <select
                className="input"
                value={eq}
                disabled={cerrada}
                onChange={(e) => {
                  const v = [...terceros]; v[i] = e.target.value; setTerceros(v);
                }}
              >
                <option value="">— elige —</option>
                {todosEquipos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Top 4 final */}
      <div className="card p-4">
        <h4 className="font-display text-xl text-pitch-700 mb-3">Top 4 final del Mundial</h4>
        <p className="text-xs text-ink-700 mb-3">
          Campeón: 8 pts · 2°/3°/4° en posición exacta: 5 pts · Solo en top 4 (posición errada): 3 pts ·
          <b> Bono: 4 finalistas exactos = +5 pts.</b>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {POSICIONES_FINALES.map((etiqueta, i) => (
            <div key={i}>
              <label className="label">{etiqueta}</label>
              <select
                className="input"
                value={top4[i]}
                disabled={cerrada}
                onChange={(e) => {
                  const v = [...top4]; v[i] = e.target.value; setTop4(v);
                }}
              >
                <option value="">— elige —</option>
                {todosEquipos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {!cerrada && (
        <div className="flex justify-end sticky bottom-3">
          <button className="btn-accent text-base shadow-glow" onClick={guardar}>
            Guardar toda mi clasificación
          </button>
        </div>
      )}
    </div>
  );
}
