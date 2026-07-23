import type { ProtocolStats } from "@/types";

interface MarketStatsProps {
  stats: ProtocolStats;
  veByndSupplyNum: number;
  totalStakedNum: number;
  stakerRatio: string;
}

export function MarketStats({
  stats,
  veByndSupplyNum,
  totalStakedNum,
  stakerRatio,
}: MarketStatsProps) {
  return (
    <div className="grid md:grid-cols-3 gap-5">
      <div className="rounded-card border border-gold/20 bg-gold/5 p-6">
        <p className="text-[13px] text-white/[.38] mb-2">
          veBYND / veMEZO ratio
        </p>
        <p className="font-mono text-3xl font-medium text-gold">
          {veByndSupplyNum > 0
            ? (veByndSupplyNum / veByndSupplyNum).toFixed(4)
            : "1:1"}
        </p>
        <p className="text-xs text-white/60 mt-1">
          Mint rate is always 1:1 on deposit
        </p>
      </div>
      <div className="rounded-card border border-void-border bg-void-soft p-6">
        <p className="text-[13px] text-white/[.38] mb-2">
          Staked / supply
        </p>
        <p className="font-mono text-3xl font-medium text-gold">{stakerRatio}%</p>
        <p className="text-xs text-white/60 mt-1">
          {totalStakedNum.toLocaleString()} of{" "}
          {veByndSupplyNum.toLocaleString()} veBYND staked
        </p>
      </div>
      <div className="rounded-card border border-void-border bg-void-soft p-6">
        <p className="text-[13px] text-white/[.38] mb-2">
          Avg. staker APR
        </p>
        <p className="font-mono text-3xl font-medium text-gold">{stats.avgApr}</p>
        <p className="text-xs text-white/60 mt-1">
          MUSD bribes distributed to stakers
        </p>
      </div>
    </div>
  );
}
