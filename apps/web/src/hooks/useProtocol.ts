'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useReadContract, useReadContracts, usePublicClient } from 'wagmi';
import { formatEther, type Address } from 'viem';
import type { ProtocolStats, EpochState, UserPosition, GaugeAllocation } from '@/types';
import {
  VAULT_ABI, STAKING_ABI, VOTER_ABI, VEMEZO_ABI, ERC20_ABI,
  VALIDATORS_VOTER_ABI, VALIDATORS_VOTER_ADDRESS,
  getAddresses, isDeployed, SUPPORTED_CHAIN_IDS,
} from '@/lib/contracts';
import { MATSNET_CHAIN_ID } from '@/lib/passport';

const EMPTY_STATS: ProtocolStats = {
  totalVotingPower: '–', tvl: '–', veByndSupply: '–', totalStaked: '–',
  bountyBps: 100, pendingIncentives: '–', rewardTokenSymbol: '…',
  activeStakers: 0, avgApr: '–', boostEfficiency: 98,
};
const WEEK = 7 * 24 * 3600;
const VOTE_WINDOW = 4 * 3600; // matches ByNdVoter's voteWindow (4 hours)
const EXTEND_COOLDOWN = 7 * 24 * 3600; // matches ByNdVault.EXTEND_COOLDOWN
// Confirmed anchor: BoostVoter.epochNext() returned 1784764800 (2026-07-23
// 00:00:00 UTC, an exact multiple of WEEK) when read live on Matsnet on
// 2026-07-22 — that's Mezo's own numbered epoch #31's end. Anchoring here
// instead of a raw floor(now/WEEK) is what turns "#2950" into "#31".
const EPOCH_31_START = 1784332800; // 2026-07-16T00:00:00Z
const MEZO_EPOCH_AT_ANCHOR = 31;

const mezoEpochNumber = (epochStartTs: number): number =>
  MEZO_EPOCH_AT_ANCHOR + Math.round((epochStartTs - EPOCH_31_START) / WEEK);

const EMPTY_EPOCH: EpochState = {
  currentEpoch: 0, displayEpoch: mezoEpochNumber(Math.floor(Date.now() / 1000 / WEEK) * WEEK),
  timeUntilNextVote: 604800, epochEndsIn: 604800, epochVoted: false,
  epochHarvested: false, epochLocksExtended: false,
  // Use current time as a safe default so the countdown shows a full epoch
  // rather than 0 while the contract read is still in-flight.
  lastVoteTimestamp: Math.floor(Date.now() / 1000),
  epochDuration: 604800,
  mezoEpochEndsAt: 0,
  mezoVoteWindowOpensAt: 0,
  clockDrifted: false,
  extendCooldownEndsAt: 0,
  canExtendLocks: false,
};
const EMPTY_POSITION: UserPosition = {
  veMezoTokenIds: [], lockedAmounts: {}, permanentIds: [], veByndBalance: '0',
  stakedBalance: '0', claimableRewards: [],
};

