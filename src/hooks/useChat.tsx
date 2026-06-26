import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthCtx } from './AuthContext';

export interface Mensaje {
  id: string;
  user_id: string;
  nombre: string;
  texto: string | null;
  sticker: string | null;
  created_at: string;
}

export function useChat() {
  const { user, profile } = useAuthCtx();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = profile?.rol === 'admin';
  const ultimoVistoRef = useRef<number>(Date.now());
  const [noLeidos, setNoLeidos] = useState(0);

  useEffect(() => {
    let canal: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase
        .from('mensajes_chat')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(200);
      setMensajes((data ?? []) as Mensaje[]);
      setLoading(false);

      canal = supabase
        .channel('chat-room-global')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_chat' },
          (payload) => {
            const nuevo = payload.new as Mensaje;
            setMensajes((prev) => prev.some(m => m.id === nuevo.id) ? prev : [...prev, nuevo]);
            // contar no leídos si no es propio
            setNoLeidos((n) => (nuevo.user_id !== user?.id ? n + 1 : n));
          })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mensajes_chat' },
          (payload) => {
            setMensajes((prev) => prev.filter(m => m.id !== (payload.old as any).id));
          })
        .subscribe();
    })();
    return () => { if (canal) supabase.removeChannel(canal); };
  }, [user?.id]);

  const enviar = async (texto: string, sticker?: string) => {
    const t = texto.trim();
    const s = sticker ?? '';
    if (!t && !s) return { error: null };
    if (!user || !profile) return { error: { message: 'No autenticado' } };
    const { error } = await supabase.from('mensajes_chat').insert({
      user_id: user.id,
      nombre: profile.nombre_completo,
      texto: t || null,
      sticker: s || null,
    });
    return { error };
  };

  const borrar = async (id: string) => {
    await supabase.from('mensajes_chat').delete().eq('id', id);
    setMensajes(prev => prev.filter(m => m.id !== id));
  };

  const marcarLeidos = () => { setNoLeidos(0); ultimoVistoRef.current = Date.now(); };

  return { mensajes, loading, isAdmin, user, enviar, borrar, noLeidos, marcarLeidos };
}

export const STICKERS = [
  '⚽', '🥅', '🏆', '🎉', '🔥', '😱', '😭', '😂',
  '👏', '💪', '🙌', '🤞', '😎', '🥶', '🤡', '💀',
  '🟥', '🟨', '🚩', '🐐', '👀', '🍻', '🇲🇽', '❤️',
];
