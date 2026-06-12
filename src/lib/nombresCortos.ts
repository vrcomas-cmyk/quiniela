// =============================================================================
// nombresCortos — genera un nombre corto y ÚNICO para cada jugador (solo display)
// =============================================================================
// No modifica la base. Toma el nombre_completo y produce algo como "Armando P.".
// Si hay choques (varios "Armando P."), va alargando el apellido y, si aún
// chocan, desempata con parte del correo.
// =============================================================================

/** ¿La palabra está en TODO MAYÚSCULAS? (con soporte de acentos) */
function esTodoMayus(s: string): boolean {
  const letras = s.replace(/[^a-záéíóúñü]/gi, '');
  return letras.length > 0 && letras === letras.toUpperCase();
}

/** Capitaliza "PEREZ" -> "Perez". Respeta el texto si no viene todo en mayúsculas. */
function capitalizarPalabra(w: string): string {
  if (w.length === 0) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/**
 * Normaliza el nombre completo según la regla acordada:
 * - Si TODO está en mayúsculas -> Capitaliza cada palabra (ARMANDO PEREZ -> Armando Perez)
 * - Si no -> se respeta tal cual lo escribió la persona
 */
function normalizarNombre(nombre: string): string {
  const limpio = (nombre ?? '').trim().replace(/\s+/g, ' ');
  if (limpio === '') return 'Jugador';
  if (esTodoMayus(limpio)) {
    return limpio.split(' ').map(capitalizarPalabra).join(' ');
  }
  return limpio;
}

/** Extrae la parte local del correo (antes de la @), para desempatar. */
function aliasCorreo(email?: string | null): string {
  if (!email) return '';
  const local = email.split('@')[0] ?? '';
  return local.slice(0, 6); // primeros 6 chars, suficiente para distinguir
}

export interface JugadorParaNombre {
  id: string;
  nombre_completo: string;
  email?: string | null;
}

/**
 * Devuelve un mapa { id -> nombreCorto } garantizando que todos los nombres
 * cortos sean únicos dentro de la lista recibida.
 */
export function nombresCortos(jugadores: JugadorParaNombre[]): Record<string, string> {
  // 1) Para cada jugador, calcular su forma normalizada y partir en palabras.
  const datos = jugadores.map(j => {
    const norm = normalizarNombre(j.nombre_completo);
    const partes = norm.split(' ').filter(Boolean);
    const primerNombre = partes[0] ?? norm;
    const apellido = partes.slice(1).join(' '); // todo lo que sigue al primer nombre
    return { id: j.id, email: j.email, norm, primerNombre, apellido };
  });

  // 2) Función para construir un candidato con N letras del apellido.
  const candidato = (d: typeof datos[number], nLetras: number): string => {
    if (!d.apellido) return d.primerNombre; // sin apellido, solo el nombre
    if (nLetras >= d.apellido.length) {
      return `${d.primerNombre} ${d.apellido}`; // apellido completo
    }
    const frag = d.apellido.slice(0, nLetras);
    return `${d.primerNombre} ${frag}.`;
  };

  // 3) Asignación inicial: 1 letra del apellido ("Armando P.")
  const resultado: Record<string, string> = {};
  const asignado: Record<string, string> = {}; // nombreCorto -> id (para detectar choques)

  // Procesar e ir resolviendo choques alargando el apellido.
  for (const d of datos) {
    let nLetras = 1;
    let corto = candidato(d, nLetras);
    // mientras choque con alguien ya asignado y se pueda alargar, alargar
    while (asignado[corto] !== undefined && nLetras < (d.apellido?.length ?? 0)) {
      nLetras++;
      corto = candidato(d, nLetras);
    }
    // si todavía choca (mismo nombre y apellido completo), desempatar con correo
    if (asignado[corto] !== undefined) {
      const alias = aliasCorreo(d.email);
      corto = alias ? `${candidato(d, nLetras)} (${alias})` : `${candidato(d, nLetras)} (${d.id.slice(0, 4)})`;
      // si por casualidad aún choca, añadir más del id
      let extra = 4;
      while (asignado[corto] !== undefined && extra < d.id.length) {
        extra++;
        corto = `${candidato(d, nLetras)} (${d.id.slice(0, extra)})`;
      }
    }
    asignado[corto] = d.id;
    resultado[d.id] = corto;
  }

  return resultado;
}
