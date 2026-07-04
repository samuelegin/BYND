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
      label: 'Your Staked',
      value: `${parseFloat(position.stakedBalance || '0').toFixed(0)} veBYND`,
      sub: 'Earning MUSD',
    },
    {
      label: 'Boost Efficiency',
      value: `${stats.boostEfficiency}%`,
      sub: 'Target optimisation',
    },
  ];

  return (
    <div className="border-b border-void-border">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-void-border">
        {items.map((s, i) => (
          <div key={i} className="px-6 py-5">
            <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim font-bold mb-2">
              {s.label}
            </p>
            <p className="font-mono text-xl font-black text-silver">{s.value}</p>
            <p className="font-mono text-[8px] text-acid mt-1">{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
