import React from 'react';
import { Panel } from '@/components/ui';
import type { GaugeAllocation } from '@/types';

export function GaugeAllocations({ gauges }: { gauges: GaugeAllocation[] }) {
  return (
    <Panel className="p-6">
      <div className="flex items-center justify-between mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38]">
          veBTC gauge weights
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
              <div className="w-10 h-10 rounded-control bg-bg border border-void-border flex items-center justify-center font-mono text-[11px] font-medium text-gold shrink-0">
                {(g.weightBps / 100).toFixed(0)}%
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-white/[.87]">
                    {g.name}
                  </span>
                  <span className="font-mono text-xs text-gold font-medium">
                    APR {g.apr}
                  </span>
                </div>
                <div className="h-1 bg-void-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold transition-all duration-700"
                    style={{ width: `${g.weightBps / 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
