import { Panel, StatRow } from "@/components/ui";
import type { GaugeAllocation, ProtocolStats } from "@/types";

interface ProtocolParametersProps {
  stats: ProtocolStats;
  gauges: GaugeAllocation[];
}

export function ProtocolParameters({ stats, gauges }: ProtocolParametersProps) {
  return (
    <Panel className="p-6">
      <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-5">
        Protocol Parameters
      </p>
      <StatRow label="Epoch Duration" value="7 Days" />
      <StatRow
        label="Keeper Bounty"
        value={`${stats.bountyBps} BPS (${stats.bountyBps / 100}%)`}
      />
      <StatRow label="Protocol Fee" value="10%" />
      <StatRow
        label="Target Boost"
        value={`Up to ${stats.boostEfficiency}%`}
        accent
      />
      <StatRow
        label="Gauge Count"
        value={gauges.length > 0 ? `${gauges.length} active` : "–"}
      />
      <StatRow label="veBYND Supply" value={stats.veByndSupply} />
      <StatRow label="Total Staked" value={stats.totalStaked} />
    </Panel>
  );
}
