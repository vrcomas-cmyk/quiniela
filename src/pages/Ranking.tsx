import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { RankingRow } from '../types';
import { useAuthCtx } from '../hooks/AuthContext';

export function Ranking() {
  const { profile } = useAuthCtx();
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('ranking').select('*');
      setRows((data ?? []) as RankingRow[]);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-center py-12 text-pitch-700">Cargando ranking…</div>;

  const medalla = (i: number) => {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    if (i === 3) return '🏅';
    if (i === 4) return '🎖';
    return '';
  };

  return (
    <div className="space-y-4">
      <div className="card p-6 bg-gradient-to-r from-pitch-700 to-pitch-900 text-white">
        <h2 className="font-display text-3xl">RANKING GENERAL</h2>
        <p className="text-pitch-100 text-sm mt-1">
          Premios: 1° 35% · 2° 25% · 3° 20% · 4° 15% · 5° 5% del bote total
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-pitch-50 text-pitch-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">#</th>
                <th className="text-left px-4 py-3 font-semibold">Jugador</th>
                <th className="text-right px-4 py-3 font-semibold">Partidos</th>
                <th className="text-right px-4 py-3 font-semibold">Clasif.</th>
                <th className="text-right px-4 py-3 font-semibold">Bonos</th>
                <th className="text-right px-4 py-3 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const esYo = r.user_id === profile?.id;
                return (
                  <tr
                    key={r.user_id}
                    className={`border-t border-pitch-100 ${
                      esYo ? 'bg-fire-500/10' : 'hover:bg-pitch-50/50'
                    }`}
                  >
                    <td className="px-4 py-3 font-display text-lg">
                      {medalla(i) || i + 1}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {r.nombre_completo}
                      {esYo && <span className="ml-2 text-xs text-fire-600">(tú)</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{r.pts_partidos}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.pts_clasificacion}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.pts_bonus}</td>
                    <td className="px-4 py-3 text-right font-mono text-lg font-bold text-pitch-700">
                      {r.puntos_totales}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-ink-700 py-8">
                    Aún no hay jugadores registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
