import React from 'react';
import { Panel, PixelArt, shortAddr, formatBribe } from '@/components/ui';
import type { GaugeAllocation } from '@/types';
import iconBoostWebp from '@/assets/illustrations/icons/icon-boost.webp';
import iconBoostPng from '@/assets/illustrations/icons/icon-boost.png';

export function GaugeAllocations({ gauges }: { gauges: GaugeAllocation[] }) {
  return (
    <Panel className="p-6">
      <div className="flex items-center justify-between mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38]">
          Gauge voted
        </p>
        <p className="text-xs text-white/60">
          Boosted veBTC positions
        </p>
      </div>
      {gauges.length === 0 ? (
        <div className="py-8 text-center rounded-control border border-void-border">
          <p className="text-sm text-white/60">
            No gauges configured
          </p>
          <p className="text-xs text-white/[.38] mt-1">
            Run optimiseGauges.ts before epoch vote
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {gauges.map((g, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-control bg-bg border border-void-border flex items-center justify-center shrink-0">
                <PixelArt
                  webp={iconBoostWebp}
                  png={iconBoostPng}
                  width={238}
                  height={240}
                  alt=""
                  className="w-6 h-auto"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className="font-mono text-sm font-medium text-white/[.87] truncate min-w-0"
                    title={g.gauge}
                  >
                    {shortAddr(g.gauge, 6)}
                  </span>
                </div>
                <div className="h-1 bg-void-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold transition-all duration-700"
                    style={{ width: `${g.weightBps / 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px] text-white/[.38]">
                    {(g.weightBps / 100).toFixed(1)}% weight
                  </span>
                  <span className="text-[11px] text-white/60">
                    Bribes available:{' '}
                    {/* One entry per token, each with its own symbol. Bribes
                        are posted in different tokens and 100 MUSD is not 100
                        BTC, so these are never summed into a single number. */}
                    {g.bribes == null ? (
                      <span className="text-gold font-medium">–</span>
                    ) : g.bribes.length === 0 ? (
                      <span className="text-white/[.38]">none this epoch</span>
                    ) : (
                      g.bribes.map((b, bi) => (
                        <React.Fragment key={b.token}>
                          {bi > 0 && <span className="text-white/[.38]"> + </span>}
                          <span className="text-gold font-medium">
                            {formatBribe(b.amount)} {b.symbol}
                          </span>
                        </React.Fragment>
                      ))
                    )}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
