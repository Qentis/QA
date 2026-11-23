import type { ReactNode } from 'react';

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`c-${keyIdx++}`}
          className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-blue-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let keyCounter = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${keyCounter++}`} className="my-1.5 list-disc space-y-1 pl-5 text-zinc-300">
        {listItems.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInline(item)}
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2));
      continue;
    }

    flushList();

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4 key={`h4-${keyCounter++}`} className="mt-2.5 mb-1 text-sm font-semibold text-white">
          {renderInline(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      const text = trimmed.replace(/^#+\s*/, '');
      blocks.push(
        <h3 key={`h3-${keyCounter++}`} className="mt-2.5 mb-1 text-sm font-bold text-white">
          {renderInline(text)}
        </h3>
      );
    } else {
      blocks.push(
        <p key={`p-${keyCounter++}`} className="my-1.5 leading-relaxed text-zinc-300">
          {renderInline(trimmed)}
        </p>
      );
    }
  }

  flushList();

  return <div className={`text-sm ${className}`}>{blocks}</div>;
}
