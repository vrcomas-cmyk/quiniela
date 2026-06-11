import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Fase, Grupo, Partido, Profile } from '../types';
import { fmtFecha, fmtFechaCorta } from '../lib/fechas';
import { invitarUsuario, invitarMasivo, eliminarUsuario, procesarCorreosAhora, InvitacionMasivaItem } from '../lib/adminApi';
import { setConfig } from '../hooks/useConfig';
import { Markdown } from '../components/Markdown';
import { calcularReparto, fmtPesos, parsePorcentajes, sumaPorcentajes, JugadorPuntos, ReporteReparto } from '../lib/premios';
import { exportarQuinielaExcel } from '../lib/exportarExcel';

type Seccion = 'fases' | 'partidos' | 'resultados' | 'clasificacion_oficial' | 'usuarios' | 'invitaciones' | 'pagos' | 'reporte' | 'premios' | 'configuracion';

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
          ['pagos', '💵 Pagos'],
          ['reporte', '📊 Reporte'],
          ['premios', '💰 Premios'],
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
      {seccion === 'pagos' && <AdminPagos />}
      {seccion === 'reporte' && <AdminReporte />}
      {seccion === 'premios' && <AdminPremios />}
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
              <div>
                <label className="label">Publicar auto. (horas antes de apertura)</label>
                <input type="number" min={0} className="input"
                  placeholder="ej. 12"
                  value={(e.publicar_horas_antes ?? f.publicar_horas_antes ?? '') as any}
                  onChange={(ev) => setEditing(s => ({ ...s, [f.id]: { ...s[f.id], publicar_horas_antes: ev.target.value === '' ? null : parseInt(ev.target.value, 10) } }))}
                />
                <div className="text-[10px] text-ink-700/60 mt-1">
                  Si lo defines, la fase se publica sola esas horas antes de la apertura (vía cron).
                </div>
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

      <div className="card p-4 bg-pitch-50 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-ink-700">
          Al crear invitaciones, el correo se <b>encola automáticamente</b> y se envía solo (vía cron).
          Si quieres forzar el envío inmediato, usa este botón.
        </div>
        <button className="btn-primary text-sm" onClick={async () => {
          setMsg(null);
          try {
            const r = await procesarCorreosAhora();
            setMsg({ tipo: 'ok', texto: `✓ Correos procesados: ${r.enviados ?? 0} enviados${r.mensaje ? ' · ' + r.mensaje : ''}` });
          } catch (err: any) {
            setMsg({ tipo: 'err', texto: err.message });
          }
        }}>
          ✉ Enviar correos pendientes ahora
        </button>
      </div>

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

// ============================================================================
// ADMIN: PREMIOS (calculadora de reparto según reglas oficiales)
// ============================================================================

