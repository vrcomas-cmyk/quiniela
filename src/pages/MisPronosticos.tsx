import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Fase, Grupo, Partido, PronosticoPartido } from '../types';
import { useAuthCtx } from '../hooks/AuthContext';
import { Countdown } from '../components/Countdown';
import { fmtFechaCorta, estaCerrado, antesDeAbrir } from '../lib/fechas';
import { Bandera } from '../lib/banderas';

interface PartidoConPronostico extends Partido {
  pronostico?: PronosticoPartido;
}

export function MisPronosticos() {
  const { user } = useAuthCtx();
  const [fases, setFases] = useState<Fase[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [partidos, setPartidos] = useState<PartidoConPronostico[]>([]);
  const [faseSel, setFaseSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  // Estado local de pronósticos (lo que el usuario está editando)
  const [edits, setEdits] = useState<Record<string, { local: string; visit: string }>>({});

  const cargarTodo = async () => {
    setLoading(true);
    const [fasesRes, gruposRes] = await Promise.all([
      supabase.from('fases').select('*').order('orden'),
      supabase.from('grupos').select('*').order('codigo'),
    ]);
    const fasesArr = (fasesRes.data ?? []) as Fase[];
    setFases(fasesArr);
    setGrupos((gruposRes.data ?? []) as Grupo[]);

    // Seleccionar fase abierta o la siguiente
    const abierta = fasesArr.find(
      (f) => f.fecha_apertura && f.fecha_cierre &&
        new Date(f.fecha_apertura) <= new Date() && new Date(f.fecha_cierre) > new Date()
    );
    const inicial = faseSel ?? abierta?.id ?? fasesArr[0]?.id;
    setFaseSel(inicial ?? null);

    if (inicial) {
      await cargarPartidos(inicial);
    }
    setLoading(false);
  };

  const cargarPartidos = async (faseId: string) => {
    const { data: pData } = await supabase
      .from('partidos').select('*').eq('fase_id', faseId).order('numero');
    const partidosArr = (pData ?? []) as Partido[];

    const { data: pronosData } = await supabase
      .from('pronosticos_partido')
      .select('*')
      .eq('user_id', user!.id)
      .in('partido_id', partidosArr.map(p => p.id));

    const mapaPron: Record<string, PronosticoPartido> = {};
    (pronosData ?? []).forEach((p: any) => { mapaPron[p.partido_id] = p; });

    const conPron = partidosArr.map(p => ({ ...p, pronostico: mapaPron[p.id] }));
    setPartidos(conPron);

    // Inicializar edits
    const ed: Record<string, { local: string; visit: string }> = {};
    conPron.forEach(p => {
      ed[p.id] = {
        local: p.pronostico?.goles_local?.toString() ?? '',
        visit: p.pronostico?.goles_visitante?.toString() ?? '',
      };
    });
    setEdits(ed);
  };

  useEffect(() => { cargarTodo(); }, []);
  useEffect(() => {
    if (faseSel) cargarPartidos(faseSel);
  }, [faseSel]);

  const faseActual = fases.find(f => f.id === faseSel);

  const numPronosticados = useMemo(
    () => partidos.filter(p => p.pronostico).length,
    [partidos]
  );

  const partidosPorGrupo = useMemo(() => {
    const m: Record<string, PartidoConPronostico[]> = {};
    partidos.forEach(p => {
      const key = p.grupo_id ?? 'sin_grupo';
      if (!m[key]) m[key] = [];
      m[key].push(p);
    });
    return m;
  }, [partidos]);

  const guardarPartido = async (p: PartidoConPronostico) => {
    setMsg(null);
    const e = edits[p.id];
    if (!e || e.local === '' || e.visit === '') {
      setMsg({ tipo: 'err', texto: 'Debes capturar ambos marcadores.' });
      return;
    }
    const gl = parseInt(e.local, 10);
    const gv = parseInt(e.visit, 10);
    if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) {
      setMsg({ tipo: 'err', texto: 'Marcadores inválidos.' });
      return;
    }

    const payload = {
      user_id: user!.id,
      partido_id: p.id,
      goles_local: gl,
      goles_visitante: gv,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('pronosticos_partido')
      .upsert(payload, { onConflict: 'user_id,partido_id' });

    if (error) {
      setMsg({ tipo: 'err', texto: `Error: ${error.message}` });
    } else {
      setMsg({ tipo: 'ok', texto: `✓ Guardado: ${p.equipo_local} ${gl}–${gv} ${p.equipo_visitante}` });
      if (faseSel) cargarPartidos(faseSel);
    }
  };

  const guardarTodos = async () => {
    if (!faseActual) return;
    setMsg(null);
    const rows: any[] = [];
    for (const p of partidos) {
      if (estaCerrado(p.cierre_pronostico ?? faseActual.fecha_cierre)) continue;
      const e = edits[p.id];
      if (!e || e.local === '' || e.visit === '') continue;
      const gl = parseInt(e.local, 10);
      const gv = parseInt(e.visit, 10);
      if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) continue;
      rows.push({
        user_id: user!.id,
        partido_id: p.id,
        goles_local: gl,
        goles_visitante: gv,
        updated_at: new Date().toISOString(),
      });
    }
    if (rows.length === 0) {
      setMsg({ tipo: 'err', texto: 'No hay pronósticos válidos para guardar.' });
      return;
    }
    const { error } = await supabase
      .from('pronosticos_partido')
      .upsert(rows, { onConflict: 'user_id,partido_id' });
    if (error) {
      setMsg({ tipo: 'err', texto: `Error: ${error.message}` });
    } else {
      setMsg({ tipo: 'ok', texto: `✓ Guardados ${rows.length} pronósticos.` });
      if (faseSel) cargarPartidos(faseSel);
    }
  };

  if (loading) return <div className="text-center py-12 text-pitch-700">Cargando partidos…</div>;

  const cierreEfectivoFase = faseActual?.fecha_cierre ?? null;
  const faseCerrada = estaCerrado(cierreEfectivoFase);
  const faseNoAbierta = antesDeAbrir(faseActual?.fecha_apertura ?? null);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="label">Selecciona la fase</label>
        <div className="flex flex-wrap gap-2">
          {fases.map(f => (
            <button
              key={f.id}
              onClick={() => setFaseSel(f.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
                f.id === faseSel
                  ? 'bg-pitch-600 text-white'
                  : 'bg-pitch-50 text-pitch-700 hover:bg-pitch-100'
              }`}
              disabled={!f.publicada}
              title={!f.publicada ? 'Aún no publicada por el admin' : ''}
            >
              {f.nombre}
              {!f.publicada && ' 🔒'}
            </button>
          ))}
        </div>
      </div>

      {faseActual && (
        <div className="card p-4 bg-gradient-to-r from-pitch-700 to-pitch-900 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-2xl">{faseActual.nombre.toUpperCase()}</h3>
              <div className="text-xs text-pitch-100">
                Exacto: <b>{faseActual.pts_marcador_exacto} pts</b> ·
                Acierto resultado: <b>{faseActual.pts_acierto_resultado} pts</b>
              </div>
              {partidos.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-pitch-100 mb-1">
                    Llevas <b className="text-fire-400">{numPronosticados}</b> de <b>{partidos.length}</b> partidos pronosticados
                    {numPronosticados < partidos.length && !faseCerrada && (
                      <span className="text-fire-400"> · te faltan {partidos.length - numPronosticados}</span>
                    )}
                  </div>
                  <div className="w-48 h-2 bg-pitch-900/40 rounded-full overflow-hidden">
                    <div className="h-full bg-fire-500 transition-all"
                      style={{ width: `${partidos.length ? (numPronosticados / partidos.length) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div>
              {faseNoAbierta && faseActual.fecha_apertura && (
                <div className="text-right">
                  <span className="badge-pending">AÚN NO ABRE</span>
                  <div className="mt-1">
                    <Countdown fechaCierre={faseActual.fecha_apertura} prefix="Abre en" />
                  </div>
                </div>
              )}
              {!faseNoAbierta && !faseActual.fecha_cierre && (
                <span className="badge-pending">No abierta</span>
              )}
              {!faseNoAbierta && faseActual.fecha_cierre && !faseCerrada && (
                <Countdown fechaCierre={faseActual.fecha_cierre} />
              )}
              {!faseNoAbierta && faseCerrada && faseActual.fecha_cierre && (
                <span className="badge-closed">CERRADA</span>
              )}
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${
          msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {msg.texto}
        </div>
      )}

      {faseNoAbierta && faseActual && faseActual.fecha_apertura && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-amber-800 text-sm flex items-center gap-2">
          <span className="text-xl">🔒</span>
          <span>
            Los pronósticos de <b>{faseActual.nombre}</b> todavía no abren. Podrás capturar tus
            marcadores a partir del <b>{fmtFechaCorta(faseActual.fecha_apertura)}</b>. Mientras tanto,
            puedes ver los partidos pero no editarlos.
          </span>
        </div>
      )}

      {!faseCerrada && !faseNoAbierta && partidos.length > 0 && (
        <div className="flex justify-end">
          <button className="btn-accent" onClick={guardarTodos}>
            Guardar todos los marcadores de esta fase
          </button>
        </div>
      )}

      {/* Listado de partidos agrupados */}
      {faseActual?.codigo === 'grupos' ? (
        grupos.map(g => {
          const ps = partidosPorGrupo[g.id] ?? [];
          if (ps.length === 0) return null;
          return (
            <div key={g.id} className="card p-4">
              <h4 className="font-display text-xl text-pitch-700 mb-3">{g.nombre}</h4>
              <div className="space-y-2">
                {ps.map(p => renderPartido(p))}
              </div>
            </div>
          );
        })
      ) : (
        <div className="card p-4">
          <div className="space-y-2">
            {partidos.map(p => renderPartido(p))}
          </div>
        </div>
      )}
    </div>
  );

  function renderPartido(p: PartidoConPronostico) {
    const cierreP = p.cierre_pronostico ?? faseActual?.fecha_cierre ?? null;
    // Bloqueado si: aún no abre la fase, O ya pasó el cierre
    const noHaAbierto = antesDeAbrir(faseActual?.fecha_apertura ?? null);
    const pCerrado = noHaAbierto || estaCerrado(cierreP);
    const tieneResultado = p.goles_local_oficial !== null && p.goles_visitante_oficial !== null;
    const e = edits[p.id] ?? { local: '', visit: '' };

    return (
      <div key={p.id} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-pitch-100 last:border-0">
        <div className="col-span-12 sm:col-span-2 text-xs text-ink-700">
          {p.numero && <span className="font-mono mr-2">#{p.numero}</span>}
          {fmtFechaCorta(p.fecha_partido)}
          {p.sede && <div className="text-[10px] text-ink-700/60">{p.sede}</div>}
        </div>

        <div className="col-span-5 sm:col-span-3 text-right">
          <span className="font-semibold"><Bandera equipo={p.equipo_local} /> {p.equipo_local}</span>
        </div>

        <div className="col-span-2 sm:col-span-3 flex items-center justify-center gap-1">
          <input
            type="number" min={0} max={20}
            className="input w-12 text-center px-1 py-1"
            value={noHaAbierto ? '' : e.local}
            disabled={pCerrado}
            placeholder={noHaAbierto ? '–' : ''}
            onChange={(ev) => setEdits(s => ({ ...s, [p.id]: { ...s[p.id], local: ev.target.value } }))}
          />
          <span className="text-ink-700">–</span>
          <input
            type="number" min={0} max={20}
            className="input w-12 text-center px-1 py-1"
            value={noHaAbierto ? '' : e.visit}
            disabled={pCerrado}
            placeholder={noHaAbierto ? '–' : ''}
            onChange={(ev) => setEdits(s => ({ ...s, [p.id]: { ...s[p.id], visit: ev.target.value } }))}
          />
        </div>

        <div className="col-span-5 sm:col-span-2">
          <span className="font-semibold"><Bandera equipo={p.equipo_visitante} /> {p.equipo_visitante}</span>
        </div>

        <div className="col-span-12 sm:col-span-2 flex justify-end items-center gap-2">
          {tieneResultado && (
            <span className="badge bg-pitch-50 text-pitch-700">
              Oficial: {p.goles_local_oficial}–{p.goles_visitante_oficial}
            </span>
          )}
          {p.pronostico && (
            <span className={`badge ${
              p.pronostico.puntos_obtenidos > 0
                ? 'bg-fire-500 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}>
              {p.pronostico.puntos_obtenidos} pts
            </span>
          )}
          {!pCerrado && (
            <button
              onClick={() => guardarPartido(p)}
              className="text-xs px-2 py-1 bg-pitch-600 text-white rounded font-semibold hover:bg-pitch-700"
            >
              Guardar
            </button>
          )}
          {noHaAbierto && (
            <span className="text-xs text-amber-600">Aún no abre</span>
          )}
          {!noHaAbierto && pCerrado && !p.pronostico && (
            <span className="text-xs text-gray-500">Sin pronóstico</span>
          )}
        </div>
      </div>
    );
  }
}
