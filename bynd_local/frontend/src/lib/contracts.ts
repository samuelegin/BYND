import type { GaugeAllocation, EpochHistoryEntry } from '@/types';
import { MATSNET_CHAIN_ID, LOCALHOST_CHAIN_ID } from '@/lib/passport';

export { MATSNET_CHAIN_ID, LOCALHOST_CHAIN_ID };
export const SUPPORTED_CHAIN_IDS = [MATSNET_CHAIN_ID, LOCALHOST_CHAIN_ID];

// ── Addresses ─────────────────────────────────────────────────────────────
// LOCALHOST: populated automatically from .env.local after running:
//   npm run deploy:local   (in /contracts)
//   node scripts/sync-addresses.js
//
// MATSNET: fill in manually after:
//   npm run deploy:matsnet

const LOCALHOST_ADDRESSES = {
  ByNdVault:   (process.env.NEXT_PUBLIC_LOCAL_VAULT    ?? '') as `0x${string}`,
  ByNdStaking: (process.env.NEXT_PUBLIC_LOCAL_STAKING  ?? '') as `0x${string}`,
  ByNdVoter:   (process.env.NEXT_PUBLIC_LOCAL_VOTER    ?? '') as `0x${string}`,
  VeBYND:      (process.env.NEXT_PUBLIC_LOCAL_VEBYND   ?? '') as `0x${string}`,
  VeMEZO:      (process.env.NEXT_PUBLIC_LOCAL_VEMEZO   ?? '') as `0x${string}`,
};

const MATSNET_ADDRESSES = {
  ByNdVault:   '' as `0x${string}`,
  ByNdStaking: '' as `0x${string}`,
  ByNdVoter:   '' as `0x${string}`,
  VeBYND:      '' as `0x${string}`,
  VeMEZO:      '0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b' as `0x${string}`,
};

export function getAddresses(chainId: number) {
  return chainId === LOCALHOST_CHAIN_ID ? LOCALHOST_ADDRESSES : MATSNET_ADDRESSES;
}

export function isDeployed(addr: string | undefined): boolean {
  return !!addr && addr !== '' && addr !== '0x0000000000000000000000000000000000000000';
}

export const EMPTY_GAUGES: GaugeAllocation[] = [];
export const EMPTY_EPOCH_HISTORY: EpochHistoryEntry[] = [];

// ── ABIs ──────────────────────────────────────────────────────────────────

export const VAULT_ABI = [
  { name: 'deposit',          type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  { name: 'extendLocks',      type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'totalVotingPower', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalLockedMEZO',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'depositedTokens',  type: 'function', stateMutability: 'view',       inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256[]' }] },
] as const;

export const STAKING_ABI = [
  { name: 'stake',           type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'unstake',         type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'claimRewards',    type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'notifyRewardAmount', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'stakedBalance',   type: 'function', stateMutability: 'view',       inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'claimableMUSD',   type: 'function', stateMutability: 'view',       inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'claimableMEZO',   type: 'function', stateMutability: 'view',       inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalStaked',     type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const VOTER_ABI = [
  { name: 'castVotes',            type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'harvestAndDistribute', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'markLocksExtended',    type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'currentEpoch',         type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'epochDuration',        type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'bountyBps',            type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'timeUntilNextVote',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getPendingIncentives', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getGaugeCount',        type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'epochVoted',           type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'epochHarvested',       type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'epochLocksExtended',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'minHarvestThreshold',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'gauges', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: 'gauge', type: 'address' }, { name: 'name', type: 'string' }, { name: 'weightBps', type: 'uint256' }],
  },
] as const;

export const VEMEZO_ABI = [
  { name: 'balanceOf',           type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',             type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
  { name: 'locked',              type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: 'amount', type: 'int128' }, { name: 'end', type: 'uint256' }] },
] as const;

export const ERC20_ABI = [
  { name: 'balanceOf',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;
