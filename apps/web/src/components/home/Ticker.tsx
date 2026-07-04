import React from 'react';
import { TICKER_ITEMS } from './data';

export function Ticker() {
  return (
    <div className="border-b border-void-border bg-void-soft overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap py-2.5">
        {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-4 mx-8 font-mono text-[9px] uppercase tracking-widest text-void-muted"
          >
            <span className="w-1 h-1 bg-acid rounded-full" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
