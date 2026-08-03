const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

describe("ByNdVoter — gauge harvest guard & failure visibility", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  async function fastForwardToVoteWindow() {
    await jumpInsideVoteWindow(ctx.voter);
  }

  it("harvestAndDistribute reverts loudly if votes were cast purely via the auto-select fallback and gauges were never explicitly configured", async () => {
    const { voter, boostVoter, deployer } = ctx;
    await voter.connect(deployer).setManagedTokenId(1);

    const gauge = ethers.Wallet.createRandom().address;
    await boostVoter.addGauge(gauge, ethers.Wallet.createRandom().address);

    await fastForwardToVoteWindow();
    // succeeds via the fallback — gauges.length is still 0 at this point
    await voter.optimiseAndVote();
    expect(await voter.epochVoted(0)).to.equal(true);

    // harvesting must NOT silently succeed with zero — it should refuse
    // until governance explicitly configures gauges via setGauges().
    await expect(voter.harvestAndDistribute()).to.be.revertedWith(
      "ByNdVoter: gauges not configured, call setGauges before harvesting"
    );

    // and the epoch must not have been silently burned — currentEpoch is
    // unchanged, so once gauges ARE configured, harvesting for this same
    // epoch can still succeed.
    expect(await voter.currentEpoch()).to.equal(0);
    await setupSingleGauge(ctx, ctx.rewardTokenA);
    await ctx.rewardTokenA.mint(await boostVoter.getAddress(), ethers.parseEther("100"));
    await voter.claimBribesBatch(200);
    await expect(voter.harvestAndDistribute()).to.not.be.reverted;
  });

  it("reverts rather than stranding the epoch when EVERY vote() call fails", async () => {
    const { voter, boostVoter, deployer } = ctx;
    await voter.connect(deployer).setManagedTokenId(1);
    const { gauge, bribe } = await setupSingleGauge(ctx, ctx.rewardTokenA);
    void gauge;
    void bribe;

    await boostVoter.setShouldRevertVote(true);
    await fastForwardToVoteWindow();

    // Marking the epoch voted when nothing reached a bribe contract strands it
    // permanently: claimBribesBatch claims 0, then harvestAndDistribute can
    // only ever revert on "nothing harvested this epoch". Observed live on
    // Matsnet epoch 0 — votes failed on a missing vault approval, and the epoch
    // needed governance forceCloseEpoch() to recover.
    await expect(voter.optimiseAndVote()).to.be.revertedWith(
      "ByNdVoter: votes not cast"
    );

    // The epoch stays open, so the keeper can fix the cause and retry it.
    expect(await voter.epochVoted(0)).to.equal(false);
    expect(await voter.currentEpoch()).to.equal(0);

    await boostVoter.setShouldRevertVote(false);
    await expect(voter.optimiseAndVote()).to.not.be.reverted;
    expect(await voter.epochVoted(0)).to.equal(true);
  });

  it("still tolerates a PARTIAL vote failure, emitting VoteCastFailed for the bad tokenId only", async () => {
    const { voter, boostVoter, deployer } = ctx;
    await voter.connect(deployer).addManagedTokenIds([1, 2]);
    await setupSingleGauge(ctx, ctx.rewardTokenA);

    // tokenId 1 reverts, tokenId 2 lands. One bad lock must not block the rest.
    await boostVoter.setShouldRevertVoteFor(1, true);
    await fastForwardToVoteWindow();

    await expect(voter.optimiseAndVote())
      .to.emit(voter, "VoteCastFailed")
      .withArgs(0, 1);
    expect(await voter.epochVoted(0)).to.equal(true);
  });

  it("emits BribeClaimFailed instead of silently swallowing a reverted claimBribes() call", async () => {
    const { voter, boostVoter, deployer, rewardTokenA } = ctx;
    await voter.connect(deployer).setManagedTokenId(1);
    await setupSingleGauge(ctx, rewardTokenA);

    await fastForwardToVoteWindow();
    await voter.optimiseAndVote();

    await boostVoter.setShouldRevertClaim(true);
    await expect(voter.claimBribesBatch(200))
      .to.emit(voter, "BribeClaimFailed")
      .withArgs(0, 1);
  });
});
