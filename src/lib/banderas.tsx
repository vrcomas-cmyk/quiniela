// =============================================================================
// banderas — imágenes de bandera por equipo (funcionan en TODOS los dispositivos)
// =============================================================================
// Windows no muestra emojis de bandera (sale "MX" en vez de 🇲🇽), así que
// usamos imágenes SVG desde flagcdn.com por código de país ISO.
// =============================================================================

// Mapa equipo (nombre en español) -> código ISO 3166-1 alfa-2 (minúsculas)
const ISO: Record<string, string> = {
  'México': 'mx', 'Estados Unidos': 'us', 'Canadá': 'ca',
  'Brasil': 'br', 'Argentina': 'ar', 'Alemania': 'de', 'Francia': 'fr',
  'España': 'es', 'Inglaterra': 'gb-eng', 'Países Bajos': 'nl', 'Bélgica': 'be',
  'Portugal': 'pt', 'Italia': 'it', 'Croacia': 'hr', 'Uruguay': 'uy',
  'Colombia': 'co', 'Ecuador': 'ec', 'Paraguay': 'py', 'Chile': 'cl', 'Perú': 'pe',
  'Japón': 'jp', 'Rep. de Corea': 'kr', 'Corea del Sur': 'kr',
  'Australia': 'au', 'Nueva Zelanda': 'nz', 'Irán': 'ir', 'Arabia Saudita': 'sa',
  'Catar': 'qa', 'Marruecos': 'ma', 'Senegal': 'sn', 'Túnez': 'tn', 'Egipto': 'eg',
  'Sudáfrica': 'za', 'Cabo Verde': 'cv', 'Costa de Marfil': 'ci', 'Ghana': 'gh',
  'Nigeria': 'ng', 'Camerún': 'cm', 'Argelia': 'dz',
  'Suiza': 'ch', 'Suecia': 'se', 'Escocia': 'gb-sct', 'Turquía': 'tr',
  'Chequia': 'cz', 'Bosnia y Herze.': 'ba', 'Bosnia y Herzegovina': 'ba',
  'Curazao': 'cw', 'Haití': 'ht', 'Noruega': 'no', 'Dinamarca': 'dk',
  'Polonia': 'pl', 'Austria': 'at', 'Serbia': 'rs', 'Ucrania': 'ua',
  'Gales': 'gb-wls', 'Panamá': 'pa', 'Costa Rica': 'cr', 'Honduras': 'hn', 'Jamaica': 'jm',
};

/** Código ISO del equipo (o '' si no se conoce). */
export function codigoPais(equipo: string | null | undefined): string {
  if (!equipo) return '';
  return ISO[equipo.trim()] ?? '';
}

/**
 * Componente de bandera como imagen. Se ve igual en Windows, Mac, Android, iOS.
 * Si el equipo no está mapeado, no muestra nada (no rompe el layout).
 */
export function Bandera({ equipo, className = '' }: { equipo: string | null | undefined; className?: string }) {
  const cod = codigoPais(equipo);
  if (!cod) return null;
  return (
    <img
      src={`https://flagcdn.com/24x18/${cod}.png`}
      srcSet={`https://flagcdn.com/48x36/${cod}.png 2x`}
      width={20}
      height={15}
      alt={equipo ?? ''}
      className={`inline-block align-[-2px] rounded-[2px] ${className}`}
      loading="lazy"
    />
  );
}
