import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Panel, LiveDot } from "@/components/ui";
import type { EpochState, GaugeAllocation, ProtocolStats } from "@/types";

interface GovernanceDynamicsProps {
  epoch: EpochState;
  stats: ProtocolStats;
  gauges: GaugeAllocation[];
}

const GAUGE_COLORS = ["#E5B567", "#B78A3F", "#8C6A30"];

export function GovernanceDynamics({
  epoch,
  stats,
  gauges,
}: GovernanceDynamicsProps) {
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
          <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-1">
            Governance dynamics
          </p>
          <p className="text-sm text-white/60">
            veBTC gauge allocation · boosted positions
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end mb-1">
            <LiveDot />
            <span className="text-sm font-medium text-gold">
              {epoch.currentEpoch > 0 ? "Active" : "Awaiting deployment"}
            </span>
          </div>
          <p className="text-xs text-white/60">
            {epoch.currentEpoch > 0 ? `Epoch #${epoch.currentEpoch}` : "–"}
          </p>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-[13px] text-white/[.38] mb-1">
          Aggregate veMEZO power
        </p>
        <p className="font-mono text-4xl font-medium text-gold">
          {stats.totalVotingPower}
        </p>
        <p className="text-xs text-white/60 mt-1">
          Grows with each deposit
        </p>
      </div>

      {gauges.length > 0 ? (
        <>
          <div className="mb-6 h-2 rounded-full bg-void-border flex overflow-hidden">
            {gauges.map((g, i) => (
              <div
                key={i}
                className="h-full transition-all duration-700"
                style={{
                  width: `${g.weightBps / 100}%`,
                  backgroundColor: GAUGE_COLORS[i] || "#E5B567",
                  marginRight: i < gauges.length - 1 ? "1px" : 0,
                }}
              />
            ))}
          </div>
          <div className="space-y-3">
            {gauges.map((g, i) => (
              <div
                key={i}
                className="rounded-control border border-void-border p-4 flex items-center gap-4 hover:border-white/[.12] transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-control flex items-center justify-center font-mono text-[11px] font-medium text-gold-ink shrink-0"
                  style={{ backgroundColor: GAUGE_COLORS[i] || "#E5B567" }}
                >
                  {(g.weightBps / 100).toFixed(0)}%
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-white/[.87] truncate min-w-0">
                      {g.name}
                    </span>
                    <span className="font-mono text-xs font-medium text-gold shrink-0 whitespace-nowrap">
                      APR {g.apr}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-white/60 truncate">
                      {g.gauge}
                    </span>
                    <button
                      onClick={() => copy(g.gauge)}
                      className="text-white/[.38] hover:text-gold transition-colors shrink-0"
                    >
                      <Copy size={12} />
                    </button>
                    <a
                      href={`https://explorer.test.mezo.org/address/${g.gauge}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/[.38] hover:text-gold transition-colors shrink-0"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  {g.boostedVeBTC && g.boostedVeBTC !== "–" && (
                    <p className="text-xs text-gold mt-1">
                      ↳ {parseInt(g.boostedVeBTC).toLocaleString()} veBTC
                      positions boosted
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-white/[.38]">
                    Pending MUSD
                  </p>
                  <p className="font-mono text-sm font-medium text-white/[.87]">
                    {g.pendingMUSD}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-control border border-void-border p-8 text-center">
          <p className="text-sm text-white/60">
            Gauges populate once contracts are deployed and first epoch votes
            are cast
          </p>
        </div>
      )}
    </Panel>
  );
}
