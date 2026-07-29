import React from 'react';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import type { DocBlock } from './types';

function Prose({ text }: { text: string }) {
  // Minimal inline formatting: `code` spans, **bold**, and [text](url)
  // links — enough for technical docs without pulling in a markdown lib.
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="rounded bg-white/[.08] px-1.5 py-0.5 font-mono text-[.85em] text-gold">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-medium text-white/[.87]">{part.slice(2, -2)}</strong>;
        }
        const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (linkMatch) {
          const [, label, href] = linkMatch;
          const external = /^https?:\/\//.test(href);
          return (
            <a
              key={i}
              href={href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              className="text-gold underline decoration-gold/30 underline-offset-2 transition-colors hover:decoration-gold"
            >
              {label}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

const CALLOUT_STYLES = {
  info:    { border: 'border-white/[.12]', bg: 'bg-white/[.03]', icon: Info, iconClass: 'text-white/60' },
  warning: { border: 'border-yellow-400/30', bg: 'bg-yellow-400/5', icon: AlertTriangle, iconClass: 'text-yellow-400' },
  success: { border: 'border-gold/30', bg: 'bg-gold/5', icon: CheckCircle2, iconClass: 'text-gold' },
} as const;

export function DocsRenderer({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2
                key={i}
                id={block.id}
                className="scroll-mt-28 pt-6 text-xl font-semibold text-white/[.87] first:pt-0"
              >
                {block.text}
              </h2>
            );

          case 'h3':
            return (
              <h3 key={i} id={block.id} className="scroll-mt-28 pt-2 text-base font-medium text-white/[.87]">
                {block.text}
              </h3>
            );

          case 'p':
            return (
              <p key={i} className="text-sm leading-relaxed text-white/60">
                <Prose text={block.text} />
              </p>
            );

          case 'list':
            return (
              <ul key={i} className={block.ordered ? 'list-decimal space-y-2 pl-5' : 'list-disc space-y-2 pl-5'}>
                {block.items.map((item, j) => (
                  <li key={j} className="text-sm leading-relaxed text-white/60 marker:text-gold/60">
                    <Prose text={item} />
                  </li>
                ))}
              </ul>
            );

          case 'steps':
            return (
              <ol key={i} className="space-y-4">
                {block.items.map((s, j) => (
                  <li key={j} className="flex gap-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/10 font-mono text-[11px] font-medium text-gold">
                      {j + 1}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm font-medium text-white/[.87]">{s.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-white/60"><Prose text={s.body} /></p>
                    </div>
                  </li>
                ))}
              </ol>
            );

          case 'callout': {
            const style = CALLOUT_STYLES[block.tone];
            const Icon = style.icon;
            return (
              <div key={i} className={`flex gap-2.5 rounded-control border ${style.border} ${style.bg} p-3.5`}>
                <Icon size={15} className={`mt-0.5 shrink-0 ${style.iconClass}`} />
                <div className="min-w-0 space-y-1">
                  {block.title && <p className="text-sm font-medium text-white/[.87]">{block.title}</p>}
                  <p className="text-sm leading-relaxed text-white/60"><Prose text={block.text} /></p>
                </div>
              </div>
            );
          }

          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded-control border border-void-border bg-bg p-4">
                <code className="font-mono text-[12.5px] leading-relaxed text-white/[.87]">{block.code}</code>
              </pre>
            );

          case 'table':
            return (
              <div key={i} className="overflow-x-auto rounded-control border border-void-border">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-void-border bg-white/[.02]">
                      {block.headers.map((h, j) => (
                        <th
                          key={j}
                          className="whitespace-nowrap px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-widest text-white/[.38]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j} className="border-b border-void-border last:border-0">
                        {row.map((cell, k) => (
                          <td key={k} className="px-4 py-2.5 font-mono text-[12.5px] text-white/[.87]">
                            <Prose text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'cards':
            return (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                {block.items.map((c, j) => {
                  const Icon = c.icon;
                  return (
                    <div key={j} className="rounded-control border border-void-border bg-bg p-4">
                      {Icon && (
                        <div className="mb-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-gold/10 text-gold">
                          <Icon size={13} strokeWidth={1.75} />
                        </div>
                      )}
                      <p className="text-sm font-medium text-white/[.87]">{c.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/60">{c.body}</p>
                    </div>
                  );
                })}
              </div>
            );

          case 'kv':
            return (
              <dl key={i} className="rounded-control border border-void-border bg-bg divide-y divide-void-border">
                {block.items.map((item, j) => (
                  <div key={j} className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">{item.label}</dt>
                    <dd className="font-mono text-[12.5px] text-white/[.87] text-right">
                      <Prose text={item.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
