// =============================================================================
// faseActual — calcula la fase corriente y su estado a partir de los PARTIDOS
// =============================================================================
// Como el cierre se maneja por partido (no por fase), el estado de una fase
// depende de sus partidos: está "abierta" si tiene al menos un partido cuyo
// pronóstico aún no cierra. La "fase corriente" es la primera (por orden) que
// todavía tiene algún partido abierto; si todas cerraron, la última con partidos.
// =============================================================================

export interface PartidoMin {
  id: string;
  fase_id: string;
  cierre_pronostico: string | null;
  fecha_partido: string | null;
}

export interface FaseMin {
  id: string;
  orden: number;
  fecha_cierre?: string | null;
}

/** Cierre efectivo de un partido: el suyo, o el de su fase como respaldo. */
export function cierreEfectivo(p: PartidoMin, faseCierre: string | null): string | null {
  return p.cierre_pronostico ?? faseCierre ?? null;
}

/** ¿La fase tiene al menos un partido con pronóstico abierto? */
export function faseTieneAbierto(
  faseId: string,
  partidos: PartidoMin[],
  faseCierre: string | null,
  ahora = new Date()
): boolean {
  return partidos.some(p => {
    if (p.fase_id !== faseId) return false;
    const c = cierreEfectivo(p, faseCierre);
    return !!c && new Date(c) > ahora;
  });
}

/** Último cierre de pronóstico de una fase (el más tardío entre sus partidos). */
export function ultimoCierreFase(
  faseId: string,
  partidos: PartidoMin[],
  faseCierre: string | null
): string | null {
  const cierres = partidos
    .filter(p => p.fase_id === faseId)
    .map(p => cierreEfectivo(p, faseCierre))
    .filter((c): c is string => !!c)
    .sort();
  return cierres.length ? cierres[cierres.length - 1] : null;
}

/** Próximo cierre futuro de una fase (el más próximo que aún no pasa). */
export function proximoCierreFase(
  faseId: string,
  partidos: PartidoMin[],
  faseCierre: string | null,
  ahora = new Date()
): string | null {
  const cierres = partidos
    .filter(p => p.fase_id === faseId)
    .map(p => cierreEfectivo(p, faseCierre))
    .filter((c): c is string => !!c && new Date(c) > ahora)
    .sort();
  return cierres.length ? cierres[0] : null;
}

/**
 * Devuelve el id de la fase corriente:
 * - la primera (por orden) que aún tiene algún partido abierto;
 * - si ninguna tiene abiertos, la de mayor orden que tenga partidos;
 * - si no hay partidos, la primera fase.
 */
export function faseCorrienteId(
  fases: FaseMin[],
  partidos: PartidoMin[],
  ahora = new Date()
): string | null {
  if (fases.length === 0) return null;
  const ordenadas = [...fases].sort((a, b) => a.orden - b.orden);

  // 1) primera con algún partido abierto
  for (const f of ordenadas) {
    if (faseTieneAbierto(f.id, partidos, f.fecha_cierre ?? null, ahora)) return f.id;
  }
  // 2) última (mayor orden) que tenga partidos
  for (let i = ordenadas.length - 1; i >= 0; i--) {
    const f = ordenadas[i];
    if (partidos.some(p => p.fase_id === f.id)) return f.id;
  }
  // 3) primera fase
  return ordenadas[0].id;
}
