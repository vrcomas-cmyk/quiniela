// =============================================================================
// REPARTO DE PREMIOS - Lógica oficial según el DOCX de bases
// =============================================================================
//
// Porcentajes base sobre el monto neto a repartir:
//   1° = 35%, 2° = 25%, 3° = 20%, 4° = 15%, 5° = 5%
//
// Reglas de empate (textuales del DOCX):
//
//  R1) Si fuesen 3 o más los ganadores a primer lugar:
//      - 4° y 5° quedan desiertos
//      - El 80% se reparte entre los empatados de 1er lugar
//      - El 20% se reparte entre quienes hayan quedado en el lugar inmediato siguiente
//
//  R2) Si fuesen 2 o menos los ganadores para 1° pero hay empate de MÁS DE 2
//      participantes para 2°:
//      - 4° y 5° quedan desiertos
//      - Los de 1° se reparten 35% + 25% (= 60%)
//      - Los de 2° se reparten 20% + 15% + 5% (= 40%)
//
//  R3) Empate solo en 3er lugar:
//      - 4° y 5° quedan desiertos
//      - Los de 3° se reparten 20% + 15% + 5% (= 40%)
//      (El DOCX dice 20+15+10=45% pero es un typo: los premios oficiales
//      son 35+25+20+15+5=100%, así que 3°+4°+5° = 40% es lo correcto.)
//
//  R4) Empate solo en 4to lugar:
//      - 5° queda desierto
//      - Los de 4° se reparten 15% + 5% (= 20%)
//
//  R5) Empate solo en 5to lugar:
//      - El 5% se divide entre los empatados
//
//  R0) Sin empates: 35/25/20/15/5 a los 5 primeros.
// =============================================================================

export interface JugadorPuntos {
  user_id: string;
  nombre_completo: string;
  puntos_totales: number;
}

export interface GrupoPosicion {
  posicion: number;          // 1, 2, 3, 4, 5
  puntos: number;
  jugadores: JugadorPuntos[];
  porcentajeOficial: number; // % que corresponde si NO hubiera empate
}

export interface AsignacionPremio {
  user_id: string;
  nombre_completo: string;
  posicion: number;            // posición en la que quedó (1..5+)
  posicion_label: string;      // "1° lugar", "Empate 2° lugar", etc.
  puntos: number;
  porcentaje: number;          // % que recibe (puede ser fraccional)
  monto: number;               // monto en pesos
}

export interface ReporteReparto {
  monto_total: number;
  monto_neto: number;          // tras descontar aporte fijo
  aporte_fijo: number;
  monto_residual: number;      // % no asignado (queda en el bote / decisión del admin)
  porcentaje_residual: number;
  asignaciones: AsignacionPremio[];
  desiertos: number[];         // posiciones (1..5) que quedaron sin asignar
  reglas_aplicadas: string[];  // descripción legible para auditoría
}

const PORCENTAJES_OFICIALES = [35, 25, 20, 15, 5];

/**
 * Agrupa jugadores por puntos en posiciones del podio (top 5 por puntos).
 * Devuelve hasta 5 grupos según los puntos distintos.
 */
export function agruparPorPosicion(jugadores: JugadorPuntos[]): GrupoPosicion[] {
  // Ordenar descendente por puntos
  const ord = [...jugadores]
    .filter(j => j.puntos_totales > 0)
    .sort((a, b) => b.puntos_totales - a.puntos_totales);

  if (ord.length === 0) return [];

  const grupos: GrupoPosicion[] = [];
  let posicion = 1;
  let i = 0;
  while (i < ord.length && posicion <= 5) {
    const pts = ord[i].puntos_totales;
    const empatados: JugadorPuntos[] = [];
    while (i < ord.length && ord[i].puntos_totales === pts) {
      empatados.push(ord[i]);
      i++;
    }
    grupos.push({
      posicion,
      puntos: pts,
      jugadores: empatados,
      porcentajeOficial: PORCENTAJES_OFICIALES[posicion - 1] ?? 0,
    });
    posicion++;
  }
  return grupos;
}

