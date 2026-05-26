import { supabase } from './supabase';

export interface InvitacionResult {
  ok: boolean;
  token?: string;
  link?: string;
  error?: string;
}

export interface InvitacionMasivaItem extends InvitacionResult {
  email: string;
}

async function callEdge(action: string, payload: any): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

export async function invitarUsuario(email: string, nombre_completo: string): Promise<InvitacionResult> {
  return callEdge('invitar', { email, nombre_completo });
}

export async function invitarMasivo(
  usuarios: { email: string; nombre_completo: string }[]
): Promise<{ resultados: InvitacionMasivaItem[] }> {
  return callEdge('invitar_masivo', { usuarios });
}

export async function eliminarUsuario(user_id: string): Promise<{ ok: boolean }> {
  return callEdge('eliminar_usuario', { user_id });
}
