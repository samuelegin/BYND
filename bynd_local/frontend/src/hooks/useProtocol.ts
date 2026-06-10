'use client';

import { useState, useEffect, useCallback } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { formatEther, type Address } from 'viem';
import type { ProtocolStats, EpochState, UserPosition, GaugeAllocation } from '@/types';
import {
  VAULT_ABI, STAKING_ABI, VOTER_ABI, VEMEZO_ABI, ERC20_ABI,
  getAddresses, isDeployed, SUPPORTED_CHAIN_IDS,
} from '@/lib/contracts';
import { MATSNET_CHAIN_ID } from '@/lib/passport';

const EMPTY_STATS: ProtocolStats = {
  totalVotingPower: '–', tvl: '–', veByndSupply: '–', totalStaked: '–',
  bountyBps: 100, pendingIncentives: '–',
  activeStakers: 0, avgApr: '–', boostEfficiency: 98,
};
const EMPTY_EPOCH: EpochState = {
  currentEpoch: 0, timeUntilNextVote: 604800, epochVoted: false,
  epochHarvested: false, epochLocksExtended: false,
  lastVoteTimestamp: 0, epochDuration: 604800,
};
const EMPTY_POSITION: UserPosition = {
  veMezoTokenIds: [], lockedAmounts: {}, veByndBalance: '0',
  stakedBalance: '0', claimableMUSD: '0', claimableMEZO: '0',
};

