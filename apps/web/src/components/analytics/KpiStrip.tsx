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
      label: "veBYND supply",
      value: stats.veByndSupply,
      icon: Lock,
      sub: "Minted 1:1 with deposits",
    },
    {
      label: "Total staked",
      value: stats.totalStaked,
      icon: TrendingUp,
      sub: "Earning MUSD rewards",
    },
    {
      label: "Staked ratio",
      value: veByndSupplyNum > 0 ? `${stakerRatio}%` : "–",
      icon: Users,
      sub: "veBYND staked vs supply",
    },
    {
      label: "veMEZO pooled",
      value: stats.totalVotingPower,
      icon: BarChart3,
      sub: "Aggregate voting power",
    },
    {
      label: "Boost efficiency",
      value: `Up to ${stats.boostEfficiency}%`,
      icon: Zap,
      sub: "Target optimisation",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-void-border lg:divide-y-0 rounded-card border border-void-border bg-void-soft overflow-hidden">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div key={i} className="p-4 lg:p-5 min-w-0">
            <div className="flex items-center gap-1.5 mb-2.5 text-white/[.38]">
              <Icon size={12} className="shrink-0" />
              <p className="text-[11px] truncate">{c.label}</p>
            </div>
            <p className="font-mono text-xl font-medium text-gold truncate">
              {c.value}
            </p>
            <p className="text-[11px] text-white/60 mt-1 truncate">
              {c.sub}
            </p>
          </div>
        );
      })}
    </div>
  );
}
