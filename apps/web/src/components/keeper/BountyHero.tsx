import React from 'react';

interface BountyHeroProps {
  estimatedBounty: string;
  rewardTokenSymbol: string;
  bountyBps: number;
  pendingIncentives: string;
}

export function BountyHero({ estimatedBounty, rewardTokenSymbol, bountyBps, pendingIncentives }: BountyHeroProps) {
  return (
    <div className="border border-acid/30 bg-acid/3 clip-corner p-8 text-center relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/60 to-transparent" />
      <div className="relative">
        <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold mb-2">
          Available Keeper Bounty This Epoch
        </p>
        <p className="text-[64px] font-black text-acid leading-none">
          ~${estimatedBounty}
        </p>
        <p className="font-mono text-[10px] text-silver-dim mt-2 uppercase tracking-widest">
          {rewardTokenSymbol} · {bountyBps / 100}% of{' '}
          {pendingIncentives === '–'
            ? '–'
            : parseFloat(pendingIncentives).toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
          {rewardTokenSymbol} pending
        </p>
      </div>
    </div>
  );
}
