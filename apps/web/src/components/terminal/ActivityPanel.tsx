import React from 'react';
import { Panel, PixelArt, shortAddr, formatBribe } from '@/components/ui';
import type { GaugeAllocation } from '@/types';
import iconBoostWebp from '@/assets/illustrations/icons/icon-boost.webp';
import iconBoostPng from '@/assets/illustrations/icons/icon-boost.png';

export function ActivityPanel({ gauges }: { gauges: GaugeAllocation[] }) {
  return (
    <Panel className="p-6 h-full">
      <div className="flex items-center justify-between mb-5">
        <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38]">
          Protocol activity
        </p>
        <p className="text-xs text-white/60">Gauge votes</p>
      </div>
      {gauges.length === 0 ? (
        <div className="py-8 text-center rounded-control border border-void-border">
          <p className="text-sm text-white/60">No gauges configured</p>
          <p className="text-xs text-white/[.38] mt-1">Run optimiseGauges.ts before epoch vote</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gauges.map((g, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-control bg-bg border border-void-border flex items-center justify-center shrink-0">
                <PixelArt
                  webp={iconBoostWebp}
                  png={iconBoostPng}
                  width={238}
                  height={240}
                  alt=""
                  className="w-5 h-auto"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-medium text-white/[.87] truncate" title={g.gauge}>
                    {shortAddr(g.gauge, 6)}
                  </span>
                  <span className="text-[11px] text-white/[.38] shrink-0">
                    {(g.weightBps / 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1 bg-void-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold transition-all duration-700"
                    style={{ width: `${g.weightBps / 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[10px] text-white/[.38]">Bribes available</span>
                  <span className="text-[11px] text-gold font-medium">
                    {g.bribes == null ? (
                      '–'
                    ) : g.bribes.length === 0 ? (
                      <span className="text-white/[.38]">none</span>
                    ) : (
                      g.bribes.map((b, bi) => (
                        <React.Fragment key={b.token}>
                          {bi > 0 && ' + '}
                          {formatBribe(b.amount)} {b.symbol}
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
