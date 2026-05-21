export type Rol = 'admin' | 'jugador';

export interface Profile {
  id: string;
  nombre_completo: string;
  rol: Rol;
  pagado: boolean;
  created_at: string;
}

export type FaseCodigo =
  | 'grupos' | '16vos' | '8vos' | '4tos' | 'semis' | '3er_lugar' | 'final';

export interface Fase {
  id: string;
  codigo: FaseCodigo;
  nombre: string;
  orden: number;
  pts_marcador_exacto: number;
  pts_acierto_resultado: number;
  fecha_apertura: string | null;
  fecha_cierre: string | null;
  publicada: boolean;
  created_at: string;
}

export interface Grupo {
  id: string;
  codigo: string; // A..L
  nombre: string;
  created_at: string;
}

export interface Partido {
  id: string;
  fase_id: string;
  grupo_id: string | null;
  numero: number | null;
  equipo_local: string;
  equipo_visitante: string;
  fecha_partido: string | null;
  sede: string | null;
  goles_local_oficial: number | null;
  goles_visitante_oficial: number | null;
  cierre_pronostico: string | null;
  created_at: string;
}

export interface PronosticoPartido {
  id: string;
  user_id: string;
  partido_id: string;
  goles_local: number;
  goles_visitante: number;
  puntos_obtenidos: number;
  created_at: string;
  updated_at: string;
}

export type TipoClasif = 'clasif_grupo' | 'tercero' | 'top4';

export interface PronosticoClasificacion {
  id: string;
  user_id: string;
  tipo: TipoClasif;
  grupo_id: string | null;
  posicion: number | null;
  equipo: string;
  puntos_obtenidos: number;
}

export interface RankingRow {
  user_id: string;
  nombre_completo: string;
  pts_partidos: number;
  pts_clasificacion: number;
  pts_bonus: number;
  puntos_totales: number;
}