export function useProtocol(
  address:  Address | undefined,
  chainId:  number  | undefined,
) {
  const [stats,    setStats]    = useState<ProtocolStats>(EMPTY_STATS);
  const [epoch,    setEpoch]    = useState<EpochState>(EMPTY_EPOCH);
  const [position, setPosition] = useState<UserPosition>(EMPTY_POSITION);
  const [gauges,   setGauges]   = useState<GaugeAllocation[]>([]);
  const [isScanningVeMezo, setIsScanningVeMezo] = useState(false);

  const isCorrectNetwork = !!chainId && SUPPORTED_CHAIN_IDS.includes(chainId);
  const isLocalhost      = chainId === 31337;
  const networkError     = !isCorrectNetwork && !!chainId
    ? `Wrong network (chainId ${chainId}). Switch to Mezo Matsnet (31611) or Hardhat Local (31337).`
    : null;

  const addrs             = getAddresses(chainId ?? MATSNET_CHAIN_ID);
  const contractsDeployed = isDeployed(addrs.ByNdVault) && isDeployed(addrs.ByNdVoter);

  // On localhost, wagmi has no transport (Passport config is read-only).
  // We enable wagmi reads only on Matsnet; on localhost we use localRpc() below.
  const enabled          = isCorrectNetwork && !isLocalhost;
  const contractsEnabled = enabled && contractsDeployed;

  // ── 1. veMEZO NFT count ──────────────────────────────────────────────────
  const { data: nftCount, isLoading: nftCountLoading, refetch: refetchNftCount } = useReadContract({
    address:      addrs.VeMEZO as Address,
    abi:          VEMEZO_ABI,
    functionName: 'balanceOf',
    args:         [address!],
    query:        { enabled: !!address && enabled && isDeployed(addrs.VeMEZO), refetchInterval: 15_000 },
  });

  // ── 2. Real token IDs via tokenOfOwnerByIndex ────────────────────────────
  const nftCountNum = nftCount ? Number(nftCount) : 0;
  const { data: tokenIdData, refetch: refetchTokenIds } = useReadContracts({
    contracts: Array.from({ length: nftCountNum }, (_, i) => ({
      address:      addrs.VeMEZO as Address,
      abi:          VEMEZO_ABI,
      functionName: 'tokenOfOwnerByIndex' as const,
      args:         [address!, BigInt(i)] as [Address, bigint],
    })),
    query: {
      enabled: !!address && nftCountNum > 0 && enabled && isDeployed(addrs.VeMEZO),
      refetchInterval: 15_000,
    },
  });

  // ── 3. Protocol reads ────────────────────────────────────────────────────
  const { data: protocolData, refetch: refetchProtocol } = useReadContracts({
    contracts: [
      { address: addrs.ByNdVault   as Address, abi: VAULT_ABI,   functionName: 'totalVotingPower'    }, // 0
      { address: addrs.VeBYND      as Address, abi: ERC20_ABI,   functionName: 'totalSupply'          }, // 1
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'currentEpoch'         }, // 2
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'epochDuration'        }, // 3
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'bountyBps'            }, // 4
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'timeUntilNextVote'    }, // 5
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'getPendingIncentives' }, // 6
      { address: addrs.ByNdVoter   as Address, abi: VOTER_ABI,   functionName: 'getGaugeCount'        }, // 7
      { address: addrs.ByNdStaking as Address, abi: STAKING_ABI, functionName: 'totalStaked'          }, // 8
    ],
    query: { enabled: contractsEnabled, refetchInterval: 15_000 },
  });

  const currentEpochNum = protocolData?.[2]?.result as bigint | undefined;
  const gaugeCount      = protocolData?.[7]?.result as bigint | undefined;

  // ── 4. Epoch flags ───────────────────────────────────────────────────────
  const { data: epochFlags, refetch: refetchFlags } = useReadContracts({
    contracts: [
      { address: addrs.ByNdVoter as Address, abi: VOTER_ABI, functionName: 'epochVoted',        args: [currentEpochNum!] },
      { address: addrs.ByNdVoter as Address, abi: VOTER_ABI, functionName: 'epochHarvested',     args: [currentEpochNum!] },
      { address: addrs.ByNdVoter as Address, abi: VOTER_ABI, functionName: 'epochLocksExtended', args: [currentEpochNum!] },
    ],
    query: { enabled: contractsEnabled && currentEpochNum !== undefined, refetchInterval: 5_000 },
  });

  // ── 5. User position ─────────────────────────────────────────────────────
  const { data: userPositionData, refetch: refetchPosition } = useReadContracts({
    contracts: [
      { address: addrs.VeBYND      as Address, abi: ERC20_ABI,   functionName: 'balanceOf',     args: [address!] },
      { address: addrs.ByNdStaking as Address, abi: STAKING_ABI, functionName: 'stakedBalance', args: [address!] },
      { address: addrs.ByNdStaking as Address, abi: STAKING_ABI, functionName: 'claimableMUSD', args: [address!] },
      { address: addrs.ByNdStaking as Address, abi: STAKING_ABI, functionName: 'claimableMEZO', args: [address!] },
    ],
    query: { enabled: !!address && contractsEnabled, refetchInterval: 10_000 },
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
    query: { enabled: contractsEnabled && gaugeCountNum > 0, refetchInterval: 60_000 },
  });

  // ── Sync token IDs (real, from chain) ────────────────────────────────────
  useEffect(() => {
    if (!tokenIdData || tokenIdData.length === 0) {
      setPosition(prev => ({ ...prev, veMezoTokenIds: [] }));
      return;
    }
    const ids = tokenIdData
      .map(d => d.result as bigint | undefined)
      .filter((id): id is bigint => id !== undefined)
      .map(id => Number(id));
    setPosition(prev => ({ ...prev, veMezoTokenIds: ids }));
  }, [tokenIdData]);

  // ── Sync protocol stats ───────────────────────────────────────────────────
  useEffect(() => {
    if (!protocolData) return;
    const totalPower  = protocolData[0]?.result as bigint | undefined;
    const veByndSup   = protocolData[1]?.result as bigint | undefined;
    const curEpoch    = protocolData[2]?.result as bigint | undefined;
    const epochDur    = protocolData[3]?.result as bigint | undefined;
    const bountyBps   = protocolData[4]?.result as bigint | undefined;
    const timeToVote  = protocolData[5]?.result as bigint | undefined;
    const pendingInc  = protocolData[6]?.result as bigint | undefined;
    const totalStaked = protocolData[8]?.result as bigint | undefined;

    setStats(prev => ({
      ...prev,
      totalVotingPower:  totalPower  != null ? Number(formatEther(totalPower)).toLocaleString()  : prev.totalVotingPower,
      veByndSupply:      veByndSup   != null ? Number(formatEther(veByndSup)).toLocaleString()   : prev.veByndSupply,
      totalStaked:       totalStaked != null ? Number(formatEther(totalStaked)).toLocaleString() : prev.totalStaked,
      bountyBps:         bountyBps   != null ? Number(bountyBps)                                 : prev.bountyBps,
      pendingIncentives: pendingInc  != null ? formatEther(pendingInc)                           : prev.pendingIncentives,
    }));

    if (curEpoch !== undefined) {
      setEpoch(prev => ({
        ...prev,
        currentEpoch:       Number(curEpoch),
        epochDuration:      epochDur   != null ? Number(epochDur)   : prev.epochDuration,
        timeUntilNextVote:  timeToVote != null ? Number(timeToVote) : prev.timeUntilNextVote,
        epochVoted:         (epochFlags?.[0]?.result as boolean) ?? prev.epochVoted,
        epochHarvested:     (epochFlags?.[1]?.result as boolean) ?? prev.epochHarvested,
        epochLocksExtended: (epochFlags?.[2]?.result as boolean) ?? prev.epochLocksExtended,
      }));
    }
  }, [protocolData, epochFlags]);

  // ── Sync user position ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userPositionData) return;
    const veByndBal = userPositionData[0]?.result as bigint | undefined;
    const stakedBal = userPositionData[1]?.result as bigint | undefined;
    const claimMUSD = userPositionData[2]?.result as bigint | undefined;
    const claimMEZO = userPositionData[3]?.result as bigint | undefined;

    setPosition(prev => ({
      ...prev,
      veByndBalance: veByndBal != null ? formatEther(veByndBal) : prev.veByndBalance,
      stakedBalance: stakedBal != null ? formatEther(stakedBal) : prev.stakedBalance,
      claimableMUSD: claimMUSD != null ? formatEther(claimMUSD) : prev.claimableMUSD,
      claimableMEZO: claimMEZO != null ? formatEther(claimMEZO) : prev.claimableMEZO,
    }));
  }, [userPositionData]);

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

  // ── Localhost polling (bypasses wagmi — Passport config is read-only) ───────
  useEffect(() => {
    if (!isLocalhost || !contractsDeployed) return;

    async function enc(sig: string): Promise<string> {
      // 4-byte keccak selectors — computed from function signatures
      const sigs: Record<string, string> = {
        'totalVotingPower()':               '0x671b3793',
        'totalSupply()':                    '0x18160ddd',
        'currentEpoch()':                   '0x76671808',
        'epochDuration()':                  '0x4ff0876a',
        'bountyBps()':                      '0x415307cc',
        'timeUntilNextVote()':              '0x6ab39058',
        'getPendingIncentives()':           '0xeaa7f651',
        'getGaugeCount()':                  '0x9c28df3e',
        'totalStaked()':                    '0x817b1cd2',
      };
      return sigs[sig] ?? '0x';
    }

    async function poll() {
      setIsScanningVeMezo(!!address);
      try {
        const [tvp, ts, ce, ed, bb, tunv, pi, gc, tStaked, tLocked] = await Promise.all([
          localCall(addrs.ByNdVault,   await enc('totalVotingPower()')),
          localCall(addrs.VeBYND,      await enc('totalSupply()')),
          localCall(addrs.ByNdVoter,   await enc('currentEpoch()')),
          localCall(addrs.ByNdVoter,   await enc('epochDuration()')),
          localCall(addrs.ByNdVoter,   await enc('bountyBps()')),
          localCall(addrs.ByNdVoter,   await enc('timeUntilNextVote()')),
          localCall(addrs.ByNdVoter,   await enc('getPendingIncentives()')),
          localCall(addrs.ByNdVoter,   await enc('getGaugeCount()')),
          localCall(addrs.ByNdStaking, await enc('totalStaked()')),
          localCall(addrs.ByNdVault,   '0xf0ac0a5d'), // totalLockedMEZO()
        ]);

        const b = (hex: string) => BigInt(hex);
        const lockedMEZO   = Number(formatEther(b(tLocked as string)));
        const supplyNum    = Number(formatEther(b(ts as string)));
        const ratio        = lockedMEZO > 0 ? (supplyNum / lockedMEZO).toFixed(4) : '–';

        setStats(prev => ({
          ...prev,
          totalVotingPower: Number(formatEther(b(tvp as string))).toLocaleString(),
          veByndSupply:     supplyNum.toLocaleString(),
          totalStaked:      Number(formatEther(b(tStaked as string))).toLocaleString(),
          tvl:              lockedMEZO.toLocaleString() + ' MEZO',
          bountyBps:        Number(b(bb as string)),
          pendingIncentives: formatEther(b(pi as string)),
        }));
        setEpoch(prev => ({
          ...prev,
          currentEpoch:      Number(b(ce as string)),
          epochDuration:     Number(b(ed as string)),
          timeUntilNextVote: Number(b(tunv as string)),
        }));

        // Fetch epoch flags using currentEpoch
        const epochNum = Number(b(ce as string));
        const epochNumHex = epochNum.toString(16).padStart(64, '0');
        const [voted, harvested, locksExtended] = await Promise.all([
          localCall(addrs.ByNdVoter, '0x202a3288' + epochNumHex), // epochVoted(uint256)
          localCall(addrs.ByNdVoter, '0xa9f31105' + epochNumHex), // epochHarvested(uint256)
          localCall(addrs.ByNdVoter, '0x6f1e3beb' + epochNumHex), // epochLocksExtended(uint256)
        ]);
        setEpoch(prev => ({
          ...prev,
          epochVoted:         (voted         as string) !== '0x' + '0'.repeat(64),
          epochHarvested:     (harvested      as string) !== '0x' + '0'.repeat(64),
          epochLocksExtended: (locksExtended  as string) !== '0x' + '0'.repeat(64),
        }));

        // Fetch gauge data
        const gaugeCount = Number(b(gc as string));
        if (gaugeCount > 0) {
          const gaugeResults: GaugeAllocation[] = [];
          const gaugeNames = ['BTC / MUSD LP', 'MEZO / MUSD LP', 'Gauge 3', 'Gauge 4'];
          for (let i = 0; i < gaugeCount; i++) {
            const gaugeSig = '0xb0539187' + i.toString(16).padStart(64, '0');
            const gaugeHex = await localCall(addrs.ByNdVoter, gaugeSig) as string;
            // ABI encoding of (address, string, uint256):
            // slot 0 (bytes 2-65):   address (padded to 32 bytes, address is last 20 bytes)
            // slot 1 (bytes 66-129): offset to string data
            // slot 2 (bytes 130-193): weightBps
            const raw = gaugeHex.slice(2); // remove 0x
            const gaugeAddr = '0x' + raw.slice(24, 64); // last 20 bytes of first slot
            const weightBpsHex = raw.slice(128, 192);   // third slot = weightBps
            const weightBps = Number(BigInt('0x' + weightBpsHex));
            gaugeResults.push({
              gauge:        gaugeAddr as `0x${string}`,
              name:         gaugeNames[i] ?? `Gauge ${i + 1}`,
              weightBps,
              apr:          '–',
              pendingMUSD:  '–',
              boostedVeBTC: '0',
            });
          }
          setGauges(gaugeResults);
        }


        if (address) {
          // balanceOf(address) — selector + padded address
          const balSig = '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0');
          const balHex = await localCall(addrs.VeMEZO, balSig) as string;
          const bal = Number(b(balHex));
          const ids: number[] = [];
          for (let i = 0; i < bal; i++) {
            // tokenOfOwnerByIndex(address, i)
            const sig = '0x2f745c59'
              + address.slice(2).toLowerCase().padStart(64, '0')
              + i.toString(16).padStart(64, '0');
            const idHex = await localCall(addrs.VeMEZO, sig) as string;
            ids.push(Number(b(idHex)));
          }
          setPosition(prev => ({ ...prev, veMezoTokenIds: ids }));

          // Fetch locked amount for each NFT — locked(tokenId) returns (int128 amount, uint256 end)
          // selector: keccak256('locked(uint256)') = 0xcbf9fe5f
          const lockedAmounts: Record<number, string> = {};
          for (const id of ids) {
            const lockedSig = '0xb45a3c0e' + id.toString(16).padStart(64, '0');
            const lockedHex = await localCall(addrs.VeMEZO, lockedSig) as string;
            // Returns (int128, uint256) — first 32 bytes is amount (int128 padded)
            const amountHex = lockedHex.slice(0, 66); // 0x + 64 chars
            const amount = BigInt(amountHex);
            lockedAmounts[id] = formatEther(amount < 0n ? -amount : amount);
          }
          setPosition(prev => ({ ...prev, lockedAmounts }));

          // User staking position
          const userSig = (sel: string) => sel + address.slice(2).toLowerCase().padStart(64, '0');
          const [veBal, staked, claimMUSD] = await Promise.all([
            localCall(addrs.VeBYND,      userSig('0x70a08231')), // balanceOf(address)
            localCall(addrs.ByNdStaking, userSig('0x60217267')), // stakedBalance(address)
            localCall(addrs.ByNdStaking, userSig('0xf73599fc')), // claimableMUSD(address)
          ]);
          setPosition(prev => ({
            ...prev,
            veByndBalance: formatEther(b(veBal    as string)),
            stakedBalance: formatEther(b(staked   as string)),
            claimableMUSD: formatEther(b(claimMUSD as string)),
          }));
        }
      } catch {
        // Node not running or not yet deployed — silently ignore
      } finally {
        setIsScanningVeMezo(false);
      }
    }

    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocalhost, contractsDeployed, address, addrs.ByNdVault]);

  // ── Manual refresh (called after tx) ─────────────────────────────────────
  const refresh = useCallback(() => {
    refetchProtocol();
    refetchFlags();
    refetchPosition();
    refetchNftCount();
    refetchTokenIds();
  }, [refetchProtocol, refetchFlags, refetchPosition, refetchNftCount, refetchTokenIds]);

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
      try { localStorage.setItem('bynd_epoch_history', JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const isScanning = (!!address && enabled && isDeployed(addrs.VeMEZO) && (nftCountLoading || false))
    || (isLocalhost && isScanningVeMezo);

  return {
    stats, epoch, position, gauges, epochHistory, recordEpoch,
    networkError, contractsDeployed, isScanning,
    refresh,
    setPosition, setEpoch, setStats,
  };
}

// ── Local RPC helper ──────────────────────────────────────────────────────────
// When on chainId 31337 (Hardhat), wagmi has no transport (Passport config is
// read-only and cannot be extended). We fall back to raw JSON-RPC fetch calls.
export async function localRpc(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch('http://127.0.0.1:8545', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export async function localCall(to: string, data: string): Promise<string> {
  return localRpc('eth_call', [{ to, data }, 'latest']) as Promise<string>;
}