/**
 * Calcula el reparto de premios aplicando las reglas de empate del DOCX.
 */
export function calcularReparto(
  jugadores: JugadorPuntos[],
  montoTotal: number,
  aporteFijo: number = 1500
): ReporteReparto {
  const montoNeto = Math.max(0, montoTotal - aporteFijo);
  const grupos = agruparPorPosicion(jugadores);
  const asignaciones: AsignacionPremio[] = [];
  const desiertos: number[] = [];
  const reglas: string[] = [];

  if (grupos.length === 0 || montoNeto === 0) {
    return {
      monto_total: montoTotal,
      monto_neto: montoNeto,
      aporte_fijo: aporteFijo,
      monto_residual: montoNeto,
      porcentaje_residual: 100,
      asignaciones,
      desiertos: [1, 2, 3, 4, 5],
      reglas_aplicadas: ['Sin jugadores con puntos o sin monto a repartir.'],
    };
  }

  const g1 = grupos[0];
  const g2 = grupos[1];
  const g3 = grupos[2];
  const g4 = grupos[3];

  // ---------------------------------------------------------------------------
  // R1: 3 o más empatados en 1er lugar
  // 80% para los de 1°, 20% para el grupo siguiente, 4° y 5° desiertos
  // ---------------------------------------------------------------------------
  if (g1.jugadores.length >= 3) {
    reglas.push(`R1: ${g1.jugadores.length} jugadores empatados en 1er lugar → 80% para ellos, 20% para el lugar siguiente, 4° y 5° desiertos.`);
    repartirGrupo(g1, 80, 'Empate 1er lugar', asignaciones, montoNeto);
    if (g2) {
      const label = g2.jugadores.length > 1 ? `Empate ${ordinal(g2.posicion)} lugar` : `${ordinal(g2.posicion)} lugar`;
      repartirGrupo(g2, 20, label, asignaciones, montoNeto);
    } else {
      reglas.push(`No hay jugadores en posición siguiente: el 20% no se reparte.`);
    }
    desiertos.push(4, 5);
    // Si g2 ocupó la posición 2, 3 también desierto
    if (g2 && g2.posicion < 3) desiertos.push(3);
    return finalizar();
  }

  // ---------------------------------------------------------------------------
  // R2: 1° con 1 o 2 ganadores PERO 2° con más de 2 empatados
  // 1° reparte 60% (35+25), 2° reparte 40% (20+15+5), 4° y 5° desiertos
  // ---------------------------------------------------------------------------
  if (g1.jugadores.length <= 2 && g2 && g2.jugadores.length > 2) {
    reglas.push(`R2: 1er lugar tiene ${g1.jugadores.length} ganador(es) y 2do lugar tiene ${g2.jugadores.length} empatados → 1° comparten 60%, 2° comparten 40%, 4° y 5° desiertos.`);
    const label1 = g1.jugadores.length > 1 ? 'Empate 1er lugar' : '1er lugar';
    repartirGrupo(g1, 60, label1, asignaciones, montoNeto);
    repartirGrupo(g2, 40, 'Empate 2do lugar', asignaciones, montoNeto);
    desiertos.push(3, 4, 5);
    return finalizar();
  }

  // ---------------------------------------------------------------------------
  // R3, R4, R5: Empate solo en 3° / 4° / 5°
  //   Las reglas anteriores ya manejaron empates en 1° y 2°.
  //   De aquí en adelante asumimos 1° y 2° sin empate problemático.
  // ---------------------------------------------------------------------------

  // 1er lugar (puede ser empate de 2, repartirían 35% entre los 2)
  const label1 = g1.jugadores.length > 1 ? 'Empate 1er lugar' : '1er lugar';
  repartirGrupo(g1, 35, label1, asignaciones, montoNeto);
  if (g1.jugadores.length > 1) {
    reglas.push(`Empate de 2 en 1er lugar: comparten 35% entre ambos.`);
  }

  if (!g2) { desiertos.push(2, 3, 4, 5); return finalizar(); }

  // 2do lugar (puede ser empate de 2, repartirían 25%)
  const label2 = g2.jugadores.length > 1 ? 'Empate 2do lugar' : '2do lugar';
  repartirGrupo(g2, 25, label2, asignaciones, montoNeto);
  if (g2.jugadores.length > 1) {
    reglas.push(`Empate de 2 en 2do lugar: comparten 25% entre ambos.`);
  }

  if (!g3) { desiertos.push(3, 4, 5); return finalizar(); }

  // R3: empate en 3er lugar (>=2)
  if (g3.jugadores.length >= 2) {
    reglas.push(`R3: ${g3.jugadores.length} empatados en 3er lugar → comparten 40% (20+15+5), 4° y 5° desiertos.`);
    repartirGrupo(g3, 40, 'Empate 3er lugar', asignaciones, montoNeto);
    desiertos.push(4, 5);
    return finalizar();
  }

  // 3er lugar normal
  repartirGrupo(g3, 20, '3er lugar', asignaciones, montoNeto);

  if (!g4) { desiertos.push(4, 5); return finalizar(); }

  // R4: empate en 4to lugar (>=2)
  if (g4.jugadores.length >= 2) {
    reglas.push(`R4: ${g4.jugadores.length} empatados en 4to lugar → comparten 20% (15+5), 5° desierto.`);
    repartirGrupo(g4, 20, 'Empate 4to lugar', asignaciones, montoNeto);
    desiertos.push(5);
    return finalizar();
  }

  // 4to lugar normal
  repartirGrupo(g4, 15, '4to lugar', asignaciones, montoNeto);

  const g5 = grupos[4];
  if (!g5) { desiertos.push(5); return finalizar(); }

  // R5: empate en 5to lugar (>=2)
  if (g5.jugadores.length >= 2) {
    reglas.push(`R5: ${g5.jugadores.length} empatados en 5to lugar → comparten el 5%.`);
    repartirGrupo(g5, 5, 'Empate 5to lugar', asignaciones, montoNeto);
    return finalizar();
  }

  // 5to lugar normal
  repartirGrupo(g5, 5, '5to lugar', asignaciones, montoNeto);

  return finalizar();

  // ---------------------------------------------------------------------------
  function finalizar(): ReporteReparto {
    const sumaPorcentajes = asignaciones.reduce((s, a) => s + a.porcentaje, 0);
    const porcentaje_residual = Math.max(0, 100 - sumaPorcentajes);
    const monto_residual = (montoNeto * porcentaje_residual) / 100;
    if (porcentaje_residual > 0.01) {
      reglas.push(`No se pudieron asignar todos los lugares (faltaron jugadores con puntos). Queda residual: ${porcentaje_residual.toFixed(2)}% = ${fmtPesos(monto_residual)}.`);
    }
    return {
      monto_total: montoTotal,
      monto_neto: montoNeto,
      aporte_fijo: aporteFijo,
      monto_residual,
      porcentaje_residual,
      asignaciones,
      desiertos: Array.from(new Set(desiertos)).sort((a, b) => a - b),
      reglas_aplicadas: reglas,
    };
  }
}

function repartirGrupo(
  grupo: GrupoPosicion,
  porcentajeTotal: number,
  label: string,
  asignaciones: AsignacionPremio[],
  montoNeto: number
) {
  const n = grupo.jugadores.length;
  if (n === 0) return;
  const porcentajePorPersona = porcentajeTotal / n;
  const montoPorPersona = (montoNeto * porcentajePorPersona) / 100;
  for (const j of grupo.jugadores) {
    asignaciones.push({
      user_id: j.user_id,
      nombre_completo: j.nombre_completo,
      posicion: grupo.posicion,
      posicion_label: label,
      puntos: j.puntos_totales,
      porcentaje: porcentajePorPersona,
      monto: montoPorPersona,
    });
  }
}

function ordinal(n: number): string {
  switch (n) {
    case 1: return '1er';
    case 2: return '2do';
    case 3: return '3er';
    case 4: return '4to';
    case 5: return '5to';
    default: return `${n}°`;
  }
}

/**
 * Helper para formatear pesos mexicanos.
 */
export function fmtPesos(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
