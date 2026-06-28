import { useEffect, useRef, useState } from 'react';
import { useChat, STICKERS } from '../hooks/useChat';

// Sonido "pop" corto generado con Web Audio (sin archivo externo)
function reproducirPop() {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  } catch { /* ignorar */ }
}

export function ChatWidget() {
  const { mensajes, loading, isAdmin, user, enviar, borrar, noLeidos, marcarLeidos, ultimoEntrante } = useChat();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [mostrarStickers, setMostrarStickers] = useState(false);
  const [preview, setPreview] = useState<{ nombre: string; texto: string } | null>(null);
  const [silenciado, setSilenciado] = useState<boolean>(() => {
    try { return localStorage.getItem('chat_silenciado') === '1'; } catch { return false; }
  });
  const finRef = useRef<HTMLDivElement>(null);
  const previewTimer = useRef<any>(null);

  const scrollAbajo = () => setTimeout(() => finRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

  useEffect(() => { if (abierto) { scrollAbajo(); marcarLeidos(); } }, [abierto, mensajes.length]);

  // Cuando llega un mensaje entrante (de otro): sonido + preview (si el chat está cerrado)
  useEffect(() => {
    if (!ultimoEntrante) return;
    if (!silenciado) reproducirPop();
    if (!abierto) {
      const txt = ultimoEntrante.texto || ultimoEntrante.sticker || '';
      setPreview({ nombre: ultimoEntrante.nombre, texto: txt });
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => setPreview(null), 5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoEntrante]);

  const toggleSilencio = () => {
    setSilenciado(s => {
      const nuevo = !s;
      try { localStorage.setItem('chat_silenciado', nuevo ? '1' : '0'); } catch {}
      return nuevo;
    });
  };

  const handleEnviar = async (sticker?: string) => {
    const { error } = await enviar(texto, sticker);
    if (!error) { setTexto(''); setMostrarStickers(false); }
    else alert('No se pudo enviar: ' + error.message);
  };

  const fmtHora = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const abrir = () => { setAbierto(true); setPreview(null); };

  // ---- Cerrado: burbuja flotante (con pulso + preview cuando hay no leídos) ----
  if (!abierto) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {/* Globo de preview del último mensaje */}
        {preview && (
          <button onClick={abrir}
            className="max-w-[15rem] bg-white shadow-xl border border-pitch-200 rounded-2xl rounded-br-sm px-3 py-2 text-left">
            <div className="text-[11px] font-semibold text-pitch-700">{preview.nombre}</div>
            <div className="text-xs text-ink-900 line-clamp-2" style={{ overflowWrap: 'anywhere' }}>
              {preview.texto}
            </div>
          </button>
        )}

        <div className="relative">
          {/* Halo de pulso cuando hay no leídos */}
          {noLeidos > 0 && (
            <span className="absolute inset-0 rounded-full bg-fire-400 opacity-60 animate-ping" />
          )}
          <button
            onClick={abrir}
            className={`relative rounded-full shadow-lg w-14 h-14 flex items-center justify-center text-2xl transition
              ${noLeidos > 0 ? 'bg-fire-500 hover:bg-fire-600 animate-bounce' : 'bg-pitch-600 hover:bg-pitch-700'} text-white`}
            title="Abrir chat"
          >
            💬
            {noLeidos > 0 && (
              <span className="absolute -top-1 -right-1 bg-white text-fire-600 text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 font-bold border border-fire-500">
                {noLeidos > 9 ? '9+' : noLeidos}
              </span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ---- Abierto: panel ----
  return (
    <div className="fixed z-50 bg-white shadow-2xl border border-pitch-200 flex flex-col
                    inset-x-2 bottom-2 top-16 rounded-2xl
                    sm:inset-auto sm:bottom-4 sm:right-4 sm:top-auto sm:w-96 sm:h-[32rem]">
      <div className="bg-pitch-600 text-white px-3 py-2 rounded-t-2xl flex items-center justify-between">
        <span className="font-display text-lg">💬 Chat</span>
        <div className="flex items-center gap-1">
          <button onClick={toggleSilencio} className="hover:bg-pitch-700 rounded px-2 py-0.5"
            title={silenciado ? 'Activar sonido' : 'Silenciar sonido'}>
            {silenciado ? '🔇' : '🔊'}
          </button>
          <button onClick={() => setAbierto(false)} className="hover:bg-pitch-700 rounded px-2 py-0.5" title="Minimizar">
            ▁
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading ? (
          <div className="text-center text-pitch-700 py-8 text-sm">Cargando…</div>
        ) : mensajes.length === 0 ? (
          <div className="text-center text-ink-700 py-8 text-sm">Aún no hay mensajes. ¡Sé el primero! ⚽</div>
        ) : mensajes.map((m) => {
          const propio = m.user_id === user?.id;
          return (
            <div key={m.id} className={`flex ${propio ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${propio ? 'bg-pitch-600 text-white' : 'bg-pitch-50 text-ink-900'}`}>
                {!propio && <div className="text-[11px] font-semibold text-pitch-700 mb-0.5">{m.nombre}</div>}
                {m.texto && <div className="text-sm whitespace-pre-wrap" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{m.texto}</div>}
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

      {mostrarStickers && (
        <div className="border-t border-pitch-100 p-2 grid grid-cols-8 gap-1 bg-pitch-50/50 max-h-32 overflow-y-auto">
          {STICKERS.map(s => (
            <button key={s} onClick={() => handleEnviar(s)} className="text-2xl hover:bg-pitch-100 rounded-lg p-1">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-pitch-100 p-2 flex items-end gap-1">
        <button onClick={() => setMostrarStickers(v => !v)} className="text-xl px-1 hover:bg-pitch-50 rounded shrink-0 self-center" title="Stickers">
          😀
        </button>
        <textarea
          className="input flex-1 text-sm py-1.5 resize-none leading-snug"
          placeholder="Mensaje…"
          value={texto}
          maxLength={5000}
          rows={1}
          style={{ maxHeight: '6rem', minHeight: '2.2rem' }}
          onChange={(e) => {
            setTexto(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar(); } }}
        />
        <button onClick={() => handleEnviar()} className="btn-accent px-3 py-1.5 text-sm shrink-0 self-center" disabled={!texto.trim()}>
          ➤
        </button>
      </div>
    </div>
  );
}
