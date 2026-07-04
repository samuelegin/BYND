import { Zap, Shield, TrendingUp, Lock } from 'lucide-react';

export const TICKER_ITEMS = [
  'Mezo Matsnet Testnet',
  'Liquid Boost Layer',
  'veBYND: Liquid veMEZO',
  'MUSD Native Rewards',
  'Keeper Bounties: 1%',
  'Multi-Token Bribe Harvest',
  'veBYND/MEZO Pool: Live',
  'Target Boost Efficiency: 98%',
  'Epoch-based Routing',
  'Permanent 4-Year Lock',
  'Rebase Auto-Compounding',
  'Permissionless Keepers',
];

export const STEPS = [
  {
    num: '01',
    title: 'Lock & Mint veBYND',
    body: 'Deposit your veMEZO NFT into the BynD Vault. The protocol permanently locks it for the 4-year maximum to secure maximum boost weight. You instantly receive veBYND 1:1 — a fully liquid ERC-20.',
    icon: Shield,
    tag: 'Vault',
    img: '/images/step-lock.png',
  },
  {
    num: '02',
    title: 'Stake veBYND',
    body: 'Stake your veBYND into the Reward Engine. All bribe tokens harvested from gauges flow here — any ERC-20, not just MUSD. Your share is pro-rata to staked balance.',
    icon: Zap,
    tag: 'Staking',
    img: '/images/step-deposit.png',
  },
  {
    num: '03',
    title: 'Earn & Exit',
    body: 'Claim your yield every epoch. When you want to exit, unstake veBYND and sell it on the veBYND/MEZO pool on Mezo Swap. No withdrawal needed — the underlying stays locked, your liquidity doesn\'t.',
    icon: TrendingUp,
    tag: 'Yield',
    img: '/images/step-deposit.png',
  },
];

export const REVENUE_STREAMS = [
  {
    icon: Lock,
    title: 'Gauge Bribes',
    tag: 'Multi-token',
    body: 'Protocols post ERC-20 incentives on gauges to attract veMEZO boost. BynD pools all deposited veMEZO into one optimised boost block and targets the highest bribe gauges — sweeping every token, not just MUSD.',
  },
  {
    icon: Zap,
    title: 'veMEZO Rebase',
    tag: 'Auto-compounds',
    body: "Each epoch, Mezo's RewardsDistributor pays a rebase to all veMEZO holders. BynD calls claimRebases() to compound it back into each NFT's locked balance — growing boost power without any liquid payout.",
  },
  {
    icon: TrendingUp,
    title: 'Keeper Bounties',
    tag: '1% per harvest',
    body: 'Anyone can trigger the four epoch keeper steps — claimRebases, extendLocks, castVotes, harvestAndDistribute — and earn 1% of every token harvested as a bounty. Permissionless.',
  },
];

export const COMPARE = [
  { label: 'Solo boost power', value: '< 0.01%', bad: true },
  { label: 'BynD aggregated block', value: 'Pooled (growing)', bad: false },
  { label: 'Solo bribe capture', value: 'Minimal / ignored', bad: true },
  { label: 'BynD bribe capture', value: 'Any token, optimised', bad: false },
  { label: 'Solo rebase claiming', value: 'Manual, often missed', bad: true },
  { label: 'BynD rebase', value: 'Auto-compounds in NFT', bad: false },
  { label: 'Solo exit from lock', value: 'Wait 4 years', bad: true },
  { label: 'veBYND exit liquidity', value: 'Instant via swap', bad: false },
];

export const EPOCH_STEPS = [
  {
    num: '00',
    fn: 'claimRebases()',
    who: 'Keeper',
    note: 'Compounds veMEZO rebase — no epoch gate',
  },
  {
    num: '01',
    fn: 'extendLocks()',
    who: 'Keeper',
    note: 'Resets all positions to 4yr max',
  },
  {
    num: '02',
    fn: 'castVotes()',
    who: 'Keeper',
    note: 'Routes boost power to best gauges',
  },
  {
    num: '03',
    fn: 'harvestAndDistribute()',
    who: 'Keeper',
    note: 'Sweeps bribes to stakers, 1% to caller',
  },
];
