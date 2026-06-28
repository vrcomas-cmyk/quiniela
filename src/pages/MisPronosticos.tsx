import { useEffect, useMemo, useRef, useState } from 'react';
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
  const { user, profile } = useAuthCtx();
  const [fases, setFases] = useState<Fase[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [partidos, setPartidos] = useState<PartidoConPronostico[]>([]);
  const [faseSel, setFaseSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  // Estado local de pronósticos (lo que el usuario está editando)
  const [edits, setEdits] = useState<Record<string, { local: string; visit: string }>>({});
  // Partidos en modo edición manual (tras tocar "Editar")
  const [editando, setEditando] = useState<Record<string, boolean>>({});
  // Estado de guardado por partido: 'guardando' | 'guardado' | 'error'
  const [estadoGuardado, setEstadoGuardado] = useState<Record<string, 'guardando' | 'guardado' | 'error'>>({});
  // Orden secuencial de partidos (para saltar al siguiente)
  const ordenRef = useRef<string[]>([]);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

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
    ordenRef.current = conPron.map(p => p.id);

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

  // Mantener una referencia fresca para guardar al cambiar de ventana
  const editsRef = useRef(edits);
  useEffect(() => { editsRef.current = edits; }, [edits]);

  // Guardar todo lo pendiente al cambiar de pestaña/ventana o cerrar
  useEffect(() => {
    const guardarPendientes = () => {
      const ed = editsRef.current;
      Object.keys(ed).forEach(pid => { void autoguardar(pid); });
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') guardarPendientes(); };
    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', guardarPendientes);
    return () => {
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', guardarPendientes);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partidos, profile]);

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

  // Guarda lo que haya de un partido (incluso incompleto). Silencioso.
  const autoguardar = async (partidoId: string): Promise<boolean> => {
    const e = editsRef.current[partidoId];
    if (!e) return false;
    // Si ambos vacíos, no hay nada que guardar
    if (e.local === '' && e.visit === '') return false;

    const p = partidos.find(x => x.id === partidoId);
    if (!p) return false;
    // Respetar cierre y permiso de edición
    const cierreP = p.cierre_pronostico ?? faseActual?.fecha_cierre ?? null;
    const puedeExtra = profile?.puede_editar === true;
    if (!puedeExtra && (antesDeAbrir(faseActual?.fecha_apertura ?? null) || estaCerrado(cierreP))) return false;

    // Parsear: lo vacío se guarda como null (incompleto permitido)
    const gl = e.local === '' ? null : parseInt(e.local, 10);
    const gv = e.visit === '' ? null : parseInt(e.visit, 10);
    if ((gl !== null && (isNaN(gl) || gl < 0)) || (gv !== null && (isNaN(gv) || gv < 0))) return false;

    // ¿Cambió respecto a lo guardado? Evita escrituras innecesarias
    const yaGl = p.pronostico?.goles_local ?? null;
    const yaGv = p.pronostico?.goles_visitante ?? null;
    if (yaGl === gl && yaGv === gv) return false;

    setEstadoGuardado(s => ({ ...s, [partidoId]: 'guardando' }));
    const { error } = await supabase
      .from('pronosticos_partido')
      .upsert({
        user_id: user!.id, partido_id: partidoId,
        goles_local: gl, goles_visitante: gv,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,partido_id' });

    if (error) {
      setEstadoGuardado(s => ({ ...s, [partidoId]: 'error' }));
      setMsg({ tipo: 'err', texto: `Error al guardar: ${error.message}` });
      return false;
    }
    setEstadoGuardado(s => ({ ...s, [partidoId]: 'guardado' }));
    // Actualizar el pronóstico en memoria (sin recargar toda la fase)
    setPartidos(prev => prev.map(x => x.id === partidoId
      ? { ...x, pronostico: { ...(x.pronostico as any), goles_local: gl, goles_visitante: gv } as any }
      : x));
    return true;
  };

  // Enfoca el primer input del siguiente partido sin completar
  const irSiguiente = (partidoActual: string) => {
    const orden = ordenRef.current;
    const idx = orden.indexOf(partidoActual);
    for (let i = idx + 1; i < orden.length; i++) {
      const sigId = orden[i];
      const ed = edits[sigId];
      // saltar a uno que no esté completo
      if (!ed || ed.local === '' || ed.visit === '') {
        const input = inputsRef.current[sigId];
        if (input) { input.focus(); input.select?.(); }
        return;
      }
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
        <div className="flex justify-end items-center gap-2 text-sm">
          {Object.values(estadoGuardado).includes('guardando') ? (
            <span className="text-pitch-700 flex items-center gap-1">
              <span className="animate-spin">⏳</span> Guardando…
            </span>
          ) : (
            <span className="text-green-700 font-semibold flex items-center gap-1">
              ✓ Todo guardado
            </span>
          )}
          <span className="text-xs text-ink-700/60">· se guarda solo al pasar al siguiente partido</span>
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
    const noHaAbierto = antesDeAbrir(faseActual?.fecha_apertura ?? null);
    const puedeExtra = profile?.puede_editar === true;
    // Bloqueado por tiempo (salvo permiso extra)
    const bloqueadoPorTiempo = noHaAbierto || estaCerrado(cierreP);
    const pCerrado = bloqueadoPorTiempo && !puedeExtra;
    const tieneResultado = p.goles_local_oficial !== null && p.goles_visitante_oficial !== null;
    const e = edits[p.id] ?? { local: '', visit: '' };

    // ¿Está guardado y completo? -> se muestra bloqueado con botón Editar
    const guardadoCompleto = !!p.pronostico
      && p.pronostico.goles_local !== null && p.pronostico.goles_local !== undefined
      && p.pronostico.goles_visitante !== null && p.pronostico.goles_visitante !== undefined;
    const enEdicion = editando[p.id] === true;
    // Inputs deshabilitados si: cerrado, O (guardado completo y NO estoy editándolo)
    const inputsDisabled = pCerrado || (guardadoCompleto && !enEdicion);

    const estado = estadoGuardado[p.id];

    // Maneja salida de un input: autoguarda; si quedó completo, salta al siguiente
    const onBlurInput = async () => {
      // pequeño delay para permitir que el foco pase al otro input del mismo partido
      setTimeout(async () => {
        const ed = edits[p.id];
        if (!ed) return;
        const ok = await autoguardar(p.id);
        // si ambos completos, cerrar edición y saltar al siguiente
        if (ed.local !== '' && ed.visit !== '') {
          if (ok || guardadoCompleto) {
            setEditando(s => ({ ...s, [p.id]: false }));
          }
        }
      }, 120);
    };

    const onChangeMarcador = (campo: 'local' | 'visit', val: string) => {
      setEdits(s => {
        const nuevo = { ...s, [p.id]: { ...s[p.id], [campo]: val } };
        editsRef.current = nuevo; // mantener el ref fresco de inmediato
        // Si con este cambio ambos quedan completos, autoguardar + saltar al siguiente
        const ed = nuevo[p.id];
        if (ed.local !== '' && ed.visit !== '') {
          setTimeout(async () => {
            const ok = await autoguardar(p.id);
            if (ok) {
              setEditando(s2 => ({ ...s2, [p.id]: false }));
              irSiguiente(p.id);
            }
          }, 50);
        }
        return nuevo;
      });
    };

    return (
      <div key={p.id} className="grid grid-cols-12 gap-2 items-center py-2 border-b border-pitch-100 last:border-0">
        <div className="col-span-12 sm:col-span-2 text-xs text-ink-700">
          {p.numero && <span className="font-mono mr-2">#{p.numero}</span>}
          {fmtFechaCorta(p.fecha_partido)}
          {p.sede && <div className="text-[10px] text-ink-700/60">{p.sede}</div>}
          {p.cierre_pronostico && !estaCerrado(cierreP) && (
            <div className="text-[10px] mt-0.5">
              🔒 <Countdown fechaCierre={p.cierre_pronostico} />
            </div>
          )}
          {p.cierre_pronostico && estaCerrado(cierreP) && !noHaAbierto && (
            <div className="text-[10px] text-red-600 font-semibold mt-0.5">🔒 Cerrado</div>
          )}
        </div>

        <div className="col-span-5 sm:col-span-3 text-right">
          <span className="font-semibold"><Bandera equipo={p.equipo_local} /> {p.equipo_local}</span>
        </div>

        <div className="col-span-2 sm:col-span-3 flex items-center justify-center gap-1">
          <input
            type="number" min={0} max={20}
            ref={(el) => { inputsRef.current[p.id] = el; }}
            className="input w-12 text-center px-1 py-1"
            value={noHaAbierto ? '' : e.local}
            disabled={inputsDisabled}
            placeholder={noHaAbierto ? '–' : ''}
            onChange={(ev) => onChangeMarcador('local', ev.target.value)}
            onBlur={onBlurInput}
          />
          <span className="text-ink-700">–</span>
          <input
            type="number" min={0} max={20}
            className="input w-12 text-center px-1 py-1"
            value={noHaAbierto ? '' : e.visit}
            disabled={inputsDisabled}
            placeholder={noHaAbierto ? '–' : ''}
            onChange={(ev) => onChangeMarcador('visit', ev.target.value)}
            onBlur={onBlurInput}
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
          {p.pronostico && (p.pronostico.puntos_obtenidos ?? 0) >= 0 && tieneResultado && (
            <span className={`badge ${
              (p.pronostico.puntos_obtenidos ?? 0) > 0 ? 'bg-fire-500 text-white' : 'bg-gray-100 text-gray-700'
            }`}>
              {p.pronostico.puntos_obtenidos ?? 0} pts
            </span>
          )}

          {/* Estado de guardado */}
          {estado === 'guardando' && <span className="text-xs text-pitch-700">guardando…</span>}
          {estado === 'guardado' && !inputsDisabled && <span className="text-xs text-green-600">✓ guardado</span>}

          {/* Botón Editar: cuando está guardado completo, no cerrado, y no lo estoy editando */}
          {guardadoCompleto && !enEdicion && !pCerrado && (
            <button
              onClick={() => {
                setEditando(s => ({ ...s, [p.id]: true }));
                setTimeout(() => { const inp = inputsRef.current[p.id]; inp?.focus(); inp?.select?.(); }, 30);
              }}
              className="text-xs px-2 py-1 bg-pitch-600 text-white rounded font-semibold hover:bg-pitch-700"
            >
              ✏️ Editar
            </button>
          )}
          {guardadoCompleto && !enEdicion && (
            <span className="badge bg-green-50 text-green-700">✓</span>
          )}

          {noHaAbierto && !puedeExtra && (
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
