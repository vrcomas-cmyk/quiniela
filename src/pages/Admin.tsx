import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Fase, Grupo, Partido, Profile } from '../types';
import { fmtFecha, fmtFechaCorta } from '../lib/fechas';
import { invitarUsuario, invitarMasivo, eliminarUsuario, InvitacionMasivaItem } from '../lib/adminApi';
import { setConfig } from '../hooks/useConfig';
import { Markdown } from '../components/Markdown';

type Seccion = 'fases' | 'partidos' | 'resultados' | 'clasificacion_oficial' | 'usuarios' | 'invitaciones' | 'configuracion';

export function Admin() {
  const [seccion, setSeccion] = useState<Seccion>('fases');

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-ink-900 text-white">
        <h2 className="font-display text-2xl">PANEL DE ADMINISTRACIÓN</h2>
        <p className="text-pitch-100 text-sm">
          Aquí controlas fases, horarios, partidos, resultados, usuarios y textos.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['fases', '⏱ Fases y horarios'],
          ['partidos', '🏟 Partidos'],
          ['resultados', '⚽ Resultados oficiales'],
          ['clasificacion_oficial', '🏆 Clasif. oficial'],
          ['invitaciones', '✉ Invitaciones'],
          ['usuarios', '👥 Usuarios'],
          ['configuracion', '⚙ Configuración'],
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
      {seccion === 'invitaciones' && <AdminInvitaciones />}
      {seccion === 'usuarios' && <AdminUsuarios />}
      {seccion === 'configuracion' && <AdminConfiguracion />}
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
    const toIso = (v?: string | null) => v ? new Date(v).toISOString() : null;
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
// ADMIN: PARTIDOS
// ============================================================================
function AdminPartidos() {
  const [fases, setFases] = useState<Fase[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [faseSel, setFaseSel] = useState<string>('');
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Partido>>({});

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

  const cargarPartidos = async () => {
    if (!faseSel) return;
    const { data } = await supabase.from('partidos').select('*').eq('fase_id', faseSel).order('numero');
    setPartidos((data ?? []) as Partido[]);
  };
  useEffect(() => { cargarPartidos(); }, [faseSel]);

  const fase = fases.find(f => f.id === faseSel);

  const toLocalInput = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const crear = async () => {
    setMsg(null);
    if (!faseSel || !nv.equipo_local || !nv.equipo_visitante) {
      setMsg({ tipo: 'err', texto: 'Faltan campos requeridos.' });
      return;
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
    if (error) setMsg({ tipo: 'err', texto: `Error: ${error.message}` });
    else {
      setMsg({ tipo: 'ok', texto: '✓ Partido creado' });
      setNv({ grupo_id: '', equipo_local: '', equipo_visitante: '', fecha_partido: '', sede: '', numero: '', cierre_pronostico: '' });
      cargarPartidos();
    }
  };

  const iniciarEdicion = (p: Partido) => {
    setEditandoId(p.id);
    setEditForm({
      grupo_id: p.grupo_id,
      numero: p.numero,
      equipo_local: p.equipo_local,
      equipo_visitante: p.equipo_visitante,
      fecha_partido: p.fecha_partido,
      sede: p.sede,
      cierre_pronostico: p.cierre_pronostico,
    });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setEditForm({});
  };

  const guardarEdicion = async (p: Partido) => {
    setMsg(null);
    if (!editForm.equipo_local || !editForm.equipo_visitante) {
      setMsg({ tipo: 'err', texto: 'Los nombres de equipos no pueden estar vacíos.' });
      return;
    }
    // Si hay resultado oficial cargado, advertir que cambiar los equipos invalida los pronósticos
    const cambianEquipos =
      editForm.equipo_local !== p.equipo_local ||
      editForm.equipo_visitante !== p.equipo_visitante;
    const tieneResultado = p.goles_local_oficial !== null || p.goles_visitante_oficial !== null;

    if (cambianEquipos && tieneResultado) {
      if (!confirm(
        '⚠ Estás cambiando los equipos de un partido que YA tiene resultado oficial cargado.\n\n' +
        'Los pronósticos siguen apuntando al mismo ID de partido, pero los marcadores ya no tendrán sentido.\n\n' +
        '¿Estás seguro? Lo recomendable es primero ELIMINAR el resultado y luego editar los equipos.'
      )) return;
    }

    const payload: any = {
      grupo_id: editForm.grupo_id || null,
      numero: editForm.numero ?? null,
      equipo_local: editForm.equipo_local,
      equipo_visitante: editForm.equipo_visitante,
      fecha_partido: editForm.fecha_partido
        ? (typeof editForm.fecha_partido === 'string' && editForm.fecha_partido.length === 16
          ? new Date(editForm.fecha_partido).toISOString()
          : editForm.fecha_partido)
        : null,
      sede: editForm.sede || null,
      cierre_pronostico: editForm.cierre_pronostico
        ? (typeof editForm.cierre_pronostico === 'string' && editForm.cierre_pronostico.length === 16
          ? new Date(editForm.cierre_pronostico).toISOString()
          : editForm.cierre_pronostico)
        : null,
    };
    const { error } = await supabase.from('partidos').update(payload).eq('id', p.id);
    if (error) setMsg({ tipo: 'err', texto: `Error: ${error.message}` });
    else {
      setMsg({ tipo: 'ok', texto: `✓ Partido actualizado: ${editForm.equipo_local} vs ${editForm.equipo_visitante}` });
      cancelarEdicion();
      cargarPartidos();
    }
  };

  const borrar = async (p: Partido) => {
    // Contar pronósticos asociados
    const { count } = await supabase
      .from('pronosticos_partido')
      .select('id', { count: 'exact', head: true })
      .eq('partido_id', p.id);
    const cnt = count ?? 0;

    const detalle = `¿BORRAR el partido "${p.equipo_local} vs ${p.equipo_visitante}"?\n\n` +
      (cnt > 0
        ? `⚠ Se borrarán también ${cnt} pronóstico(s) asociado(s) y sus puntos.\n\n`
        : '') +
      `Esta acción NO se puede deshacer.\n\n¿Continuar?`;
    if (!confirm(detalle)) return;

    const { error } = await supabase.from('partidos').delete().eq('id', p.id);
    if (error) setMsg({ tipo: 'err', texto: `Error: ${error.message}` });
    else {
      setMsg({ tipo: 'ok', texto: `✓ Partido eliminado` });
      cargarPartidos();
    }
  };

  // Filtrado por búsqueda
  const partidosFiltrados = busqueda.trim() === ''
    ? partidos
    : partidos.filter(p => {
        const q = busqueda.toLowerCase();
        return p.equipo_local.toLowerCase().includes(q)
          || p.equipo_visitante.toLowerCase().includes(q)
          || (p.sede ?? '').toLowerCase().includes(q)
          || String(p.numero ?? '').includes(q);
      });

  return (
    <div className="space-y-4">
      {msg && <div className={`p-2 rounded text-sm ${
        msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
      }`}>{msg.texto}</div>}

      <div className="card p-4">
        <label className="label">Fase</label>
        <select className="input" value={faseSel} onChange={e => setFaseSel(e.target.value)}>
          {fases.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
        <div className="text-xs text-ink-700 mt-1">{partidos.length} partido(s) en esta fase</div>
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

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-display text-xl">Partidos existentes</h3>
          <input
            className="input max-w-xs"
            placeholder="🔍 Buscar por equipo, sede o número…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pitch-50 text-pitch-700">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Partido</th>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Sede</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {partidosFiltrados.map(p => {
                const enEdicion = editandoId === p.id;
                const tieneResultado = p.goles_local_oficial !== null && p.goles_visitante_oficial !== null;

                if (enEdicion) {
                  return (
                    <tr key={p.id} className="border-t border-pitch-100 bg-amber-50/40">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="font-semibold text-pitch-700 mb-2">
                          ✏ Editando: {p.equipo_local} vs {p.equipo_visitante}
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                          {fase?.codigo === 'grupos' && (
                            <div>
                              <label className="label">Grupo</label>
                              <select className="input" value={editForm.grupo_id ?? ''}
                                onChange={e => setEditForm(s => ({ ...s, grupo_id: e.target.value || null }))}>
                                <option value="">— ninguno —</option>
                                {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="label">Número</label>
                            <input type="number" className="input"
                              value={editForm.numero ?? ''}
                              onChange={e => setEditForm(s => ({ ...s, numero: e.target.value === '' ? null : parseInt(e.target.value, 10) }))}
                            />
                          </div>
                          <div>
                            <label className="label">Equipo Local</label>
                            <input className="input" value={editForm.equipo_local ?? ''}
                              onChange={e => setEditForm(s => ({ ...s, equipo_local: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="label">Equipo Visitante</label>
                            <input className="input" value={editForm.equipo_visitante ?? ''}
                              onChange={e => setEditForm(s => ({ ...s, equipo_visitante: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="label">Fecha y hora</label>
                            <input type="datetime-local" className="input"
                              value={typeof editForm.fecha_partido === 'string' && editForm.fecha_partido.length === 16
                                ? editForm.fecha_partido
                                : toLocalInput(editForm.fecha_partido as string | null)}
                              onChange={e => setEditForm(s => ({ ...s, fecha_partido: e.target.value as any }))}
                            />
                          </div>
                          <div>
                            <label className="label">Sede</label>
                            <input className="input" value={editForm.sede ?? ''}
                              onChange={e => setEditForm(s => ({ ...s, sede: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="label">Cierre pronóstico individual</label>
                            <input type="datetime-local" className="input"
                              value={typeof editForm.cierre_pronostico === 'string' && editForm.cierre_pronostico.length === 16
                                ? editForm.cierre_pronostico
                                : toLocalInput(editForm.cierre_pronostico as string | null)}
                              onChange={e => setEditForm(s => ({ ...s, cierre_pronostico: e.target.value as any }))}
                            />
                          </div>
                        </div>
                        {tieneResultado && (
                          <div className="mt-2 text-xs bg-amber-100 text-amber-800 p-2 rounded">
                            ⚠ Este partido ya tiene resultado oficial cargado. Cambiar los equipos podría invalidar los pronósticos.
                          </div>
                        )}
                        <div className="flex justify-end gap-2 mt-3">
                          <button className="btn-ghost text-xs" onClick={cancelarEdicion}>Cancelar</button>
                          <button className="btn-primary text-xs" onClick={() => guardarEdicion(p)}>Guardar cambios</button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={p.id} className="border-t border-pitch-100">
                    <td className="px-3 py-2 font-mono">{p.numero ?? '—'}</td>
                    <td className="px-3 py-2">{p.equipo_local} vs {p.equipo_visitante}</td>
                    <td className="px-3 py-2">{fmtFechaCorta(p.fecha_partido)}</td>
                    <td className="px-3 py-2 text-xs">{p.sede ?? '—'}</td>
                    <td className="px-3 py-2">
                      {tieneResultado
                        ? <span className="badge bg-pitch-50 text-pitch-700">{p.goles_local_oficial}–{p.goles_visitante_oficial}</span>
                        : <span className="text-xs text-ink-700/60">Sin resultado</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex gap-1 justify-end">
                        <button className="btn-ghost text-xs" onClick={() => iniciarEdicion(p)}>✏ Editar</button>
                        <button className="btn-danger text-xs" onClick={() => borrar(p)}>🗑 Borrar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {partidosFiltrados.length === 0 && (
                <tr><td colSpan={6} className="text-center text-ink-700 py-4">
                  {busqueda ? 'No hay partidos que coincidan con la búsqueda.' : 'No hay partidos en esta fase.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN: RESULTADOS OFICIALES (con botón eliminar resultado)
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

  const borrarResultado = async (p: Partido) => {
    // Contar pronósticos afectados
    const { count } = await supabase
      .from('pronosticos_partido')
      .select('id', { count: 'exact', head: true })
      .eq('partido_id', p.id)
      .gt('puntos_obtenidos', 0);
    const cnt = count ?? 0;
    const confirmacion = `¿Eliminar el resultado oficial de "${p.equipo_local} vs ${p.equipo_visitante}"?\n\n` +
      `Esto pondrá el marcador en blanco y los puntos de ${cnt} pronóstico(s) que habían acertado volverán a 0.\n\n` +
      `¿Continuar?`;
    if (!confirm(confirmacion)) return;

    const { error } = await supabase.from('partidos')
      .update({ goles_local_oficial: null, goles_visitante_oficial: null })
      .eq('id', p.id);
    if (error) setMsg(`Error: ${error.message}`);
    else { setMsg(`✓ Resultado eliminado y puntos revertidos.`); cargar(); }
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
          El botón <b>Eliminar</b> pone el marcador en blanco y revierte los puntos a 0.
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
              const tieneResultado = p.goles_local_oficial !== null && p.goles_visitante_oficial !== null;
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
                    <div className="flex gap-1 justify-end">
                      <button className="btn-primary text-xs" onClick={() => guardar(p)}>Guardar</button>
                      {tieneResultado && (
                        <button className="btn-danger text-xs" onClick={() => borrarResultado(p)} title="Eliminar resultado">
                          🗑
                        </button>
                      )}
                    </div>
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
// ADMIN: CLASIFICACIÓN OFICIAL
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
// ADMIN: INVITACIONES (crear individual + masivo CSV)
// ============================================================================
interface Invitacion {
  id: string;
  token: string;
  email: string;
  nombre_completo: string;
  created_at: string;
  expira_en: string;
  usada_en: string | null;
}

function AdminInvitaciones() {
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [csvText, setCsvText] = useState('');
  const [resultados, setResultados] = useState<InvitacionMasivaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const cargar = async () => {
    const { data } = await supabase
      .from('invitaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setInvitaciones((data ?? []) as Invitacion[]);
  };
  useEffect(() => { cargar(); }, []);

  const generarLink = (token: string) => {
    return `${window.location.origin}/invite?token=${token}`;
  };

  const copiarLink = async (token: string) => {
    const link = generarLink(token);
    try {
      await navigator.clipboard.writeText(link);
      setMsg({ tipo: 'ok', texto: '✓ Link copiado al portapapeles' });
      setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg({ tipo: 'err', texto: 'No se pudo copiar; selecciona y copia manualmente' });
    }
  };

  const invitar = async () => {
    setMsg(null);
    if (!nombre || !email) {
      setMsg({ tipo: 'err', texto: 'Captura nombre y email' });
      return;
    }
    setLoading(true);
    try {
      const r = await invitarUsuario(email.trim(), nombre.trim());
      if (r.ok) {
        setMsg({ tipo: 'ok', texto: `✓ Invitación creada${r.error ? ' (' + r.error + ')' : ''}` });
        setNombre(''); setEmail('');
        cargar();
      } else {
        setMsg({ tipo: 'err', texto: r.error ?? 'Error' });
      }
    } catch (err: any) {
      setMsg({ tipo: 'err', texto: err.message });
    } finally {
      setLoading(false);
    }
  };

  const procesarCsv = async () => {
    setMsg(null);
    setResultados([]);
    // Parsing simple: nombre,email | nombre;email | nombre[tab]email
    const lineas = csvText.split(/\r?\n/).filter(l => l.trim());
    const usuarios: { nombre_completo: string; email: string }[] = [];
    for (const linea of lineas) {
      // Saltarse encabezado si contiene "nombre" o "email"
      if (/^(nombre|name|email|correo)/i.test(linea) && lineas.indexOf(linea) === 0) continue;
      const cols = linea.split(/[,;\t]/).map(s => s.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 2) continue;
      const [a, b] = cols;
      // Detectar cuál es email
      if (a.includes('@')) usuarios.push({ email: a, nombre_completo: b });
      else if (b.includes('@')) usuarios.push({ email: b, nombre_completo: a });
    }
    if (usuarios.length === 0) {
      setMsg({ tipo: 'err', texto: 'No se detectaron usuarios válidos. Formato esperado: nombre,email (uno por línea)' });
      return;
    }
    setLoading(true);
    try {
      const { resultados } = await invitarMasivo(usuarios);
      setResultados(resultados);
      const exitosos = resultados.filter(r => r.ok).length;
      setMsg({ tipo: 'ok', texto: `✓ Procesados: ${exitosos}/${resultados.length} invitaciones creadas` });
      setCsvText('');
      cargar();
    } catch (err: any) {
      setMsg({ tipo: 'err', texto: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`p-3 rounded text-sm ${
          msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>{msg.texto}</div>
      )}

      <div className="card p-4">
        <h3 className="font-display text-xl mb-2">Invitar un usuario</h3>
        <p className="text-xs text-ink-700 mb-3">
          Crea una invitación con link único. Cópialo y mándalo por email o WhatsApp.
          El usuario abre el link y crea su propia contraseña.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nombre completo</label>
            <input className="input" value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Como aparecerá en el ranking" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button className="btn-accent" onClick={invitar} disabled={loading}>
            {loading ? 'Generando…' : 'Crear invitación'}
          </button>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-display text-xl mb-2">Importar desde CSV / Excel</h3>
        <p className="text-xs text-ink-700 mb-3">
          Pega filas <code className="bg-pitch-50 px-1">nombre,email</code> (una por línea). Separador: coma, punto y coma o tab.
          También funciona pegar directo desde Excel (selecciona 2 columnas y copia).
          Ejemplo:
        </p>
        <pre className="bg-pitch-50 text-xs p-2 rounded mb-2 font-mono">{`Juan Pérez García, juan@empresa.com
María López,maria@empresa.com
Pedro Sánchez Ruiz,pedro@empresa.com`}</pre>
        <textarea
          className="input font-mono text-sm" rows={8}
          value={csvText} onChange={e => setCsvText(e.target.value)}
          placeholder="Pega aquí los usuarios..."
        />
        <div className="flex justify-end mt-3">
          <button className="btn-accent" onClick={procesarCsv} disabled={loading || !csvText.trim()}>
            {loading ? 'Procesando…' : 'Crear invitaciones masivas'}
          </button>
        </div>

        {resultados.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold text-sm mb-2">Resultados:</h4>
            <div className="max-h-64 overflow-y-auto border border-pitch-100 rounded">
              <table className="w-full text-xs">
                <thead className="bg-pitch-50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Email</th>
                    <th className="text-left px-2 py-1">Estado</th>
                    <th className="text-left px-2 py-1">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r, i) => (
                    <tr key={i} className="border-t border-pitch-100">
                      <td className="px-2 py-1 font-mono">{r.email}</td>
                      <td className="px-2 py-1">
                        {r.ok
                          ? <span className="text-green-700">✓ {r.error ?? 'Creada'}</span>
                          : <span className="text-red-700">✗ {r.error}</span>
                        }
                      </td>
                      <td className="px-2 py-1">
                        {r.token && (
                          <button className="text-pitch-700 underline" onClick={() => copiarLink(r.token!)}>
                            Copiar link
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-display text-xl px-4 pt-3 mb-2">Invitaciones recientes</h3>
        <table className="w-full text-sm">
          <thead className="bg-pitch-50 text-pitch-700">
            <tr>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="text-left px-3 py-2">Expira</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {invitaciones.map(inv => {
              const usada = inv.usada_en !== null;
              const expirada = !usada && new Date(inv.expira_en) < new Date();
              return (
                <tr key={inv.id} className="border-t border-pitch-100">
                  <td className="px-3 py-2 font-semibold">{inv.nombre_completo}</td>
                  <td className="px-3 py-2 font-mono text-xs">{inv.email}</td>
                  <td className="px-3 py-2">
                    {usada && <span className="badge bg-green-100 text-green-700">✓ Activada</span>}
                    {expirada && <span className="badge bg-red-100 text-red-700">Expirada</span>}
                    {!usada && !expirada && <span className="badge bg-amber-100 text-amber-700">Pendiente</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{fmtFecha(inv.expira_en)}</td>
                  <td className="px-3 py-2 text-right">
                    {!usada && !expirada && (
                      <button className="btn-ghost text-xs" onClick={() => copiarLink(inv.token)}>
                        📋 Copiar link
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {invitaciones.length === 0 && (
              <tr><td colSpan={5} className="text-center text-ink-700 py-4">
                No hay invitaciones aún.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN: USUARIOS (con botón eliminar)
// ============================================================================
function AdminUsuarios() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const cargar = async () => {
    const { data } = await supabase.from('profiles').select('*').order('nombre_completo');
    setUsers((data ?? []) as Profile[]);
  };
  useEffect(() => { cargar(); }, []);

  const cambiarRol = async (u: Profile) => {
    const nuevoRol = u.rol === 'admin' ? 'jugador' : 'admin';
    if (!confirm(`¿Cambiar rol de ${u.nombre_completo} a ${nuevoRol}?`)) return;
    const { error } = await supabase.from('profiles').update({ rol: nuevoRol }).eq('id', u.id);
    if (error) setMsg({ tipo: 'err', texto: error.message });
    else { setMsg({ tipo: 'ok', texto: '✓ Rol actualizado' }); cargar(); }
  };

  const togglePago = async (u: Profile) => {
    const { error } = await supabase.from('profiles').update({ pagado: !u.pagado }).eq('id', u.id);
    if (error) setMsg({ tipo: 'err', texto: error.message });
    else cargar();
  };

  const eliminar = async (u: Profile) => {
    const confirmacion = `¿ELIMINAR a ${u.nombre_completo}?\n\n` +
      `Esto borrará permanentemente:\n` +
      `• Su cuenta de acceso\n` +
      `• Todos sus pronósticos\n` +
      `• Toda su puntuación\n\n` +
      `Esta acción NO se puede deshacer.\n\n` +
      `¿Continuar?`;
    if (!confirm(confirmacion)) return;
    // Segunda confirmación pidiendo escribir parte del nombre
    const primerNombre = u.nombre_completo.split(' ')[0];
    const respuesta = prompt(`Para confirmar, escribe "${primerNombre}":`);
    if (respuesta !== primerNombre) {
      setMsg({ tipo: 'err', texto: 'Confirmación incorrecta. No se eliminó.' });
      return;
    }
    try {
      await eliminarUsuario(u.id);
      setMsg({ tipo: 'ok', texto: `✓ Usuario ${u.nombre_completo} eliminado` });
      cargar();
    } catch (err: any) {
      setMsg({ tipo: 'err', texto: err.message });
    }
  };

  return (
    <div className="space-y-3">
      {msg && <div className={`p-2 rounded text-sm ${
        msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
      }`}>{msg.texto}</div>}
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
                  <div className="flex gap-1 justify-end">
                    <button className="btn-ghost text-xs" onClick={() => cambiarRol(u)}>
                      {u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                    </button>
                    <button className="btn-danger text-xs" onClick={() => eliminar(u)}>
                      🗑 Eliminar
                    </button>
                  </div>
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
// ADMIN: CONFIGURACIÓN (editar textos visibles en la app)
// ============================================================================
interface ConfigItem {
  clave: string;
  valor: string;
  descripcion: string | null;
}

function AdminConfiguracion() {
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const cargar = async () => {
    const { data } = await supabase
      .from('configuracion')
      .select('*')
      .order('clave');
    setItems((data ?? []) as ConfigItem[]);
    const e: Record<string, string> = {};
    (data ?? []).forEach((it: any) => { e[it.clave] = it.valor; });
    setEdits(e);
  };
  useEffect(() => { cargar(); }, []);

  const guardar = async (clave: string) => {
    setMsg(null);
    const { error } = await setConfig(clave, edits[clave] ?? '');
    if (error) setMsg({ tipo: 'err', texto: error.message });
    else { setMsg({ tipo: 'ok', texto: `✓ ${clave} actualizado` }); cargar(); }
  };

  return (
    <div className="space-y-4">
      {msg && <div className={`p-2 rounded text-sm ${
        msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
      }`}>{msg.texto}</div>}

      <div className="card p-4">
        <h3 className="font-display text-xl mb-2">Textos editables de la app</h3>
        <p className="text-xs text-ink-700">
          Estos textos aparecen en distintas partes de la aplicación. Puedes usar Markdown simple:
          <code className="mx-1 bg-pitch-50 px-1">**negrita**</code>,
          <code className="mx-1 bg-pitch-50 px-1">*itálica*</code>,
          <code className="mx-1 bg-pitch-50 px-1"># título</code>,
          <code className="mx-1 bg-pitch-50 px-1">## sub-título</code>,
          <code className="mx-1 bg-pitch-50 px-1">- viñeta</code>.
        </p>
      </div>

      {items.map(item => (
        <div key={item.clave} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h4 className="font-display text-lg text-pitch-700">{item.clave}</h4>
              {item.descripcion && (
                <p className="text-xs text-ink-700">{item.descripcion}</p>
              )}
            </div>
            <div className="flex gap-1">
              <button
                className="btn-ghost text-xs"
                onClick={() => setPreviewing(previewing === item.clave ? null : item.clave)}
              >
                {previewing === item.clave ? 'Ocultar vista previa' : '👁 Vista previa'}
              </button>
              <button className="btn-primary text-xs" onClick={() => guardar(item.clave)}>
                Guardar
              </button>
            </div>
          </div>
          <textarea
            className="input font-mono text-sm"
            rows={Math.min(Math.max(edits[item.clave]?.split('\n').length ?? 3, 3), 20)}
            value={edits[item.clave] ?? ''}
            onChange={e => setEdits(s => ({ ...s, [item.clave]: e.target.value }))}
          />
          {previewing === item.clave && (
            <div className="mt-3 p-3 border border-pitch-100 rounded bg-pitch-50/30">
              <div className="text-xs text-pitch-700 mb-1 font-semibold">Vista previa:</div>
              <Markdown text={edits[item.clave] ?? ''} className="text-sm" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}