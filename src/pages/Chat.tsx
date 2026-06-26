import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthCtx } from '../hooks/AuthContext';

interface Mensaje {
  id: string;
  user_id: string;
  nombre: string;
  texto: string | null;
  sticker: string | null;
  created_at: string;
}

// Stickers = emojis grandes temáticos de fútbol/quiniela
const STICKERS = [
  '⚽', '🥅', '🏆', '🎉', '🔥', '😱', '😭', '😂',
  '👏', '💪', '🙌', '🤞', '😎', '🥶', '🤡', '💀',
  '🟥', '🟨', '🚩', '🐐', '👀', '🍻', '🇲🇽', '❤️',
];

export function Chat() {
  const { user, profile } = useAuthCtx();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [mostrarStickers, setMostrarStickers] = useState(false);
  const [loading, setLoading] = useState(true);
  const finRef = useRef<HTMLDivElement>(null);
  const isAdmin = profile?.rol === 'admin';

  const scrollAbajo = () => {
    setTimeout(() => finRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  // Carga inicial + suscripción en tiempo real
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
      scrollAbajo();

      // Realtime: escuchar inserts y deletes
      canal = supabase
        .channel('chat-room')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_chat' },
          (payload) => {
            setMensajes((prev) => {
              // evitar duplicar si ya lo agregamos optimistamente
              if (prev.some(m => m.id === (payload.new as Mensaje).id)) return prev;
              return [...prev, payload.new as Mensaje];
            });
            scrollAbajo();
          })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mensajes_chat' },
          (payload) => {
            setMensajes((prev) => prev.filter(m => m.id !== (payload.old as any).id));
          })
        .subscribe();
    })();

    return () => { if (canal) supabase.removeChannel(canal); };
  }, []);

  const enviar = async (stickerSel?: string) => {
    const t = texto.trim();
    const s = stickerSel ?? '';
    if (!t && !s) return;
    if (!user || !profile) return;

    setTexto('');
    setMostrarStickers(false);

    const { error } = await supabase.from('mensajes_chat').insert({
      user_id: user.id,
      nombre: profile.nombre_completo,
      texto: t || null,
      sticker: s || null,
    });
    if (error) {
      // si falla, devolver el texto al input
      setTexto(t);
      alert('No se pudo enviar: ' + error.message);
    }
  };

  const borrar = async (id: string) => {
    await supabase.from('mensajes_chat').delete().eq('id', id);
    // el realtime actualiza la lista; por si acaso, quitarlo local
    setMensajes(prev => prev.filter(m => m.id !== id));
  };

  const fmtHora = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h2 className="font-display text-2xl text-pitch-700">💬 CHAT DE LA QUINIELA</h2>
        <p className="text-xs text-ink-700">Comenta en tiempo real con todos los jugadores. Sé respetuoso. 🤝</p>
      </div>

      <div className="card p-0 flex flex-col" style={{ height: '65vh' }}>
        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="text-center text-pitch-700 py-8">Cargando chat…</div>
          ) : mensajes.length === 0 ? (
            <div className="text-center text-ink-700 py-8">Aún no hay mensajes. ¡Sé el primero! ⚽</div>
          ) : mensajes.map((m) => {
            const propio = m.user_id === user?.id;
            return (
              <div key={m.id} className={`flex ${propio ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                  propio ? 'bg-pitch-600 text-white' : 'bg-pitch-50 text-ink-900'
                }`}>
                  {!propio && <div className="text-[11px] font-semibold text-pitch-700 mb-0.5">{m.nombre}</div>}
                  {m.texto && <div className="text-sm break-words whitespace-pre-wrap">{m.texto}</div>}
                  {m.sticker && <div className="text-4xl leading-tight">{m.sticker}</div>}
                  <div className={`text-[9px] mt-0.5 flex items-center gap-2 ${propio ? 'text-pitch-100' : 'text-ink-700/60'}`}>
                    <span>{fmtHora(m.created_at)}</span>
                    {(propio || isAdmin) && (
                      <button onClick={() => borrar(m.id)} className="underline hover:opacity-80">borrar</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={finRef} />
        </div>

        {/* Panel de stickers */}
        {mostrarStickers && (
          <div className="border-t border-pitch-100 p-2 grid grid-cols-8 gap-1 bg-pitch-50/50">
            {STICKERS.map(s => (
              <button key={s} onClick={() => enviar(s)}
                className="text-2xl hover:bg-pitch-100 rounded-lg p-1 transition">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Barra de envío */}
        <div className="border-t border-pitch-100 p-2 flex items-center gap-2">
          <button onClick={() => setMostrarStickers(v => !v)}
            className="text-2xl px-2 hover:bg-pitch-50 rounded-lg" title="Stickers">
            😀
          </button>
          <input
            className="input flex-1"
            placeholder="Escribe un mensaje…"
            value={texto}
            maxLength={500}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          />
          <button onClick={() => enviar()} className="btn-accent px-4" disabled={!texto.trim()}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
