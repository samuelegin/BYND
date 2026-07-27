import React, { useMemo, useState } from 'react';
import { Gift, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';
import { Panel, Button, Badge } from '@/components/ui';
import type { ProtocolStats, TxStatus, UserPosition } from '@/types';

interface StakeAndEarnProps {
  position: UserPosition;
  stats: ProtocolStats;
  hasRewards: boolean;
  onStake: (amount: string) => Promise<void>;
  onClaim: () => Promise<void>;
  onUnstake: () => void;
}

export function StakeAndEarn({ position, stats, hasRewards, onStake, onClaim, onUnstake }: StakeAndEarnProps) {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });
  const [claiming, setClaiming] = useState(false);

  const walletBalance = parseFloat(position.veByndBalance || '0');
  const stakedBalance = parseFloat(position.stakedBalance || '0');
  const amountNum = parseFloat(amount || '0');
  const validAmount = amountNum > 0 && amountNum <= walletBalance;

  // APR string looks like "12.4%" — parse the numeric part so we can
  // project rewards without pretending to know exact on-chain math.
  const aprNum = useMemo(() => {
    const n = parseFloat((stats.avgApr || '').replace('%', ''));
    return isNaN(n) ? null : n;
  }, [stats.avgApr]);

  const projectedAnnual = aprNum !== null && amountNum > 0 ? (amountNum * aprNum) / 100 : null;

  const rewards = position.claimableRewards ?? [];
  const pendingAmount = parseFloat(stats.pendingIncentives || '0');
  const hasPending = !isNaN(pendingAmount) && pendingAmount > 0;
  const primaryReward = rewards[0];

  const handleStake = async () => {
    if (!validAmount) return;
    setStatus({ type: 'loading', message: 'Staking veBYND…' });
    try {
      await onStake(amount);
      setStatus({ type: 'success', message: 'Staked. Earning gauge-bribe yield' });
      setAmount('');
      setTimeout(() => setStatus({ type: null, message: null }), 2500);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Staking failed' });
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await onClaim();
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Panel className="p-6 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[.14em] text-gold mb-1">
            Step 02 · Stake
          </p>
          <p className="text-sm text-white/60">
            Stake veBYND to activate {stats.rewardTokenSymbol} yield
          </p>
        </div>
        <Badge variant={stakedBalance > 0 ? 'acid' : 'muted'}>
          {stakedBalance > 0 ? 'Earning' : 'Not staking'}
        </Badge>
      </div>

      {/* Progression, shown once — wallet → after stake — instead of
          repeating "veBYND balance" across three separate cards. */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/[.38] mb-1">Wallet</p>
          <p className="text-2xl font-semibold text-white/[.87] leading-none truncate">
            {walletBalance.toFixed(2)}
          </p>
        </div>
        <div className="text-white/[.38] shrink-0">→</div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/[.38] mb-1">After stake</p>
          <p className="text-2xl font-semibold text-gold leading-none truncate">
            {(stakedBalance + (validAmount ? amountNum : 0)).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Stake input with MAX */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/[.38]">
            Stake amount
          </span>
          <span className="font-mono text-[10px] text-white/[.38]">
            Available: {walletBalance.toFixed(2)} veBYND
          </span>
        </div>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-control border border-void-border bg-bg text-white/[.87] font-mono text-lg px-4 py-3 outline-none focus:border-gold/50 transition-colors placeholder:text-white/[.38]"
          />
          <button
            type="button"
            onClick={() => setAmount(position.veByndBalance || '0')}
            className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-gold uppercase tracking-widest hover:text-gold-bright transition-colors"
          >
            Max
          </button>
        </div>
      </div>

      {/* APR + projected rewards */}
      <div className="rounded-control border border-void-border bg-bg p-4 space-y-3 mb-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
            Estimated APR
          </span>
          <span className="font-mono text-sm font-medium text-gold">{stats.avgApr || '–'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
            Projected {stats.rewardTokenSymbol}/yr
          </span>
          <span className="font-mono text-sm font-medium text-white/[.87]">
            {projectedAnnual !== null ? `~${projectedAnnual.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '–'}
          </span>
        </div>
        <div className="pt-3 border-t border-void-border flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Gift size={12} className="text-white/[.38]" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
              Claimable {primaryReward?.symbol ?? stats.rewardTokenSymbol}
            </span>
          </div>
          <span className="text-xl font-semibold text-gold leading-none">
            {primaryReward ? parseFloat(primaryReward.amount || '0').toFixed(2) : '0.00'}
          </span>
        </div>
        {hasPending && (
          <p className="text-[11px] text-white/60 leading-relaxed">
            +{pendingAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {stats.rewardTokenSymbol} pending on the gauge, moves to claimable after next harvest.
          </p>
        )}
      </div>

      {status.message && (
        <p className={clsx(
          'text-xs mb-3 leading-relaxed',
          status.type === 'error' ? 'text-red-400' : status.type === 'success' ? 'text-gold' : 'text-white/60',
        )}>
          {status.message}
        </p>
      )}

      <div className="mt-auto space-y-2">
        <Button
          variant="primary"
          fullWidth
          onClick={handleStake}
          disabled={!validAmount}
          isLoading={status.type === 'loading'}
        >
          <TrendingUp size={14} /> Stake veBYND
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onUnstake}>
            Unstake
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleClaim}
            disabled={!hasRewards}
            isLoading={claiming}
          >
            Claim rewards
          </Button>
        </div>
      </div>
    </Panel>
  );
}
