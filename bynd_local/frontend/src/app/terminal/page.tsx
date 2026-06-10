'use client';

import React, { useState } from 'react';
import { Database, Gift, RefreshCw, Zap, TrendingUp, ArrowUpRight, ArrowDownRight, Lock, Shield, Loader2 } from 'lucide-react';
import { Panel, Button, StatRow, Badge, LiveDot, formatTime } from '@/components/ui';
import {
  DepositModal, WithdrawModal, StakeModal, UnstakeModal, ClaimModal,
  CastVotesModal, HarvestModal,
} from '@/components/modals';
import { useWallet } from '@/hooks/useWallet';
import { useProtocol } from '@/hooks/useProtocol';
import { ConnectModal } from '@/components/modals';
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import { getAddresses, VAULT_ABI, STAKING_ABI, VOTER_ABI, VEMEZO_ABI, ERC20_ABI } from '@/lib/contracts';

export default function TerminalPage() {
  const { isConnected, isConnecting, address, chainId, connect, disconnect, formatAddress } = useWallet();

  const {
    stats, epoch, position, gauges, isScanning, networkError, contractsDeployed, refresh, recordEpoch,
    setPosition, setEpoch,
  } = useProtocol(address, chainId);

  const [activeModal, setActiveModal]     = useState<string | null>(null);
  const [connectOpen, setConnectOpen]     = useState(false);
  const [extendingLocks, setExtendingLocks] = useState(false);
  const [txStatus, setTxStatus]           = useState<{ type: 'idle'|'loading'|'success'|'error', message?: string }>({ type: 'idle' });

  const addrs      = getAddresses(chainId ?? 31337);
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
      throw e; // re-throw so modal's own catch block can update its status
    }
  };

  // ── Real contract calls ───────────────────────────────────────────────────

  const handleDeposit = async (tokenId: number) => {
    await withTx(async () => {
      // Step 1: approve vault to transfer NFT, then wait for confirmation.
      // On Matsnet block times are slow — calling deposit() before approval lands
      // causes the vault's safeTransferFrom to revert with "not approved".
      const approveHash = await writeContractAsync({
        address: addrs.VeMEZO,
        abi: VEMEZO_ABI,
        functionName: 'approve',
        args: [addrs.ByNdVault, BigInt(tokenId)],
      });
      await publicClient?.waitForTransactionReceipt({ hash: approveHash });

      // Step 2: deposit — approval is confirmed on-chain.
      return writeContractAsync({
        address: addrs.ByNdVault,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [BigInt(tokenId)],
      });
    });
  };

  const handleWithdraw = async (_tokenId: number) => {
    // Vault has no withdraw — permanent lock by design
    alert('Permanent lock — exit via veBYND/MEZO pool on Mezo Swap.');
  };

  const handleStake = async (amount: string) => {
    await withTx(async () => {
      // Approve staking contract to spend veBYND
      await writeContractAsync({
        address: addrs.VeBYND,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [addrs.ByNdStaking, parseEther(amount)],
      });
      return writeContractAsync({
        address: addrs.ByNdStaking,
        abi: STAKING_ABI,
        functionName: 'stake',
        args: [parseEther(amount)],
      });
    });
  };

  const handleUnstake = async (amount: string) => {
    await withTx(() => writeContractAsync({
      address: addrs.ByNdStaking,
      abi: STAKING_ABI,
      functionName: 'unstake',
      args: [parseEther(amount)],
    }));
  };

  const handleClaim = async () => {
    await withTx(() => writeContractAsync({
      address: addrs.ByNdStaking,
      abi: STAKING_ABI,
      functionName: 'claimRewards',
      args: [],
    }));
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
    // Record this epoch in history after successful harvest
    recordEpoch(epoch.currentEpoch, stats.totalVotingPower, stats.pendingIncentives, stats.bountyBps);
  };

  const checkAllowance = async (amount: string) => true;

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

  const handleFastForward = async () => {
    try {
      // Skip to the vote window (4hrs before epoch end) if not there yet.
      // If already in vote window (timeUntilNextVote === 0), skip past full epoch end.
      const skipSeconds = epoch.timeUntilNextVote > 0
        ? epoch.timeUntilNextVote + 1           // skip to vote window
        : epoch.epochDuration - 14400 + 1;      // skip past epoch end (full epoch from last vote)

      await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'evm_increaseTime', params: [skipSeconds] }),
      });
      await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'evm_mine', params: [] }),
      });
      refresh();
    } catch {
      console.error('Fast forward failed — is Hardhat node running?');
    }
  };

  const approveToken   = async (amount: string) => {};

  const hasRewards = parseFloat(position.claimableMUSD) > 0 || parseFloat(position.claimableMEZO) > 0;
  const canExtend  = !epoch.epochLocksExtended;

  return (
    <div className="min-h-screen bg-void">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="border-b border-void-border bg-void-soft">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LiveDot />
            <span className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">
              Terminal // {chainId === 31337 ? 'Hardhat Local' : chainId === 31611 ? 'Matsnet' : 'Not Connected'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {chainId === 31337 && (
              <Button variant="ghost" size="sm" onClick={handleFastForward}>
                ⏩ Skip Epoch
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw size={12} /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* ── Network error banner ─────────────────────────────────── */}
      {networkError && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-3 flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full shrink-0" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-red-400 font-bold">
            {networkError}
          </p>
        </div>
      )}

      {/* ── Contract deployment status banner ────────────────────── */}
      {!networkError && !contractsDeployed && (
        <div className="bg-acid/5 border-b border-acid/20 px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-acid rounded-full animate-pulse shrink-0" />
            <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold">
              Connected to Mezo Matsnet — reading native contracts. BynD contracts pending deployment.
            </p>
          </div>
          <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest shrink-0">
            Deploy contracts first — run: npm run deploy:local
          </p>
        </div>
      )}

      {/* ── Connected + deployed confirmation ───────────────────── */}
      {!networkError && contractsDeployed && (
        <div className="bg-acid/5 border-b border-acid/20 px-6 py-3 flex items-center gap-3">
          <div className="w-2 h-2 bg-acid rounded-full shrink-0" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold">
            Live — reading from {chainId === 31337 ? 'Hardhat Local (chainId 31337)' : 'Mezo Matsnet (chainId 31611)'}
          </p>
        </div>
      )}

      {isScanning && (
        <div className="bg-void-soft border-b border-acid/10 px-6 py-3 flex items-center gap-3">
          <Loader2 size={12} className="text-acid animate-spin shrink-0" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">
            Scanning your wallet for veMEZO NFTs — this may take a few seconds.
          </p>
        </div>
      )}

      {/* ── Stat strip ─────────────────────────────────────────── */}
      <div className="border-b border-void-border">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 divide-x divide-void-border">
          {[
            { label: 'System TVL',        value: stats.tvl,                                             sub: '+4.2%' },
            { label: 'Epoch',             value: `#${epoch.currentEpoch}`,                              sub: `${formatTime(epoch.timeUntilNextVote)} left` },
            { label: 'Your Staked',       value: `${parseFloat(position.stakedBalance || '0').toFixed(0)} veBYND`, sub: 'Earning MUSD' },
            { label: 'Boost Efficiency',  value: `${stats.boostEfficiency}%`,                           sub: 'Target optimisation' },
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

              {/* ── Liquid Locker — Step 01 ───────────────────── */}
              <Panel className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold">Liquid Locker</p>
                    <p className="font-mono text-[8px] text-silver-dim mt-0.5 uppercase tracking-widest">
                      Step 01 — Lock & Mint veBYND · Permanent 4-Year Lock
                    </p>
                  </div>
                  <Badge variant={position.veMezoTokenIds.length > 0 ? 'acid' : 'muted'}>
                    {position.veMezoTokenIds.length > 0 ? 'Locked' : 'No Deposit'}
                  </Badge>
                </div>

                {/* Permanent lock notice */}
                <div className="mb-5 p-3 border border-acid/20 bg-acid/3 flex items-center gap-3">
                  <Shield size={12} className="text-acid shrink-0" />
                  <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
                    <span className="text-acid font-bold">Permanent lock.</span> Your veMEZO NFT is locked for the 4-year maximum to secure highest governance weight. You receive liquid <span className="text-silver font-bold">veBYND</span> 1:1 as your receipt — exit via Mezo Swap, not withdrawal.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="aspect-square border border-void-border bg-void flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute inset-0 grid-bg opacity-50" />
                    <Database
                      size={56}
                      strokeWidth={1}
                      className={`transition-colors duration-500 relative z-10 ${position.veMezoTokenIds.length > 0 ? 'text-acid' : 'text-void-muted'}`}
                    />
                    <p className="font-mono text-[9px] text-silver-dim uppercase tracking-widest mt-4 relative z-10 text-center px-4">
                      {position.veMezoTokenIds.length > 0
                        ? `veMEZO #${position.veMezoTokenIds[0]} · Permanently Locked`
                        : 'No veMEZO Detected'}
                    </p>
                    <div className="absolute bottom-2 left-2 right-2 p-1.5 bg-void/90 border border-void-border font-mono text-[7px] text-void-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      📸 Replace: Glowing veMEZO NFT card inserted into a dark vault terminal, acid-green energy lines sealing it shut
                    </div>
                  </div>

                  <div className="flex flex-col justify-between py-2 space-y-4">
                    <div className="space-y-3">
                      <div>
                        <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">veBYND Balance</p>
                        <p className="text-3xl font-black text-silver">
                          {parseFloat(position.veByndBalance || '0').toFixed(2)}
                          <span className="text-sm text-silver-dim ml-2 font-normal">veBYND</span>
                        </p>
                      </div>
                      <StatRow label="Vault Voting Power" value={stats.totalVotingPower} />
                      <StatRow label="Mint Rate" value="1:1 veBYND" accent />
                      <StatRow label="Lock Duration" value="4 Years (max)" accent />
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

              {/* ── Staking Terminal — Step 02 ────────────────── */}
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
                          <div
                            className="h-full bg-acid transition-all duration-700"
                            style={{ width: `${g.weightBps / 100}%` }}
                          />
                        </div>
                        {g.boostedVeBTC && (
                          <p className="font-mono text-[7px] text-silver-dim mt-1">
                            {parseInt(g.boostedVeBTC).toLocaleString()} veBTC positions boosted
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
                      <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">Claimable MUSD</p>
                      <p className="text-4xl font-black text-acid leading-none">
                        {parseFloat(position.claimableMUSD || '0').toFixed(2)}
                      </p>
                      <p className="font-mono text-[7px] text-silver-dim mt-1">
                        {parseFloat(position.stakedBalance || '0') > 0
                          ? parseFloat(position.claimableMUSD || '0') > 0
                            ? 'MUSD bribes from gauge voting — ready to claim'
                            : 'Rewards accumulate after keeper harvests each epoch'
                          : 'Stake veBYND above to start earning MUSD'
                        }
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">Claimable MEZO</p>
                      <p className="text-2xl font-black text-silver leading-none">
                        {parseFloat(position.claimableMEZO || '0').toFixed(4)}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => setActiveModal('claim')}
                    disabled={!hasRewards}
                  >
                    Claim MUSD Yield
                  </Button>
                </div>
              </div>

              {/* ── Keeper Functions ────────────────────────────── */}
              <Panel className="p-6">
                <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-1">
                  Keeper Functions
                </p>
                <p className="font-mono text-[8px] text-silver-dim mb-5 leading-relaxed uppercase tracking-wider">
                  Permissionless. Earn bounties each epoch.
                </p>

                <div className="space-y-3">

                  {/* Step 0: extendLocks */}
                  <div className={`border p-4 space-y-3 transition-colors ${canExtend ? 'border-acid/50 bg-acid/3' : 'border-void-border'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 border ${canExtend ? 'border-acid/50 bg-acid/10' : 'border-void-border'}`}>
                        <Shield size={12} className={`${canExtend ? 'text-acid' : 'text-silver-dim'}`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-mono text-[9px] uppercase font-black text-silver">Protocol Maintenance</p>
                        <p className="font-mono text-[7px] text-silver-dim mt-0.5">
                          Step 00 — Reset all veMEZO to 4-yr max
                        </p>
                      </div>
                      {epoch.epochLocksExtended
                        ? <Badge variant="acid">Done</Badge>
                        : canExtend ? <Badge variant="orange">Ready</Badge>
                        : <Badge variant="muted">Waiting</Badge>}
                    </div>
                    <Button
                      variant={canExtend ? 'outline' : 'ghost'}
                      size="sm"
                      fullWidth
                      onClick={handleExtendLocks}
                      disabled={!canExtend || extendingLocks}
                      isLoading={extendingLocks}
                    >
                      extendLocks()
                    </Button>
                  </div>

                  {/* Cast Votes */}
                  <div className={`border p-4 space-y-3 transition-colors ${!epoch.epochVoted && epoch.timeUntilNextVote === 0 ? 'border-acid/50 bg-acid/3' : 'border-void-border'}`}>
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-void border border-void-border">
                        <RefreshCw size={12} className={`text-acid ${epoch.timeUntilNextVote === 0 && !epoch.epochVoted ? 'animate-spin' : ''}`} />
                      </div>
                      <div>
                        <p className="font-mono text-[9px] uppercase font-black text-silver">Cast System Votes</p>
                        <p className="font-mono text-[8px] text-silver-dim mt-0.5">
                          {epoch.epochVoted ? 'Voted this epoch' : epoch.timeUntilNextVote > 0
                            ? `Opens in ${formatTime(epoch.timeUntilNextVote)}`
                            : 'Open now — vote!'}
                        </p>
                      </div>
                      {epoch.epochVoted && <Badge variant="acid" className="ml-auto">Done</Badge>}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => setActiveModal('castVotes')}
                      disabled={epoch.epochVoted || epoch.timeUntilNextVote > 0}
                    >
                      castVotes()
                    </Button>
                  </div>

                  {/* Harvest */}
                  <div className={`border p-4 space-y-3 transition-colors ${epoch.epochVoted && !epoch.epochHarvested ? 'border-acid/50 bg-acid/3' : 'border-void-border'}`}>
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-void border border-void-border">
                        <Zap size={12} className="text-acid" />
                      </div>
                      <div>
                        <p className="font-mono text-[9px] uppercase font-black text-silver">Harvest & Distribute</p>
                        <p className="font-mono text-[8px] text-silver-dim mt-0.5">
                          Earn {stats.bountyBps / 100}% on MUSD harvested
                        </p>
                      </div>
                      {epoch.epochHarvested && <Badge variant="muted" className="ml-auto">Done</Badge>}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={() => setActiveModal('harvest')}
                      disabled={!epoch.epochVoted || epoch.epochHarvested}
                    >
                      harvestAndDistribute()
                    </Button>
                  </div>
                </div>
              </Panel>

              {/* ── Epoch Status ─────────────────────────────────── */}
              <Panel className="p-6">
                <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-4">Epoch Status</p>
                <StatRow label="Current Epoch"    value={`#${epoch.currentEpoch}`} />
                <StatRow label="Time Remaining"   value={formatTime(epoch.timeUntilNextVote)} />
                <StatRow label="Locks Extended"   value={epoch.epochLocksExtended ? '✓ Yes' : 'No'} accent={epoch.epochLocksExtended} />
                <StatRow label="Votes Cast"        value={epoch.epochVoted ? '✓ Yes' : 'No'}    accent={epoch.epochVoted} />
                <StatRow label="Harvested"         value={epoch.epochHarvested ? '✓ Yes' : 'No'} accent={epoch.epochHarvested} />
                <StatRow label="Keeper Bounty"     value={`${stats.bountyBps / 100}% MUSD`} />
              </Panel>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      <DepositModal
        isOpen={activeModal === 'deposit'}
        onClose={() => setActiveModal(null)}
        tokenIds={position.veMezoTokenIds}
        lockedAmounts={position.lockedAmounts}
        onDeposit={handleDeposit}
      />
      <WithdrawModal
        isOpen={activeModal === 'withdraw'}
        onClose={() => setActiveModal(null)}
        tokenIds={position.veMezoTokenIds}
        onWithdraw={handleWithdraw}
      />
      <StakeModal
        isOpen={activeModal === 'stake'}
        onClose={() => setActiveModal(null)}
        veByndBalance={position.veByndBalance}
        onStake={handleStake}
        onCheckAllowance={checkAllowance}
        onApprove={approveToken}
      />
      <UnstakeModal
        isOpen={activeModal === 'unstake'}
        onClose={() => setActiveModal(null)}
        stakedBalance={position.stakedBalance}
        onUnstake={handleUnstake}
      />
      <ClaimModal
        isOpen={activeModal === 'claim'}
        onClose={() => setActiveModal(null)}
        claimableMUSD={position.claimableMUSD}
        claimableMEZO={position.claimableMEZO}
        onClaim={handleClaim}
      />
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
      <ConnectModal
        isOpen={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnect={() => { connect(); setConnectOpen(false); }}
        isConnecting={isConnecting}
        error={null}
      />
    </div>
  );
}
