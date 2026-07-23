import { Panel, StatRow } from "@/components/ui";
import type { GaugeAllocation, ProtocolStats } from "@/types";

interface ProtocolParametersProps {
  stats: ProtocolStats;
  gauges: GaugeAllocation[];
}

export function ProtocolParameters({ stats, gauges }: ProtocolParametersProps) {
  return (
    <Panel className="p-6">
      <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-5">
        Protocol parameters
      </p>
      <StatRow label="Epoch duration" value="7 days" />
      <StatRow
        label="Keeper bounty"
        value={`${stats.bountyBps} bps (${stats.bountyBps / 100}%)`}
      />
      <StatRow label="Protocol fee" value="10%" />
      <StatRow
        label="Target boost"
        value={`Up to ${stats.boostEfficiency}%`}
        accent
      />
      <StatRow
        label="Gauge count"
        value={gauges.length > 0 ? `${gauges.length} active` : "–"}
      />
      <StatRow label="veBYND supply" value={stats.veByndSupply} />
      <StatRow label="Total staked" value={stats.totalStaked} />
    </Panel>
  );
}
