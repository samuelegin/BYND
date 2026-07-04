import React, { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { Panel, LiveDot } from '@/components/ui';
import type { EpochState, GaugeAllocation, ProtocolStats } from '@/types';

interface GovernanceDynamicsProps {
  epoch: EpochState;
  stats: ProtocolStats;
  gauges: GaugeAllocation[];
}

const GAUGE_COLORS = ['#C8FF00', '#7ACC00', '#3D7A00'];

export function GovernanceDynamics({ epoch, stats, gauges }: GovernanceDynamicsProps) {
  const [, setCopied] = useState<string | null>(null);

  const copy = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Panel className="p-6">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold mb-1">
            Governance Dynamics
          </p>
          <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest">
            veBTC Gauge Allocation · Boosted Positions
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end mb-1">
            <LiveDot />
            <span className="font-mono text-[9px] text-acid font-bold uppercase">
              {epoch.currentEpoch > 0 ? 'Active' : 'Awaiting Deployment'}
            </span>
          </div>
          <p className="font-mono text-[8px] text-silver-dim">
            {epoch.currentEpoch > 0 ? `Epoch #${epoch.currentEpoch}` : '–'}
          </p>
        </div>
      </div>

      <div className="mb-6">
        <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">
          Aggregate veMEZO Power
        </p>
        <p className="text-4xl font-black text-silver">{stats.totalVotingPower}</p>
        <p className="font-mono text-[8px] text-silver-dim mt-1">Grows with each deposit</p>
      </div>

      {gauges.length > 0 ? (
        <>
          <div className="mb-6 h-3 bg-void-border flex overflow-hidden">
            {gauges.map((g, i) => (
              <div
                key={i}
                className="h-full transition-all duration-700"
                style={{
                  width: `${g.weightBps / 100}%`,
                  backgroundColor: GAUGE_COLORS[i] || '#C8FF00',
                  marginRight: i < gauges.length - 1 ? '1px' : 0,
                }}
              />
            ))}
          </div>
          <div className="space-y-3">
            {gauges.map((g, i) => (
              <div
                key={i}
                className="border border-void-border p-4 flex items-center gap-4 group hover:border-acid/20 transition-colors"
              >
                <div
                  className="w-10 h-10 flex items-center justify-center font-mono text-[9px] font-black text-void shrink-0"
                  style={{ backgroundColor: GAUGE_COLORS[i] || '#C8FF00' }}
                >
                  {(g.weightBps / 100).toFixed(0)}%
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-mono text-[10px] font-black text-silver uppercase">
                      {g.name}
                    </span>
                    <span className="font-mono text-[9px] text-acid font-bold">APR {g.apr}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[8px] text-silver-dim truncate">{g.gauge}</span>
                    <button
                      onClick={() => copy(g.gauge)}
                      className="text-void-muted hover:text-acid transition-colors shrink-0"
                    >
                      <Copy size={10} />
                    </button>
                    <a
                      href={`https://explorer.test.mezo.org/address/${g.gauge}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-void-muted hover:text-acid transition-colors shrink-0"
                    >
                      <ExternalLink size={10} />
                    </a>
                  </div>
                  {g.boostedVeBTC && g.boostedVeBTC !== '–' && (
                    <p className="font-mono text-[7px] text-acid mt-1">
                      ↳ {parseInt(g.boostedVeBTC).toLocaleString()} veBTC positions boosted
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest">
                    Pending MUSD
                  </p>
                  <p className="font-mono text-[10px] font-bold text-silver">{g.pendingMUSD}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="border border-void-border p-8 text-center">
          <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">
            Gauges populate once contracts are deployed and first epoch votes are cast
          </p>
        </div>
      )}
    </Panel>
  );
}
