import React from 'react';
import { Panel } from '@/components/ui';
import type { GaugeAllocation } from '@/types';

export function GaugeAllocations({ gauges }: { gauges: GaugeAllocation[] }) {
  return (
    <Panel className="p-6">
      <div className="flex items-center justify-between mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold">
          veBTC Gauge Weights
        </p>
        <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest">
          Boosted veBTC Positions
        </p>
      </div>
      {gauges.length === 0 ? (
        <div className="py-8 text-center border border-void-border">
          <p className="font-mono text-[9px] text-silver-dim uppercase tracking-widest">
            No gauges configured
          </p>
          <p className="font-mono text-[8px] text-void-muted mt-1">
            Run optimiseGauges.ts before epoch vote
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {gauges.map((g, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-10 h-10 bg-void border border-void-border flex items-center justify-center font-mono text-[9px] font-black text-acid shrink-0">
                {(g.weightBps / 100).toFixed(0)}%
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <span className="font-mono text-[10px] font-bold text-silver uppercase tracking-wide">
                    {g.name}
                  </span>
                  <span className="font-mono text-[9px] text-acid font-bold">
                    APR {g.apr}
                  </span>
                </div>
                <div className="h-1 bg-void-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-acid transition-all duration-700"
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
