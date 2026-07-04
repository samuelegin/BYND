import {
  TrendingUp,
  Users,
  Database,
  Lock,
  BarChart3,
  Zap,
} from "lucide-react";
import type { ProtocolStats } from "@/types";

interface KpiStripProps {
  stats: ProtocolStats;
  stakerRatio: string;
  veByndSupplyNum: number;
}

export function KpiStrip({
  stats,
  stakerRatio,
  veByndSupplyNum,
}: KpiStripProps) {
  const cards = [
    {
      label: "Total TVL",
      value: stats.tvl,
      icon: Database,
      sub: "Total MEZO locked in vault",
    },
    {
      label: "veBYND Supply",
      value: stats.veByndSupply,
      icon: Lock,
      sub: "Minted 1:1 with deposits",
    },
    {
      label: "Total Staked",
      value: stats.totalStaked,
      icon: TrendingUp,
      sub: "Earning MUSD rewards",
    },
    {
      label: "Staked Ratio",
      value: veByndSupplyNum > 0 ? `${stakerRatio}%` : "–",
      icon: Users,
      sub: "veBYND staked vs supply",
    },
    {
      label: "veMEZO Pooled",
      value: stats.totalVotingPower,
      icon: BarChart3,
      sub: "Aggregate voting power",
    },
    {
      label: "Boost Efficiency",
      value: `Up to ${stats.boostEfficiency}%`,
      icon: Zap,
      sub: "Target optimisation",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-void-border border border-void-border">
      {cards.map((c, i) => {
        const Icon = c.icon;
        const isBoost = c.label === "Boost Efficiency";
        return (
          <div
            key={i}
            className={`bg-void-soft p-4 lg:p-5 min-w-0 ${isBoost ? "border border-acid/20" : ""}`}
          >
            <div className="flex items-center gap-1.5 mb-3 text-silver-dim">
              <Icon
                size={11}
                className={`shrink-0 ${isBoost ? "text-acid" : ""}`}
              />
              <p className="font-mono text-[7px] uppercase tracking-widest font-bold truncate">
                {c.label}
              </p>
            </div>
            <p
              className={`text-xl lg:text-2xl font-black truncate ${isBoost ? "text-acid" : "text-silver"}`}
            >
              {c.value}
            </p>
            <p className="font-mono text-[7px] text-silver-dim mt-1 truncate">
              {c.sub}
            </p>
          </div>
        );
      })}
    </div>
  );
}
