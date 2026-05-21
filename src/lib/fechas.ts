import { formatDistanceToNow, format, isAfter, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';

export function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return format(d, "EEEE d 'de' MMMM, HH:mm 'hrs'", { locale: es });
}

export function fmtFechaCorta(iso: string | null): string {
  if (!iso) return '—';
  return format(new Date(iso), "d MMM HH:mm", { locale: es });
}

export function relativo(iso: string | null): string {
  if (!iso) return '';
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
}

export function estaAbierto(apertura: string | null, cierre: string | null): boolean {
  if (!apertura || !cierre) return false;
  const ahora = new Date();
  return isAfter(ahora, new Date(apertura)) && isBefore(ahora, new Date(cierre));
}

export function estaCerrado(cierre: string | null): boolean {
  if (!cierre) return true;
  return isAfter(new Date(), new Date(cierre));
}

export function antesDeAbrir(apertura: string | null): boolean {
  if (!apertura) return true;
  return isBefore(new Date(), new Date(apertura));
}
