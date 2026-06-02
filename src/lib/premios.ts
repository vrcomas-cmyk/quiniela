// =============================================================================
// REPARTO DE PREMIOS - Porcentajes configurables, cálculo sin empates
// =============================================================================
//
// El número de lugares premiados y sus porcentajes son configurables desde el
// panel admin (deben sumar 100%). Ej: [35,25,20,15,5] o [50,30,20].
//
// El sistema calcula el reparto ASUMIENDO QUE NO HAY EMPATES (cada lugar a una
// persona). Si detecta empates en las posiciones premiadas, los SEÑALA para que
// el administrador resuelva el reparto manualmente.
// =============================================================================

export interface JugadorPuntos {
  user_id: string;
  nombre_completo: string;
  puntos_totales: number;
}

export interface AsignacionPremio {
  user_id: string | null;        // null si el lugar está empatado o sin jugador
  nombre_completo: string;
  posicion: number;              // 1..N
  posicion_label: string;        // "1er lugar", etc.
  puntos: number;
  porcentaje: number;
  monto: number;
  empatado: boolean;             // true si hay 2+ con los mismos puntos en esta posición
  nombres_empatados?: string[];  // si empatado, los nombres involucrados
}

export interface ReporteReparto {
  monto_total: number;
  monto_neto: number;
  aporte_fijo: number;
  asignaciones: AsignacionPremio[];
  hay_empates: boolean;          // si true, el admin debe revisar/ajustar a mano
  notas: string[];
}

const PORCENTAJES_DEFAULT = [35, 25, 20, 15, 5];

function ordinalLabel(n: number): string {
  const maps: Record<number, string> = {
    1: '1er lugar', 2: '2do lugar', 3: '3er lugar', 4: '4to lugar', 5: '5to lugar',
  };
  return maps[n] ?? `${n}° lugar`;
}

/**
 * Parsea los porcentajes desde el valor de configuración (string JSON o CSV).
 * Acepta "[35,25,20,15,5]" o "35,25,20,15,5". Devuelve default si es inválido.
 */
export function parsePorcentajes(valor: string | null | undefined): number[] {
  if (!valor) return [...PORCENTAJES_DEFAULT];
  try {
    const limpio = valor.trim();
    let arr: number[];
    if (limpio.startsWith('[')) {
      arr = JSON.parse(limpio);
    } else {
      arr = limpio.split(',').map((s) => parseFloat(s.trim()));
    }
    arr = arr.filter((n) => !isNaN(n) && n > 0);
    return arr.length > 0 ? arr : [...PORCENTAJES_DEFAULT];
  } catch {
    return [...PORCENTAJES_DEFAULT];
  }
}

/** Suma de porcentajes (para validar que sea 100). */
export function sumaPorcentajes(porcentajes: number[]): number {
  return porcentajes.reduce((s, p) => s + p, 0);
}

/**
 * Calcula el reparto de premios.
 */
export function calcularReparto(
  jugadores: JugadorPuntos[],
  montoTotal: number,
  porcentajes: number[] = PORCENTAJES_DEFAULT,
  aporteFijo: number = 0
): ReporteReparto {
  const montoNeto = Math.max(0, montoTotal - aporteFijo);
  const notas: string[] = [];

  const ord = [...jugadores]
    .filter((j) => j.puntos_totales > 0)
    .sort((a, b) => b.puntos_totales - a.puntos_totales);

  const asignaciones: AsignacionPremio[] = [];
  let hayEmpates = false;

  // Agrupar por puntaje (escalones distintos)
  const escalones: { puntos: number; jugadores: JugadorPuntos[] }[] = [];
  for (const j of ord) {
    const ultimo = escalones[escalones.length - 1];
    if (ultimo && ultimo.puntos === j.puntos_totales) {
      ultimo.jugadores.push(j);
    } else {
      escalones.push({ puntos: j.puntos_totales, jugadores: [j] });
    }
  }

  for (let pos = 1; pos <= porcentajes.length; pos++) {
    const escalon = escalones[pos - 1];
    const pct = porcentajes[pos - 1];
    const monto = (montoNeto * pct) / 100;

    if (!escalon) {
      asignaciones.push({
        user_id: null,
        nombre_completo: '(sin jugador)',
        posicion: pos,
        posicion_label: ordinalLabel(pos),
        puntos: 0,
        porcentaje: pct,
        monto,
        empatado: false,
      });
      notas.push(`No hay jugador para el ${ordinalLabel(pos)} (faltan participantes con puntos).`);
      continue;
    }

    if (escalon.jugadores.length > 1) {
      hayEmpates = true;
      asignaciones.push({
        user_id: null,
        nombre_completo: `EMPATE (${escalon.jugadores.length} jugadores)`,
        posicion: pos,
        posicion_label: ordinalLabel(pos),
        puntos: escalon.puntos,
        porcentaje: pct,
        monto,
        empatado: true,
        nombres_empatados: escalon.jugadores.map((j) => j.nombre_completo),
      });
    } else {
      const j = escalon.jugadores[0];
      asignaciones.push({
        user_id: j.user_id,
        nombre_completo: j.nombre_completo,
        posicion: pos,
        posicion_label: ordinalLabel(pos),
        puntos: j.puntos_totales,
        porcentaje: pct,
        monto,
        empatado: false,
      });
    }
  }

  if (hayEmpates) {
    notas.unshift(
      'Se detectaron empates en posiciones premiadas. El monto mostrado por lugar es el ' +
      'oficial, pero deberás decidir manualmente cómo repartirlo entre los empatados.'
    );
  }

  return {
    monto_total: montoTotal,
    monto_neto: montoNeto,
    aporte_fijo: aporteFijo,
    asignaciones,
    hay_empates: hayEmpates,
    notas,
  };
}

export function fmtPesos(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
