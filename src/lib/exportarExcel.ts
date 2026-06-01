import { supabase } from './supabase';

// Exporta toda la quiniela a un archivo Excel con varias hojas.
// xlsx se importa dinámicamente para no inflar el bundle inicial.

export async function exportarQuinielaExcel(): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // ----- HOJA 1: Ranking con desglose por fase -----
  const { data: ranking } = await supabase
    .from('ranking')
    .select('*')
    .order('puntos_totales', { ascending: false });

  // Desglose por fase desde ranking_por_fase
  const { data: porFase } = await supabase
    .from('ranking_por_fase')
    .select('*');

  // Mapa user_id -> {fase_codigo: puntos}
  const desglose: Record<string, Record<string, number>> = {};
  (porFase ?? []).forEach((r: any) => {
    if (!desglose[r.user_id]) desglose[r.user_id] = {};
    desglose[r.user_id][r.fase_codigo] = r.puntos;
  });

  const filasRanking = (ranking ?? []).map((r: any, i: number) => ({
    'Ranking': i + 1,
    'Participante': r.nombre_completo,
    'Grupos': desglose[r.user_id]?.['grupos'] ?? 0,
    '16vos': desglose[r.user_id]?.['16vos'] ?? 0,
    'Octavos': desglose[r.user_id]?.['8vos'] ?? 0,
    'Cuartos': desglose[r.user_id]?.['4tos'] ?? 0,
    'Semis': desglose[r.user_id]?.['semis'] ?? 0,
    '3er Lugar': desglose[r.user_id]?.['3er_lugar'] ?? 0,
    'Final': desglose[r.user_id]?.['final'] ?? 0,
    'Pts Partidos': r.pts_partidos,
    'Pts Clasificación': r.pts_clasificacion,
    'Pts Bonos': r.pts_bonus,
    'TOTAL': r.puntos_totales,
  }));
  const wsRanking = XLSX.utils.json_to_sheet(filasRanking);
  XLSX.utils.book_append_sheet(wb, wsRanking, 'Ranking');

  // ----- HOJA 2: Estado de pagos -----
  const { data: pagos } = await supabase
    .from('estado_pagos')
    .select('*')
    .order('nombre_completo');
  const filasPagos = (pagos ?? []).map((p: any) => ({
    'Participante': p.nombre_completo,
    'Total Pagado': p.total_pagado,
    'Costo Total': p.costo_total,
    'Saldo Pendiente': p.saldo_pendiente,
    'Liquidado': p.liquidado ? 'Sí' : 'No',
  }));
  const wsPagos = XLSX.utils.json_to_sheet(filasPagos);
  XLSX.utils.book_append_sheet(wb, wsPagos, 'Pagos');

  // ----- HOJA 3: Progreso de pronósticos -----
  const { data: progreso } = await supabase
    .from('progreso_pronosticos')
    .select('*');
  // Pivot: una fila por jugador, columnas por fase (pronosticados/total)
  const porJugador: Record<string, any> = {};
  (progreso ?? []).forEach((p: any) => {
    if (!porJugador[p.user_id]) porJugador[p.user_id] = { 'Participante': p.nombre_completo };
    porJugador[p.user_id][p.fase_nombre] = `${p.pronosticados}/${p.total_partidos}`;
  });
  const filasProgreso = Object.values(porJugador);
  if (filasProgreso.length > 0) {
    const wsProgreso = XLSX.utils.json_to_sheet(filasProgreso);
    XLSX.utils.book_append_sheet(wb, wsProgreso, 'Progreso pronósticos');
  }

  // Descargar
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `quiniela-mundial-2026-${fecha}.xlsx`);
}
