import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui";
import {
  TerminalHeader,
  OverviewStats,
  LockAndMint,
  StakeAndEarn,
  KeeperPanel,
  ActivityPanel,
  EpochRewardsPanel,
  TerminalModals,
} from "@/components/terminal";
import { useWallet } from "@/hooks/useWallet";
import { useProtocol } from "@/hooks/useProtocol";
import { useWriteContract, usePublicClient } from "wagmi";
import { parseEther } from "viem";
import {
  getAddresses,
  VAULT_ABI,
  STAKING_ABI,
  VOTER_ABI,
  VEMEZO_ABI,
  ERC20_ABI,
  MATSNET_CHAIN_ID,
} from "@/lib/contracts";

export default function TerminalPage() {
  const { isConnected, address, chainId, connect } = useWallet();

  const {
    stats,
    epoch,
    position,
    gauges,
    isLoading,
    isScanning,
    networkError,
    contractsDeployed,
    refresh,
    recordEpoch,
  } = useProtocol(address, chainId);

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [extendingLocks, setExtendingLocks] = useState(false);

  // Countdown ticking now happens centrally inside useProtocol, so every
  // page reads the same live-updating clock — no local timer needed here.
  const timeToVoteOpen = epoch.timeUntilNextVote;
  // Real global Mezo epoch number (new epoch every Thursday 00:00 UTC).
  const mezoEpoch = epoch.displayEpoch;

  const addrs = getAddresses(chainId ?? MATSNET_CHAIN_ID);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Waits for a tx to be mined AND checks it actually succeeded. Mined does
  // not mean succeeded -- a reverted tx still produces a receipt. Without
  // this check, a reverted deposit()/stake()/approve() looks identical to a
  // successful one in the UI: no error shown, no mint, no NFT transferred.
  const waitAndCheck = async (hash: `0x${string}`, label: string) => {
    // Matsnet's block times are slower/less consistent than viem's default
    // timeout assumes -- without this, a perfectly good tx that just takes a
    // bit longer to confirm throws a spurious "receipt not found" error even
    // though it lands fine a few seconds later.
    const receipt = await publicClient?.waitForTransactionReceipt({
      hash,
      timeout: 180_000, // 3 min
      pollingInterval: 3_000,
    });
    if (receipt?.status !== "success") {
      throw new Error(
        `${label} transaction was mined but reverted on-chain (${hash}). ` +
          `No changes were made -- check the transaction on the explorer for the revert reason.`,
      );
    }
    return receipt;
  };

  const withTx = async (fn: () => Promise<`0x${string}`>, label = "Transaction") => {
    const hash = await fn();
    await waitAndCheck(hash, label);
    setTimeout(refresh, 1500);
  };

  const handleDeposit = async (tokenId: number) => {
    await withTx(async () => {
      // Pre-flight: check for permanent lock — vault requires lock.end > 0.
      // Permanently locked veMEZO has end=0 and will always revert with
      // "ByNdVault: lock expired". Surface a clear error before wasting gas.
      const lockData = (await publicClient?.readContract({
        address: addrs.VeMEZO as `0x${string}`,
        abi: VEMEZO_ABI,
        functionName: "locked",
        args: [BigInt(tokenId)],
      })) as { amount: bigint; end: bigint; isPermanent: boolean } | undefined;

      if (lockData?.isPermanent) {
        throw new Error(
          "veMEZO #" +
            tokenId +
            " is permanently locked. " +
            "Call unlock_permanent(" +
            tokenId +
            ") on the veMEZO contract first, then deposit.",
        );
      }

      // Step 1: approve vault to transfer the NFT, then wait for the tx to be mined
      // AND confirm it actually succeeded -- a reverted approve() must stop this
      // flow here, not silently continue into a guaranteed-to-fail deposit().
      const approveHash = await writeContractAsync({
        address: addrs.VeMEZO,
        abi: VEMEZO_ABI,
        functionName: "approve",
        args: [addrs.ByNdVault, BigInt(tokenId)],
      });
      await waitAndCheck(approveHash, `Approval for veMEZO #${tokenId}`);

      // Step 2: deposit — approval is now confirmed on-chain.
      return writeContractAsync({
        address: addrs.ByNdVault,
        abi: VAULT_ABI,
        functionName: "deposit",
        args: [BigInt(tokenId)],
      });
    }, `Deposit of veMEZO #${tokenId}`);
  };

  const handleWithdraw = async (_tokenId: number) => {
    alert("Permanent lock. Exit via veBYND/MEZO pool on Mezo Swap.");
  };

  const handleStake = async (amount: string) => {
    await withTx(async () => {
      // Wait for the approval to be mined AND confirm it succeeded before
      // staking — on Matsnet block times are slow, so calling stake() before
      // the approval lands (or after a reverted approval) causes
      // ByNdStaking's transferFrom to revert (allowance still 0 on-chain).
      const approveHash = await writeContractAsync({
        address: addrs.VeBYND,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [addrs.ByNdStaking, parseEther(amount)],
      });
      await waitAndCheck(approveHash, "veBYND approval");

      return writeContractAsync({
        address: addrs.ByNdStaking,
        abi: STAKING_ABI,
        functionName: "stake",
        args: [parseEther(amount)],
      });
    }, `Stake of ${amount} veBYND`);
  };

  const handleUnstake = async (amount: string) => {
    await withTx(() =>
      writeContractAsync({
        address: addrs.ByNdStaking,
        abi: STAKING_ABI,
        functionName: "unstake",
        args: [parseEther(amount)],
      }),
    );
  };

  const handleClaim = async () => {
    await withTx(() =>
      writeContractAsync({
        address: addrs.ByNdStaking,
        abi: STAKING_ABI,
        functionName: "claimAll",
        args: [],
      }),
    );
  };

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
    recordEpoch(
      epoch.currentEpoch,
      stats.totalVotingPower,
      stats.pendingIncentives,
      stats.bountyBps,
    );
  };

  const handleUnlockPermanent = async (tokenId: number) => {
    // withTx expects a fn that returns a hash — return it directly and
    // wait for receipt inside withTx's own flow.
    await withTx(() =>
      writeContractAsync({
        address: addrs.VeMEZO,
        abi: VEMEZO_ABI,
        functionName: "unlockPermanent",
        args: [BigInt(tokenId)],
      }),
      `Unlock permanent lock for veMEZO #${tokenId}`,
    );
  };

  const handleExtendLock = async (tokenId: number) => {
    // Fixes the exact bug that silently broke veMEZO #832's deposit: the
    // vault requires (isPermanent || end > now), and an already-expired,
    // non-permanent lock reverts deposit() every time until extended.
    const FOUR_YEARS = 4 * 365 * 24 * 60 * 60;
    const newEnd = BigInt(Math.floor(Date.now() / 1000) + FOUR_YEARS);
    await withTx(
      () =>
        writeContractAsync({
          address: addrs.VeMEZO,
          abi: VEMEZO_ABI,
          functionName: "increaseUnlockTime",
          args: [BigInt(tokenId), newEnd],
        }),
      `Extend lock for veMEZO #${tokenId}`,
    );
  };

  const handleExtendLocks = async () => {
    setExtendingLocks(true);
    try {
      await withTx(async () => {
        // extendLocks() takes a batch of tokenIds (max 200/call) — use the
        // contract's own paging helper to fetch exactly the ones that still
        // need extending. See VAULT_ABI comment in lib/contracts.ts.
        const result = (await publicClient?.readContract({
          address: addrs.ByNdVault,
          abi: VAULT_ABI,
          functionName: "tokensNeedingExtend",
          args: [0n, 200n],
        })) as readonly [readonly bigint[], bigint] | undefined;

        const tokenIds = result?.[0];
        if (!tokenIds || tokenIds.length === 0) {
          throw new Error("No locks currently need extending.");
        }

        // ByNdVault.extendLocks() already calls voter.markLocksExtended()
        // internally as msg.sender == vault — a separate frontend call to
        // markLocksExtended() would always revert, since ByNdVoter requires
        // msg.sender == vault and a user's wallet is never that address.
        return writeContractAsync({
          address: addrs.ByNdVault,
          abi: VAULT_ABI,
          functionName: "extendLocks",
          args: [tokenIds as bigint[]],
        });
      });
    } finally {
      setExtendingLocks(false);
    }
  };

  const hasRewards = position.claimableRewards.some(r => parseFloat(r.amount || '0') > 0);
  const canExtend = epoch.canExtendLocks;

  return (
    <div className="min-h-screen bg-void">
      <TerminalHeader
        isLoading={isLoading}
        isScanning={isScanning}
        networkError={networkError}
        contractsDeployed={contractsDeployed}
        refresh={refresh}
      />

      <div className="max-w-[1700px] mx-auto px-6 py-6 space-y-6">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-14 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full border border-void-border flex items-center justify-center">
              <Lock size={24} className="text-white/60" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-white/[.38] mb-2">
                Access required
              </p>
              <p className="text-white/60 text-sm max-w-sm">
                Connect your wallet or Mezo Passport to access the terminal.
              </p>
            </div>
            <Button variant="primary" onClick={connect}>
              Connect wallet
            </Button>
          </div>
        ) : (
          <>
            <OverviewStats
              stats={stats}
              epoch={epoch}
              mezoEpoch={mezoEpoch}
              liveCountdown={epoch.epochEndsIn}
            />

            {/* Primary workflow — Step 1 and Step 2 side by side, always
                visible without scrolling. */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
              <LockAndMint
                position={position}
                stats={stats}
                isScanning={isScanning}
                isLoading={isLoading}
                onDeposit={handleDeposit}
                onUnlockPermanent={handleUnlockPermanent}
                onExtendLock={handleExtendLock}
              />
              <StakeAndEarn
                position={position}
                stats={stats}
                hasRewards={hasRewards}
                onStake={handleStake}
                onClaim={handleClaim}
                onUnstake={() => setActiveModal("unstake")}
              />
            </div>

            {/* Secondary row — keeper status, protocol activity, epoch/rewards. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <KeeperPanel
                epoch={epoch}
                stats={stats}
                canExtend={canExtend}
                extendingLocks={extendingLocks}
                timeToVoteOpen={timeToVoteOpen}
                onExtendLocks={handleExtendLocks}
                onCastVotes={() => setActiveModal("castVotes")}
                onHarvest={() => setActiveModal("harvest")}
              />
              <ActivityPanel gauges={gauges} />
              <EpochRewardsPanel
                epoch={epoch}
                stats={stats}
                mezoEpoch={mezoEpoch}
                liveCountdown={epoch.epochEndsIn}
              />
            </div>
          </>
        )}
      </div>

      <TerminalModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        position={position}
        stats={stats}
        epoch={epoch}
        gauges={gauges}
        timeToVoteOpen={timeToVoteOpen}
        onWithdraw={handleWithdraw}
        onUnstake={handleUnstake}
        onCastVotes={handleCastVotes}
        onHarvest={handleHarvest}
      />
    </div>
  );
}
