import React, { useState } from 'react';
import { RefreshCw, Zap, Shield, Droplets, AlertTriangle } from 'lucide-react';
import { Panel, Button, StatRow, Badge, LiveDot, SectionHeader, formatTime } from '@/components/ui';
import { CastVotesModal, HarvestModal } from '@/components/modals';
import { useProtocol } from '@/hooks/useProtocol';
import { useWallet } from '@/hooks/useWallet';
import { useWriteContract, usePublicClient } from 'wagmi';
import { getAddresses, VAULT_ABI, VOTER_ABI } from '@/lib/contracts';

type BadgeVariant = 'acid' | 'orange' | 'muted';

export default function KeeperPage() {
  const { isConnected, address, chainId } = useWallet();
  // Pass address+chainId so contractsEnabled fires and all on-chain reads execute
  const { stats, epoch, gauges, contractsDeployed, setEpoch, setPosition, refresh } = useProtocol(address, chainId);

  const [activeModal, setActiveModal]         = useState<string | null>(null);
  const [extendingLocks, setExtendingLocks]   = useState(false);
  const [claimingRebases, setClaimingRebases] = useState(false);
  const [txStatus, setTxStatus]               = useState<{ type: 'idle'|'loading'|'success'|'error', message?: string }>({ type: 'idle' });

  // Matsnet global epoch clock — same math as Terminal
  const EPOCH_WEEK    = 7 * 24 * 3600;
  const now           = Math.floor(Date.now() / 1000);
  const mezoEpoch     = Math.floor(now / EPOCH_WEEK);           // e.g. 2942
  const epochEnd      = (mezoEpoch + 1) * EPOCH_WEEK;          // unix ts when this epoch ends
  const liveCountdown = Math.max(0, epochEnd - now);            // seconds until epoch ends
  const voteWindowSec = 4 * 3600;                               // vote opens 4h before epoch end
  const timeToVoteOpen = Math.max(0, liveCountdown - voteWindowSec); // 0 when window is open

  const addrs        = getAddresses(chainId ?? 31611);
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

  const handleClaimRebases = async () => {
    setClaimingRebases(true);
    try {
      await withTx(() => writeContractAsync({
        address: addrs.ByNdVault,
        abi: VAULT_ABI,
        functionName: 'claimRebases',
        args: [],
      }));
    } finally {
      setClaimingRebases(false);
    }
  };

  const handleExtendLocks = async () => {
    setExtendingLocks(true);
    try {
      await withTx(async () => {
        // Step 1: re-lock all NFTs to 4-year max on the Vault
        const extendHash = await writeContractAsync({
          address: addrs.ByNdVault,
          abi: VAULT_ABI,
          functionName: 'extendLocks',
          args: [],
        });
        await publicClient?.waitForTransactionReceipt({ hash: extendHash });

        // Step 2: mark locks extended for this epoch on the Voter so
        // epochLocksExtended flips to true and the button disables.
        return writeContractAsync({
          address: addrs.ByNdVoter,
          abi: VOTER_ABI,
          functionName: 'markLocksExtended',
          args: [],
        });
      });
    } finally {
      setExtendingLocks(false);
    }
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

  const canClaimRebases = true;
  const canExtend       = !epoch.epochLocksExtended;
  // Vote window opens 4h before Matsnet epoch ends
  const canVote         = !epoch.epochVoted && timeToVoteOpen === 0;
  const canHarvest      = epoch.epochVoted && !epoch.epochHarvested;

  type StepDef = {
    id: string;
    step: string;
    label: string;
    icon: React.ElementType;
    can: boolean;
    done: boolean;
    isLoading: boolean;
    description: string;
    onClick: () => void;
    badge: string;
    badgeVariant: BadgeVariant;
  };

  const steps: StepDef[] = [
    {
      id: 'claimRebases',
      step: '00',
      label: 'claimRebases()',
      icon: Droplets,
      can: canClaimRebases,
      done: false,
      isLoading: claimingRebases,
      description: 'Compounds veMEZO rebase rewards back into all deposited NFTs. Grows locked MEZO balance → grows BynD voting power. No tokens leave the vault.',
      onClick: handleClaimRebases,
      badge: 'Ready',
      badgeVariant: 'orange',
    },
    {
      id: 'extendLocks',
      step: '01',
      label: 'extendLocks()',
      icon: Shield,
      can: canExtend,
      done: epoch.epochLocksExtended,
      isLoading: extendingLocks,
      description: 'Resets all protocol-held veMEZO to the 4-year maximum, ensuring permanent max governance weight.',
      onClick: handleExtendLocks,
      badge: epoch.epochLocksExtended ? 'Done' : canExtend ? 'Ready' : 'Waiting',
      badgeVariant: (epoch.epochLocksExtended ? 'acid' : canExtend ? 'orange' : 'muted') as BadgeVariant,
    },
    {
      id: 'castVotes',
      step: '02',
      label: 'castVotes()',
      icon: RefreshCw,
      can: canVote,
      done: epoch.epochVoted,
      isLoading: false,
      description: `Aggregates all veMEZO power and casts votes toward highest-bribe veBTC gauges. Vote window opens 4h before epoch end${timeToVoteOpen > 0 ? ' — opens in ' + formatTime(timeToVoteOpen) : ' — open now'}.`,
      onClick: () => setActiveModal('castVotes'),
      badge: epoch.epochVoted ? 'Done' : canVote ? 'Ready' : 'Waiting',
      badgeVariant: (epoch.epochVoted ? 'acid' : canVote ? 'orange' : 'muted') as BadgeVariant,
    },
    {
      id: 'harvest',
      step: '03',
      label: 'harvestAndDistribute()',
      icon: Zap,
      can: canHarvest,
      done: epoch.epochHarvested,
      isLoading: false,
      description: `Collects bribes from all gauges — any token. Your ${stats.bountyBps / 100}% bounty: ~$${estimatedBounty} MUSD.`,
      onClick: () => setActiveModal('harvest'),
      badge: epoch.epochHarvested ? 'Done' : canHarvest ? 'Ready' : 'Locked',
      badgeVariant: (epoch.epochHarvested ? 'acid' : canHarvest ? 'orange' : 'muted') as BadgeVariant,
    },
  ];

  return (
    <div className="min-h-screen bg-void">
      <div className="border-b border-void-border bg-void-soft">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <SectionHeader
            label="Keeper"
            title="Keeper Dashboard"
            subtitle="Epoch-gated keeper functions. Call in order each epoch. Earn bounties (paid in whatever token was harvested) by triggering harvestAndDistribute."
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* Bounty hero */}
        <div className="border border-acid/30 bg-acid/3 clip-corner p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-30" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/60 to-transparent" />
          <div className="relative">
            <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold mb-2">
              Available Keeper Bounty This Epoch
            </p>
            <p className="text-[64px] font-black text-acid leading-none">~${estimatedBounty}</p>
            <p className="font-mono text-[10px] text-silver-dim mt-2 uppercase tracking-widest">
              {stats.rewardTokenSymbol} · {stats.bountyBps / 100}% of {
                stats.pendingIncentives === '–' ? '–' :
                parseFloat(stats.pendingIncentives).toLocaleString(undefined, { maximumFractionDigits: 2 })
              } {stats.rewardTokenSymbol} pending
            </p>
          </div>
        </div>

        {/* Status overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-void-border border border-void-border">
          {[
            // Use Matsnet global epoch clock — same as Terminal
            { label: 'Current Epoch',  value: `#${mezoEpoch}` },
            { label: 'Time Remaining', value: formatTime(liveCountdown) },
            { label: 'Pending Rewards',
              value: stats.pendingIncentives === '–' ? '–' :
                parseFloat(stats.pendingIncentives).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + stats.rewardTokenSymbol
            },
            { label: 'Keeper Bounty',  value: `${stats.bountyBps / 100}% of harvest` },
          ].map((s, i) => (
            <div key={i} className="bg-void-soft p-6">
              <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim font-bold mb-2">{s.label}</p>
              <p className="font-mono text-xl font-black text-silver">{s.value}</p>
            </div>
          ))}
        </div>

        {/* 4-step epoch flow */}
        <Panel className="p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold mb-6">
            Epoch Flow — Call Order
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const active = s.can && !s.done;
              return (
                <React.Fragment key={s.id}>
                  <div className={`border p-5 space-y-4 transition-colors ${active ? 'border-acid/50 bg-acid/3' : 'border-void-border'}`}>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className={`p-2 border ${active ? 'border-acid/50 bg-acid/10' : 'border-void-border'}`}>
                          <Icon
                            size={14}
                            className={`${active ? 'text-acid' : 'text-silver-dim'} transition-colors ${s.id === 'castVotes' && active ? 'animate-spin' : ''}`}
                          />
                        </div>
                        <Badge variant={s.badgeVariant}>{s.badge}</Badge>
                      </div>
                      <div>
                        <p className="font-mono text-[9px] uppercase font-black text-silver">{s.label}</p>
                        <p className="font-mono text-[7px] text-silver-dim mt-0.5">Step {s.step}</p>
                      </div>
                    </div>
                    <p className="font-mono text-[8px] text-silver-dim leading-relaxed">{s.description}</p>
                    <Button
                      variant={active ? 'primary' : 'ghost'}
                      size="sm"
                      fullWidth
                      onClick={s.onClick}
                      disabled={(!s.can && !s.done) || s.isLoading}
                      isLoading={s.isLoading}
                    >
                      {s.label}
                    </Button>
                  </div>

                </React.Fragment>
              );
            })}
          </div>
        </Panel>

        {/* Notes */}
        <Panel className="p-6 border-acid/10">
          <div className="flex gap-3">
            <AlertTriangle size={16} className="text-acid shrink-0 mt-0.5" />
            <div className="space-y-2 font-mono text-[9px] text-silver-dim leading-relaxed">
              <p className="uppercase tracking-widest font-bold text-silver">Keeper Design</p>
              <p>• <span className="text-silver">claimRebases() is permissionless and has no epoch gate.</span> Call it any time. Rebase compounds locked MEZO in-place — no tokens leave the vault.</p>
              <p>• <span className="text-silver">Epoch-gated steps 01–03.</span> Each executes once per epoch. Repeat calls revert.</p>
              <p>• <span className="text-silver">Multi-token harvest.</span> harvestAndDistribute() sweeps any ERC-20 bribe token. Keepers earn 1% in each token harvested.</p>
              <p>• <span className="text-silver">Permissionless.</span> Any wallet can call any step. First caller of harvestAndDistribute() earns the bounty.</p>
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
