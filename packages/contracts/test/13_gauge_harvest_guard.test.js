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
    await expect(voter.harvestAndDistribute()).to.not.be.reverted;
  });

  it("emits VoteCastFailed instead of silently swallowing a reverted vote() call", async () => {
    const { voter, boostVoter, deployer } = ctx;
    await voter.connect(deployer).setManagedTokenId(1);
    const { gauge, bribe } = await setupSingleGauge(ctx, ctx.rewardTokenA);
    void gauge;
    void bribe;

    await boostVoter.setShouldRevertVote(true);
    await fastForwardToVoteWindow();

    // the outer call still succeeds (the epoch is still marked voted) —
    // only the underlying boostVoter.vote() call failed and is now visible
    // via the event instead of disappearing into an empty catch block.
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
    await expect(voter.harvestAndDistribute())
      .to.emit(voter, "BribeClaimFailed")
      .withArgs(0, 1);
  });
});
