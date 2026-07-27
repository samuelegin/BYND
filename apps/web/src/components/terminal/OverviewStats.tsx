import React from 'react';
import { formatTime } from '@/components/ui';
import type { ProtocolStats, EpochState } from '@/types';

interface OverviewStatsProps {
  stats: ProtocolStats;
  epoch: EpochState;
  mezoEpoch: number;
  liveCountdown: number;
}

// Six protocol-level metrics spanning the full terminal width. This replaces
// the old 4-item StatStrip (which mixed protocol + user data) — user
// position data now lives inside Step 1 / Step 2 where it's actionable.
export function OverviewStats({ stats, epoch, mezoEpoch, liveCountdown }: OverviewStatsProps) {
  const items = [
    { label: 'TVL', value: stats.tvl, sub: 'MEZO locked in vault' },
    { label: 'Avg. APR', value: stats.avgApr, sub: 'Staker yield' },
    { label: 'Vault voting power', value: stats.totalVotingPower, sub: 'Aggregate veMEZO' },
    { label: 'veBYND minted', value: stats.veByndSupply, sub: '1:1 with deposits' },
    {
      label: 'Epoch countdown',
      value: `#${mezoEpoch}`,
      sub: `${formatTime(liveCountdown)} left`,
    },
    {
      label: 'Pending incentives',
      value: stats.pendingIncentives,
      sub: `${stats.rewardTokenSymbol} awaiting harvest`,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y divide-void-border lg:divide-y-0 rounded-card border border-void-border bg-void-soft overflow-hidden">
      {items.map((s, i) => (
        <div key={i} className="px-5 py-4 min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/[.38] mb-2 truncate">
            {s.label}
          </p>
          <p className="font-mono text-2xl font-semibold text-gold leading-none truncate">
            {s.value}
          </p>
          <p className="text-[11px] text-white/60 mt-1.5 truncate">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}
