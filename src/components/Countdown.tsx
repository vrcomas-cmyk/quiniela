import { useEffect, useState } from 'react';

interface Props {
  fechaCierre: string;
  prefix?: string;
}

function getRemaining(target: Date) {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return null;
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return { d, h, m, s };
}

export function Countdown({ fechaCierre, prefix = 'Cierra en' }: Props) {
  const target = new Date(fechaCierre);
  const [rem, setRem] = useState(() => getRemaining(target));

  useEffect(() => {
    const id = setInterval(() => setRem(getRemaining(target)), 1000);
    return () => clearInterval(id);
  }, [fechaCierre]);

  if (!rem) {
    return <span className="text-red-600 font-semibold">CERRADO</span>;
  }

  return (
    <span className="font-mono text-sm font-semibold text-fire-600">
      {prefix} {rem.d > 0 ? `${rem.d}d ` : ''}
      {String(rem.h).padStart(2, '0')}:
      {String(rem.m).padStart(2, '0')}:
      {String(rem.s).padStart(2, '0')}
    </span>
  );
}
