'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle2, ExternalLink, Copy, ArrowRight, ShieldCheck, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Input, StatRow, Divider, Badge } from '@/components/ui';
import type { ModalType, TxStatus } from '@/types';

// ── Modal Shell ───────────────────────────────────────────────────────────────

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, size = 'md' }) => {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx(
        'relative w-full bg-void-soft border border-void-border clip-corner animate-slide-up',
        widths[size]
      )}>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/50 to-transparent" />
        <div className="flex items-start justify-between p-6 border-b border-void-border">
          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] font-black text-silver">{title}</h3>
            {subtitle && <p className="text-[9px] font-mono text-silver-dim mt-1 uppercase tracking-widest">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-silver-dim hover:text-silver transition-colors p-1 -mr-1">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-void-border pointer-events-none" />
        <div className="absolute top-6 right-6 w-2 h-2 border-t border-r border-void-muted pointer-events-none" />
      </div>
    </div>
  );
};

// ── Tx Status Block ───────────────────────────────────────────────────────────

const TxBlock: React.FC<{ status: TxStatus }> = ({ status }) => {
  if (!status.type) return null;
  return (
    <div className={clsx(
      'flex items-center gap-3 p-4 border font-mono text-[10px] mt-4',
      status.type === 'loading' && 'border-void-border bg-void text-silver-dim',
      status.type === 'success' && 'border-acid/30 bg-acid/5 text-acid',
      status.type === 'error'   && 'border-red-500/30 bg-red-500/5 text-red-400',
    )}>
      {status.type === 'loading' && <div className="w-3 h-3 border border-silver-dim border-t-transparent rounded-full animate-spin" />}
      {status.type === 'success' && <CheckCircle2 size={14} />}
      {status.type === 'error'   && <AlertTriangle size={14} />}
      <span className="uppercase tracking-wider">{status.message}</span>
      {status.hash && (
        <a href={`https://explorer.test.mezo.org/tx/${status.hash}`} target="_blank" rel="noopener noreferrer"
           className="ml-auto flex items-center gap-1 text-acid hover:underline">
          Tx <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
};

// ── Connect Wallet Modal ──────────────────────────────────────────────────────

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (walletId: string) => void;
  isConnecting: boolean;
  error: string | null;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen, onClose, onConnect, isConnecting, error,
}) => {
  const wallets = [
    { id: 'mezo-passport', name: 'Mezo Passport', description: 'Native Mezo wallet — Xverse or Unisat', badge: 'Required', icon: '🛂' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Connect Wallet" subtitle="Choose your access method">
      <div className="space-y-3">
        {wallets.map(w => (
          <button
            key={w.id}
            onClick={() => onConnect(w.id)}
            disabled={isConnecting}
            className="w-full flex items-center justify-between p-4 border border-void-border hover:border-acid/40 hover:bg-acid/3 transition-all duration-200 group disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              <span className="text-2xl">{w.icon}</span>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-widest font-black text-silver">{w.name}</span>
                  {w.badge && <Badge variant="acid">{w.badge}</Badge>}
                </div>
                <span className="font-mono text-[9px] text-silver-dim">{w.description}</span>
              </div>
            </div>
            <ArrowRight size={14} className="text-silver-dim group-hover:text-acid transition-colors group-hover:translate-x-1 duration-200" />
          </button>
        ))}

        {error && (
          <div className="flex items-center gap-2 p-3 border border-red-500/30 bg-red-500/5">
            <AlertTriangle size={12} className="text-red-400" />
            <span className="font-mono text-[9px] text-red-400 uppercase tracking-wider">{error}</span>
          </div>
        )}

        <Divider label="Network" />

        <div className="p-3 border border-void-border bg-void space-y-1">
          <StatRow label="Testnet"  value="Mezo Matsnet" />
          <StatRow label="Chain ID" value="31611" />
          <StatRow label="RPC"      value="rpc.test.mezo.org" />
        </div>
      </div>
    </Modal>
  );
};

// ── Approve Modal ─────────────────────────────────────────────────────────────

interface ApproveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => Promise<void>;
  tokenName: string;
  spenderName: string;
  amount: string;
}

export const ApproveModal: React.FC<ApproveModalProps> = ({
  isOpen, onClose, onApprove, tokenName, spenderName, amount,
}) => {
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  const handleApprove = async () => {
    setStatus({ type: 'loading', message: 'Awaiting wallet confirmation...' });
    try {
      await onApprove();
      setStatus({ type: 'success', message: 'Approval confirmed' });
      setTimeout(onClose, 1500);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Approval failed' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Token Approval" subtitle="One-time signature required">
      <div className="space-y-6">
        <div className="p-4 border border-void-border bg-void space-y-1">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={14} className="text-acid" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold">Approval Details</span>
          </div>
          <StatRow label="Token"   value={tokenName} />
          <StatRow label="Spender" value={spenderName} />
          <StatRow label="Amount"  value={amount} accent />
        </div>
        <p className="font-mono text-[9px] text-silver-dim leading-relaxed uppercase tracking-wider">
          This allows the {spenderName} contract to transfer your {tokenName} tokens.
          You only need to do this once.
        </p>
        <TxBlock status={status} />
        <Button variant="primary" fullWidth onClick={handleApprove} isLoading={status.type === 'loading'}>
          Approve {tokenName}
        </Button>
      </div>
    </Modal>
  );
};

// ── Deposit Modal ─────────────────────────────────────────────────────────────

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenIds: number[];
  lockedAmounts?: Record<number, string>;
  onDeposit: (tokenId: number) => Promise<void>;
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose, tokenIds, lockedAmounts = {}, onDeposit }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus]     = useState<TxStatus>({ type: null, message: null });

  const handleDeposit = async () => {
    if (selected === null) return;
    setStatus({ type: 'loading', message: 'Locking veMEZO NFT...' });
    try {
      await onDeposit(selected);
      setStatus({ type: 'success', message: 'Locked — veBYND minted 1:1' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Deposit failed' });
    }
  };

  const displayIds = tokenIds; // real token IDs only — no mock fallback

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Lock & Mint veBYND" subtitle="Permanent 4-year lock · 1:1 veBYND minted">
      <div className="space-y-4">

        {/* Permanent lock warning */}
        <div className="p-3 border border-acid/20 bg-acid/3 flex gap-2">
          <Lock size={13} className="text-acid shrink-0 mt-0.5" />
          <p className="font-mono text-[9px] text-silver-dim uppercase tracking-wider leading-relaxed">
            <span className="text-acid font-bold">Permanent lock.</span> Your veMEZO NFT cannot be withdrawn.
            Exit via the <span className="text-silver font-bold">veBYND/MEZO pool</span> on Mezo Swap.
          </p>
        </div>

        <div className="space-y-2">
          {displayIds.length === 0 ? (
            <div className="p-6 border border-void-border text-center">
              <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">No veMEZO NFTs in wallet</p>
            </div>
          ) : displayIds.map(id => (
            <button
              key={id}
              onClick={() => setSelected(id)}
              className={clsx(
                'w-full flex items-center justify-between p-4 border transition-all duration-200',
                selected === id ? 'border-acid/60 bg-acid/5' : 'border-void-border hover:border-void-muted'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx(
                  'w-4 h-4 border transition-colors',
                  selected === id ? 'border-acid bg-acid' : 'border-void-muted'
                )} />
                <div className="text-left">
                  <span className="font-mono text-[10px] font-black text-silver uppercase">veMEZO #{id}</span>
                  <p className="font-mono text-[8px] text-silver-dim">{lockedAmounts[id] ? `~${parseFloat(lockedAmounts[id]).toLocaleString()} MEZO locked · extended to 4yr` : 'Loading...'}</p>
                </div>
              </div>
              <span className="font-mono text-xs font-bold text-acid">{lockedAmounts[id] ? `${parseFloat(lockedAmounts[id]).toLocaleString()} veBYND` : '...'}</span>
            </button>
          ))}
        </div>

        <div className="p-3 border border-void-border bg-void">
          <StatRow label="You Receive"    value={selected !== null && lockedAmounts[selected] ? `${parseFloat(lockedAmounts[selected]).toLocaleString()} veBYND` : '–'} accent={!!selected} />
          <StatRow label="Lock Duration"  value="4 Years (max, permanent)" />
          <StatRow label="Protocol Fee"   value="None (on deposit)" />
        </div>

        <TxBlock status={status} />

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleDeposit}
                  disabled={selected === null} isLoading={status.type === 'loading'}>
            Lock & Mint veBYND
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ── Withdraw Modal (disabled — permanent lock) ────────────────────────────────

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenIds: number[];
  onWithdraw: (tokenId: number) => Promise<void>;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose, tokenIds, onWithdraw }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Withdrawal Unavailable" subtitle="Permanent lock protocol">
      <div className="space-y-4">
        <div className="p-4 border border-orange-500/20 bg-orange-500/5 flex gap-3">
          <AlertTriangle size={16} className="text-orange-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-black text-orange-400 uppercase tracking-wider">
              veMEZO is permanently locked
            </p>
            <p className="font-mono text-[9px] text-orange-400/80 leading-relaxed uppercase tracking-wider">
              BynD permanently locks all deposited veMEZO to the 4-year maximum to maintain 100% governance weight.
              There is no withdrawal function by design.
            </p>
          </div>
        </div>

        <div className="p-4 border border-acid/20 bg-acid/3 space-y-2">
          <p className="font-mono text-[9px] font-black text-acid uppercase tracking-wider">Your exit path: veBYND/MEZO pool</p>
          <p className="font-mono text-[9px] text-silver-dim leading-relaxed uppercase tracking-wider">
            Unstake your veBYND from the Staking Terminal, then sell it on the veBYND/MEZO liquidity pool
            on Mezo Swap. BynD seeds this pool at launch to guarantee exit liquidity at market price.
          </p>
        </div>

        <Button variant="ghost" fullWidth onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
};

