import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bandera } from '../lib/banderas';

interface FilaProyeccion {
  equipo: string;
  votos: number;
  jugadores: string[];
}

type DetalleSel =
  | { tipo: 'grupo'; grupoId: string; grupoCodigo: string; posicion: 1 | 2 }
  | { tipo: 'tercero' }
  | { tipo: 'top4'; posicion: number }
  | null;

export function Proyeccion() {
  const [grupos, setGrupos] = useState<any[]>([]);
  const [proyG1, setProyG1] = useState<Record<string, FilaProyeccion[]>>({});
  const [proyG2, setProyG2] = useState<Record<string, FilaProyeccion[]>>({});
  const [terceros, setTerceros] = useState<FilaProyeccion[]>([]);
  const [top4, setTop4] = useState<Record<number, FilaProyeccion[]>>({});
  const [loading, setLoading] = useState(true);
  const [cerrado, setCerrado] = useState(false);
  const [sel, setSel] = useState<DetalleSel>(null);

  useEffect(() => {
    (async () => {
      const { data: ab } = await supabase.rpc('clasificacion_abierta');
      const estaAbierta = ab === true;
      setCerrado(!estaAbierta);

      const { data: gs } = await supabase.from('grupos').select('*').order('codigo');
      setGrupos(gs ?? []);

      const todos: any[] = [];
      let desde = 0; const TAM = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('pronosticos_clasificacion')
          .select('tipo, grupo_id, posicion, equipo, user_id')
          .range(desde, desde + TAM - 1);
        if (error) break;
        const arr = data ?? [];
        todos.push(...arr);
        if (arr.length < TAM) break;
        desde += TAM;
      }

      let nombres: Record<string, string> = {};
      if (!estaAbierta) {
        const { data: profs } = await supabase.from('profiles').select('id, nombre_completo');
        (profs ?? []).forEach((p: any) => { nombres[p.id] = p.nombre_completo; });
      }

      const agrupar = (filas: any[]): FilaProyeccion[] => {
        const m: Record<string, { votos: number; jugadores: string[] }> = {};
        filas.forEach(f => {
          if (!f.equipo) return;
          if (!m[f.equipo]) m[f.equipo] = { votos: 0, jugadores: [] };
          m[f.equipo].votos++;
          const nom = nombres[f.user_id];
          if (nom) m[f.equipo].jugadores.push(nom);
        });
        return Object.entries(m)
          .map(([equipo, v]) => ({ equipo, votos: v.votos, jugadores: v.jugadores.sort() }))
          .sort((a, b) => b.votos - a.votos);
      };

      const g1: Record<string, FilaProyeccion[]> = {};
      const g2: Record<string, FilaProyeccion[]> = {};
      (gs ?? []).forEach((g: any) => {
        g1[g.id] = agrupar(todos.filter(t => t.tipo === 'clasif_grupo' && t.grupo_id === g.id && t.posicion === 1));
        g2[g.id] = agrupar(todos.filter(t => t.tipo === 'clasif_grupo' && t.grupo_id === g.id && t.posicion === 2));
      });
      setProyG1(g1); setProyG2(g2);
      setTerceros(agrupar(todos.filter(t => t.tipo === 'tercero')));

      const t4: Record<number, FilaProyeccion[]> = {};
      [1, 2, 3, 4].forEach(pos => { t4[pos] = agrupar(todos.filter(t => t.tipo === 'top4' && t.posicion === pos)); });
      setTop4(t4);

      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-center py-12 text-pitch-700">Calculando proyección…</div>;

  const datosDetalle = (): { titulo: string; filas: FilaProyeccion[] } | null => {
    if (!sel) return null;
    if (sel.tipo === 'grupo') {
      const filas = (sel.posicion === 1 ? proyG1 : proyG2)[sel.grupoId] ?? [];
      return { titulo: `Grupo ${sel.grupoCodigo} — ${sel.posicion}° lugar`, filas };
    }
    if (sel.tipo === 'tercero') return { titulo: 'Mejores terceros', filas: terceros };
    if (sel.tipo === 'top4') {
      const lbl: Record<number, string> = { 1: 'Campeón', 2: 'Subcampeón', 3: '3er lugar', 4: '4° lugar' };
      return { titulo: lbl[sel.posicion], filas: top4[sel.posicion] ?? [] };
    }
    return null;
  };
  const detalle = datosDetalle();

  const Compacto = ({ filas, onClick, label }: { filas: FilaProyeccion[]; onClick: () => void; label: string }) => {
    const lider = filas[0];
    const totalVotos = filas.reduce((s, f) => s + f.votos, 0);
    return (
      <button onClick={onClick}
        className="w-full text-left rounded-lg border border-pitch-100 hover:border-pitch-400 hover:bg-pitch-50 transition p-2">
        <div className="text-[11px] text-ink-700 font-semibold">{label}</div>
        {lider ? (
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm"><Bandera equipo={lider.equipo} /> {lider.equipo}</span>
            <span className="text-xs text-pitch-700">{lider.votos} voto{lider.votos !== 1 ? 's' : ''}</span>
          </div>
        ) : <div className="text-xs text-ink-700/60">Sin votos aún</div>}
        <div className="text-[10px] text-ink-700/60 mt-0.5">
          {filas.length} opción(es) · {totalVotos} voto(s) · toca para ver detalle ›
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-pitch-900 text-white">
        <h2 className="font-display text-2xl">📊 CLASIFICACIÓN PROYECTADA</h2>
        <p className="text-pitch-100 text-sm mt-1">
          Lo que la comunidad pronostica. Toca cualquier grupo, posición, los terceros o un
          finalista para ver el ranking completo y quién votó.
        </p>
        {!cerrado && (
          <p className="text-fire-300 text-xs mt-2">
            🔒 Los nombres de quién votó se mostrarán cuando cierre la clasificación.
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {grupos.map((g: any) => (
          <div key={g.id} className="card p-3 space-y-2">
            <div className="font-display text-pitch-700">Grupo {g.codigo}</div>
            <Compacto label="1° lugar" filas={proyG1[g.id] ?? []}
              onClick={() => setSel({ tipo: 'grupo', grupoId: g.id, grupoCodigo: g.codigo, posicion: 1 })} />
            <Compacto label="2° lugar" filas={proyG2[g.id] ?? []}
              onClick={() => setSel({ tipo: 'grupo', grupoId: g.id, grupoCodigo: g.codigo, posicion: 2 })} />
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="card p-3">
          <div className="font-display text-pitch-700 mb-2">Mejores terceros</div>
          <Compacto label="Más votado" filas={terceros} onClick={() => setSel({ tipo: 'tercero' })} />
        </div>
        {[1, 2, 3, 4].map(pos => {
          const lbl: Record<number, string> = { 1: 'Campeón 🏆', 2: 'Subcampeón 🥈', 3: '3er lugar 🥉', 4: '4° lugar' };
          return (
            <div key={pos} className="card p-3">
              <div className="font-display text-pitch-700 mb-2">{lbl[pos]}</div>
              <Compacto label="Más votado" filas={top4[pos] ?? []} onClick={() => setSel({ tipo: 'top4', posicion: pos })} />
            </div>
          );
        })}
      </div>

      {detalle && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSel(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-pitch-600 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between sticky top-0">
              <h3 className="font-display text-lg">{detalle.titulo}</h3>
              <button onClick={() => setSel(null)} className="hover:bg-pitch-700 rounded px-2">✕</button>
            </div>
            <div className="p-4 space-y-3">
              {detalle.filas.length === 0 ? (
                <div className="text-center text-ink-700 py-6">Nadie ha votado por esta opción todavía.</div>
              ) : detalle.filas.map((f, i) => {
                const max = detalle.filas[0].votos;
                return (
                  <div key={f.equipo} className="border-b border-pitch-100 pb-2 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        <span className="text-ink-700/50 mr-1">{i + 1}.</span>
                        <Bandera equipo={f.equipo} /> {f.equipo}
                      </span>
                      <span className="text-sm text-pitch-700 font-mono">{f.votos}</span>
                    </div>
                    <div className="h-2 bg-pitch-50 rounded mt-1">
                      <div className="h-2 bg-pitch-500 rounded" style={{ width: `${(f.votos / max) * 100}%` }} />
                    </div>
                    {cerrado ? (
                      f.jugadores.length > 0 && (
                        <div className="text-[11px] text-ink-700 mt-1">
                          <span className="font-semibold">Votaron:</span> {f.jugadores.join(', ')}
                        </div>
                      )
                    ) : (
                      <div className="text-[10px] text-ink-700/50 mt-1 italic">
                        Los nombres se mostrarán al cerrar la clasificación.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