function AdminPremios() {
  const [jugadores, setJugadores] = useState<JugadorPuntos[]>([]);
  const [participantesPagados, setParticipantesPagados] = useState(0);
  const [participantesTotal, setParticipantesTotal] = useState(0);
  const [pagoPorPersona, setPagoPorPersona] = useState(400);
  const [aporteFijo, setAporteFijo] = useState(1500);
  const [usarSoloPagados, setUsarSoloPagados] = useState(true);
  const [porcentajesTexto, setPorcentajesTexto] = useState('35, 25, 20, 15, 5');
  const [reporte, setReporte] = useState<ReporteReparto | null>(null);
  const [loading, setLoading] = useState(true);
  const [msgCfg, setMsgCfg] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    const { data: ranking } = await supabase
      .from('ranking')
      .select('user_id, nombre_completo, puntos_totales');
    setJugadores((ranking ?? []) as JugadorPuntos[]);

    const { count: totalCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('rol', 'jugador');
    const { count: pagadosCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('rol', 'jugador')
      .eq('pagado', true);
    setParticipantesTotal(totalCount ?? 0);
    setParticipantesPagados(pagadosCount ?? 0);

    // Cargar config de porcentajes y costo/aporte
    const { data: cfgs } = await supabase
      .from('configuracion')
      .select('clave, valor')
      .in('clave', ['premios_porcentajes', 'costo_quiniela', 'premios_aporte_fijo']);
    (cfgs ?? []).forEach((c: any) => {
      if (c.clave === 'premios_porcentajes' && c.valor) setPorcentajesTexto(c.valor);
      if (c.clave === 'costo_quiniela' && c.valor) setPagoPorPersona(parseFloat(c.valor));
      if (c.clave === 'premios_aporte_fijo' && c.valor) setAporteFijo(parseFloat(c.valor));
    });
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const porcentajes = parsePorcentajes(porcentajesTexto);
  const sumaPct = sumaPorcentajes(porcentajes);
  const pctValido = Math.abs(sumaPct - 100) < 0.01;

  const guardarConfigPremios = async () => {
    setMsgCfg(null);
    if (!pctValido) {
      setMsgCfg(`Los porcentajes deben sumar 100% (suman ${sumaPct}%).`);
      return;
    }
    await setConfig('premios_porcentajes', JSON.stringify(porcentajes));
    await setConfig('premios_aporte_fijo', String(aporteFijo));
    setMsgCfg('✓ Configuración de premios guardada.');
  };

  const recalcular = () => {
    const n = usarSoloPagados ? participantesPagados : participantesTotal;
    const monto = n * pagoPorPersona;
    const r = calcularReparto(jugadores, monto, porcentajes, aporteFijo);
    setReporte(r);
  };

  const exportarCSV = () => {
    if (!reporte) return;
    const filas = [
      ['Posicion', 'Etiqueta', 'Nombre', 'Puntos', 'Porcentaje', 'Monto'],
      ...reporte.asignaciones.map(a => [
        String(a.posicion),
        a.posicion_label,
        a.nombre_completo,
        String(a.puntos),
        `${a.porcentaje.toFixed(4)}%`,
        a.monto.toFixed(2),
      ]),
    ];
    const csv = filas.map(f => f.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reparto-premios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-display text-xl mb-2">💰 Calculadora de premios</h3>
        <p className="text-xs text-ink-700 mb-3">
          Configura los porcentajes de premio y calcula el reparto del bote con el ranking actual.
          El cálculo asume que no hay empates; si los hay, se señalan para que ajustes a mano.
        </p>

        {/* Configuración de porcentajes */}
        <div className="border border-pitch-100 rounded-lg p-3 mb-4">
          <label className="label">Porcentajes de premio por lugar (separados por coma)</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-md font-mono"
              value={porcentajesTexto}
              onChange={e => setPorcentajesTexto(e.target.value)}
              placeholder="ej. 35, 25, 20, 15, 5"
            />
            <button className="btn-primary text-sm" onClick={guardarConfigPremios}>
              Guardar configuración
            </button>
          </div>
          <div className="text-xs mt-2">
            <span className={pctValido ? 'text-pitch-700' : 'text-red-600 font-semibold'}>
              {porcentajes.length} lugar(es) · suma {sumaPct}% {pctValido ? '✓' : '✗ (debe ser 100%)'}
            </span>
          </div>
          {msgCfg && <div className="text-xs mt-1 text-green-700">{msgCfg}</div>}
        </div>

        {loading ? <div className="text-pitch-700">Cargando…</div> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label">Participantes pagados</label>
              <input type="number" className="input" value={participantesPagados}
                onChange={e => setParticipantesPagados(parseInt(e.target.value, 10) || 0)} />
              <div className="text-[10px] text-ink-700/60 mt-1">
                Total registrados: {participantesTotal}
              </div>
            </div>
            <div>
              <label className="label">Pago por persona ($)</label>
              <input type="number" className="input" value={pagoPorPersona}
                onChange={e => setPagoPorPersona(parseInt(e.target.value, 10) || 0)} />
            </div>
            <div>
              <label className="label">Aporte fijo desarrollador ($)</label>
              <input type="number" className="input" value={aporteFijo}
                onChange={e => setAporteFijo(parseInt(e.target.value, 10) || 0)} />
              <div className="text-[10px] text-ink-700/60 mt-1">
                Se descuenta del total antes de repartir.
              </div>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-sm mb-2">
                <input type="checkbox" checked={usarSoloPagados}
                  onChange={e => setUsarSoloPagados(e.target.checked)} />
                Solo contar pagados
              </label>
              <button className="btn-accent" onClick={recalcular} disabled={!pctValido}>
                Calcular reparto
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 text-sm text-ink-700">
          <div>Monto bruto: <b>{fmtPesos((usarSoloPagados ? participantesPagados : participantesTotal) * pagoPorPersona)}</b></div>
          <div>Aporte fijo: −{fmtPesos(aporteFijo)}</div>
          <div>Monto neto a repartir: <b className="text-pitch-700">
            {fmtPesos(Math.max(0, (usarSoloPagados ? participantesPagados : participantesTotal) * pagoPorPersona - aporteFijo))}
          </b></div>
        </div>
      </div>

      {reporte && (
        <>
          {reporte.hay_empates && (
            <div className="card p-3 bg-amber-50 border-amber-200 text-sm text-amber-800">
              ⚠ <b>Hay empates en posiciones premiadas.</b> El monto por lugar es el oficial,
              pero debes decidir manualmente cómo repartirlo entre los empatados.
            </div>
          )}

          <div className="card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-pitch-100">
              <h4 className="font-display text-lg">Reparto calculado</h4>
              <button className="btn-ghost text-xs" onClick={exportarCSV}>📥 Exportar a CSV</button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-pitch-50 text-pitch-700">
                <tr>
                  <th className="text-left px-3 py-2">Lugar</th>
                  <th className="text-left px-3 py-2">Jugador</th>
                  <th className="text-right px-3 py-2">Puntos</th>
                  <th className="text-right px-3 py-2">%</th>
                  <th className="text-right px-3 py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {reporte.asignaciones.map((a, i) => (
                  <tr key={i} className={`border-t border-pitch-100 ${a.empatado ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-3 py-2 font-display">{a.posicion_label}</td>
                    <td className="px-3 py-2 font-semibold">
                      {a.empatado ? (
                        <div>
                          <span className="text-amber-700">⚠ {a.nombre_completo}</span>
                          <div className="text-xs font-normal text-ink-700">
                            {a.nombres_empatados?.join(', ')}
                          </div>
                        </div>
                      ) : a.nombre_completo}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{a.puntos}</td>
                    <td className="px-3 py-2 text-right font-mono">{a.porcentaje.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-pitch-700">{fmtPesos(a.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-pitch-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right font-semibold">TOTAL:</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {reporte.asignaciones.reduce((s, a) => s + a.porcentaje, 0).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold">
                    {fmtPesos(reporte.asignaciones.reduce((s, a) => s + a.monto, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {reporte.notas.length > 0 && (
            <div className="card p-4">
              <h4 className="font-semibold text-pitch-700 mb-2">Notas</h4>
              <ul className="text-sm text-ink-700 space-y-1">
                {reporte.notas.map((n, i) => <li key={i}>• {n}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// ADMIN: PAGOS (parcialidades)
// ============================================================================
interface EstadoPago {
  user_id: string;
  nombre_completo: string;
  total_pagado: number;
  costo_total: number;
  saldo_pendiente: number;
  liquidado: boolean;
}
interface PagoRow {
  id: string;
  user_id: string;
  monto: number;
  metodo: string | null;
  nota: string | null;
  created_at: string;
}

function AdminPagos() {
  const [estados, setEstados] = useState<EstadoPago[]>([]);
  const [costoQuiniela, setCostoQuiniela] = useState<number>(400);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [pagosUsuario, setPagosUsuario] = useState<PagoRow[]>([]);
  const [nuevoPago, setNuevoPago] = useState<{ monto: string; metodo: string; nota: string }>({ monto: '', metodo: 'efectivo', nota: '' });
  const [filtro, setFiltro] = useState('');

  const cargar = async () => {
    const { data } = await supabase.from('estado_pagos').select('*').order('nombre_completo');
    setEstados((data ?? []) as EstadoPago[]);
    const { data: cfg } = await supabase.from('configuracion').select('valor').eq('clave', 'costo_quiniela').maybeSingle();
    if (cfg?.valor) setCostoQuiniela(parseFloat(cfg.valor));
  };
  useEffect(() => { cargar(); }, []);

  const verPagos = async (userId: string) => {
    if (expandido === userId) { setExpandido(null); return; }
    setExpandido(userId);
    const { data } = await supabase.from('pagos').select('*').eq('user_id', userId).order('created_at');
    setPagosUsuario((data ?? []) as PagoRow[]);
  };

  const abonar = async (userId: string) => {
    setMsg(null);
    const monto = parseFloat(nuevoPago.monto);
    if (isNaN(monto) || monto <= 0) { setMsg({ tipo: 'err', texto: 'Monto inválido.' }); return; }
    const { error } = await supabase.from('pagos').insert({
      user_id: userId, monto, metodo: nuevoPago.metodo || null, nota: nuevoPago.nota || null,
    });
    if (error) { setMsg({ tipo: 'err', texto: error.message }); return; }
    setMsg({ tipo: 'ok', texto: `✓ Abono de ${fmtPesos(monto)} registrado.` });
    setNuevoPago({ monto: '', metodo: 'efectivo', nota: '' });
    await verPagos(userId); // refrescar lista
    setExpandido(userId);
    const { data } = await supabase.from('pagos').select('*').eq('user_id', userId).order('created_at');
    setPagosUsuario((data ?? []) as PagoRow[]);
    cargar();
  };

  const borrarPago = async (pagoId: string, userId: string) => {
    if (!confirm('¿Borrar este abono?')) return;
    await supabase.from('pagos').delete().eq('id', pagoId);
    const { data } = await supabase.from('pagos').select('*').eq('user_id', userId).order('created_at');
    setPagosUsuario((data ?? []) as PagoRow[]);
    cargar();
  };

  const guardarCosto = async () => {
    const { error } = await setConfig('costo_quiniela', String(costoQuiniela));
    if (error) setMsg({ tipo: 'err', texto: error.message });
    else { setMsg({ tipo: 'ok', texto: '✓ Costo actualizado.' }); cargar(); }
  };

  const filtrados = filtro.trim() === '' ? estados
    : estados.filter(e => e.nombre_completo.toLowerCase().includes(filtro.toLowerCase()));

  const totalRecaudado = estados.reduce((s, e) => s + Number(e.total_pagado), 0);
  const totalLiquidados = estados.filter(e => e.liquidado).length;

  return (
    <div className="space-y-4">
      {msg && <div className={`p-2 rounded text-sm ${msg.tipo === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.texto}</div>}

      <div className="card p-4 grid sm:grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-ink-700 uppercase tracking-widest">Recaudado</div>
          <div className="font-display text-2xl text-pitch-700">{fmtPesos(totalRecaudado)}</div>
        </div>
        <div>
          <div className="text-xs text-ink-700 uppercase tracking-widest">Liquidados</div>
          <div className="font-display text-2xl text-pitch-700">{totalLiquidados} / {estados.length}</div>
        </div>
        <div>
          <label className="label">Costo de la quiniela ($)</label>
          <div className="flex gap-2">
            <input type="number" className="input" value={costoQuiniela}
              onChange={e => setCostoQuiniela(parseFloat(e.target.value) || 0)} />
            <button className="btn-primary text-sm whitespace-nowrap" onClick={guardarCosto}>Guardar</button>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <input className="input max-w-xs" placeholder="🔍 Buscar participante…"
          value={filtro} onChange={e => setFiltro(e.target.value)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-pitch-50 text-pitch-700">
            <tr>
              <th className="text-left px-3 py-2">Participante</th>
              <th className="text-right px-3 py-2">Pagado</th>
              <th className="text-right px-3 py-2">Saldo</th>
              <th className="text-center px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(e => (
              <>
                <tr key={e.user_id} className="border-t border-pitch-100">
                  <td className="px-3 py-2 font-semibold">{e.nombre_completo}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtPesos(Number(e.total_pagado))}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtPesos(Number(e.saldo_pendiente))}</td>
                  <td className="px-3 py-2 text-center">
                    {e.liquidado
                      ? <span className="badge bg-green-100 text-green-700">✓ Liquidado</span>
                      : <span className="badge bg-amber-100 text-amber-700">Parcial</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button className="btn-ghost text-xs" onClick={() => verPagos(e.user_id)}>
                      {expandido === e.user_id ? 'Cerrar' : 'Abonos / +Pago'}
                    </button>
                  </td>
                </tr>
                {expandido === e.user_id && (
                  <tr className="bg-pitch-50/40">
                    <td colSpan={5} className="px-3 py-3">
                      <div className="grid sm:grid-cols-4 gap-2 items-end mb-3">
                        <div>
                          <label className="label">Monto del abono</label>
                          <input type="number" className="input" value={nuevoPago.monto}
                            onChange={ev => setNuevoPago(s => ({ ...s, monto: ev.target.value }))} />
                        </div>
                        <div>
                          <label className="label">Método</label>
                          <select className="input" value={nuevoPago.metodo}
                            onChange={ev => setNuevoPago(s => ({ ...s, metodo: ev.target.value }))}>
                            <option value="efectivo">Efectivo</option>
                            <option value="transferencia">Transferencia</option>
                            <option value="otro">Otro</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Nota (opcional)</label>
                          <input className="input" value={nuevoPago.nota}
                            onChange={ev => setNuevoPago(s => ({ ...s, nota: ev.target.value }))} />
                        </div>
                        <button className="btn-accent text-sm" onClick={() => abonar(e.user_id)}>
                          Registrar abono
                        </button>
                      </div>
                      {pagosUsuario.length > 0 ? (
                        <table className="w-full text-xs">
                          <thead className="text-ink-700">
                            <tr>
                              <th className="text-left py-1">Fecha</th>
                              <th className="text-right py-1">Monto</th>
                              <th className="text-left py-1 pl-3">Método</th>
                              <th className="text-left py-1">Nota</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagosUsuario.map(pg => (
                              <tr key={pg.id} className="border-t border-pitch-100">
                                <td className="py-1">{fmtFechaCorta(pg.created_at)}</td>
                                <td className="py-1 text-right font-mono">{fmtPesos(Number(pg.monto))}</td>
                                <td className="py-1 pl-3">{pg.metodo ?? '—'}</td>
                                <td className="py-1">{pg.nota ?? ''}</td>
                                <td className="py-1 text-right">
                                  <button className="text-red-600 text-xs" onClick={() => borrarPago(pg.id, e.user_id)}>borrar</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : <div className="text-xs text-ink-700">Sin abonos aún.</div>}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN: REPORTE (quién no ha pronosticado + exportar Excel)
// ============================================================================
interface ProgresoRow {
  user_id: string;
  nombre_completo: string;
  fase_id: string;
  fase_codigo: string;
  fase_nombre: string;
  total_partidos: number;
  pronosticados: number;
  faltantes: number;
}

interface ProgresoClasifRow {
  user_id: string;
  nombre_completo: string;
  total_esperado: number;
  llenados: number;
  grupos_llenados: number;
  terceros_llenados: number;
  top4_llenados: number;
  faltantes: number;
}

function AdminReporte() {
  const [fases, setFases] = useState<Fase[]>([]);
  const [faseSel, setFaseSel] = useState<string>('');
  const [progreso, setProgreso] = useState<ProgresoRow[]>([]);
  const [progresoClasif, setProgresoClasif] = useState<ProgresoClasifRow[]>([]);
  const [soloFaltantes, setSoloFaltantes] = useState(true);
  const [soloFaltantesClasif, setSoloFaltantesClasif] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('fases').select('*').eq('publicada', true).order('orden');
      const arr = (data ?? []) as Fase[];
      setFases(arr);
      const abierta = arr.find(f => f.fecha_apertura && f.fecha_cierre &&
        new Date(f.fecha_apertura) <= new Date() && new Date(f.fecha_cierre) > new Date());
      setFaseSel(abierta?.id ?? arr[0]?.id ?? '');
    })();
    // Cargar progreso de clasificación (no depende de la fase seleccionada)
    (async () => {
      const { data } = await supabase.from('progreso_clasificacion').select('*');
      setProgresoClasif(((data ?? []) as ProgresoClasifRow[]).sort((a, b) => b.faltantes - a.faltantes));
    })();
  }, []);

  useEffect(() => {
    if (!faseSel) return;
    (async () => {
      const { data } = await supabase.from('progreso_pronosticos').select('*').eq('fase_id', faseSel);
      setProgreso(((data ?? []) as ProgresoRow[]).sort((a, b) => b.faltantes - a.faltantes));
    })();
  }, [faseSel]);

  const exportar = async () => {
    setExportando(true);
    setMsg(null);
    try {
      await exportarQuinielaExcel();
      setMsg('✓ Excel generado y descargado.');
    } catch (err: any) {
      setMsg('Error al exportar: ' + err.message);
    } finally {
      setExportando(false);
    }
  };

  const filtrados = soloFaltantes ? progreso.filter(p => p.faltantes > 0) : progreso;
  const completados = progreso.filter(p => p.faltantes === 0).length;

  const filtradosClasif = soloFaltantesClasif ? progresoClasif.filter(p => p.faltantes > 0) : progresoClasif;
  const completadosClasif = progresoClasif.filter(p => p.faltantes === 0).length;

  return (
    <div className="space-y-4">
      {msg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{msg}</div>}

      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl">Respaldo completo</h3>
          <p className="text-xs text-ink-700">Descarga toda la quiniela (ranking, pagos, progreso) en un Excel.</p>
        </div>
        <button className="btn-accent" onClick={exportar} disabled={exportando}>
          {exportando ? 'Generando…' : '📥 Exportar a Excel'}
        </button>
      </div>

      <div className="card p-4">
        <h3 className="font-display text-xl mb-3">Quién ha pronosticado</h3>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <select className="input max-w-xs" value={faseSel} onChange={e => setFaseSel(e.target.value)}>
            {fases.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloFaltantes} onChange={e => setSoloFaltantes(e.target.checked)} />
            Mostrar solo a quienes les faltan
          </label>
          <span className="text-sm text-ink-700">{completados} de {progreso.length} completos</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pitch-50 text-pitch-700">
              <tr>
                <th className="text-left px-3 py-2">Participante</th>
                <th className="text-right px-3 py-2">Pronosticados</th>
                <th className="text-right px-3 py-2">Faltantes</th>
                <th className="text-center px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.user_id} className="border-t border-pitch-100">
                  <td className="px-3 py-2 font-semibold">{p.nombre_completo}</td>
                  <td className="px-3 py-2 text-right font-mono">{p.pronosticados} / {p.total_partidos}</td>
                  <td className="px-3 py-2 text-right font-mono">{p.faltantes}</td>
                  <td className="px-3 py-2 text-center">
                    {p.faltantes === 0
                      ? <span className="badge bg-green-100 text-green-700">✓ Completo</span>
                      : <span className="badge bg-amber-100 text-amber-700">Faltan {p.faltantes}</span>}
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={4} className="text-center text-ink-700 py-4">
                  {soloFaltantes ? '¡Todos completaron sus pronósticos en esta fase!' : 'Sin datos.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-display text-xl mb-1">Quién ha llenado la Clasificación</h3>
        <p className="text-xs text-ink-700 mb-3">
          1° y 2° de cada grupo, 8 terceros y top 4. Total: {progresoClasif[0]?.total_esperado ?? 36} pronósticos.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloFaltantesClasif} onChange={e => setSoloFaltantesClasif(e.target.checked)} />
            Mostrar solo a quienes les faltan
          </label>
          <span className="text-sm text-ink-700">{completadosClasif} de {progresoClasif.length} completos</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pitch-50 text-pitch-700">
              <tr>
                <th className="text-left px-3 py-2">Participante</th>
                <th className="text-right px-3 py-2">Grupos</th>
                <th className="text-right px-3 py-2">Terceros</th>
                <th className="text-right px-3 py-2">Top 4</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-center px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtradosClasif.map(p => (
                <tr key={p.user_id} className="border-t border-pitch-100">
                  <td className="px-3 py-2 font-semibold">{p.nombre_completo}</td>
                  <td className="px-3 py-2 text-right font-mono">{p.grupos_llenados}/24</td>
                  <td className="px-3 py-2 text-right font-mono">{p.terceros_llenados}/8</td>
                  <td className="px-3 py-2 text-right font-mono">{p.top4_llenados}/4</td>
                  <td className="px-3 py-2 text-right font-mono">{p.llenados}/{p.total_esperado}</td>
                  <td className="px-3 py-2 text-center">
                    {p.faltantes === 0
                      ? <span className="badge bg-green-100 text-green-700">✓ Completo</span>
                      : <span className="badge bg-amber-100 text-amber-700">Faltan {p.faltantes}</span>}
                  </td>
                </tr>
              ))}
              {filtradosClasif.length === 0 && (
                <tr><td colSpan={6} className="text-center text-ink-700 py-4">
                  {soloFaltantesClasif ? '¡Todos completaron su clasificación!' : 'Sin datos.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
