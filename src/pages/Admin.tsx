import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Fase, Grupo, Partido, Profile } from '../types';
import { fmtFecha, fmtFechaCorta } from '../lib/fechas';

type Seccion = 'fases' | 'partidos' | 'resultados' | 'clasificacion_oficial' | 'usuarios';

export function Admin() {
  const [seccion, setSeccion] = useState<Seccion>('fases');

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-ink-900 text-white">
        <h2 className="font-display text-2xl">PANEL DE ADMINISTRACIÓN</h2>
        <p className="text-pitch-100 text-sm">
          Aquí controlas fases, horarios, partidos, resultados oficiales y usuarios.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['fases', '⏱ Fases y horarios'],
          ['partidos', '🏟 Partidos'],
          ['resultados', '⚽ Resultados oficiales'],
          ['clasificacion_oficial', '🏆 Clasif. oficial'],
          ['usuarios', '👥 Usuarios'],
        ] as [Seccion, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSeccion(k)}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
              seccion === k ? 'bg-pitch-600 text-white' : 'bg-pitch-50 text-pitch-700'
            }`}
          >{label}</button>
        ))}
      </div>

      {seccion === 'fases' && <AdminFases />}
      {seccion === 'partidos' && <AdminPartidos />}
      {seccion === 'resultados' && <AdminResultados />}
      {seccion === 'clasificacion_oficial' && <AdminClasificacionOficial />}
      {seccion === 'usuarios' && <AdminUsuarios />}
    </div>
  );
}

// ============================================================================
// ADMIN: FASES
// ============================================================================
function AdminFases() {
  const [fases, setFases] = useState<Fase[]>([]);
  const [editing, setEditing] = useState<Record<string, Partial<Fase>>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = async () => {
    const { data } = await supabase.from('fases').select('*').order('orden');
    setFases((data ?? []) as Fase[]);
    setEditing({});
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async (id: string) => {
    setMsg(null);
    const cambios = editing[id];
    if (!cambios) return;
    // Convertir datetime-local string a ISO si aplica
    const toIso = (v?: string | null) => {
      if (!v) return null;
      // datetime-local llega como 'YYYY-MM-DDTHH:mm'
      return new Date(v).toISOString();
    };
    const payload: any = { ...cambios };
    if ('fecha_apertura' in cambios) payload.fecha_apertura = toIso(cambios.fecha_apertura as any);
    if ('fecha_cierre' in cambios)   payload.fecha_cierre   = toIso(cambios.fecha_cierre as any);

    const { error } = await supabase.from('fases').update(payload).eq('id', id);
    if (error) setMsg(`Error: ${error.message}`);
    else { setMsg('✓ Fase actualizada'); cargar(); }
  };

  const toLocalInput = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    // YYYY-MM-DDTHH:MM
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="space-y-3">
      {msg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{msg}</div>}
      {fases.map(f => {
        const e = editing[f.id] ?? {};
        const valAp = (e.fecha_apertura ?? toLocalInput(f.fecha_apertura)) as string;
        const valCi = (e.fecha_cierre ?? toLocalInput(f.fecha_cierre)) as string;
        return (
          <div key={f.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-display text-xl">{f.nombre}</h3>
                <div className="text-xs text-ink-700">código: {f.codigo}</div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(e.publicada ?? f.publicada) as boolean}
                  onChange={(ev) => setEditing(s => ({ ...s, [f.id]: { ...s[f.id], publicada: ev.target.checked } }))}
                />
                Publicada (visible para jugadores)
              </label>
            </div>
            <div className="grid sm:grid-cols-4 gap-3 text-sm">
              <div>
                <label className="label">Pts marcador exacto</label>
                <input type="number" className="input"
                  value={(e.pts_marcador_exacto ?? f.pts_marcador_exacto) as number}
                  onChange={(ev) => setEditing(s => ({ ...s, [f.id]: { ...s[f.id], pts_marcador_exacto: parseInt(ev.target.value, 10) } }))}
                />
              </div>
              <div>
                <label className="label">Pts acierto resultado</label>
                <input type="number" className="input"
                  value={(e.pts_acierto_resultado ?? f.pts_acierto_resultado) as number}
                  onChange={(ev) => setEditing(s => ({ ...s, [f.id]: { ...s[f.id], pts_acierto_resultado: parseInt(ev.target.value, 10) } }))}
                />
              </div>
              <div>
                <label className="label">Apertura pronósticos</label>
                <input type="datetime-local" className="input"
                  value={valAp}
                  onChange={(ev) => setEditing(s => ({ ...s, [f.id]: { ...s[f.id], fecha_apertura: ev.target.value as any } }))}
                />
              </div>
              <div>
                <label className="label">Cierre pronósticos</label>
                <input type="datetime-local" className="input"
                  value={valCi}
                  onChange={(ev) => setEditing(s => ({ ...s, [f.id]: { ...s[f.id], fecha_cierre: ev.target.value as any } }))}
                />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <button className="btn-primary text-sm" onClick={() => guardar(f.id)}>
                Guardar cambios
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// ADMIN: PARTIDOS (crear/editar partidos por fase)
// ============================================================================
function AdminPartidos() {
  const [fases, setFases] = useState<Fase[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [faseSel, setFaseSel] = useState<string>('');
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // Nuevo partido
  const [nv, setNv] = useState({
    grupo_id: '', equipo_local: '', equipo_visitante: '',
    fecha_partido: '', sede: '', numero: '', cierre_pronostico: '',
  });

  useEffect(() => {
    (async () => {
      const [f, g] = await Promise.all([
        supabase.from('fases').select('*').order('orden'),
        supabase.from('grupos').select('*').order('codigo'),
      ]);
      setFases((f.data ?? []) as Fase[]);
      setGrupos((g.data ?? []) as Grupo[]);
      if ((f.data ?? []).length > 0) setFaseSel((f.data as any)[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!faseSel) return;
    (async () => {
      const { data } = await supabase.from('partidos').select('*').eq('fase_id', faseSel).order('numero');
      setPartidos((data ?? []) as Partido[]);
    })();
  }, [faseSel]);

  const fase = fases.find(f => f.id === faseSel);

  const crear = async () => {
    setMsg(null);
    if (!faseSel || !nv.equipo_local || !nv.equipo_visitante) {
      setMsg('Faltan campos requeridos.'); return;
    }
    const payload: any = {
      fase_id: faseSel,
      grupo_id: nv.grupo_id || null,
      numero: nv.numero ? parseInt(nv.numero, 10) : null,
      equipo_local: nv.equipo_local,
      equipo_visitante: nv.equipo_visitante,
      fecha_partido: nv.fecha_partido ? new Date(nv.fecha_partido).toISOString() : null,
      sede: nv.sede || null,
      cierre_pronostico: nv.cierre_pronostico ? new Date(nv.cierre_pronostico).toISOString() : null,
    };
    const { error } = await supabase.from('partidos').insert(payload);
    if (error) setMsg(`Error: ${error.message}`);
    else {
      setMsg('✓ Partido creado');
      setNv({ grupo_id: '', equipo_local: '', equipo_visitante: '', fecha_partido: '', sede: '', numero: '', cierre_pronostico: '' });
      const { data } = await supabase.from('partidos').select('*').eq('fase_id', faseSel).order('numero');
      setPartidos((data ?? []) as Partido[]);
    }
  };

  const borrar = async (id: string) => {
    if (!confirm('¿Borrar este partido? Se borrarán también los pronósticos asociados.')) return;
    await supabase.from('partidos').delete().eq('id', id);
    const { data } = await supabase.from('partidos').select('*').eq('fase_id', faseSel).order('numero');
    setPartidos((data ?? []) as Partido[]);
  };

  return (
    <div className="space-y-4">
      {msg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{msg}</div>}

      <div className="card p-4">
        <label className="label">Fase</label>
        <select className="input" value={faseSel} onChange={e => setFaseSel(e.target.value)}>
          {fases.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
      </div>

      <div className="card p-4">
        <h3 className="font-display text-xl mb-3">Crear nuevo partido en {fase?.nombre}</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {fase?.codigo === 'grupos' && (
            <div>
              <label className="label">Grupo (opcional)</label>
              <select className="input" value={nv.grupo_id} onChange={e => setNv(s => ({ ...s, grupo_id: e.target.value }))}>
                <option value="">— ninguno —</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Número</label>
            <input className="input" type="number" value={nv.numero} onChange={e => setNv(s => ({ ...s, numero: e.target.value }))} />
          </div>
          <div>
            <label className="label">Equipo Local</label>
            <input className="input" value={nv.equipo_local} onChange={e => setNv(s => ({ ...s, equipo_local: e.target.value }))} />
          </div>
          <div>
            <label className="label">Equipo Visitante</label>
            <input className="input" value={nv.equipo_visitante} onChange={e => setNv(s => ({ ...s, equipo_visitante: e.target.value }))} />
          </div>
          <div>
            <label className="label">Fecha y hora</label>
            <input className="input" type="datetime-local" value={nv.fecha_partido} onChange={e => setNv(s => ({ ...s, fecha_partido: e.target.value }))} />
          </div>
          <div>
            <label className="label">Sede</label>
            <input className="input" value={nv.sede} onChange={e => setNv(s => ({ ...s, sede: e.target.value }))} />
          </div>
          <div>
            <label className="label">Cierre pronóstico (opcional, overridea fase)</label>
            <input className="input" type="datetime-local" value={nv.cierre_pronostico} onChange={e => setNv(s => ({ ...s, cierre_pronostico: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button className="btn-primary" onClick={crear}>Crear partido</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pitch-50 text-pitch-700">
            <tr>
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Partido</th>
              <th className="text-left px-3 py-2">Fecha</th>
              <th className="text-left px-3 py-2">Sede</th>
              <th className="text-left px-3 py-2">Cierre indiv.</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {partidos.map(p => (
              <tr key={p.id} className="border-t border-pitch-100">
                <td className="px-3 py-2 font-mono">{p.numero ?? '—'}</td>
                <td className="px-3 py-2">{p.equipo_local} vs {p.equipo_visitante}</td>
                <td className="px-3 py-2">{fmtFechaCorta(p.fecha_partido)}</td>
                <td className="px-3 py-2 text-xs">{p.sede ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{p.cierre_pronostico ? fmtFechaCorta(p.cierre_pronostico) : 'usa el de la fase'}</td>
                <td className="px-3 py-2 text-right">
                  <button className="btn-danger text-xs" onClick={() => borrar(p.id)}>Borrar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN: RESULTADOS OFICIALES DE PARTIDOS
// ============================================================================
function AdminResultados() {
  const [fases, setFases] = useState<Fase[]>([]);
  const [faseSel, setFaseSel] = useState<string>('');
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [edits, setEdits] = useState<Record<string, { l: string; v: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('fases').select('*').order('orden');
      setFases((data ?? []) as Fase[]);
      if ((data ?? []).length > 0) setFaseSel((data as any)[0].id);
    })();
  }, []);

  const cargar = async () => {
    if (!faseSel) return;
    const { data } = await supabase.from('partidos').select('*').eq('fase_id', faseSel).order('numero');
    const arr = (data ?? []) as Partido[];
    setPartidos(arr);
    const e: Record<string, { l: string; v: string }> = {};
    arr.forEach(p => {
      e[p.id] = {
        l: p.goles_local_oficial?.toString() ?? '',
        v: p.goles_visitante_oficial?.toString() ?? '',
      };
    });
    setEdits(e);
  };
  useEffect(() => { cargar(); }, [faseSel]);

  const guardar = async (p: Partido) => {
    setMsg(null);
    const e = edits[p.id];
    const gl = e.l === '' ? null : parseInt(e.l, 10);
    const gv = e.v === '' ? null : parseInt(e.v, 10);
    const { error } = await supabase.from('partidos')
      .update({ goles_local_oficial: gl, goles_visitante_oficial: gv })
      .eq('id', p.id);
    if (error) setMsg(`Error: ${error.message}`);
    else { setMsg(`✓ Resultado guardado: ${p.equipo_local} ${gl ?? '?'}–${gv ?? '?'} ${p.equipo_visitante} · Puntos recalculados.`); cargar(); }
  };

  return (
    <div className="space-y-4">
      {msg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{msg}</div>}
      <div className="card p-4">
        <label className="label">Fase</label>
        <select className="input" value={faseSel} onChange={e => setFaseSel(e.target.value)}>
          {fases.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
        <p className="text-xs text-ink-700 mt-2">
          Al guardar un resultado, los puntos de todos los pronósticos de ese partido se recalculan automáticamente.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pitch-50 text-pitch-700">
            <tr>
              <th className="text-left px-3 py-2">Partido</th>
              <th className="text-center px-3 py-2">Marcador oficial</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {partidos.map(p => {
              const e = edits[p.id] ?? { l: '', v: '' };
              return (
                <tr key={p.id} className="border-t border-pitch-100">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{p.equipo_local} vs {p.equipo_visitante}</div>
                    <div className="text-xs text-ink-700">{fmtFechaCorta(p.fecha_partido)}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex items-center gap-1">
                      <input type="number" min={0} max={20} className="input w-14 text-center"
                        value={e.l}
                        onChange={ev => setEdits(s => ({ ...s, [p.id]: { ...s[p.id], l: ev.target.value } }))}
                      />
                      <span>–</span>
                      <input type="number" min={0} max={20} className="input w-14 text-center"
                        value={e.v}
                        onChange={ev => setEdits(s => ({ ...s, [p.id]: { ...s[p.id], v: ev.target.value } }))}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button className="btn-primary text-xs" onClick={() => guardar(p)}>Guardar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN: CLASIFICACIÓN OFICIAL (1°/2° por grupo, terceros, top 4)
// ============================================================================
function AdminClasificacionOficial() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [equipos, setEquipos] = useState<string[]>([]);
  const [clasifGrupo, setClasifGrupo] = useState<Record<string, { p1: string; p2: string }>>({});
  const [terceros, setTerceros] = useState<string[]>(new Array(8).fill(''));
  const [top4, setTop4] = useState<string[]>(new Array(4).fill(''));
  const [msg, setMsg] = useState<string | null>(null);

  const POSICIONES_FINALES = ['Campeón', 'Subcampeón', '3er Lugar', '4to Lugar'];

  const cargar = async () => {
    const [g, partidos, oficial] = await Promise.all([
      supabase.from('grupos').select('*').order('codigo'),
      supabase.from('partidos').select('equipo_local, equipo_visitante'),
      supabase.from('resultados_clasificacion').select('*'),
    ]);
    setGrupos((g.data ?? []) as Grupo[]);
    const set = new Set<string>();
    (partidos.data ?? []).forEach((p: any) => {
      set.add(p.equipo_local); set.add(p.equipo_visitante);
    });
    setEquipos(Array.from(set).sort());

    const arr = (oficial.data ?? []) as any[];
    const cg: Record<string, { p1: string; p2: string }> = {};
    (g.data ?? []).forEach((gr: any) => {
      const p1 = arr.find(x => x.tipo === 'clasif_grupo' && x.grupo_id === gr.id && x.posicion === 1)?.equipo ?? '';
      const p2 = arr.find(x => x.tipo === 'clasif_grupo' && x.grupo_id === gr.id && x.posicion === 2)?.equipo ?? '';
      cg[gr.id] = { p1, p2 };
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
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async () => {
    setMsg(null);
    // Borrar todo previo
    await supabase.from('resultados_clasificacion').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const rows: any[] = [];
    Object.entries(clasifGrupo).forEach(([gid, v]) => {
      if (v.p1) rows.push({ tipo: 'clasif_grupo', grupo_id: gid, posicion: 1, equipo: v.p1 });
      if (v.p2) rows.push({ tipo: 'clasif_grupo', grupo_id: gid, posicion: 2, equipo: v.p2 });
    });
    terceros.forEach(eq => { if (eq) rows.push({ tipo: 'tercero', equipo: eq }); });
    top4.forEach((eq, i) => { if (eq) rows.push({ tipo: 'top4', posicion: i + 1, equipo: eq }); });

    if (rows.length > 0) {
      const { error } = await supabase.from('resultados_clasificacion').insert(rows);
      if (error) { setMsg(`Error: ${error.message}`); return; }
    }

    // Recalcular puntos
    const { error: rpcErr } = await supabase.rpc('recalcular_puntos_clasificacion');
    if (rpcErr) setMsg(`Guardado pero error al recalcular: ${rpcErr.message}`);
    else setMsg(`✓ Resultados oficiales guardados y puntos recalculados.`);
  };

  return (
    <div className="space-y-4">
      {msg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{msg}</div>}

      <div className="card p-4">
        <h3 className="font-display text-xl">1° y 2° de cada grupo</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {grupos.map(g => (
            <div key={g.id} className="border border-pitch-100 rounded-lg p-3">
              <div className="font-semibold text-pitch-700 mb-2">{g.nombre}</div>
              <label className="label">1° lugar</label>
              <select className="input mb-2" value={clasifGrupo[g.id]?.p1 ?? ''}
                onChange={e => setClasifGrupo(s => ({ ...s, [g.id]: { ...s[g.id], p1: e.target.value } }))}
              >
                <option value="">— ninguno —</option>
                {equipos.map(eq => <option key={eq}>{eq}</option>)}
              </select>
              <label className="label">2° lugar</label>
              <select className="input" value={clasifGrupo[g.id]?.p2 ?? ''}
                onChange={e => setClasifGrupo(s => ({ ...s, [g.id]: { ...s[g.id], p2: e.target.value } }))}
              >
                <option value="">— ninguno —</option>
                {equipos.map(eq => <option key={eq}>{eq}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-display text-xl">8 mejores terceros</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {terceros.map((eq, i) => (
            <div key={i}>
              <label className="label">Tercero {i + 1}</label>
              <select className="input" value={eq}
                onChange={e => { const v = [...terceros]; v[i] = e.target.value; setTerceros(v); }}>
                <option value="">— ninguno —</option>
                {equipos.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-display text-xl">Top 4 final</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {POSICIONES_FINALES.map((etq, i) => (
            <div key={i}>
              <label className="label">{etq}</label>
              <select className="input" value={top4[i]}
                onChange={e => { const v = [...top4]; v[i] = e.target.value; setTop4(v); }}>
                <option value="">— ninguno —</option>
                {equipos.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-accent" onClick={guardar}>
          Guardar resultados oficiales y recalcular puntos
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN: USUARIOS
// ============================================================================
function AdminUsuarios() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = async () => {
    const { data } = await supabase.from('profiles').select('*').order('nombre_completo');
    setUsers((data ?? []) as Profile[]);
  };
  useEffect(() => { cargar(); }, []);

  const cambiarRol = async (u: Profile) => {
    const nuevoRol = u.rol === 'admin' ? 'jugador' : 'admin';
    if (!confirm(`¿Cambiar rol de ${u.nombre_completo} a ${nuevoRol}?`)) return;
    const { error } = await supabase.from('profiles').update({ rol: nuevoRol }).eq('id', u.id);
    if (error) setMsg(`Error: ${error.message}`);
    else { setMsg('✓ Rol actualizado'); cargar(); }
  };

  const togglePago = async (u: Profile) => {
    const { error } = await supabase.from('profiles').update({ pagado: !u.pagado }).eq('id', u.id);
    if (error) setMsg(`Error: ${error.message}`);
    else cargar();
  };

  return (
    <div className="space-y-3">
      {msg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{msg}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pitch-50 text-pitch-700">
            <tr>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-left px-3 py-2">Rol</th>
              <th className="text-center px-3 py-2">Pagado</th>
              <th className="text-left px-3 py-2">Registrado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-pitch-100">
                <td className="px-3 py-2 font-semibold">{u.nombre_completo}</td>
                <td className="px-3 py-2">
                  <span className={`badge ${u.rol === 'admin' ? 'bg-fire-500 text-white' : 'bg-pitch-50 text-pitch-700'}`}>
                    {u.rol}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => togglePago(u)} className={`badge ${u.pagado ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.pagado ? '✓ Pagado' : 'Pendiente'}
                  </button>
                </td>
                <td className="px-3 py-2 text-xs">{fmtFecha(u.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  <button className="btn-ghost text-xs" onClick={() => cambiarRol(u)}>
                    {u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
