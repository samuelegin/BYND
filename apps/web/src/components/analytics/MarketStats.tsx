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
    <div className="grid md:grid-cols-3 gap-6">
      <div className="border border-acid/20 bg-acid/3 clip-corner p-6">
        <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-2">
          veBYND / veMEZO Ratio
        </p>
        <p className="text-4xl font-black text-silver">
          {veByndSupplyNum > 0
            ? (veByndSupplyNum / veByndSupplyNum).toFixed(4)
            : "1:1"}
        </p>
        <p className="font-mono text-[8px] text-silver-dim mt-1">
          Mint rate is always 1:1 on deposit
        </p>
      </div>
      <div className="border border-void-border p-6 clip-corner">
        <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold mb-2">
          Staked / Supply
        </p>
        <p className="text-4xl font-black text-silver">{stakerRatio}%</p>
        <p className="font-mono text-[8px] text-acid mt-1">
          {totalStakedNum.toLocaleString()} of{" "}
          {veByndSupplyNum.toLocaleString()} veBYND staked
        </p>
      </div>
      <div className="border border-void-border p-6 clip-corner">
        <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold mb-2">
          Avg. Staker APR
        </p>
        <p className="text-4xl font-black text-silver">{stats.avgApr}</p>
        <p className="font-mono text-[8px] text-acid mt-1">
          MUSD bribes distributed to stakers
        </p>
      </div>
    </div>
  );
}
