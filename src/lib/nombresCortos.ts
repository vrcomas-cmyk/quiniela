// Genera un nombre corto y ÚNICO para cada jugador (solo display, no toca la base).
function esTodoMayus(s: string): boolean {
  const letras = s.replace(/[^a-záéíóúñü]/gi, '');
  return letras.length > 0 && letras === letras.toUpperCase();
}
function capitalizarPalabra(w: string): string {
  if (w.length === 0) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}
function normalizarNombre(nombre: string): string {
  const limpio = (nombre ?? '').trim().replace(/\s+/g, ' ');
  if (limpio === '') return 'Jugador';
  if (esTodoMayus(limpio)) return limpio.split(' ').map(capitalizarPalabra).join(' ');
  return limpio;
}
function aliasCorreo(email?: string | null): string {
  if (!email) return '';
  return (email.split('@')[0] ?? '').slice(0, 6);
}
export interface JugadorParaNombre { id: string; nombre_completo: string; email?: string | null; }
export function nombresCortos(jugadores: JugadorParaNombre[]): Record<string, string> {
  const datos = jugadores.map(j => {
    const norm = normalizarNombre(j.nombre_completo);
    const partes = norm.split(' ').filter(Boolean);
    return { id: j.id, email: j.email, norm, primerNombre: partes[0] ?? norm, apellido: partes.slice(1).join(' ') };
  });
  const candidato = (d: typeof datos[number], nLetras: number): string => {
    if (!d.apellido) return d.primerNombre;
    if (nLetras >= d.apellido.length) return `${d.primerNombre} ${d.apellido}`;
    return `${d.primerNombre} ${d.apellido.slice(0, nLetras)}.`;
  };
  const resultado: Record<string, string> = {};
  const asignado: Record<string, string> = {};
  for (const d of datos) {
    let nLetras = 1;
    let corto = candidato(d, nLetras);
    while (asignado[corto] !== undefined && nLetras < (d.apellido?.length ?? 0)) {
      nLetras++; corto = candidato(d, nLetras);
    }
    if (asignado[corto] !== undefined) {
      const alias = aliasCorreo(d.email);
      corto = alias ? `${candidato(d, nLetras)} (${alias})` : `${candidato(d, nLetras)} (${d.id.slice(0, 4)})`;
      let extra = 4;
      while (asignado[corto] !== undefined && extra < d.id.length) {
        extra++; corto = `${candidato(d, nLetras)} (${d.id.slice(0, extra)})`;
      }
    }
    asignado[corto] = d.id;
    resultado[d.id] = corto;
  }
  return resultado;
}
