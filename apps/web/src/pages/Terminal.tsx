import React, { useState, useEffect } from 'react';
import { Database, Gift, RefreshCw, Zap, TrendingUp, ArrowUpRight, ArrowDownRight, Lock, Shield, Loader2 } from 'lucide-react';
import { Panel, Button, StatRow, Badge, LiveDot, formatTime } from '@/components/ui';
import {
  DepositModal, WithdrawModal, StakeModal, UnstakeModal, ClaimModal,
  CastVotesModal, HarvestModal,
} from '@/components/modals';
import { useWallet } from '@/hooks/useWallet';
import { useProtocol } from '@/hooks/useProtocol';
import { useWriteContract, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import { getAddresses, VAULT_ABI, STAKING_ABI, VOTER_ABI, VEMEZO_ABI, ERC20_ABI, MATSNET_CHAIN_ID } from '@/lib/contracts';

// ── NFT placeholder image — shown while scanning, replaced by real NFT art once detected
const NFT_PLACEHOLDER_PROMPT =
  'Glowing veMEZO NFT card inside a dark terminal vault. Acid-green energy lines sealing it shut. Abstract circuit texture background. Dark void palette.';

export default function TerminalPage() {
  const { isConnected, isConnecting, address, chainId, connect, disconnect, formatAddress } = useWallet();

  const {
    stats, epoch, position, gauges, isLoading, isScanning, networkError, contractsDeployed, refresh, recordEpoch,
    setPosition, setEpoch,
  } = useProtocol(address, chainId);

  const [activeModal, setActiveModal]       = useState<string | null>(null);
  const [extendingLocks, setExtendingLocks] = useState(false);
  const [txStatus, setTxStatus]             = useState<{ type: 'idle'|'loading'|'success'|'error', message?: string }>({ type: 'idle' });

  // Live ticking countdown — Velodrome epoch math
  const EPOCH_WEEK = 7 * 24 * 3600;
  const calcRemaining = () => {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, (Math.floor(now / EPOCH_WEEK) + 1) * EPOCH_WEEK - now);
  };
  const [liveCountdown, setLiveCountdown] = useState<number>(calcRemaining);
  useEffect(() => {
    const id = setInterval(() => setLiveCountdown(calcRemaining()), 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mezoEpoch     = Math.floor(Date.now() / 1000 / EPOCH_WEEK);
  // Vote window opens 4h before epoch ends. timeToVoteOpen counts down to that moment.
  // e.g. if epoch ends Wednesday midnight, timeToVoteOpen hits 0 at Wednesday 8pm.
  const VOTE_WINDOW   = 4 * 3600; // 4 hours in seconds
  const timeToVoteOpen = Math.max(0, liveCountdown - VOTE_WINDOW);

  const addrs        = getAddresses(chainId ?? MATSNET_CHAIN_ID);
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

  const handleDeposit = async (tokenId: number) => {
    await withTx(async () => {
      // Pre-flight: check for permanent lock — vault requires lock.end > 0.
      // Permanently locked veMEZO has end=0 and will always revert with
      // "ByNdVault: lock expired". Surface a clear error before wasting gas.
      const lockData = await publicClient?.readContract({
        address: addrs.VeMEZO as `0x${string}`, abi: VEMEZO_ABI,
        functionName: 'locked', args: [BigInt(tokenId)],
      }) as { amount: bigint; end: bigint; isPermanent: boolean } | undefined;

      if (lockData?.isPermanent) {
        throw new Error(
          'veMEZO #' + tokenId + ' is permanently locked. ' +
          'Call unlock_permanent(' + tokenId + ') on the veMEZO contract first, then deposit.'
        );
      }

      // Step 1: approve vault to transfer the NFT, then wait for the tx to be mined.
      // On Matsnet block times are slow — calling deposit() before the approval lands
      // causes the vault's safeTransferFrom to revert with "not approved".
      const approveHash = await writeContractAsync({
        address: addrs.VeMEZO, abi: VEMEZO_ABI,
        functionName: 'approve', args: [addrs.ByNdVault, BigInt(tokenId)],
      });
      await publicClient?.waitForTransactionReceipt({ hash: approveHash });

      // Step 2: deposit — approval is now confirmed on-chain.
      return writeContractAsync({
        address: addrs.ByNdVault, abi: VAULT_ABI,
        functionName: 'deposit', args: [BigInt(tokenId)],
      });
    });
  };

  const handleWithdraw = async (_tokenId: number) => {
    alert('Permanent lock — exit via veBYND/MEZO pool on Mezo Swap.');
  };

  const handleStake = async (amount: string) => {
    await withTx(async () => {
      await writeContractAsync({
        address: addrs.VeBYND, abi: ERC20_ABI,
        functionName: 'approve', args: [addrs.ByNdStaking, parseEther(amount)],
      });
      return writeContractAsync({
        address: addrs.ByNdStaking, abi: STAKING_ABI,
        functionName: 'stake', args: [parseEther(amount)],
      });
    });
  };

  const handleUnstake = async (amount: string) => {
    await withTx(() => writeContractAsync({
      address: addrs.ByNdStaking, abi: STAKING_ABI,
      functionName: 'unstake', args: [parseEther(amount)],
    }));
  };

  const handleClaim = async () => {
    await withTx(() => writeContractAsync({
      address: addrs.ByNdStaking, abi: STAKING_ABI,
      functionName: 'claimAll', args: [],
    }));
  };

  const handleCastVotes = async () => {
    await withTx(() => writeContractAsync({
      address: addrs.ByNdVoter, abi: VOTER_ABI,
      functionName: 'castVotes', args: [],
    }));
  };

  const handleHarvest = async () => {
    await withTx(() => writeContractAsync({
      address: addrs.ByNdVoter, abi: VOTER_ABI,
      functionName: 'harvestAndDistribute', args: [],
    }));
    recordEpoch(epoch.currentEpoch, stats.totalVotingPower, stats.pendingIncentives, stats.bountyBps);
  };

  const handleUnlockPermanent = async (tokenId: number) => {
    // withTx expects a fn that returns a hash — return it directly and
    // wait for receipt inside withTx's own flow.
    await withTx(() => writeContractAsync({
      address: addrs.VeMEZO, abi: VEMEZO_ABI,
      functionName: 'unlockPermanent', args: [BigInt(tokenId)],
    }));
  };

  const handleExtendLocks = async () => {
    setExtendingLocks(true);
    try {
      await withTx(async () => {
        // Step 1: re-lock all NFTs to 4-year max on the Vault
        const extendHash = await writeContractAsync({
          address: addrs.ByNdVault, abi: VAULT_ABI,
          functionName: 'extendLocks', args: [],
        });
        await publicClient?.waitForTransactionReceipt({ hash: extendHash });

        // Step 2: mark locks extended for this epoch on the Voter so
        // epochLocksExtended flips to true and the button disables.
        return writeContractAsync({
          address: addrs.ByNdVoter, abi: VOTER_ABI,
          functionName: 'markLocksExtended', args: [],
        });
      });
    } finally {
      setExtendingLocks(false);
    }
  };

  const checkAllowance = async (_amount: string) => true;
  const approveToken   = async (_amount: string) => {};

  const hasRewards = parseFloat(position.claimableMUSD) > 0 || parseFloat(position.claimableMEZO) > 0;
  const canExtend  = !epoch.epochLocksExtended;

  const hasNFT = position.veMezoTokenIds.length > 0;

  return (
    <div className="min-h-screen bg-void">

      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="border-b border-void-border bg-void-soft">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LiveDot />
            <span className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">
              Terminal // Mezo Matsnet
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Banners ──────────────────────────────────────────────── */}
      {networkError && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-3 flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full shrink-0" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-red-400 font-bold">{networkError}</p>
        </div>
      )}
      {!networkError && !contractsDeployed && (
        <div className="bg-acid/5 border-b border-acid/20 px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-acid rounded-full animate-pulse shrink-0" />
            <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold">
              Connected to Mezo Matsnet — BynD contracts pending deployment.
            </p>
          </div>
          <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest shrink-0">
            Run: npm run deploy:matsnet
          </p>
        </div>
      )}
      {!networkError && contractsDeployed && (
        <div className="bg-acid/5 border-b border-acid/20 px-6 py-3 flex items-center gap-3">
          <div className="w-2 h-2 bg-acid rounded-full shrink-0" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold">
            Live — reading from Mezo Matsnet (chainId 31611)
          </p>
        </div>
      )}

      {/* ── NFT scanning banner — shown while wallet is connected but chain is still being read ── */}
      {isScanning && (
        <div className="bg-void-soft border-b border-acid/10 px-6 py-3 flex items-center gap-3">
          <Loader2 size={12} className="text-acid animate-spin shrink-0" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">
            Scanning chain for your veMEZO NFTs — this takes a few seconds…
          </p>
        </div>
      )}

      {/* ── Stat strip ─────────────────────────────────────────── */}
      <div className="border-b border-void-border">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-void-border">
          {[
            { label: 'System TVL',       value: stats.tvl,                                                    sub: '+4.2%' },
            { label: 'Epoch',            value: `#${mezoEpoch}`,                                              sub: `${formatTime(liveCountdown)} left` },
            { label: 'Your Staked',      value: `${parseFloat(position.stakedBalance || '0').toFixed(0)} veBYND`, sub: 'Earning MUSD' },
            { label: 'Boost Efficiency', value: `${stats.boostEfficiency}%`,                                  sub: 'Target optimisation' },
          ].map((s, i) => (
            <div key={i} className="px-6 py-5">
              <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim font-bold mb-2">{s.label}</p>
              <p className="font-mono text-xl font-black text-silver">{s.value}</p>
              <p className="font-mono text-[8px] text-acid mt-1">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6 text-center">
            <div className="w-16 h-16 border border-void-border flex items-center justify-center">
              <Lock size={24} className="text-silver-dim" />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-silver-dim mb-2">Access Required</p>
              <p className="text-silver-dim text-sm max-w-sm">Connect your wallet or Mezo Passport to access the terminal.</p>
            </div>
            <Button variant="primary" onClick={connect}>Connect Wallet</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* ── Left column ──────────────────────────────────── */}
            <div className="lg:col-span-8 space-y-8">

              {/* ── Liquid Locker ─────────────────────────────── */}
              <Panel className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold">Liquid Locker</p>
                    <p className="font-mono text-[8px] text-silver-dim mt-0.5 uppercase tracking-widest">
                      Step 01 — Lock & Mint veBYND · Permanent 4-Year Lock
                    </p>
                  </div>
                  <Badge variant={hasNFT ? 'acid' : 'muted'}>
                    {hasNFT ? 'Locked' : isScanning ? 'Scanning…' : 'No Deposit'}
                  </Badge>
                </div>

                <div className="mb-5 p-3 border border-acid/20 bg-acid/3 flex items-center gap-3">
                  <Shield size={12} className="text-acid shrink-0" />
                  <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
                    <span className="text-acid font-bold">Permanent lock.</span> Your veMEZO NFT is locked for the 4-year maximum to secure highest governance weight. You receive liquid <span className="text-silver font-bold">veBYND</span> 1:1 as your receipt — exit via Mezo Swap, not withdrawal.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">

                  {/* NFT display — scanning / detected / empty states */}
                  <div className="aspect-square border border-void-border bg-void flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute inset-0 grid-bg opacity-50" />

                    {isScanning ? (
                      // ── Scanning state ──────────────────────────────
                      <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
                        <div className="relative">
                          <div className="w-14 h-14 border border-acid/30 flex items-center justify-center">
                            <Loader2 size={28} strokeWidth={1} className="text-acid animate-spin" />
                          </div>
                          <div className="absolute inset-0 border border-acid/10 scale-110 animate-ping" />
                        </div>
                        <div>
                          <p className="font-mono text-[9px] text-acid uppercase tracking-widest font-bold">
                            Scanning Chain
                          </p>
                          <p className="font-mono text-[8px] text-silver-dim mt-1 leading-relaxed">
                            Reading veMEZO NFTs<br />from Matsnet…
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {[0, 1, 2].map(i => (
                            <div
                              key={i}
                              className="w-1.5 h-1.5 bg-acid rounded-full animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : hasNFT ? (
                      // ── NFT detected state ──────────────────────────
                      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                        {/* NFT art — replace src with real token image URL when available */}
                        <div className="w-full flex-1 relative border border-acid/30 overflow-hidden bg-void-soft flex items-center justify-center min-h-0">
                          {/* Acid glow bg */}
                          <div className="absolute inset-0 bg-acid/5" />
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-acid/20 rounded-full blur-2xl" />
                          {/* NFT icon / art */}
                          <div className="relative z-10 flex flex-col items-center gap-2">
                            <div className="w-16 h-16 border border-acid/50 bg-acid/10 flex items-center justify-center">
                              <Database size={32} strokeWidth={1} className="text-acid" />
                            </div>
                            <div className="text-center">
                              <p className="font-mono text-[8px] font-black text-acid uppercase tracking-wider">
                                veMEZO #{position.veMezoTokenIds[0]}
                              </p>
                              <p className="font-mono text-[7px] text-silver-dim">Permanently Locked</p>
                            </div>
                          </div>
                          {/* Corner accent */}
                          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-acid/50" />
                          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-acid/50" />
                        </div>
                        <div className="w-full flex items-center justify-between px-1">
                          <p className="font-mono text-[7px] text-silver-dim uppercase tracking-widest">Status</p>
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-acid rounded-full animate-pulse" />
                            <p className="font-mono text-[7px] text-acid font-bold uppercase">Active · 4yr max</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // ── Empty state ─────────────────────────────────
                      <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
                        <Database size={48} strokeWidth={1} className="text-void-muted" />
                        <p className="font-mono text-[9px] text-silver-dim uppercase tracking-widest">
                          No veMEZO Detected
                        </p>
                        <p className="font-mono text-[7px] text-void-muted leading-relaxed">
                          Deposit a veMEZO NFT<br />to get started
                        </p>
                      </div>
                    )}

                    {/* Hover prompt for devs — image replacement hint */}
                    {!isScanning && (
                      <div className="absolute bottom-2 left-2 right-2 p-1.5 bg-void/95 border border-void-border font-mono text-[6px] text-void-muted opacity-0 group-hover:opacity-100 transition-opacity leading-relaxed">
                        📸 {NFT_PLACEHOLDER_PROMPT}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between py-2 space-y-4">
                    <div className="space-y-3">
                      <div>
                        <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">veBYND Balance</p>
                        <p className="text-3xl font-black text-silver">
                          {isLoading
                            ? <span className="inline-flex items-center gap-2 text-silver-dim text-xl"><Loader2 size={16} className="animate-spin" /> Loading</span>
                            : parseFloat(position.veByndBalance || '0').toFixed(2)
                          }
                          {!isLoading && <span className="text-sm text-silver-dim ml-2 font-normal">veBYND</span>}
                        </p>
                      </div>
                      <StatRow label="Vault Voting Power" value={stats.totalVotingPower} />
                      <StatRow label="Mint Rate"          value="1:1 veBYND" accent />
                      <StatRow label="Lock Duration"      value="4 Years (max)" accent />
                    </div>

                    <div className="space-y-3">
                      <Button variant="primary" fullWidth onClick={() => setActiveModal('deposit')}>
                        <ArrowUpRight size={12} /> Lock & Mint veBYND
                      </Button>
                      <Button variant="ghost" fullWidth onClick={() => setActiveModal('withdraw')} disabled>
                        <ArrowDownRight size={12} /> Withdraw (Permanent Lock)
                      </Button>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* ── Staking Terminal ──────────────────────────── */}
              <Panel className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold">Staking Terminal</p>
                    <p className="font-mono text-[8px] text-silver-dim mt-0.5 uppercase tracking-widest">
                      Step 02 — Stake veBYND · Activate MUSD Yield
                    </p>
                  </div>
                  <Badge variant={parseFloat(position.stakedBalance) > 0 ? 'acid' : 'muted'}>
                    APR ~{stats.avgApr}
                  </Badge>
                </div>

                <div className="grid sm:grid-cols-3 gap-6">
                  <div className="sm:col-span-1 space-y-4">
                    <div>
                      <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">Wallet (unstaked)</p>
                      <p className="text-2xl font-black text-silver">
                        {parseFloat(position.veByndBalance || '0').toFixed(0)}
                        <span className="text-xs text-silver-dim ml-1">veBYND</span>
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">Staked</p>
                      <p className="text-2xl font-black text-acid">
                        {parseFloat(position.stakedBalance || '0').toFixed(0)}
                        <span className="text-xs text-silver-dim ml-1">veBYND</span>
                      </p>
                    </div>
                  </div>
                  <div className="sm:col-span-2 flex flex-col justify-end gap-3">
                    <Button variant="primary" fullWidth onClick={() => setActiveModal('stake')}>
                      <TrendingUp size={12} /> Stake veBYND
                    </Button>
                    <Button variant="ghost" fullWidth onClick={() => setActiveModal('unstake')}>
                      Unstake
                    </Button>
                  </div>
                </div>
              </Panel>

              {/* ── Gauge Allocations ─────────────────────────── */}
              <Panel className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold">
                    veBTC Gauge Weights
                  </p>
                  <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest">
                    Boosted veBTC Positions
                  </p>
                </div>
                {gauges.length === 0 ? (
                  <div className="py-8 text-center border border-void-border">
                    <p className="font-mono text-[9px] text-silver-dim uppercase tracking-widest">
                      No gauges configured
                    </p>
                    <p className="font-mono text-[8px] text-void-muted mt-1">
                      Run optimiseGauges.ts before epoch vote
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {gauges.map((g, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-void border border-void-border flex items-center justify-center font-mono text-[9px] font-black text-acid shrink-0">
                          {(g.weightBps / 100).toFixed(0)}%
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-1">
                            <span className="font-mono text-[10px] font-bold text-silver uppercase tracking-wide">{g.name}</span>
                            <span className="font-mono text-[9px] text-acid font-bold">APR {g.apr}</span>
                          </div>
                          <div className="h-1 bg-void-border rounded-full overflow-hidden">
                            <div className="h-full bg-acid transition-all duration-700" style={{ width: `${g.weightBps / 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* ── Right column ─────────────────────────────────── */}
            <div className="lg:col-span-4 space-y-6">

              {/* ── Yield Terminal ──────────────────────────────── */}
              <div className="bg-void-soft border border-void-border clip-corner relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/40 to-transparent" />
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-acid/3 rounded-full blur-3xl pointer-events-none" />
                <div className="p-6 relative">
                  <div className="flex items-center justify-between mb-6">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold">Yield Terminal</p>
                    <Gift size={16} className="text-void-muted" />
                  </div>

                  <div className="space-y-4 mb-6">
                    <div>
                      <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">Claimable {stats.rewardTokenSymbol}</p>
                      <p className="text-4xl font-black text-acid leading-none">
                        {parseFloat(position.claimableMUSD || '0').toFixed(2)}
                      </p>
                      <p className="font-mono text-[7px] text-silver-dim mt-1">
                        {parseFloat(position.stakedBalance || '0') > 0
                          ? parseFloat(position.claimableMUSD || '0') > 0
                            ? 'MUSD bribes from gauge voting — ready to claim'
                            : 'Rewards accumulate after keeper harvests each epoch'
                          : `Stake veBYND above to start earning ${stats.rewardTokenSymbol}`}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">Claimable MEZO</p>
                      <p className="text-2xl font-black text-silver leading-none">
                        {parseFloat(position.claimableMEZO || '0').toFixed(4)}
                      </p>
                    </div>
                  </div>

                  <Button variant="primary" fullWidth onClick={() => setActiveModal('claim')} disabled={!hasRewards}>
                    Claim MUSD Yield
                  </Button>
                </div>
              </div>

              {/* ── Keeper Functions ────────────────────────────── */}
              <Panel className="p-6">
                <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-1">Keeper Functions</p>
                <p className="font-mono text-[8px] text-silver-dim mb-5 uppercase tracking-wider">
                  Permissionless. Earn bounties each epoch.
                </p>

                <div className="space-y-2">
                  {/* extendLocks */}
                  <div className={`border p-3 space-y-2 transition-colors ${canExtend ? 'border-acid/40 bg-acid/3' : 'border-void-border'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Shield size={11} className={canExtend ? 'text-acid shrink-0' : 'text-silver-dim shrink-0'} />
                        <div className="min-w-0">
                          <p className="font-mono text-[8px] uppercase font-black text-silver truncate">Protocol Maintenance</p>
                          <p className="font-mono text-[7px] text-silver-dim">Reset all veMEZO to 4-yr max</p>
                        </div>
                      </div>
                      {epoch.epochLocksExtended
                        ? <Badge variant="acid">Done</Badge>
                        : canExtend ? <Badge variant="orange">Ready</Badge>
                        : <Badge variant="muted">Wait</Badge>}
                    </div>
                    <Button variant={canExtend ? 'outline' : 'ghost'} size="sm" fullWidth
                      onClick={handleExtendLocks} disabled={!canExtend || extendingLocks} isLoading={extendingLocks}>
                      extendLocks()
                    </Button>
                  </div>

                  {/* castVotes */}
                  <div className={`border p-3 space-y-2 transition-colors ${!epoch.epochVoted && timeToVoteOpen === 0 ? 'border-acid/40 bg-acid/3' : 'border-void-border'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <RefreshCw size={11} className={`text-acid shrink-0 ${timeToVoteOpen === 0 && !epoch.epochVoted ? 'animate-spin' : ''}`} />
                        <div className="min-w-0">
                          <p className="font-mono text-[8px] uppercase font-black text-silver truncate">Cast System Votes</p>
                          <p className="font-mono text-[7px] text-silver-dim">
                            {epoch.epochVoted ? 'Voted this epoch' : timeToVoteOpen > 0 ? `Opens in ${formatTime(timeToVoteOpen)}` : 'Open now — 4h window'}
                          </p>
                        </div>
                      </div>
                      {epoch.epochVoted && <Badge variant="acid">Done</Badge>}
                    </div>
                    <Button variant="outline" size="sm" fullWidth onClick={() => setActiveModal('castVotes')}
                      disabled={epoch.epochVoted || timeToVoteOpen > 0}>
                      castVotes()
                    </Button>
                  </div>

                  {/* harvestAndDistribute */}
                  <div className={`border p-3 space-y-2 transition-colors ${epoch.epochVoted && !epoch.epochHarvested ? 'border-acid/40 bg-acid/3' : 'border-void-border'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Zap size={11} className="text-acid shrink-0" />
                        <div className="min-w-0">
                          <p className="font-mono text-[8px] uppercase font-black text-silver truncate">Harvest & Distribute</p>
                          <p className="font-mono text-[7px] text-silver-dim">Earn {stats.bountyBps / 100}% on harvest</p>
                        </div>
                      </div>
                      {epoch.epochHarvested && <Badge variant="muted">Done</Badge>}
                    </div>
                    <Button variant="outline" size="sm" fullWidth onClick={() => setActiveModal('harvest')}
                      disabled={!epoch.epochVoted || epoch.epochHarvested}>
                      harvestAndDistribute()
                    </Button>
                  </div>
                </div>
              </Panel>

              {/* ── Epoch Status ─────────────────────────────────── */}
              <Panel className="p-6">
                <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-4">Epoch Status</p>
                <StatRow label="Current Epoch"  value={`#${mezoEpoch}`} />
                <StatRow label="Time Remaining" value={formatTime(liveCountdown)} />
                <StatRow label="Locks Extended" value={epoch.epochLocksExtended ? '✓ Yes' : 'No'} accent={epoch.epochLocksExtended} />
                <StatRow label="Votes Cast"     value={epoch.epochVoted      ? '✓ Yes' : 'No'} accent={epoch.epochVoted} />
                <StatRow label="Harvested"      value={epoch.epochHarvested  ? '✓ Yes' : 'No'} accent={epoch.epochHarvested} />
                <StatRow label="Keeper Bounty"  value={`${stats.bountyBps / 100}% MUSD`} />
              </Panel>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      <DepositModal isOpen={activeModal === 'deposit'} onClose={() => setActiveModal(null)}
                   permanentIds={position.permanentIds}
                   onUnlockPermanent={handleUnlockPermanent}
        tokenIds={position.veMezoTokenIds} lockedAmounts={position.lockedAmounts} onDeposit={handleDeposit} />
      <WithdrawModal isOpen={activeModal === 'withdraw'} onClose={() => setActiveModal(null)}
        tokenIds={position.veMezoTokenIds} onWithdraw={handleWithdraw} />
      <StakeModal isOpen={activeModal === 'stake'} onClose={() => setActiveModal(null)}
        veByndBalance={position.veByndBalance} avgApr={stats.avgApr} rewardTokenSymbol={stats.rewardTokenSymbol}
        onStake={handleStake} onCheckAllowance={checkAllowance} onApprove={approveToken} />
      <UnstakeModal isOpen={activeModal === 'unstake'} onClose={() => setActiveModal(null)}
        stakedBalance={position.stakedBalance} onUnstake={handleUnstake} />
      <ClaimModal isOpen={activeModal === 'claim'} onClose={() => setActiveModal(null)}
        claimableMUSD={position.claimableMUSD} claimableMEZO={position.claimableMEZO} onClaim={handleClaim} />
      <CastVotesModal isOpen={activeModal === 'castVotes'} onClose={() => setActiveModal(null)}
        totalPower={stats.totalVotingPower} gauges={gauges} epochVoted={epoch.epochVoted}
        timeUntilNextVote={liveCountdown} onCastVotes={handleCastVotes} />
      <HarvestModal isOpen={activeModal === 'harvest'} onClose={() => setActiveModal(null)}
        pendingIncentives={stats.pendingIncentives} bountyBps={stats.bountyBps}
        epochVoted={epoch.epochVoted} epochHarvested={epoch.epochHarvested} onHarvest={handleHarvest} />

    </div>
  );
}
