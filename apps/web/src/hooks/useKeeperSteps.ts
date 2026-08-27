import { useState } from "react";
import { Droplets, Shield, RefreshCw, HandCoins, Zap, GitMerge, ArrowRightLeft } from "lucide-react";
import { useWriteContract } from "wagmi";
import { getAddresses, VAULT_ABI, VOTER_ABI } from "@/lib/contracts";
import { formatTime } from "@/components/ui";
import type { EpochState, ProtocolStats } from "@/types";
import type { KeeperStepDef } from "@/components/keeper";

// Single source of truth for every permissionless keeper action across the
// app. KeeperPanel (Terminal, "core" tier only) and Keeper.tsx (/keeper,
// every tier) both render from this list instead of each hand-writing their
// own gating math — which is exactly how canClaimBribes drifted out of sync
// between the two pages before (Terminal got the pendingIncentives fix,
// /keeper didn't, because there were two separate copies of the same logic).
//
// "core"     — the five routine weekly-cycle steps, shown on both pages.
// "extended" — recovery/maintenance actions, /keeper only: retryMerge and
//              syncBribesFromVault. Not part of the normal weekly flow, so
//              they'd just add noise to the Terminal's quick-glance panel.

export interface UseKeeperStepsArgs {
  epoch: EpochState;
  stats: ProtocolStats;
  chainId?: number;
  onOpenCastVotesModal: () => void;
  onOpenHarvestModal: () => void;
  // Each page owns its own transaction-running strategy — deliberately NOT
  // unified here. Terminal's runs an extra waitAndCheck(hash, label)
  // no-op/revert safety check per action; /keeper's is a simpler
  // wait-then-refresh. Forcing one into this hook would either lose
  // Terminal's safety check or add dead weight to /keeper — this is a real
  // difference between the two pages, not the kind of accidental drift the
  // gating logic below was suffering from.
  runTx: (fn: () => Promise<`0x${string}`>, label?: string) => Promise<void>;
}

const MUSD_DEFAULT = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as const;

