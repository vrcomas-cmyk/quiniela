// Mini renderer de Markdown para textos editables del admin.
// Soporta: # ## ### headings, **negritas**, *itálicas*, - listas, párrafos.
// NO usa dependencias externas, NO permite HTML embebido (seguro contra XSS).

import { ReactNode } from 'react';

function renderInline(text: string): ReactNode[] {
  // Escapar HTML primero
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Reemplazar **negrita** e *itálica*
  const parts: ReactNode[] = [];
  let remaining = safe;
  let key = 0;
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++} dangerouslySetInnerHTML={{ __html: remaining.slice(lastIndex, match.index) }} />);
    }
    if (match[1]) {
      parts.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2]) {
      parts.push(<em key={key++}>{match[2]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < remaining.length) {
    parts.push(<span key={key++} dangerouslySetInnerHTML={{ __html: remaining.slice(lastIndex) }} />);
  }
  return parts;
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2">
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flushList();
      continue;
    }
    if (line.startsWith('### ')) {
      flushList();
      blocks.push(<h4 key={key++} className="font-display text-lg text-pitch-700 mt-3 mb-1">{renderInline(line.slice(4))}</h4>);
    } else if (line.startsWith('## ')) {
      flushList();
      blocks.push(<h3 key={key++} className="font-display text-xl text-pitch-700 mt-4 mb-2">{renderInline(line.slice(3))}</h3>);
    } else if (line.startsWith('# ')) {
      flushList();
      blocks.push(<h2 key={key++} className="font-display text-2xl text-ink-900 mt-4 mb-2">{renderInline(line.slice(2))}</h2>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(line.slice(2));
    } else {
      flushList();
      blocks.push(<p key={key++} className="my-1">{renderInline(line)}</p>);
    }
  }
  flushList();

  return <div className={className}>{blocks}</div>;
}