// ── Stake Modal ───────────────────────────────────────────────────────────────

interface StakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  veByndBalance: string;
  onStake: (amount: string) => Promise<void>;
  onCheckAllowance: (amount: string) => Promise<boolean>;
  onApprove: (amount: string) => Promise<void>;
}

export const StakeModal: React.FC<StakeModalProps> = ({
  isOpen, onClose, veByndBalance, onStake, onCheckAllowance, onApprove,
}) => {
  const [amount, setAmount]       = useState('');
  const [status, setStatus]       = useState<TxStatus>({ type: null, message: null });

  const checkAndStake = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setStatus({ type: 'loading', message: 'Checking allowance...' });
    try {
      const approved = await onCheckAllowance(amount);
      if (!approved) {
        setStatus({ type: 'loading', message: 'Approving veBYND...' });
        await onApprove(amount);
      }
      setStatus({ type: 'loading', message: 'Staking veBYND...' });
      await onStake(amount);
      setStatus({ type: 'success', message: 'Staked — MUSD yield now active' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Staking failed' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stake veBYND" subtitle="Activate MUSD + MEZO yield">
      <div className="space-y-4">
        <Input
          label="Amount"
          hint={`Available: ${parseFloat(veByndBalance || '0').toFixed(2)} veBYND`}
          value={amount}
          onChange={setAmount}
          type="number"
          placeholder="0.00"
          max={veByndBalance}
        />

        <div className="p-3 border border-void-border bg-void">
          <StatRow label="Protocol APR"    value="~31.2%"        accent />
          <StatRow label="Reward Tokens"   value="MUSD + MEZO" />
          <StatRow label="Sources"         value="MUSD Bribes" />
          <StatRow label="Unbonding"       value="None" />
        </div>

        <TxBlock status={status} />

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={checkAndStake}
                  disabled={!amount || parseFloat(amount) <= 0}
                  isLoading={status.type === 'loading'}>
            Stake veBYND
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ── Unstake Modal ─────────────────────────────────────────────────────────────

interface UnstakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  stakedBalance: string;
  onUnstake: (amount: string) => Promise<void>;
}

export const UnstakeModal: React.FC<UnstakeModalProps> = ({ isOpen, onClose, stakedBalance, onUnstake }) => {
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  const handleUnstake = async () => {
    setStatus({ type: 'loading', message: 'Unstaking veBYND...' });
    try {
      await onUnstake(amount);
      setStatus({ type: 'success', message: 'Unstaked — veBYND returned to wallet' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Unstake failed' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Unstake veBYND" subtitle="Returns veBYND to wallet · stops yield">
      <div className="space-y-4">
        <Input
          label="Amount"
          hint={`Staked: ${parseFloat(stakedBalance || '0').toFixed(2)} veBYND`}
          value={amount}
          onChange={setAmount}
          type="number"
          placeholder="0.00"
          max={stakedBalance}
        />
        <p className="font-mono text-[9px] text-silver-dim uppercase tracking-wider leading-relaxed">
          After unstaking, sell veBYND on the <span className="text-acid">veBYND/MEZO pool</span> on Mezo Swap for exit liquidity.
        </p>
        <TxBlock status={status} />
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="outline" className="flex-1" onClick={handleUnstake}
                  disabled={!amount || parseFloat(amount) <= 0}
                  isLoading={status.type === 'loading'}>
            Unstake
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ── Claim Modal ───────────────────────────────────────────────────────────────

interface ClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  claimableMUSD: string;
  claimableMEZO: string;
  onClaim: () => Promise<void>;
}

export const ClaimModal: React.FC<ClaimModalProps> = ({
  isOpen, onClose, claimableMUSD, claimableMEZO, onClaim,
}) => {
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  const handleClaim = async () => {
    setStatus({ type: 'loading', message: 'Claiming rewards...' });
    try {
      await onClaim();
      setStatus({ type: 'success', message: 'MUSD rewards claimed to wallet' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Claim failed' });
    }
  };

  const totalUSD = (
    parseFloat(claimableMUSD || '0') +
    parseFloat(claimableMEZO || '0') * 0.08
  ).toFixed(2);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Claim MUSD Yield" subtitle="MUSD bribes · pro-rata share">
      <div className="space-y-4">
        <div className="p-6 border border-acid/20 bg-acid/3 space-y-4">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">MUSD Rewards</p>
            <p className="text-3xl font-black text-acid">{parseFloat(claimableMUSD || '0').toFixed(2)}</p>
            <p className="font-mono text-[7px] text-silver-dim mt-0.5">From MUSD bribes captured each epoch</p>
          </div>
          <div>
            <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">MEZO Rewards</p>
            <p className="text-xl font-bold text-silver">{parseFloat(claimableMEZO || '0').toFixed(4)}</p>
          </div>
          <Divider />
          <StatRow label="Est. Total Value" value={`~$${totalUSD}`} accent />
        </div>
        <TxBlock status={status} />
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleClaim}
                  disabled={parseFloat(claimableMUSD) === 0 && parseFloat(claimableMEZO) === 0}
                  isLoading={status.type === 'loading'}>
            Claim All Rewards
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ── Cast Votes Modal ──────────────────────────────────────────────────────────

interface CastVotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalPower: string;
  gauges: { name: string; weightBps: number }[];
  epochVoted: boolean;
  timeUntilNextVote: number;
  onCastVotes: () => Promise<void>;
}

export const CastVotesModal: React.FC<CastVotesModalProps> = ({
  isOpen, onClose, totalPower, gauges, epochVoted, timeUntilNextVote, onCastVotes,
}) => {
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });

  const handleCast = async () => {
    setStatus({ type: 'loading', message: 'Casting votes on-chain...' });
    try {
      await onCastVotes();
      setStatus({ type: 'success', message: 'Votes cast — veBTC gauges activated' });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'castVotes() failed' });
    }
  };

  const canVote = timeUntilNextVote === 0 && !epochVoted;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cast System Votes" subtitle="Permissionless — earn keeper bounty">
      <div className="space-y-4">
        {!canVote && (
          <div className="p-3 border border-orange-500/20 bg-orange-500/5 flex gap-2">
            <AlertTriangle size={14} className="text-orange-400 shrink-0" />
            <p className="font-mono text-[9px] text-orange-400 uppercase tracking-wider leading-relaxed">
              {epochVoted ? 'Votes already cast this epoch.' : `Epoch opens in ${timeUntilNextVote}s.`}
            </p>
          </div>
        )}

        <div className="p-3 border border-void-border bg-void">
          <StatRow label="Total veMEZO Power" value={totalPower} accent />
          <StatRow label="Target Gauges"       value={`${gauges.length} veBTC positions`} />
        </div>

        <div className="space-y-2">
          {gauges.map((g, i) => (
            <div key={i} className="flex justify-between items-center p-3 border border-void-border">
              <span className="font-mono text-[9px] uppercase tracking-wider text-silver">{g.name}</span>
              <span className="font-mono text-[10px] font-bold text-acid">{(g.weightBps / 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>

        <TxBlock status={status} />

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleCast}
                  disabled={!canVote} isLoading={status.type === 'loading'}>
            Cast Votes
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ── Harvest Modal ─────────────────────────────────────────────────────────────

interface HarvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingIncentives: string;
  bountyBps: number;
  epochVoted: boolean;
  epochHarvested: boolean;
  onHarvest: () => Promise<void>;
}

export const HarvestModal: React.FC<HarvestModalProps> = ({
  isOpen, onClose, pendingIncentives, bountyBps, epochVoted, epochHarvested, onHarvest,
}) => {
  const [status, setStatus] = useState<TxStatus>({ type: null, message: null });
  const bounty = (parseFloat(pendingIncentives.replace(/[$,]/g, '')) * bountyBps / 10000).toFixed(2);

  const handleHarvest = async () => {
    setStatus({ type: 'loading', message: 'Harvesting MUSD from gauges...' });
    try {
      await onHarvest();
      setStatus({ type: 'success', message: `Harvested — your bounty: ${bounty} MUSD` });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'harvestAndDistribute() failed' });
    }
  };

  const canHarvest = epochVoted && !epochHarvested;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Harvest & Distribute" subtitle="Claim keeper bounty · Forward MUSD to stakers">
      <div className="space-y-4">
        {!epochVoted && (
          <div className="p-3 border border-orange-500/20 bg-orange-500/5 flex gap-2">
            <AlertTriangle size={14} className="text-orange-400 shrink-0" />
            <p className="font-mono text-[9px] text-orange-400 uppercase tracking-wider">castVotes() must be called before harvesting.</p>
          </div>
        )}
        {epochHarvested && (
          <div className="p-3 border border-void-border flex gap-2">
            <CheckCircle2 size={14} className="text-acid shrink-0" />
            <p className="font-mono text-[9px] text-acid uppercase tracking-wider">Already harvested this epoch.</p>
          </div>
        )}

        <div className="p-4 border border-void-border bg-void space-y-1">
          <StatRow label="Pending Incentives" value={pendingIncentives}   accent />
          <StatRow label="Your Keeper Bounty" value={`~${bounty} MUSD`} accent />
          <StatRow label="Bounty Rate"        value={`${bountyBps / 100}% of harvest`} />
          <StatRow label="Remainder"          value="→ veBYND stakers (pro-rata)" />
        </div>

        <TxBlock status={status} />

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleHarvest}
                  disabled={!canHarvest} isLoading={status.type === 'loading'}>
            Harvest Now
          </Button>
        </div>
      </div>
    </Modal>
  );
};
