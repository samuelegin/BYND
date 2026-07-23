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
  // claimAll: claims all reward tokens in one tx — this is the ONLY claim
  // function on v2. claimRewards()/claimableMUSD() from v1 no longer exist.
  { name: 'claimAll',      type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    name: 'notifyRewardAmount', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  { name: 'stakedBalance',    type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }],     outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalStaked',      type: 'function', stateMutability: 'view', inputs: [],                                  outputs: [{ name: '', type: 'uint256' }] },
  // claimable: per-token claimable balance — replaces v1's claimableMUSD,
  // now requires the token address since v2 supports multiple reward tokens.
  {
    name: 'claimable', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }, { name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // claimableAll: every pending reward across every registered token in one call
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
  // castVotes() was renamed to optimiseAndVote() in v2 — it now also falls
  // back to auto-selecting the best live gauge if governance hasn't
  // configured one explicitly (see setGauges below).
  { name: 'optimiseAndVote',      type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'harvestAndDistribute', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'markLocksExtended',    type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'currentEpoch',         type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'epochDuration',        type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'bountyBps',            type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  // protocolFeeBps: new in v2, the fee taken off the top before the staker
  // split. Not yet displayed anywhere in the UI — worth surfacing.
  { name: 'protocolFeeBps',       type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'timeUntilNextVote',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'lastVoteTimestamp',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getGaugeCount',        type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'previewOptimalGauge', type: 'function', stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'bestGauge',     type: 'address' },
      { name: 'bestClaimable', type: 'uint256' },
    ],
  },
  { name: 'epochVoted',           type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'epochHarvested',       type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'epochLocksExtended',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'minHarvestThreshold',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    name: 'gauges', type: 'function', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    // Solidity auto-generated getters omit dynamic-array fields from structs,
    // so the real Gauge.tokens[] field is NOT part of this return tuple —
    // this 4-value shape is correct, not a simplification.
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
  { name: 'tokenOfOwnerByIndex', type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],           outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',             type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],             outputs: [] },
  { name: 'locked',              type: 'function', stateMutability: 'view',       inputs: [{ name: 'tokenId', type: 'uint256' }],                                             outputs: [{ name: 'amount', type: 'int128' }, { name: 'end', type: 'uint256' }, { name: 'isPermanent', type: 'bool' }] },
  { name: 'unlockPermanent',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }],                                             outputs: [] },
] as const;

export const ERC20_ABI = [
  { name: 'balanceOf',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }],                                           outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view',       inputs: [],                                                                                outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],      outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance',   type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],       outputs: [{ name: '', type: 'uint256' }] },
  { name: 'symbol',      type: 'function', stateMutability: 'view',       inputs: [],                                                                                outputs: [{ name: '', type: 'string' }] },
] as const;

// ── Matsnet BoostVoter ABI ──────────────────────────────────────────────────
// Confirmed live on explorer (read_proxy) + hardhat probe against
// 0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1 on 2026-07-22: periodFinish,
// activePeriod, epochVoteEnd, EPOCH_DURATION do NOT exist on this contract
// (all reverted). The real functions are epochStart(timestamp) and
// epochNext(timestamp) — pure Velodrome-style calendar math, no stored
// counter: epochStart(t) = t - (t % WEEK), epochNext(t) = epochStart(t) + WEEK.
export const VALIDATORS_VOTER_ABI = [
  { name: 'epochStart', type: 'function', stateMutability: 'view', inputs: [{ name: '_timestamp', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'epochNext',  type: 'function', stateMutability: 'view', inputs: [{ name: '_timestamp', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const VALIDATORS_VOTER_ADDRESS = '0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1' as const;