export function useKeeperSteps({
  epoch, stats, chainId, onOpenCastVotesModal, onOpenHarvestModal, runTx,
}: UseKeeperStepsArgs): { steps: (KeeperStepDef & { tier: "core" | "extended" })[]; retryMergeTokenId: string; setRetryMergeTokenId: (v: string) => void } {
  const addrs = getAddresses(chainId ?? 31611);
  const { writeContractAsync } = useWriteContract();

  const [claimingRebases, setClaimingRebases] = useState(false);
  const [extendingLocks, setExtendingLocks] = useState(false);
  const [claimingBribes, setClaimingBribes] = useState(false);
  const [syncingVault, setSyncingVault] = useState(false);
  const [retryingMerge, setRetryingMerge] = useState(false);
  const [retryMergeTokenId, setRetryMergeTokenId] = useState("");

  const handleClaimRebases = async () => {
    setClaimingRebases(true);
    try {
      await runTx(
        () => writeContractAsync({ address: addrs.ByNdVault, abi: VAULT_ABI, functionName: "claimRebases", args: [] }),
        "claimRebases",
      );
    } finally {
      setClaimingRebases(false);
    }
  };

  const handleExtendLocks = async () => {
    setExtendingLocks(true);
    try {
      await runTx(
        () => writeContractAsync({ address: addrs.ByNdVault, abi: VAULT_ABI, functionName: "extendLocks", args: [] }),
        "extendLocks",
      );
    } finally {
      setExtendingLocks(false);
    }
  };

  const handleClaimBribes = async () => {
    setClaimingBribes(true);
    try {
      await runTx(
        () => writeContractAsync({ address: addrs.ByNdVoter, abi: VOTER_ABI, functionName: "claimBribesBatch", args: [200n] }),
        "claimBribesBatch",
      );
    } finally {
      setClaimingBribes(false);
    }
  };

  const handleSyncVault = async () => {
    setSyncingVault(true);
    try {
      await runTx(
        () =>
          writeContractAsync({
            address: addrs.ByNdVoter,
            abi: VOTER_ABI,
            functionName: "syncBribesFromVault",
            args: [MUSD_DEFAULT],
          }),
        "syncBribesFromVault",
      );
    } finally {
      setSyncingVault(false);
    }
  };

  const handleRetryMerge = async () => {
    const tokenId = BigInt(retryMergeTokenId || "0");
    if (tokenId === 0n) return;
    setRetryingMerge(true);
    try {
      await runTx(
        () => writeContractAsync({ address: addrs.ByNdVault, abi: VAULT_ABI, functionName: "retryMerge", args: [tokenId] }),
        `retryMerge #${retryMergeTokenId}`,
      );
    } finally {
      setRetryingMerge(false);
    }
  };

  // ── Gating — copied over exactly as-is, not re-derived, from the two
  // places it used to live separately. This is now the only copy. ──
  const canExtend = epoch.canExtendLocks;
  const voteWindowOpen = epoch.timeUntilNextVote <= 0;
  const canVote = !epoch.epochVoted && voteWindowOpen;
  const bribesClaimed = epoch.claimBribesReady;
  // pendingIncentives (previewOptimalGauge()'s bestScore) is the same
  // "is there actually anything here" signal HarvestModal already uses.
  // Without it, "Ready" showed as soon as votes were cast, even when the
  // bribe hadn't checkpointed on Mezo's side yet — claimBribesBatch() would
  // fire, succeed, and move nothing.
  const pendingNum = parseFloat(String(stats.pendingIncentives).replace(/[$,]/g, ""));
  const nothingPending = Number.isNaN(pendingNum) || pendingNum === 0;
  const canClaimBribes = epoch.epochVoted && !epoch.epochHarvested && !bribesClaimed && !nothingPending;
  const canHarvest = epoch.epochVoted && !epoch.epochHarvested && bribesClaimed;
  const needsPaging = epoch.claimBribesTotal > 200;

  const steps: (KeeperStepDef & { tier: "core" | "extended" })[] = [
    {
      id: "claimRebases",
      tier: "core",
      step: "00",
      label: "claimRebases()",
      icon: Droplets,
      // On-chain 7-day cooldown (BYND-19) — mirrors canExtendLocks below.
      can: epoch.canClaimRebases,
      done: false,
      isLoading: claimingRebases,
      description: epoch.canClaimRebases
        ? "Compounds veMEZO rebase rewards back into all deposited NFTs. Grows locked MEZO balance → grows BynD voting power. No tokens leave the vault."
        : `Called too recently — the 7-day cooldown reopens in ${formatTime(epoch.timeUntilRebaseClaim)}.`,
      onClick: handleClaimRebases,
      badge: epoch.canClaimRebases ? "Ready" : "Waiting",
      badgeVariant: epoch.canClaimRebases ? "orange" : "muted",
    },
    {
      id: "extendLocks",
      tier: "core",
      step: "01",
      label: "extendLocks()",
      icon: Shield,
      can: canExtend,
      done: epoch.epochLocksExtended,
      isLoading: extendingLocks,
      description: epoch.epochLocksExtended
        ? "Already done this epoch."
        : canExtend
          ? "Pushes protocol-held veMEZO back out to the 208-week maximum. Extend window is open now."
          : `Only callable in the final window before the epoch boundary. Opens in ${formatTime(epoch.timeUntilExtendWindow)}.`,
      onClick: handleExtendLocks,
      badge: epoch.epochLocksExtended ? "Done" : canExtend ? "Ready" : "Waiting",
      badgeVariant: epoch.epochLocksExtended ? "muted" : canExtend ? "orange" : "muted",
    },
    {
      id: "castVotes",
      tier: "core",
      step: "02",
      label: "optimiseAndVote()",
      icon: RefreshCw,
      can: canVote,
      done: epoch.epochVoted,
      isLoading: false,
      description: epoch.epochVoted
        ? "Aggregates all veMEZO power and casts votes toward highest-bribe veBTC gauges."
        : voteWindowOpen
          ? "Vote window is open now. First keeper to call it each epoch locks in the vote."
          : `Only callable in the final window before Mezo's epoch boundary. Opens in ${formatTime(epoch.timeUntilNextVote)}.`,
      onClick: onOpenCastVotesModal,
      badge: epoch.epochVoted ? "Done" : canVote ? "Ready" : "Waiting",
      badgeVariant: epoch.epochVoted ? "muted" : canVote ? "orange" : "muted",
    },
    {
      id: "claimBribes",
      tier: "core",
      step: "03",
      label: "claimBribesBatch()",
      icon: HandCoins,
      can: canClaimBribes,
      done: bribesClaimed,
      isLoading: claimingBribes,
      description: bribesClaimed
        ? "Bribes pulled in from every gauge's bribe contract. Harvest is unlocked."
        : !epoch.epochVoted
          ? "Pulls each managed veMEZO NFT's bribes into the voter. Needs votes cast first."
          : nothingPending
            ? "Votes are in, but the bribe hasn't checkpointed on Mezo's side yet — usually settles on the next epoch boundary, not instantly."
            : `Required before harvesting.${needsPaging ? ` ${epoch.claimBribesCursor}/${epoch.claimBribesTotal} processed — press again until Done.` : ""}`,
      onClick: handleClaimBribes,
      badge: bribesClaimed ? "Done" : canClaimBribes ? "Ready" : "Locked",
      badgeVariant: bribesClaimed ? "muted" : canClaimBribes ? "orange" : "muted",
    },
    {
      id: "harvest",
      tier: "core",
      step: "04",
      label: "harvestAndDistribute()",
      icon: Zap,
      can: canHarvest,
      done: epoch.epochHarvested,
      isLoading: false,
      description: epoch.epochHarvested
        ? "Splits the claimed bribes: protocol fee, keeper bounties, remainder to veBYND stakers."
        : bribesClaimed
          ? `Ready — earn ${stats.bountyBps / 100}% bounty.`
          : "Reverts until claimBribesBatch() has finished — run step 03 first.",
      onClick: onOpenHarvestModal,
      badge: epoch.epochHarvested ? "Done" : canHarvest ? "Ready" : "Locked",
      badgeVariant: epoch.epochHarvested ? "muted" : canHarvest ? "orange" : "muted",
    },
    {
      id: "syncBribesFromVault",
      tier: "extended",
      step: "R1",
      label: "syncBribesFromVault()",
      icon: ArrowRightLeft,
      // Idempotent (a no-op if the vault balance is already 0), but a real
      // (non-no-op) call is now rate-limited on-chain to once per 7 days,
      // per token (BYND-19) — so "always callable" no longer holds once
      // there's something real to move and it was moved recently.
      can: epoch.canSyncVault,
      done: false,
      isLoading: syncingVault,
      description: epoch.canSyncVault
        ? "Mezo's Bribe contract pays claim payouts to the vault (the veMEZO NFT's registered owner), not to the voter that requested them. Run this after claimBribesBatch() if a harvest ever reports nothing to distribute — pulls the vault's balance into the voter so harvest can see it. Safe to run any time; a no-op if nothing's stuck."
        : `Already synced recently — the 7-day cooldown reopens in ${formatTime(epoch.timeUntilSync)}. (Only applies when there was something real to move — a no-op call is never rate-limited.)`,
      onClick: handleSyncVault,
      badge: epoch.canSyncVault ? "Ready" : "Waiting",
      badgeVariant: epoch.canSyncVault ? "orange" : "muted",
    },
    {
      id: "retryMerge",
      tier: "extended",
      step: "R2",
      label: "retryMerge()",
      icon: GitMerge,
      can: retryMergeTokenId.length > 0,
      done: false,
      isLoading: retryingMerge,
      description:
        "Folds a \"straggler\" veMEZO NFT into the vault's canonical lock once whatever blocked the original merge clears (e.g. a live gauge vote — this clears it first). Permissionless; can only consolidate the vault's own holdings. Enter the straggler's tokenId to run.",
      onClick: handleRetryMerge,
      badge: retryMergeTokenId.length > 0 ? "Ready" : "Needs tokenId",
      badgeVariant: retryMergeTokenId.length > 0 ? "orange" : "muted",
    },
  ];

  return { steps, retryMergeTokenId, setRetryMergeTokenId };
}
