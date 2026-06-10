'use client';

import React, { useState } from 'react';
import { RefreshCw, Zap, Shield, AlertTriangle } from 'lucide-react';
import { Panel, Button, StatRow, Badge, LiveDot, SectionHeader, formatTime } from '@/components/ui';
import { CastVotesModal, HarvestModal } from '@/components/modals';
import { useProtocol } from '@/hooks/useProtocol';
import { useWallet } from '@/hooks/useWallet';
import { useWriteContract } from 'wagmi';
import { usePublicClient } from 'wagmi';
import { getAddresses, VAULT_ABI, VOTER_ABI } from '@/lib/contracts';

export default function KeeperPage() {
  const { isConnected, address, chainId } = useWallet();
  const { stats, epoch, gauges, setEpoch, setPosition, refresh } = useProtocol(address, chainId);

  const [activeModal, setActiveModal]       = useState<string | null>(null);
  const [extendingLocks, setExtendingLocks] = useState(false);
  const [txStatus, setTxStatus]             = useState<{ type: 'idle'|'loading'|'success'|'error', message?: string }>({ type: 'idle' });

  const addrs        = getAddresses(chainId ?? 31337);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const withTx = async (fn: () => Promise<`0x${string}`>) => {
    setTxStatus({ type: 'loading' });
    try {
      const hash = await fn();
      await publicClient?.waitForTransactionReceipt({ hash });
      setTxStatus({ type: 'success' });
      setTimeout(() => { setTxStatus({ type: 'idle' }); refresh(); }, 1500);
    } catch (e: any) {
      setTxStatus({ type: 'error', message: e?.shortMessage ?? e?.message ?? 'Transaction failed' });
      setTimeout(() => setTxStatus({ type: 'idle' }), 3000);
      throw e;
    }
  };

  const handleExtendLocks = async () => {
    setExtendingLocks(true);
    await withTx(() => writeContractAsync({
      address: addrs.ByNdVault,
      abi: VAULT_ABI,
      functionName: 'extendLocks',
      args: [],
    }));
    setExtendingLocks(false);
  };

  const handleCastVotes = async () => {
    await withTx(() => writeContractAsync({
      address: addrs.ByNdVoter,
      abi: VOTER_ABI,
      functionName: 'castVotes',
      args: [],
    }));
  };

  const handleHarvest = async () => {
    await withTx(() => writeContractAsync({
      address: addrs.ByNdVoter,
      abi: VOTER_ABI,
      functionName: 'harvestAndDistribute',
      args: [],
    }));
  };

  const estimatedBounty = (
    parseFloat(stats.pendingIncentives.replace(/[$,]/g, '')) * stats.bountyBps / 10000
  ).toFixed(2);

  const canExtend  = !epoch.epochLocksExtended;
  const canVote    = !epoch.epochVoted && epoch.timeUntilNextVote === 0; // open in last 4hrs of epoch
  const canHarvest = epoch.epochVoted && !epoch.epochHarvested;

  return (
    <div className="min-h-screen bg-void">
      <div className="border-b border-void-border bg-void-soft">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <SectionHeader
            label="Keeper"
            title="Keeper Dashboard"
            subtitle="Epoch-gated keeper functions. Each function is callable once per cycle with idempotency protection. Earn MUSD bounties by triggering harvests."
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* ── MUSD Bounty Hero stat ───────────────────────────────────── */}
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
              MUSD · {stats.bountyBps / 100}% of {stats.pendingIncentives} pending
            </p>
          </div>
        </div>

        {/* Status overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-void-border border border-void-border">
          {[
            { label: 'Current Epoch',  value: epoch.currentEpoch > 0 ? `#${epoch.currentEpoch}` : '–' },
            { label: 'Time Remaining', value: epoch.currentEpoch > 0 ? formatTime(epoch.timeUntilNextVote) : '–' },
            { label: 'Pending MUSD',   value: stats.pendingIncentives },
            { label: 'Keeper Bounty',  value: `${stats.bountyBps / 100}% of harvest` },
          ].map((s, i) => (
            <div key={i} className="bg-void-soft p-6">
              <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim font-bold mb-2">{s.label}</p>
              <p className="font-mono text-xl font-black text-silver">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Epoch flow — 3 steps */}
        <Panel className="p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold mb-6">
            Epoch Flow — Call Order
          </p>

          <div className="grid md:grid-cols-5 gap-4 items-start">

            {/* Step 0: extendLocks */}
            <div className={`md:col-span-1 border p-5 space-y-4 transition-colors ${canExtend ? 'border-acid/50 bg-acid/3' : 'border-void-border'}`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className={`p-2 border ${canExtend ? 'border-acid/50 bg-acid/10' : 'border-void-border'}`}>
                    <Shield size={14} className={`${canExtend ? 'text-acid' : 'text-silver-dim'} transition-colors`} />
                  </div>
                  {epoch.epochLocksExtended
                    ? <Badge variant="acid">Done</Badge>
                    : canExtend
                    ? <Badge variant="orange">Ready</Badge>
                    : <Badge variant="muted">Waiting</Badge>}
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase font-black text-silver">extendLocks()</p>
                  <p className="font-mono text-[7px] text-silver-dim mt-0.5">Step 00</p>
                </div>
              </div>
              <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
                Resets all protocol-held veMEZO to the 4-year maximum, ensuring permanent max governance weight.
              </p>
              <Button
                variant={canExtend ? 'primary' : 'ghost'}
                size="sm"
                fullWidth
                onClick={handleExtendLocks}
                disabled={!canExtend || extendingLocks}
                isLoading={extendingLocks}
              >
                extendLocks()
              </Button>
            </div>

            <div className="hidden md:flex items-center justify-center pt-10 text-void-muted font-mono text-lg">→</div>

            {/* Step 1: castVotes */}
            <div className={`md:col-span-1 border p-5 space-y-4 transition-colors ${canVote ? 'border-acid/50 bg-acid/3' : 'border-void-border'}`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className={`p-2 border ${canVote ? 'border-acid/50 bg-acid/10' : 'border-void-border'}`}>
                    <RefreshCw size={14} className={`${canVote ? 'text-acid animate-spin' : 'text-silver-dim'} transition-colors`} />
                  </div>
                  {epoch.epochVoted
                    ? <Badge variant="acid">Done</Badge>
                    : canVote
                    ? <Badge variant="orange">Ready</Badge>
                    : <Badge variant="muted">Waiting</Badge>}
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase font-black text-silver">castVotes()</p>
                  <p className="font-mono text-[7px] text-silver-dim mt-0.5">Step 01</p>
                </div>
              </div>
              <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
                Aggregates all veMEZO power and casts votes toward highest-bribe veBTC gauges.
              </p>
              <Button
                variant={canVote ? 'primary' : 'ghost'}
                size="sm"
                fullWidth
                onClick={() => setActiveModal('castVotes')}
                disabled={!canVote}
              >
                castVotes()
              </Button>
            </div>

            <div className="hidden md:flex items-center justify-center pt-10 text-void-muted font-mono text-lg">→</div>

            {/* Step 2: harvestAndDistribute */}
            <div className={`md:col-span-1 border p-5 space-y-4 transition-colors ${canHarvest ? 'border-acid/50 bg-acid/3' : 'border-void-border'}`}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className={`p-2 border ${canHarvest ? 'border-acid/50 bg-acid/10' : 'border-void-border'}`}>
                    <Zap size={14} className={`${canHarvest ? 'text-acid' : 'text-silver-dim'} transition-colors`} />
                  </div>
                  {epoch.epochHarvested
                    ? <Badge variant="acid">Done</Badge>
                    : canHarvest
                    ? <Badge variant="orange">Ready</Badge>
                    : <Badge variant="muted">Locked</Badge>}
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase font-black text-silver">harvestAndDistribute()</p>
                  <p className="font-mono text-[7px] text-silver-dim mt-0.5">Step 02</p>
                </div>
              </div>
              <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
                Collects MUSD bribes from all gauges. Your {stats.bountyBps / 100}% bounty: ~${estimatedBounty} MUSD.
              </p>
              <Button
                variant={canHarvest ? 'primary' : 'ghost'}
                size="sm"
                fullWidth
                onClick={() => setActiveModal('harvest')}
                disabled={!canHarvest}
              >
                harvestAndDistribute()
              </Button>
            </div>

          </div>
        </Panel>

        {/* Gauge summary with boosted veBTC */}
        <Panel className="p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold mb-5">
            Active Gauge Configuration — Boosted veBTC Positions
          </p>
          <div className="space-y-3">
            {gauges.map((g, i) => (
              <div key={i} className="flex items-center justify-between p-4 border border-void-border hover:border-acid/20 transition-colors">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-[9px] font-black text-acid w-10">{(g.weightBps / 100).toFixed(0)}%</span>
                  <div>
                    <p className="font-mono text-[10px] font-bold text-silver uppercase">{g.name}</p>
                    <p className="font-mono text-[8px] text-silver-dim">{g.gauge}</p>
                    {g.boostedVeBTC && (
                      <p className="font-mono text-[7px] text-acid mt-0.5">
                        {parseInt(g.boostedVeBTC).toLocaleString()} veBTC boosted
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[8px] text-silver-dim">Pending MUSD</p>
                  <p className="font-mono text-[10px] font-bold text-acid">{g.pendingMUSD}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Notes */}
        <Panel className="p-6 border-acid/10">
          <div className="flex gap-3">
            <AlertTriangle size={16} className="text-acid shrink-0 mt-0.5" />
            <div className="space-y-2 font-mono text-[9px] text-silver-dim leading-relaxed">
              <p className="uppercase tracking-widest font-bold text-silver">Keeper Design</p>
              <p>• <span className="text-silver">Epoch-gated.</span> Each function executes once per epoch. Repeat calls revert — idempotency is enforced on-chain via <code className="text-acid">epochVoted</code>, <code className="text-acid">epochHarvested</code>, and <code className="text-acid">epochLocksExtended</code> flags.</p>
              <p>• <span className="text-silver">Call order enforced.</span> extendLocks() → castVotes() → harvestAndDistribute(). harvestAndDistribute() reverts if castVotes() has not been called this epoch.</p>
              <p>• <span className="text-silver">Minimum threshold.</span> harvestAndDistribute() reverts if pending MUSD is below the estimated gas cost — prevents griefing calls when gauges are empty.</p>
              <p>• <span className="text-silver">Permissionless.</span> Any wallet can call. First caller earns the bounty. No whitelist, no owner privilege.</p>
              <p>• <span className="text-silver">No MEV surface.</span> The harvest moves MUSD between contracts — no swap, no price impact, no sandwich opportunity.</p>
              <p>• Bounty (1%) is paid in MUSD to the caller. All remaining MUSD goes to veBYND stakers pro-rata.</p>
            </div>
          </div>
        </Panel>
      </div>

      <CastVotesModal
        isOpen={activeModal === 'castVotes'}
        onClose={() => setActiveModal(null)}
        totalPower={stats.totalVotingPower}
        gauges={gauges}
        epochVoted={epoch.epochVoted}
        timeUntilNextVote={epoch.timeUntilNextVote}
        onCastVotes={handleCastVotes}
      />
      <HarvestModal
        isOpen={activeModal === 'harvest'}
        onClose={() => setActiveModal(null)}
        pendingIncentives={stats.pendingIncentives}
        bountyBps={stats.bountyBps}
        epochVoted={epoch.epochVoted}
        epochHarvested={epoch.epochHarvested}
        onHarvest={handleHarvest}
      />
    </div>
  );
}
