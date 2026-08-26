import { useState } from "react";
import { SectionHeader } from "@/components/ui";
import { CastVotesModal, HarvestModal } from "@/components/modals";
import { StatusOverview, EpochFlowSteps, KeeperNotes } from "@/components/keeper";
import { useProtocol } from "@/hooks/useProtocol";
import { useWallet } from "@/hooks/useWallet";
import { useKeeperSteps } from "@/hooks/useKeeperSteps";
import { useWriteContract, usePublicClient } from "wagmi";
import { getAddresses, VOTER_ABI } from "@/lib/contracts";

export default function KeeperPage() {
  const { address, chainId } = useWallet();
  // Pass address+chainId so contractsEnabled fires and all on-chain reads execute
  const { stats, epoch, gauges, refresh } = useProtocol(address, chainId);

  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Epoch display + vote-window countdown come from the shared useProtocol
  // hook — same Thursday-based global epoch number and chain-verified
  // timing used on the Terminal page.
  const mezoEpoch = epoch.displayEpoch;
  const liveCountdown = epoch.epochEndsIn;
  const timeToVoteOpen = epoch.timeUntilNextVote;

  const addrs = getAddresses(chainId ?? 31611);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const withTx = async (fn: () => Promise<`0x${string}`>) => {
    const hash = await fn();
    await publicClient?.waitForTransactionReceipt({ hash });
    setTimeout(refresh, 1500);
  };

  // castVotes/harvest are confirm-time handlers for the modals below, not
  // part of the step list itself (the step list only owns opening the
  // modal) — same split Terminal.tsx uses, kept as-is here.
  const handleCastVotes = async () => {
    await withTx(() =>
      writeContractAsync({
        address: addrs.ByNdVoter,
        abi: VOTER_ABI,
        functionName: "optimiseAndVote",
        args: [],
      }),
    );
  };

  const handleHarvest = async () => {
    await withTx(() =>
      writeContractAsync({
        address: addrs.ByNdVoter,
        abi: VOTER_ABI,
        functionName: "harvestAndDistribute",
        args: [],
      }),
    );
  };

  // Step gating + write handlers (claimRebases, extendLocks, claimBribes,
  // plus the two extended/recovery steps: syncBribesFromVault and
  // retryMerge) now live once in useKeeperSteps, shared with the Terminal
  // page's KeeperPanel — this is what fixes canClaimBribes here having
  // silently drifted out of sync with Terminal's already-patched version.
  const { steps, retryMergeTokenId, setRetryMergeTokenId } = useKeeperSteps({
    epoch,
    stats,
    chainId,
    onOpenCastVotesModal: () => setActiveModal("castVotes"),
    onOpenHarvestModal: () => setActiveModal("harvest"),
    runTx: (fn) => withTx(fn),
  });

  const bribesClaimed = epoch.claimBribesReady;

  return (
    <div className="min-h-screen bg-void">
      <div className="max-w-[1120px] mx-auto px-5 pt-6">
        <SectionHeader
          label="Keeper"
          title="Keeper dashboard"
          subtitle="Epoch-gated keeper functions. Call in order each epoch. Earn bounties (paid in whatever token was harvested) by triggering harvestAndDistribute."
        />
      </div>

      <div className="max-w-[1120px] mx-auto px-5 py-8 space-y-6">
        <StatusOverview
          mezoEpoch={mezoEpoch}
          liveCountdown={liveCountdown}
          pendingIncentives={stats.pendingIncentives}
          rewardTokenSymbol={stats.rewardTokenSymbol}
        />
        <EpochFlowSteps steps={steps.filter((s) => s.tier === "core")} />

        {/* Recovery / maintenance steps — not part of the routine weekly
            cycle, so kept visually separate from the core flow above. */}
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-3">
            Recovery &amp; maintenance
          </p>
          <div className="space-y-3">
            {steps
              .filter((s) => s.tier === "extended")
              .map((s) =>
                s.id === "retryMerge" ? (
                  <div key={s.id} className="rounded-control border border-void-border p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-white/[.87]">{s.label}</p>
                      <p className="text-xs text-white/60 mt-1">{s.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Straggler tokenId"
                        value={retryMergeTokenId}
                        onChange={(e) => setRetryMergeTokenId(e.target.value.replace(/\D/g, ""))}
                        className="flex-1 rounded-control border border-void-border bg-transparent px-3 py-2 text-sm text-white/[.87] placeholder:text-white/30 outline-none focus:border-gold/40"
                      />
                      <button
                        onClick={s.onClick}
                        disabled={!s.can || s.isLoading}
                        className="shrink-0 rounded-control border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {s.isLoading ? "Running…" : "Retry merge"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={s.id} className="rounded-control border border-void-border p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-white/[.87]">{s.label}</p>
                      <p className="text-xs text-white/60 mt-1">{s.description}</p>
                    </div>
                    <button
                      onClick={s.onClick}
                      disabled={!s.can || s.isLoading}
                      className="w-full rounded-control border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-gold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {s.isLoading ? "Running…" : s.label}
                    </button>
                  </div>
                ),
              )}
          </div>
        </div>

        <KeeperNotes />
      </div>

      <CastVotesModal
        isOpen={activeModal === "castVotes"}
        onClose={() => setActiveModal(null)}
        totalPower={stats.totalVotingPower}
        gauges={gauges}
        epochVoted={epoch.epochVoted}
        timeUntilNextVote={timeToVoteOpen}
        onCastVotes={handleCastVotes}
      />
      <HarvestModal
        isOpen={activeModal === "harvest"}
        onClose={() => setActiveModal(null)}
        pendingIncentives={stats.pendingIncentives}
        bountyBps={stats.bountyBps}
        epochVoted={epoch.epochVoted}
        epochHarvested={epoch.epochHarvested}
        bribesClaimed={bribesClaimed}
        claimCursor={epoch.claimBribesCursor}
        claimTotal={epoch.claimBribesTotal}
        onHarvest={handleHarvest}
      />
    </div>
  );
}
