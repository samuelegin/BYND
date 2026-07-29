import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChevronRight, Menu, X } from 'lucide-react';
import { DOCS_NAV, DOCS_ICONS, ALL_DOC_PAGES } from './content';
import { DocsRenderer } from './DocsRenderer';
import { ContractsTable } from './ContractsTable';
import type { DocPage } from './types';

function SidebarNav({ activeSlug, onNavigate }: { activeSlug: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Docs">
      {DOCS_NAV.map((group) => (
        <div key={group.label} className="mb-6">
          <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-widest text-white/[.38]">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.pages.map((pg) => {
              const Icon = DOCS_ICONS[pg.slug];
              const active = pg.slug === activeSlug;
              return (
                <Link
                  key={pg.slug}
                  to={`/docs/${pg.slug}`}
                  onClick={onNavigate}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-gold/10 text-gold font-medium'
                      : 'text-white/60 hover:bg-white/[.04] hover:text-white/[.87]',
                  )}
                >
                  {Icon && <Icon size={14} className="shrink-0" strokeWidth={1.75} />}
                  <span className="truncate">{pg.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function OnThisPage({ page }: { page: DocPage }) {
  const headings = page.blocks.filter((b) => b.type === 'h2' || b.type === 'h3') as
    { type: 'h2' | 'h3'; id: string; text: string }[];
  if (headings.length === 0) return null;

  return (
    <div className="sticky top-28">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-white/[.38]">
        On this page
      </p>
      <ul className="space-y-2">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={clsx(
                'block border-l text-[13px] text-white/60 transition-colors border-transparent hover:border-gold/50 hover:text-white/[.87]',
                h.type === 'h2' ? 'pl-3.5 py-1' : 'pl-6 py-1',
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DocsLayout({ page }: { page: DocPage }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const idx = ALL_DOC_PAGES.findIndex((pg) => pg.slug === page.slug);
  const prev = idx > 0 ? ALL_DOC_PAGES[idx - 1] : null;
  const next = idx < ALL_DOC_PAGES.length - 1 ? ALL_DOC_PAGES[idx + 1] : null;

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-24">
      {/* Mobile nav toggle */}
      <button
        onClick={() => setMobileNavOpen((v) => !v)}
        className="mb-4 flex w-full items-center justify-between rounded-control border border-void-border bg-void-soft px-4 py-3 text-sm text-white/[.87] lg:hidden"
      >
        <span className="flex items-center gap-2">
          {mobileNavOpen ? <X size={15} /> : <Menu size={15} />}
          Docs menu
        </span>
        <span className="text-white/[.38]">{page.title}</span>
      </button>
      {mobileNavOpen && (
        <div className="mb-6 rounded-control border border-void-border bg-void-soft p-3 lg:hidden">
          <SidebarNav activeSlug={page.slug} onNavigate={() => setMobileNavOpen(false)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr_180px]">
        {/* Left sidebar — desktop only */}
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <SidebarNav activeSlug={page.slug} />
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0">
          <div className="mb-8">
            <h1 className="text-[clamp(26px,3.4vw,34px)] font-semibold leading-tight text-white/[.87]">
              {page.title}
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-white/60">{page.description}</p>
          </div>

          <DocsRenderer blocks={page.blocks} />
          {page.slug === 'contracts' && (
            <div className="mt-5">
              <ContractsTable />
            </div>
          )}

          {(prev || next) && (
            <div className="mt-14 flex flex-col gap-3 border-t border-void-border pt-8 sm:flex-row sm:justify-between">
              {prev ? (
                <Link
                  to={`/docs/${prev.slug}`}
                  className="group flex flex-1 items-center gap-2 rounded-control border border-void-border bg-bg px-4 py-3 transition-colors hover:border-gold/30"
                >
                  <ChevronRight size={14} className="rotate-180 shrink-0 text-white/[.38]" />
                  <div className="min-w-0 text-right sm:text-left">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-white/[.38]">Previous</p>
                    <p className="truncate text-sm text-white/[.87] group-hover:text-gold">{prev.title}</p>
                  </div>
                </Link>
              ) : <div className="flex-1" />}
              {next && (
                <Link
                  to={`/docs/${next.slug}`}
                  className="group flex flex-1 items-center justify-end gap-2 rounded-control border border-void-border bg-bg px-4 py-3 text-right transition-colors hover:border-gold/30"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-white/[.38]">Next</p>
                    <p className="truncate text-sm text-white/[.87] group-hover:text-gold">{next.title}</p>
                  </div>
                  <ChevronRight size={14} className="shrink-0 text-white/[.38]" />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Right "on this page" TOC — desktop only */}
        <aside className="hidden lg:block">
          <OnThisPage page={page} />
        </aside>
      </div>
    </div>
  );
}