export function useProtocol(
  address:  Address | undefined,
  chainId:  number  | undefined,
) {
  const [stats,    setStats]    = useState<ProtocolStats>(EMPTY_STATS);
  const [epoch,    setEpoch]    = useState<EpochState>(EMPTY_EPOCH);
  const [position, setPosition] = useState<UserPosition>(EMPTY_POSITION);
  const [gauges,   setGauges]   = useState<GaugeAllocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  const isCorrectNetwork = !!chainId && SUPPORTED_CHAIN_IDS.includes(chainId);
  const networkError     = !isCorrectNetwork && !!chainId
    ? `Wrong network (chainId ${chainId}). Switch to Mezo Matsnet (chainId 31611).`
    : null;

  const addrs             = getAddresses(chainId ?? MATSNET_CHAIN_ID);
  const contractsDeployed = isDeployed(addrs.ByNdVault) && isDeployed(addrs.ByNdVoter);

  const enabled          = isCorrectNetwork;
  const contractsEnabled = enabled && contractsDeployed;
  // Public client for read-only on-chain queries (Matsnet)
  const publicClient  = usePublicClient({ chainId: MATSNET_CHAIN_ID });
  // Allow read-only analytics when there's a public client (no wallet connected)
  const publicClientAvailable = !!publicClient;
  const readOnlyContractsEnabled = publicClientAvailable && contractsDeployed;

  // ── 1. veMEZO NFT count (still use balanceOf to know if user has any) ────
  const { data: nftCount, refetch: refetchNftCount } = useReadContract({
    address:      addrs.VeMEZO as Address,
    abi:          VEMEZO_ABI,
    functionName: 'balanceOf',
    args:         [address!],
    query:        { enabled: !!address && (enabled || publicClientAvailable) && isDeployed(addrs.VeMEZO), refetchInterval: 15_000 },
  });

  // ── 2. Token IDs — VotingEscrow has no ERC721Enumerable, scan via ownerOf ─
  // Strategy: get totalSupply to know the ceiling, then check ownerOf(1..total)
  const { data: veMezoSupply } = useReadContract({
    address:      addrs.VeMEZO as Address,
    abi:          [{ name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const,
    functionName: 'totalSupply',
    query:        { enabled: !!address && (enabled || publicClientAvailable) && isDeployed(addrs.VeMEZO), refetchInterval: 15_000 },
  });

  const [ownedTokenIds, setOwnedTokenIds] = useState<number[]>([]);
  const fetchingRef = useRef(false);

  const fetchTokenIds = useCallback(async () => {
    if (!address || !publicClient || !isDeployed(addrs.VeMEZO)) {
      console.log('[BYND] fetchTokenIds skip:', { address: !!address, publicClient: !!publicClient, deployed: isDeployed(addrs.VeMEZO) });
      return;
    }
    if (!nftCount || Number(nftCount) === 0) {
      console.log('[BYND] nftCount is 0, skipping scan');
      setOwnedTokenIds([]);
      return;
    }
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsScanning(true);

    console.log('[BYND] fetchTokenIds start', { address, veMEZO: addrs.VeMEZO, nftCount: Number(nftCount), veMezoSupply: veMezoSupply ? Number(veMezoSupply) : 'unknown' });

    try {
      // ── Direct probe: try ownerOf(664) which MetaMask shows as the known token
      try {
        const knownOwner = await publicClient.readContract({
          address: addrs.VeMEZO as Address, abi: VEMEZO_ABI,
          functionName: 'ownerOf', args: [BigInt(664)],
        });
        console.log('[BYND] ownerOf(664) =', knownOwner, '| wallet =', address, '| match =', (knownOwner as string).toLowerCase() === address.toLowerCase());
      } catch (e) { console.log('[BYND] ownerOf(664) threw:', e); }

      const total = veMezoSupply ? Number(veMezoSupply) : 1000;
      const BATCH = 20;
      const found: number[] = [];

      console.log('[BYND] scanning ownerOf 1 to', total, 'in batches of', BATCH);

      for (let start = 1; start <= total && found.length < Number(nftCount); start += BATCH) {
        const end = Math.min(start + BATCH - 1, total);
        const ids = Array.from({ length: end - start + 1 }, (_, i) => start + i);

        const results = await Promise.allSettled(
          ids.map(id =>
            publicClient.readContract({
              address:      addrs.VeMEZO as Address,
              abi:          VEMEZO_ABI,
              functionName: 'ownerOf',
              args:         [BigInt(id)],
            })
          )
        );

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === 'fulfilled') {
            const owner = (r.value as string).toLowerCase();
            if (owner === address.toLowerCase()) {
              console.log('[BYND] found token', ids[i], 'owned by', address);
              found.push(ids[i]);
            }
          }
        }

        if (start === 1) console.log('[BYND] first batch done, found so far:', found);
      }

      console.log('[BYND] scan complete, owned:', found);
      setOwnedTokenIds(found);
    } catch (e) {
      console.error('[BYND] fetchTokenIds error:', e);
    } finally {
      fetchingRef.current = false;
      setIsScanning(false);
    }
  }, [address, publicClient, addrs.VeMEZO, nftCount, veMezoSupply]);


  // Fetch on mount / address change / network change
  useEffect(() => {
    fetchTokenIds();
  }, [fetchTokenIds]);

  // Also re-fetch when nftCount changes (after deposit/withdraw)
  useEffect(() => {
    fetchTokenIds();
  }, [nftCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetchTokenIds = fetchTokenIds;


  // ── 2b. Read locked(tokenId) for each owned token
  const { data: lockedData, refetch: refetchLocked } = useReadContracts({
    contracts: ownedTokenIds.map(id => ({
      address:      addrs.VeMEZO as Address,
      abi:          VEMEZO_ABI,
      functionName: 'locked' as const,
      args:         [BigInt(id)] as [bigint],
    })),
    query: { enabled: ownedTokenIds.length > 0 && (enabled || publicClientAvailable) && isDeployed(addrs.VeMEZO) },
  });

  // ── 3. Protocol reads ────────────────────────────────────────────────────
  // NOTE: index 6 used to be getPendingIncentives(), which does not exist on
  // the v2 ByNdVoter contract. Replaced with previewOptimalGauge(), which
  // returns (bestGauge, bestClaimable) — the closest real on-chain signal
  // for "incentive currently available to harvest." With a single configured
  // gauge (the current setup) this is exactly equivalent to a full sum; once
  // multiple gauges are configured, this undercounts vs. a true total across
  // all of them — revisit then if a precise sum is needed.
  const { data: protocolData, refetch: refetchProtocol } = useReadContracts({
    contracts: [
      { address: addrs.ByNdVault   as Address, abi: VAULT_ABI,   functionName: 'totalVotingPower'    }, // 0
      { address: addrs.VeBYND      as Address, abi: ERC20_ABI,   functionName: 'totalSupply'          }, // 1
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'currentEpoch'         }, // 2
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'epochDuration'        }, // 3
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'bountyBps'            }, // 4
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'timeUntilNextVote'    }, // 5
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'previewOptimalGauge'  }, // 6 (was getPendingIncentives)
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'getGaugeCount'        }, // 7
      { address: addrs.ByNdStaking as Address, abi: STAKING_ABI, functionName: 'totalStaked'          }, // 8
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'lastVoteTimestamp'    }, // 9
      { address: addrs.ByNdStaking as Address, abi: STAKING_ABI, functionName: 'rewardTokens', args: [0n] as [bigint] }, // 10 — first reward token address
      { address: addrs.ByNdVault   as Address, abi: VAULT_ABI,   functionName: 'totalLockedMEZO'     }, // 11
      { address: addrs.ByNdVault   as Address, abi: VAULT_ABI,   functionName: 'totalPendingRebase' }, // 12
      { address: addrs.ByNdVault   as Address, abi: VAULT_ABI,   functionName: 'lastExtendTimestamp' }, // 13
    ],
    query: { enabled: contractsEnabled || readOnlyContractsEnabled, refetchInterval: 15_000 }, // slot 5 (timeUntilNextVote) drives the countdown
  });

  // ── 3b. Read Matsnet's real epoch boundaries from BoostVoter ─────────────
  // epochStart/epochNext are pure functions of whatever timestamp you pass —
  // there's no stored counter on this contract, confirmed via hardhat probe
  // (periodFinish/activePeriod/epochVoteEnd/EPOCH_DURATION all revert).
  // Passing "now" gives the current epoch's start boundary and the absolute
  // timestamp the next one begins (== when this one ends).
  const nowForEpochRead = Math.floor(Date.now() / 1000);
  const { data: matsnetEpochData, refetch: refetchMatsnetEpoch } = useReadContracts({
    contracts: [
      { address: VALIDATORS_VOTER_ADDRESS, abi: VALIDATORS_VOTER_ABI, functionName: 'epochStart', args: [BigInt(nowForEpochRead)] }, // 0
      { address: VALIDATORS_VOTER_ADDRESS, abi: VALIDATORS_VOTER_ABI, functionName: 'epochNext',  args: [BigInt(nowForEpochRead)] }, // 1
    ],
    query: { enabled: enabled || publicClientAvailable, refetchInterval: 15_000 },
  });

  const currentEpochNum = protocolData?.[2]?.result as bigint | undefined;
  const gaugeCount      = protocolData?.[7]?.result as bigint | undefined;
  // rewardTokenAddress is only used below to resolve the protocol-level
  // reward token symbol (rewardSymbolData) — user-facing claimable amounts
  // no longer depend on it (see claimableAllData / claimableTokens below).
  const rewardTokenAddress = protocolData?.[10]?.result as `0x${string}` | undefined;

  // ── 4. Epoch flags ───────────────────────────────────────────────────────
  const { data: epochFlags, refetch: refetchFlags } = useReadContracts({
    contracts: [
      { address: addrs.ByNdVoter as Address, abi: VOTER_ABI, functionName: 'epochVoted',        args: [currentEpochNum!] },
      { address: addrs.ByNdVoter as Address, abi: VOTER_ABI, functionName: 'epochHarvested',     args: [currentEpochNum!] },
      { address: addrs.ByNdVoter as Address, abi: VOTER_ABI, functionName: 'epochLocksExtended', args: [currentEpochNum!] },
    ],
    query: { enabled: (contractsEnabled || readOnlyContractsEnabled) && currentEpochNum !== undefined, refetchInterval: 5_000 },
  });

  // ── 5. User balances (veBYND + staked) ───────────────────────────────────
  // These used to be bundled into the same batch as the reward-claimable
  // read below, and that whole batch was gated on rewardTokenAddress being
  // resolved first — so if that lookup lagged or failed, the wallet's plain
  // balanceOf/stakedBalance reads never fired either, even though they have
  // nothing to do with reward tokens. Decoupled here: these fire as soon as
  // the address + contracts are available.
  const { data: balanceData, refetch: refetchBalances } = useReadContracts({
    contracts: [
      { address: addrs.VeBYND      as Address, abi: ERC20_ABI,   functionName: 'balanceOf',     args: [address!] },
      { address: addrs.ByNdStaking as Address, abi: STAKING_ABI, functionName: 'stakedBalance', args: [address!] },
    ],
    query: { enabled: !!address && contractsEnabled, refetchInterval: 10_000 },
  });

  // ── 5b. Claimable rewards — generic across every registered reward token ─
  // NOTE: this used to read claimable(rewardTokenAddress, address) — a
  // single hardcoded token — and gated the whole position query on that
  // token being resolved. claimableAll(user) returns every registered
  // reward token + amount in one call, independent of that lookup.
  const { data: claimableAllData, refetch: refetchClaimable } = useReadContracts({
    contracts: [
      { address: addrs.ByNdStaking as Address, abi: STAKING_ABI, functionName: 'claimableAll', args: [address!] },
    ],
    query: { enabled: !!address && contractsEnabled, refetchInterval: 10_000 },
  });

  const claimableResult   = claimableAllData?.[0]?.result as [readonly string[], readonly bigint[]] | undefined;
  const claimableTokens   = claimableResult?.[0] ?? [];
  const claimableAmounts  = claimableResult?.[1] ?? [];

  // ── 5c. Symbols for each claimable reward token ─────────────────────────
  const { data: claimableSymbolData } = useReadContracts({
    contracts: claimableTokens.map(token => ({
      address:      token as Address,
      abi:          ERC20_ABI,
      functionName: 'symbol' as const,
    })),
    query: { enabled: claimableTokens.length > 0 },
  });

  // ── 6. Gauges from chain ─────────────────────────────────────────────────
  const gaugeCountNum = gaugeCount ? Number(gaugeCount) : 0;
  const { data: gaugeData } = useReadContracts({
    contracts: Array.from({ length: gaugeCountNum }, (_, i) => ({
      address:      addrs.ByNdVoter as Address,
      abi:          VOTER_ABI,
      functionName: 'gauges' as const,
      args:         [BigInt(i)] as [bigint],
    })),
    query: { enabled: (contractsEnabled || readOnlyContractsEnabled) && gaugeCountNum > 0, refetchInterval: 60_000 },
  });

  // ── Sync token IDs + locked amounts ─────────────────────────────────────
  useEffect(() => {
    const amounts: Record<number, string> = {};
    if (lockedData) {
      ownedTokenIds.forEach((id, i) => {
        // result is [amount: int128, end: uint256, isPermanent: bool]
        const result = lockedData[i]?.result as [bigint, bigint, boolean] | undefined;
        if (result) {
          // amount is int128 stored as bigint, convert from wei
          const raw = result[0] < 0n ? -result[0] : result[0];
          amounts[id] = formatEther(raw);
        }
      });
    }
    const permanent: number[] = [];
    if (lockedData) {
      ownedTokenIds.forEach((id, i) => {
        const result = lockedData[i]?.result as [bigint, bigint, boolean] | undefined;
        if (result?.[2]) permanent.push(id); // isPermanent = true
      });
    }
    setPosition(prev => ({ ...prev, veMezoTokenIds: ownedTokenIds, lockedAmounts: amounts, permanentIds: permanent }));
  }, [ownedTokenIds, lockedData]);

  // ── Read reward token symbol ────────────────────────────────────────────
  const { data: rewardSymbolData } = useReadContract({
    address: rewardTokenAddress,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: { enabled: !!rewardTokenAddress && isDeployed(rewardTokenAddress) },
  });

  // ── Sync protocol stats ───────────────────────────────────────────────────
  useEffect(() => {
    if (!protocolData) return;
    const totalPower  = protocolData[0]?.result as bigint | undefined;
    const veByndSup   = protocolData[1]?.result as bigint | undefined;
    const curEpoch    = protocolData[2]?.result as bigint | undefined;
    const epochDur    = protocolData[3]?.result as bigint | undefined;
    const bountyBps   = protocolData[4]?.result as bigint | undefined;
    const timeToVote  = protocolData[5]?.result as bigint | undefined;
    // previewOptimalGauge() returns (address bestGauge, uint256 bestClaimable)
    const optimalGaugeResult = protocolData[6]?.result as [string, bigint] | undefined;
    const pendingInc  = optimalGaugeResult?.[1] as bigint | undefined;
    const totalStaked = protocolData[8]?.result as bigint | undefined;
    const lastVoteTs  = protocolData[9]?.result as bigint | undefined;
    const totalLockedMezo = protocolData[11]?.result as bigint | undefined;
    const lastExtendTs = protocolData[13]?.result as bigint | undefined;

    const formattedTotalLocked = totalLockedMezo != null
      ? Number(formatEther(totalLockedMezo)).toLocaleString(undefined, { maximumFractionDigits: 2 })
      : undefined;
    const totalLocked = totalLockedMezo != null
      ? Number(formatEther(totalLockedMezo))
      : NaN;
    const activeStaked = totalStaked != null ? Number(formatEther(totalStaked)) : NaN;
    const epochSecs = epochDur != null ? Number(epochDur) : NaN;
    const pendingMUSD = pendingInc != null ? Number(formatEther(pendingInc)) : NaN;
    const aprValue = !Number.isNaN(totalLocked) && !Number.isNaN(activeStaked) && activeStaked > 0 && !Number.isNaN(epochSecs) && epochSecs > 0
      ? (pendingMUSD * (365 * 24 * 60 * 60) / epochSecs) / activeStaked * 100
      : NaN;

    setStats(prev => ({
      ...prev,
      totalVotingPower:  totalPower  != null ? Number(formatEther(totalPower)).toLocaleString()  : prev.totalVotingPower,
      tvl:               formattedTotalLocked ?? prev.tvl,
      veByndSupply:      veByndSup   != null ? Number(formatEther(veByndSup)).toLocaleString()   : prev.veByndSupply,
      totalStaked:       totalStaked != null ? Number(formatEther(totalStaked)).toLocaleString() : prev.totalStaked,
      bountyBps:         bountyBps   != null ? Number(bountyBps)                                 : prev.bountyBps,
      pendingIncentives:   pendingInc  != null ? formatEther(pendingInc)                           : prev.pendingIncentives,
      rewardTokenSymbol:   (rewardSymbolData as string | undefined) ?? prev.rewardTokenSymbol,
      avgApr:             Number.isFinite(aprValue) ? `${aprValue.toFixed(1)}%` : prev.avgApr,
    }));
    if (curEpoch !== undefined) {
      setIsLoading(false);

      // ── Derive real epoch-end + vote-window timing from Matsnet's clock ────
      // epochStart(now)/epochNext(now) are BoostVoter's own pure calendar
      // functions — epochNext(now) is the absolute timestamp Mezo's current
      // epoch actually ends (confirmed live: 1784764800 == 2026-07-23 00:00
      // UTC, an exact Thursday boundary, on 2026-07-22). No ">  now" guard
      // needed since these are pure functions of "now", not stored state.
      const now = Math.floor(Date.now() / 1000);
      const matsnetEpochStart = matsnetEpochData?.[0]?.result as bigint | undefined;
      const matsnetEpochEnd   = matsnetEpochData?.[1]?.result as bigint | undefined;

      const mezoEpochEndsAt        = matsnetEpochEnd != null ? Number(matsnetEpochEnd) : undefined;
      const mezoVoteWindowOpensAt  = mezoEpochEndsAt != null ? mezoEpochEndsAt - VOTE_WINDOW : undefined;

      // ByNdVoter's OWN on-chain clock — this is what actually gates
      // optimiseAndVote(), independent of Mezo's real boundary above.
      const ownVoteOpensIn       = timeToVote != null ? Number(timeToVote) : undefined;
      const ownEpochEndsIn       = ownVoteOpensIn != null ? ownVoteOpensIn + VOTE_WINDOW : undefined;
      const ownVoteWindowOpensAt = ownVoteOpensIn != null ? now + ownVoteOpensIn : undefined;

      // Flag when BynD's internal vote-window clock disagrees with Mezo's
      // real one by more than an hour — the button may show/enable at a
      // different time than the "Mezo epoch" times imply, since the
      // contract only knows its own lastVoteTimestamp cadence.
      const clockDrifted =
        mezoVoteWindowOpensAt != null && ownVoteWindowOpensAt != null
          ? Math.abs(mezoVoteWindowOpensAt - ownVoteWindowOpensAt) > 3600
          : false;

      // ── Real extendLocks() cooldown ─────────────────────────────────────
      // ByNdVault.extendLocks() gates on `now >= lastExtendTimestamp +
      // EXTEND_COOLDOWN` (7 real days) — a global cooldown independent of
      // epoch number. The old UI instead checked `epochLocksExtended`,
      // a per-epoch flag that resets to false on every new epoch even
      // while the real 7-day cooldown is still active — showing "Ready"
      // when the contract would actually revert with "cooldown active".
      const extendCooldownEndsAt = lastExtendTs != null ? Number(lastExtendTs) + EXTEND_COOLDOWN : undefined;

      setEpoch(prev => ({
        ...prev,
        currentEpoch:       Number(curEpoch),
        // Real global Mezo epoch number, anchored to the confirmed live
        // genesis (epoch #31 started 2026-07-16T00:00Z) rather than a raw
        // floor(now/WEEK) count — that raw count was showing "#2950".
        displayEpoch:        matsnetEpochStart != null ? mezoEpochNumber(Number(matsnetEpochStart)) : prev.displayEpoch,
        epochDuration:      epochDur   != null ? Number(epochDur)   : prev.epochDuration,
        timeUntilNextVote:  ownVoteOpensIn ?? prev.timeUntilNextVote,
        epochEndsIn:        ownEpochEndsIn ?? prev.epochEndsIn,
        mezoEpochEndsAt:       mezoEpochEndsAt       ?? prev.mezoEpochEndsAt,
        mezoVoteWindowOpensAt: mezoVoteWindowOpensAt ?? prev.mezoVoteWindowOpensAt,
        clockDrifted,
        extendCooldownEndsAt:  extendCooldownEndsAt  ?? prev.extendCooldownEndsAt,
        canExtendLocks:        extendCooldownEndsAt != null ? now >= extendCooldownEndsAt : prev.canExtendLocks,
        epochVoted:         (epochFlags?.[0]?.result as boolean) ?? prev.epochVoted,
        epochHarvested:     (epochFlags?.[1]?.result as boolean) ?? prev.epochHarvested,
        epochLocksExtended:  (epochFlags?.[2]?.result as boolean) ?? prev.epochLocksExtended,
        lastVoteTimestamp:   lastVoteTs != null ? Number(lastVoteTs) : prev.lastVoteTimestamp,
      }));
    }
  }, [protocolData, epochFlags, matsnetEpochData, rewardSymbolData]);

  // ── Sync user balances (veBYND + staked) — independent of reward tokens ──
  useEffect(() => {
    if (!balanceData) return;
    const veByndBal = balanceData[0]?.result as bigint | undefined;
    const stakedBal = balanceData[1]?.result as bigint | undefined;
    setPosition(prev => ({
      ...prev,
      veByndBalance: veByndBal != null ? formatEther(veByndBal) : prev.veByndBalance,
      stakedBalance: stakedBal != null ? formatEther(stakedBal) : prev.stakedBalance,
    }));
  }, [balanceData]);

  // ── Sync claimable rewards — generic list, any number of reward tokens ──
  useEffect(() => {
    if (!claimableAllData) return;
    const rewards = claimableTokens.map((token, i) => ({
      token,
      symbol: (claimableSymbolData?.[i]?.result as string | undefined) ?? '…',
      amount: formatEther(claimableAmounts[i] ?? 0n),
    }));
    setPosition(prev => ({ ...prev, claimableRewards: rewards }));
  }, [claimableAllData, claimableSymbolData]);

  // ── Sync gauges ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gaugeData || gaugeData.length === 0) { setGauges([]); return; }
    const parsed: GaugeAllocation[] = gaugeData
      .map(d => d.result as [string, string, bigint] | undefined)
      .filter((r): r is [string, string, bigint] => !!r)
      .map(([gauge, name, weightBps]) => ({
        gauge, name,
        weightBps:   Number(weightBps),
        apr:         '–',
        pendingMUSD: '–',
        boostedVeBTC: '–',
      }));
    setGauges(parsed);
  }, [gaugeData]);

  const refresh = useCallback(() => {
    refetchProtocol();
    refetchFlags();
    refetchBalances();
    refetchClaimable();
    refetchNftCount();
    refetchTokenIds();
    refetchLocked();
    refetchMatsnetEpoch();
    }, [refetchProtocol, refetchFlags, refetchBalances, refetchClaimable, refetchNftCount, refetchTokenIds, refetchLocked, refetchMatsnetEpoch]);

  // ── Epoch history (stored in localStorage, updated after each harvest) ──────
  const [epochHistory, setEpochHistory] = useState<Array<{
    epoch: number; votingPower: string; musdHarvested: string; bounty: string;
  }>>(() => {
    try {
      const stored = localStorage.getItem('bynd_epoch_history');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const recordEpoch = (epochNum: number, votingPower: string, musdAmount: string, bountyBps: number) => {
    const musdNum = parseFloat(musdAmount);
    const bountyNum = musdNum * bountyBps / 10000;
    const entry = {
      epoch: epochNum,
      votingPower,
      musdHarvested: musdNum.toFixed(2) + ' MUSD',
      bounty: bountyNum.toFixed(2) + ' MUSD',
    };
    setEpochHistory(prev => {
      const updated = [entry, ...prev.filter(e => e.epoch !== epochNum)].slice(0, 20);
      try { localStorage.setItem('bynd_epoch_history', JSON.stringify(updated)); } catch { /* quota exceeded or storage disabled — non-fatal */ }
      return updated;
    });
  };

  return {
    stats, epoch, position, gauges, epochHistory, recordEpoch,
    networkError, contractsDeployed, isLoading, isScanning,
    refresh,
    setPosition, setEpoch, setStats,
  };
}
