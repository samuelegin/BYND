import type { GaugeAllocation, EpochHistoryEntry } from '@/types';
import { MATSNET_CHAIN_ID } from '@/lib/passport';

export { MATSNET_CHAIN_ID };
export const SUPPORTED_CHAIN_IDS = [MATSNET_CHAIN_ID];

// ── Addresses ─────────────────────────────────────────────────────────────
const MATSNET_ADDRESSES = {
  ByNdVault:   (import.meta.env.VITE_MATSNET_VAULT    ?? '') as `0x${string}`,
  ByNdStaking: (import.meta.env.VITE_MATSNET_STAKING  ?? '') as `0x${string}`,
  ByNdVoter:   (import.meta.env.VITE_MATSNET_VOTER    ?? '') as `0x${string}`,
  VeBYND:      (import.meta.env.VITE_MATSNET_VEBYND   ?? '') as `0x${string}`,
  VeMEZO:      (import.meta.env.VITE_MATSNET_VEMEZO   ?? '0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b') as `0x${string}`,
};

export function getAddresses(_chainId?: number) {
  return MATSNET_ADDRESSES;
}

export function isDeployed(addr: string | undefined): boolean {
  return !!addr && addr !== '' && addr !== '0x0000000000000000000000000000000000000000';
}

export const EMPTY_GAUGES: GaugeAllocation[] = [];
export const EMPTY_EPOCH_HISTORY: EpochHistoryEntry[] = [];

// ── ABIs ──────────────────────────────────────────────────────────────────

export const VAULT_ABI = [
  { name: 'deposit',             type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  { name: 'extendLocks',         type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  // claimRebases: compounds veMEZO rebase back into each NFT (increases voting power)
  { name: 'claimRebases',        type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'totalClaimed', type: 'uint256' }] },
  { name: 'totalVotingPower',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalLockedMEZO',     type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalPendingRebase',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalDeposited',      type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getUserTokens',       type: 'function', stateMutability: 'view',       inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'uint256[]' }] },
  { name: 'lastExtendTimestamp', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const STAKING_ABI = [
  { name: 'stake',         type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'unstake',       type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  // claimAll: claims all reward tokens (MUSD + any bribe tokens) in one tx
  { name: 'claimAll',      type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  // claimRewards: legacy alias for claimAll — kept for backward compat
  { name: 'claimRewards',  type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  // notifyRewardAmount now takes (token, amount) — multi-token support
  {
    name: 'notifyRewardAmount', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  { name: 'stakedBalance',    type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }],     outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalStaked',      type: 'function', stateMutability: 'view', inputs: [],                                  outputs: [{ name: '', type: 'uint256' }] },
  // claimableMUSD: legacy view — returns pending balance of the first reward token (MUSD)
  { name: 'claimableMUSD',    type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }],     outputs: [{ name: '', type: 'uint256' }] },
  // claimableAll: returns all pending rewards across every registered token
  {
    name: 'claimableAll', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'tokens',  type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
  },
  { name: 'rewardTokenCount', type: 'function', stateMutability: 'view', inputs: [],                                  outputs: [{ name: '', type: 'uint256' }] },
  { name: 'rewardTokens',     type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }],     outputs: [{ name: '', type: 'address' }] },
] as const;

export const VOTER_ABI = [
  { name: 'castVotes',            type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'harvestAndDistribute', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'markLocksExtended',    type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'currentEpoch',         type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'epochDuration',        type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'bountyBps',            type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'timeUntilNextVote',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'lastVoteTimestamp',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getPendingIncentives', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getGaugeCount',        type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'epochVoted',           type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'epochHarvested',       type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'epochLocksExtended',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'minHarvestThreshold',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'gauges', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    // bribe field added — needed for harvestAndDistribute multi-token display
    outputs: [
      { name: 'gauge',     type: 'address' },
      { name: 'bribe',     type: 'address' },
      { name: 'name',      type: 'string'  },
      { name: 'weightBps', type: 'uint256' },
    ],
  },
] as const;

export const VEMEZO_ABI = [
  { name: 'balanceOf',           type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner',   type: 'address' }],                                             outputs: [{ name: '', type: 'uint256' }] },
  { name: 'ownerOf',             type: 'function', stateMutability: 'view',       inputs: [{ name: 'tokenId', type: 'uint256' }],                                             outputs: [{ name: '', type: 'address' }] },
  // tokenOfOwnerByIndex: needed to enumerate which NFT IDs a user holds
  { name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],           outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',             type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],             outputs: [] },
  { name: 'locked',              type: 'function', stateMutability: 'view',       inputs: [{ name: 'tokenId', type: 'uint256' }],                                             outputs: [{ name: 'amount', type: 'int128' }, { name: 'end', type: 'uint256' }, { name: 'isPermanent', type: 'bool' }] },
  // unlockPermanent: converts a permanent lock back to a 4-year time-based lock so the vault can accept it
  { name: 'unlockPermanent',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }],                                             outputs: [] },
] as const;

export const ERC20_ABI = [
  { name: 'balanceOf',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }],                                           outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view',       inputs: [],                                                                                outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],      outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],       outputs: [{ name: '', type: 'uint256' }] },
  { name: 'symbol',      type: 'function', stateMutability: 'view',       inputs: [],                                                                                outputs: [{ name: '', type: 'string' }] },
] as const;

// ── Matsnet ValidatorsVoter ABI ────────────────────────────────────────────
export const VALIDATORS_VOTER_ABI = [
  { name: 'periodFinish',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'activePeriod',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'epochVoteEnd',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'EPOCH_DURATION', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const VALIDATORS_VOTER_ADDRESS = '0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1' as const;
