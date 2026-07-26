import React from 'react';
import { Gift, Clock } from 'lucide-react';
import { Button } from '@/components/ui';
import type { ProtocolStats, UserPosition } from '@/types';

interface YieldTerminalProps {
  position: UserPosition;
  stats: ProtocolStats;
  hasRewards: boolean;
  onClaim: () => void;
}

export function YieldTerminal({ position, stats, hasRewards, onClaim }: YieldTerminalProps) {
  const rewards = position.claimableRewards ?? [];
  const pendingAmount = parseFloat(stats.pendingIncentives || '0');
  const hasPending = !isNaN(pendingAmount) && pendingAmount > 0;

  return (
    <div className="rounded-card bg-void-soft border border-void-border relative overflow-hidden">
      <div className="absolute bottom-0 right-0 w-32 h-32 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
      <div className="p-6 relative">
        <div className="flex items-center justify-between mb-6">
          <p className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
            Yield terminal
          </p>
          <Gift size={16} className="text-white/[.38]" />
        </div>

        {/* Pending — sitting on Mezo's gauge, not yet pulled in by a keeper's
            harvestAndDistribute(). Not a time-vesting thing: it only moves
            into "claimable" once that keeper call actually fires. */}
        {hasPending && (
          <div className="mb-4 rounded-control p-3 border border-void-border bg-bg flex items-start gap-2">
            <Clock size={13} className="text-white/60 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-widest text-white/[.38] mb-0.5">
                Pending, not yet harvested
              </p>
              <p className="text-lg font-semibold text-white/[.87] leading-none">
                {pendingAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                <span className="text-xs text-white/60 ml-1 font-normal">
                  {stats.rewardTokenSymbol}
                </span>
              </p>
              <p className="text-[11px] text-white/60 mt-1 leading-relaxed">
                Sitting on the gauge. Moves to claimable once a keeper runs harvestAndDistribute().
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4 mb-6">
          {rewards.length === 0 ? (
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-white/[.38] mb-1">
                Claimable rewards
              </p>
              <p className="text-4xl font-semibold text-gold leading-none">0.00</p>
              <p className="text-xs text-white/60 mt-1">
                {parseFloat(position.stakedBalance || '0') > 0
                  ? 'Rewards land here once a keeper calls harvestAndDistribute() this epoch'
                  : `Stake veBYND above to start earning ${stats.rewardTokenSymbol}`}
              </p>
            </div>
          ) : (
            rewards.map((r, i) => (
              <div key={r.token}>
                <p className="font-mono text-[11px] uppercase tracking-widest text-white/[.38] mb-1">
                  Claimable {r.symbol}
                </p>
                <p
                  className={
                    i === 0
                      ? 'text-4xl font-semibold text-gold leading-none'
                      : 'text-2xl font-semibold text-white/[.87] leading-none'
                  }
                >
                  {parseFloat(r.amount || '0').toFixed(i === 0 ? 2 : 4)}
                </p>
                {i === 0 && (
                  <p className="text-xs text-white/60 mt-1">
                    {parseFloat(r.amount || '0') > 0
                      ? 'Bribes from gauge voting, ready to claim'
                      : 'Rewards land here once a keeper calls harvestAndDistribute() this epoch'}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <Button variant="primary" fullWidth onClick={onClaim} disabled={!hasRewards}>
          Claim all rewards
        </Button>
      </div>
    </div>
  );
}
