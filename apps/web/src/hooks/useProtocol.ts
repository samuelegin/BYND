'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useReadContract, useReadContracts, usePublicClient } from 'wagmi';
import { formatEther, formatUnits, type Address } from 'viem';
import type { ProtocolStats, EpochState, UserPosition, GaugeAllocation, GaugeBribe } from '@/types';
import {
  VAULT_ABI, STAKING_ABI, VOTER_ABI, VEMEZO_ABI, ERC20_ABI, BRIBE_ABI,
  BOOST_VOTER_ABI, BOOST_VOTER_ADDRESS,
  getAddresses, isDeployed, SUPPORTED_CHAIN_IDS,
} from '@/lib/contracts';
import { MATSNET_CHAIN_ID } from '@/lib/passport';

const EMPTY_STATS: ProtocolStats = {
  totalVotingPower: '–', tvl: '–', veByndSupply: '–', totalStaked: '–',
  bountyBps: 100, pendingIncentives: '–', rewardTokenSymbol: '…',
  activeStakers: 0, avgApr: '–', boostEfficiency: 98,
  // Governance hasn't necessarily set this — default to 0, not a placeholder.
  protocolFeeBps: 0,
};
const WEEK = 7 * 24 * 3600;
// Fallback only — the live voteWindow is read from the contract (see
// chainVoteWindow below) and takes precedence. 3h matches ByNdVoter's default,
// which stops an hour short of the epoch boundary because Mezo's BoostVoter
// refuses votes after epochNext - 1h.
const VOTE_WINDOW = 3 * 3600;
const EXTEND_WINDOW = 24 * 3600; // matches ByNdVoter's extendWindow default
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
  voteOpensAtAbs: 0,
  epochEndsAtAbs: 0,
  clockDrifted: false,
  extendWindow: EXTEND_WINDOW,
  extendWindowOpensAt: 0,
  timeUntilExtendWindow: EXTEND_WINDOW,
  canExtendLocks: false,
};
const EMPTY_POSITION: UserPosition = {
  veMezoTokenIds: [], lockedAmounts: {}, permanentIds: [], expiredIds: [], veByndBalance: '0',
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
      // 13 was ByNdVault.lastExtendTimestamp(), a function that does not exist
      // on the deployed vault — the read always failed and the 7-day "extend
      // cooldown" built on it was fiction. extendLocks() now has a real gate:
      // a time window (extendWindow, below) plus once-per-epoch
      // (epochLocksExtended, in the epoch-flags batch).
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'extendWindow'        }, // 13
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'voteWindow'          }, // 14
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'protocolFeeBps'      }, // 15 — governance-set, defaults to 0 on-chain if never set
      // 16 — how many bribe tokens governance has priced. Zero means the
      // ranking can't score anything and falls back to the first alive gauge,
      // which is the state an upgraded (not freshly deployed) proxy starts in.
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'getValuedTokenCount' }, // 16
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
      { address: BOOST_VOTER_ADDRESS, abi: BOOST_VOTER_ABI, functionName: 'epochStart', args: [BigInt(nowForEpochRead)] }, // 0
      { address: BOOST_VOTER_ADDRESS, abi: BOOST_VOTER_ABI, functionName: 'epochNext',  args: [BigInt(nowForEpochRead)] }, // 1
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

  // ── 6b. Bribes posted on each gauge, per token ───────────────────────────
  // This used to read BoostVoter.claimable(gauge). That was wrong twice over:
  // it returned 0 for every gauge sampled live on Matsnet (BoostVoter's own
  // rewardToken() is unset), and even had it worked it would have been a
  // single number in an unidentified token — so there was nothing to label it
  // with. The real bribes live on each gauge's OWN bribe contract, one amount
  // per token, which is exactly what ByNdVoter's ranking reads.
  const gaugeAddresses = gauges.map(g => g.gauge);

  // The tokens governance has priced. Nothing else is worth showing: an
  // unpriced token scores zero in the contract's ranking, so displaying it
  // would imply a gauge is worth more than the protocol thinks it is.
  const valuedTokenCount = protocolData?.[16]?.result as bigint | undefined;
  const valuedTokenCountNum = valuedTokenCount ? Number(valuedTokenCount) : 0;
  const { data: valuedTokenData } = useReadContracts({
    contracts: Array.from({ length: valuedTokenCountNum }, (_, i) => ({
      address:      addrs.ByNdVoter as Address,
      abi:          VOTER_ABI,
      functionName: 'valuedTokens' as const,
      args:         [BigInt(i)] as [bigint],
    })),
    query: { enabled: (contractsEnabled || readOnlyContractsEnabled) && valuedTokenCountNum > 0, refetchInterval: 60_000 },
  });
  const valuedTokens = (valuedTokenData ?? [])
    .map(r => r?.result as string | undefined)
    .filter((t): t is string => !!t);

  // Symbol AND decimals per valued token. Decimals are read, never assumed:
  // formatting a non-18dp token with formatEther is off by orders of
  // magnitude, which is exactly the bug this replaces.
  const { data: valuedTokenMetaData } = useReadContracts({
    contracts: valuedTokens.flatMap(token => [
      { address: token as Address, abi: ERC20_ABI, functionName: 'symbol'   as const },
      { address: token as Address, abi: ERC20_ABI, functionName: 'decimals' as const },
    ]),
    query: { enabled: valuedTokens.length > 0 },
  });

  // Bribes are posted per epoch, so the amount has to be read against the
  // epoch currently being voted on — the same epochStart the contract uses.
  const bribeEpochStart = matsnetEpochData?.[0]?.result as bigint | undefined;
  const bribeContracts = gauges.map(g => g.bribe);
  const { data: gaugeBribeData } = useReadContracts({
    contracts: bribeContracts.flatMap(bribe =>
      valuedTokens.map(token => ({
        address:      bribe as Address,
        abi:          BRIBE_ABI,
        functionName: 'tokenRewardsPerEpoch' as const,
        args:         [token as Address, bribeEpochStart ?? 0n] as [Address, bigint],
      })),
    ),
    query: {
      enabled: bribeContracts.length > 0 && valuedTokens.length > 0 && bribeEpochStart != null && (enabled || publicClientAvailable),
      refetchInterval: 30_000,
    },
  });

  useEffect(() => {
    if (!gaugeBribeData || gaugeAddresses.length === 0 || valuedTokens.length === 0) return;
    const meta = valuedTokens.map((token, i) => ({
      token,
      symbol:   (valuedTokenMetaData?.[i * 2]?.result as string | undefined) ?? 'TOKEN',
      decimals: Number((valuedTokenMetaData?.[i * 2 + 1]?.result as number | undefined) ?? 18),
    }));
    setGauges(prev => prev.map((g, gi) => {
      const bribes: GaugeBribe[] = [];
      meta.forEach((m, ti) => {
        const amt = gaugeBribeData[gi * valuedTokens.length + ti]?.result as bigint | undefined;
        // Drop zero amounts — a gauge with no bribe in a token shouldn't
        // render a "0 MUSD" row implying someone posted an empty bribe.
        if (amt != null && amt > 0n) {
          bribes.push({ token: m.token, symbol: m.symbol, amount: formatUnits(amt, m.decimals) });
        }
      });
      return { ...g, bribes };
    }));
  }, [gaugeBribeData, valuedTokenMetaData]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const expired: number[] = [];
    const now = Math.floor(Date.now() / 1000);
    if (lockedData) {
      ownedTokenIds.forEach((id, i) => {
        const result = lockedData[i]?.result as [bigint, bigint, boolean] | undefined;
        if (!result) return;
        const [, end, isPermanent] = result;
        if (isPermanent) {
          permanent.push(id); // isPermanent = true
        } else if (Number(end) <= now) {
          // Vault requires (isPermanent || end > now) — an expired,
          // non-permanent lock will revert on deposit() until extended.
          // This is the exact case that silently failed before we added
          // proper receipt-status checking: the tx would look "successful"
          // in the UI with the old code, but nothing actually deposited.
          expired.push(id);
        }
      });
    }
    setPosition(prev => ({ ...prev, veMezoTokenIds: ownedTokenIds, lockedAmounts: amounts, permanentIds: permanent, expiredIds: expired }));
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
    // previewOptimalGauge() returns (address bestGauge, uint256 bestScore) —
    // a value-WEIGHTED score, not an amount of any real token.
    const optimalGaugeResult = protocolData[6]?.result as [string, bigint] | undefined;
    const pendingInc  = optimalGaugeResult?.[1] as bigint | undefined;
    const totalStaked = protocolData[8]?.result as bigint | undefined;
    const lastVoteTs  = protocolData[9]?.result as bigint | undefined;
    const totalLockedMezo = protocolData[11]?.result as bigint | undefined;
    const chainExtendWindow = protocolData[13]?.result as bigint | undefined;
    const chainVoteWindow = protocolData[14]?.result as bigint | undefined;
    const protocolFeeBps = protocolData[15]?.result as bigint | undefined;

    const formattedTotalLocked = totalLockedMezo != null
      ? Number(formatEther(totalLockedMezo)).toLocaleString(undefined, { maximumFractionDigits: 2 })
      : undefined;
    const totalLocked = totalLockedMezo != null
      ? Number(formatEther(totalLockedMezo))
      : NaN;
    const activeStaked = totalStaked != null ? Number(formatEther(totalStaked)) : NaN;
    const epochSecs = epochDur != null ? Number(epochDur) : NaN;
    // The best gauge's score, denominated in the reference token (the one
    // governance weighted at 10000 bps — MUSD, 18dp). It is a valuation, not a
    // claim on any single token's balance, so treat the APR built on it as an
    // estimate of the epoch's incentive value rather than a MUSD figure.
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
      // Governance-set fee. 0 is a valid, real on-chain value (fee not set),
      // so we only fall back to prev while the read is still in-flight.
      protocolFeeBps:     protocolFeeBps != null ? Number(protocolFeeBps) : prev.protocolFeeBps,
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
      // Prefer the real on-chain voteWindow (governance can change it via
      // setVoteWindow()); fall back to the constant only before it's loaded.
      const voteWindowSecs = chainVoteWindow != null ? Number(chainVoteWindow) : VOTE_WINDOW;

      const mezoEpochEndsAt        = matsnetEpochEnd != null ? Number(matsnetEpochEnd) : undefined;
      const mezoVoteWindowOpensAt  = mezoEpochEndsAt != null ? mezoEpochEndsAt - voteWindowSecs : undefined;

      // ByNdVoter's OWN on-chain clock — this is what actually gates
      // optimiseAndVote(), independent of Mezo's real boundary above.
      const ownVoteOpensIn       = timeToVote != null ? Number(timeToVote) : undefined;
      const ownEpochEndsIn       = ownVoteOpensIn != null ? ownVoteOpensIn + voteWindowSecs : undefined;
      const ownVoteWindowOpensAt = ownVoteOpensIn != null ? now + ownVoteOpensIn : undefined;

      // ── Wall-clock anchors for the ticking countdown ────────────────────
      // timeUntilNextVote()/epochNext() are pure functions of block.timestamp,
      // which on a low-traffic testnet only advances when a tx is mined — it
      // can sit frozen for minutes between blocks. Re-deriving "seconds
      // remaining" straight from that value on every 15s poll means the
      // client-side tick gets reset back to the same stale number each time
      // no new block has landed, which reads as a frozen countdown. Instead,
      // convert the (possibly slightly stale) relative offset into an
      // absolute wall-clock target ONCE per poll, using Date.now() as the
      // base rather than block.timestamp. The per-second tick then derives
      // the displayed countdown from this absolute target vs. Date.now(),
      // so it counts down smoothly in real time between polls regardless of
      // block cadence.
      const newVoteOpensAtAbs = ownVoteWindowOpensAt;
      const newEpochEndsAtAbs = ownEpochEndsIn != null ? now + ownEpochEndsIn : undefined;

      // Flag when BynD's internal vote-window clock disagrees with Mezo's
      // real one by more than an hour — the button may show/enable at a
      // different time than the "Mezo epoch" times imply, since the
      // contract only knows its own lastVoteTimestamp cadence.
      const clockDrifted =
        mezoVoteWindowOpensAt != null && ownVoteWindowOpensAt != null
          ? Math.abs(mezoVoteWindowOpensAt - ownVoteWindowOpensAt) > 3600
          : false;

      // ── extendLocks() gate ──────────────────────────────────────────────
      // Two independent conditions, both enforced on-chain:
      //   1. time window — the last `extendWindow` seconds before Mezo's
      //      epoch boundary (default 24h, wide enough to contain the 4h vote
      //      window so a keeper can extend then vote in one run). Derived
      //      here from epochNext() rather than read as a view, because
      //      ByNdVoter sits close to the EIP-170 size limit and this is the
      //      same arithmetic the contract does.
      //   2. once per epoch — only the first caller is credited a keeper
      //      slot, so the vault now rejects later callers up front instead
      //      of letting them burn gas for nothing (epochLocksExtended).
      // extendWindow == 0 disables (1) only; (2) always applies.
      const extendWindowSecs = chainExtendWindow != null ? Number(chainExtendWindow) : EXTEND_WINDOW;
      const extendWindowOpensAt = extendWindowSecs === 0
        ? now
        : mezoEpochEndsAt != null ? mezoEpochEndsAt - extendWindowSecs : undefined;
      const timeUntilExtendWindow = extendWindowOpensAt != null
        ? Math.max(0, extendWindowOpensAt - now)
        : undefined;
      const extendWindowIsOpen = timeUntilExtendWindow != null ? timeUntilExtendWindow === 0 : undefined;
      const locksAlreadyExtended = (epochFlags?.[2]?.result as boolean | undefined) ?? false;

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
        voteOpensAtAbs:        newVoteOpensAtAbs ?? prev.voteOpensAtAbs,
        epochEndsAtAbs:        newEpochEndsAtAbs ?? prev.epochEndsAtAbs,
        clockDrifted,
        extendWindow:           extendWindowSecs,
        extendWindowOpensAt:    extendWindowOpensAt    ?? prev.extendWindowOpensAt,
        timeUntilExtendWindow:  timeUntilExtendWindow  ?? prev.timeUntilExtendWindow,
        canExtendLocks:         extendWindowIsOpen != null
          ? extendWindowIsOpen && !locksAlreadyExtended
          : prev.canExtendLocks,
        epochVoted:         (epochFlags?.[0]?.result as boolean) ?? prev.epochVoted,
        epochHarvested:     (epochFlags?.[1]?.result as boolean) ?? prev.epochHarvested,
        epochLocksExtended:  (epochFlags?.[2]?.result as boolean) ?? prev.epochLocksExtended,
        lastVoteTimestamp:   lastVoteTs != null ? Number(lastVoteTs) : prev.lastVoteTimestamp,
      }));
    }
  }, [protocolData, epochFlags, matsnetEpochData, rewardSymbolData]);

  // ── Live per-second countdown tick ──────────────────────────────────────
  // timeUntilNextVote/epochEndsIn above are only refreshed from-chain every
  // 15s (see refetchInterval on the protocolData read). Without this, any
  // page showing that raw value only appears to move in ~15s jumps instead
  // of ticking smoothly — that's exactly what was happening on Analytics,
  // which read epoch.timeUntilNextVote directly. Terminal and Keeper used to
  // patch this locally with their own per-page setInterval, which duplicated
  // the logic and could drift out of sync with each other. Centralizing it
  // here means every consumer of this hook gets one consistent, correctly
  // ticking clock for free — no page-level timer needed anymore.
  useEffect(() => {
    const id = setInterval(() => {
      setEpoch(prev => {
        const nowMs = Date.now();
        // Once we have real anchors, derive the countdown from wall-clock
        // time against them. Before the first successful chain read (both
        // anchors still 0), fall back to a plain decrement so the initial
        // placeholder value still counts down instead of sitting static.
        const timeUntilNextVote = prev.voteOpensAtAbs > 0
          ? Math.max(0, prev.voteOpensAtAbs - Math.floor(nowMs / 1000))
          : Math.max(0, prev.timeUntilNextVote - 1);
        const epochEndsIn = prev.epochEndsAtAbs > 0
          ? Math.max(0, prev.epochEndsAtAbs - Math.floor(nowMs / 1000))
          : Math.max(0, prev.epochEndsIn - 1);
        // Same treatment for the extend window: derive from its absolute
        // open time against wall-clock, so the countdown ticks smoothly
        // between the 15s chain polls. canExtendLocks flips on the instant
        // it hits zero, mirroring the vote-window gate.
        const timeUntilExtendWindow = prev.extendWindowOpensAt > 0
          ? Math.max(0, prev.extendWindowOpensAt - Math.floor(nowMs / 1000))
          : Math.max(0, prev.timeUntilExtendWindow - 1);
        const extendWindowNowOpen = timeUntilExtendWindow === 0;
        return {
          ...prev,
          timeUntilNextVote,
          epochEndsIn,
          timeUntilExtendWindow,
          canExtendLocks: extendWindowNowOpen && !prev.epochLocksExtended,
        };
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

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
    // gauges(i) returns (address gauge, address bribe, string name, uint256
    // weightBps) — 4 fields. Previously destructured as only 3
    // ([gauge, name, weightBps]), which silently shifted every value one
    // slot over: `name` received the bribe address and `weightBps` received
    // the name string (Number("some-name") => NaN), breaking the weight bar.
    const parsed: GaugeAllocation[] = gaugeData
      .map(d => d.result as [string, string, string, bigint] | undefined)
      .filter((r): r is [string, string, string, bigint] => !!r)
      .map(([gauge, bribe, name, weightBps]) => ({
        gauge, bribe, name,
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
