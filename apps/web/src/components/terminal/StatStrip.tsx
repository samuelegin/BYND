import React from 'react';
import { formatTime } from '@/components/ui';
import type { ProtocolStats, UserPosition } from '@/types';

interface StatStripProps {
  stats: ProtocolStats;
  position: UserPosition;
  mezoEpoch: number;
  liveCountdown: number;
}

export function StatStrip({ stats, position, mezoEpoch, liveCountdown }: StatStripProps) {
  const items = [
    { label: 'System TVL', value: stats.tvl, sub: '+4.2%' },
    {
      label: 'Epoch',
      value: `#${mezoEpoch}`,
      sub: `${formatTime(liveCountdown)} left`,
    },
    {
      label: 'Your staked',
      value: `${parseFloat(position.stakedBalance || '0').toFixed(0)} veBYND`,
      sub: 'Earning MUSD',
    },
    {
      label: 'Boost efficiency',
      value: `${stats.boostEfficiency}%`,
      sub: 'Target optimisation',
    },
  ];

  return (
    <div className="max-w-[1120px] mx-auto px-5 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-void-border rounded-card border border-void-border bg-void-soft overflow-hidden">
        {items.map((s, i) => (
          <div key={i} className="px-6 py-5">
            <p className="text-[13px] text-white/[.38] mb-1.5">
              {s.label}
            </p>
            <p className="font-mono text-xl font-medium text-gold">{s.value}</p>
            <p className="text-xs text-white/60 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
