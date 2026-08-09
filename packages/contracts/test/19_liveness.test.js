const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow, WEEK, nextBoundary } = require("./epochTime");

/**
 * Phase 5 regressions — BYND-06 and BYND-11.
 *
 * BYND-06 is a liveness bug, not a value bug. Two reachable states cannot
 * complete a normal harvest: an epoch voted through auto-select while `gauges`
 * was never configured (claimBribesBatch and harvestAndDistribute both refuse),
 * and an epoch where nothing was harvested (harvestAndDistribute reverts on
 * "nothing harvested this epoch"). Both needed onlyGovernance forceCloseEpoch to
 * escape, so losing the governance key froze the protocol permanently.
 */
describe("ByNdVoter — liveness and scan observability", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await deployAll();
  });

  /// Moves past the point where the permissionless force-close opens: the
  /// deadline is measured from the end of the epoch containing lastVoteTimestamp,
  /// not from now.
  async function jumpPastForceCloseDeadline() {
    const { voter } = ctx;
    const opensAt = Number((await voter.forceCloseStatus())[0]);
    await ethers.provider.send("evm_setNextBlockTimestamp", [opensAt + 1]);
    await ethers.provider.send("evm_mine");
  }

  describe("BYND-06 — permissionless epoch recovery", () => {
    it("lets anyone close an epoch stranded past the deadline, without governance", async () => {
      const { voter, boostVoter, deployer, stranger } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);

      // The auto-select freeze state: a live gauge exists, so the vote lands,
      // but `gauges` is empty so nothing downstream will accept the epoch.
      const gauge = ethers.Wallet.createRandom().address;
      await boostVoter.addGauge(gauge, ethers.Wallet.createRandom().address);

      await jumpInsideVoteWindow(voter);
      await voter.optimiseAndVote();

      await expect(voter.harvestAndDistribute()).to.be.revertedWith(
        "ByNdVoter: gauges not configured, call setGauges before harvesting"
      );

      // Too early: the hatch is shut while the epoch is merely late.
      expect((await voter.forceCloseStatus())[1]).to.equal(false);
      await expect(voter.connect(stranger).forceCloseEpoch()).to.be.revertedWith(
        "ByNdVoter: force close not yet open"
      );

      await jumpPastForceCloseDeadline();
      expect((await voter.forceCloseStatus())[1]).to.equal(true);

      // Pre-fix this call was onlyGovernance, so a lost key meant the epoch --
      // and every epoch after it -- never advanced.
      await expect(voter.connect(stranger).forceCloseEpoch())
        .to.emit(voter, "Harvested")
        .withArgs(0, stranger.address, 0);
      expect(await voter.currentEpoch()).to.equal(1);
    });

    it("banks the stranded balance into carriedOver rather than losing it", async () => {
      const { voter, boostVoter, deployer, stranger, rewardTokenA } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await setupSingleGauge(ctx, rewardTokenA);

      await jumpInsideVoteWindow(voter);
      await voter.optimiseAndVote();

      // Snapshot the balances, then have value land afterwards. It is inside the
      // epoch's delta but the epoch never harvests it.
      await voter.claimBribesBatch(200);
      await rewardTokenA.mint(await voter.getAddress(), ethers.parseEther("100"));

      await jumpPastForceCloseDeadline();
      await voter.connect(stranger).forceCloseEpoch();

      // Untaxed, so it lands in carriedOver (not carriedOverNet) and is taxed
      // once on the epoch that finally clears it.
      const tokenAddr = await rewardTokenA.getAddress();
      expect(await voter.carriedOver(tokenAddr)).to.equal(
        ethers.parseEther("100")
      );
      // Registered too, so dropping the gauge later cannot orphan it (BYND-05).
      expect(await voter.carriedOverTokens(0)).to.equal(tokenAddr);
    });

    it("governance keeps the immediate path, with no waiting period", async () => {
      const { voter, boostVoter, deployer } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      const gauge = ethers.Wallet.createRandom().address;
      await boostVoter.addGauge(gauge, ethers.Wallet.createRandom().address);

      await jumpInsideVoteWindow(voter);
      await voter.optimiseAndVote();

      expect((await voter.forceCloseStatus())[1]).to.equal(false);
      await expect(voter.connect(deployer).forceCloseEpoch()).to.not.be.reverted;
      expect(await voter.currentEpoch()).to.equal(1);
    });

    it("cannot be looped to burn through epoch numbers", async () => {
      const { voter, boostVoter, deployer, stranger } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      const gauge = ethers.Wallet.createRandom().address;
      await boostVoter.addGauge(gauge, ethers.Wallet.createRandom().address);

      await jumpInsideVoteWindow(voter);
      await voter.optimiseAndVote();

      await jumpPastForceCloseDeadline();
      await voter.connect(stranger).forceCloseEpoch();
      expect(await voter.currentEpoch()).to.equal(1);

      // lastVoteTimestamp does not move on a force-close, so the deadline is
      // still in the past. What stops a second call is that the epoch it just
      // opened has not been voted -- and an unvoted epoch has nothing stranded
      // in it to rescue.
      await expect(voter.connect(stranger).forceCloseEpoch()).to.be.revertedWith(
        "ByNdVoter: votes not cast"
      );
      expect(await voter.currentEpoch()).to.equal(1);
    });

    it("refuses once the epoch has been harvested normally", async () => {
      const { voter, deployer, stranger, rewardTokenA, boostVoter } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await setupSingleGauge(ctx, rewardTokenA);
      await rewardTokenA.mint(
        await boostVoter.getAddress(),
        ethers.parseEther("100")
      );

      await jumpInsideVoteWindow(voter);
      await voter.optimiseAndVote();
      await voter.claimBribesBatch(200);
      await voter.harvestAndDistribute();

      await jumpPastForceCloseDeadline();
      // currentEpoch is 1 now and epoch 1 was never voted.
      await expect(voter.connect(stranger).forceCloseEpoch()).to.be.revertedWith(
        "ByNdVoter: votes not cast"
      );
    });
  });

  describe("BYND-06 — the empty-gauge state is announced at vote time", () => {
    it("emits VotedWithoutConfiguredGauges when auto-select carries the vote", async () => {
      const { voter, boostVoter, deployer } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      const gauge = ethers.Wallet.createRandom().address;
      await boostVoter.addGauge(gauge, ethers.Wallet.createRandom().address);

      // Voting still succeeds -- auto-select is a real feature and the bribes it
      // earns are recoverable once setGauges names the bribe contract. But the
      // keeper now learns at vote time that this epoch cannot harvest as-is,
      // instead of finding out when claimBribesBatch reverts.
      await jumpInsideVoteWindow(voter);
      await expect(voter.optimiseAndVote())
        .to.emit(voter, "VotedWithoutConfiguredGauges")
        .withArgs(0, gauge);
    });

    it("stays silent when gauges are configured", async () => {
      const { voter, deployer, rewardTokenA } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await setupSingleGauge(ctx, rewardTokenA);

      await jumpInsideVoteWindow(voter);
      await expect(voter.optimiseAndVote()).to.not.emit(
        voter,
        "VotedWithoutConfiguredGauges"
      );
    });
  });

  describe("BYND-11 — a truncated gauge scan is visible", () => {
    /// Registers `n` gauges, each with a live bribe contract, and gives the last
    /// one the richest bribe so a full scan and a capped scan disagree.
    async function seedGauges(n) {
      const { boostVoter, voter, deployer, musd } = ctx;
      const MockReward = await ethers.getContractFactory("MockReward");
      const addrs = [];
      for (let i = 0; i < n; i++) {
        const gauge = ethers.Wallet.createRandom().address;
        const bribeContract = await MockReward.deploy();
        await bribeContract.setTokenRewardsPerEpoch(
          await musd.getAddress(),
          ethers.parseEther(String(100 * (i + 1)))
        );
        await boostVoter.addGauge(gauge, await bribeContract.getAddress());
        addrs.push(gauge);
      }
      await voter
        .connect(deployer)
        .setTokenWeights([await musd.getAddress()], [10000]);
      return addrs;
    }

    it("emits ScanTruncated with the coverage the ranking actually had", async () => {
      const { voter, deployer } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      const gauges = await seedGauges(4);
      await voter.connect(deployer).setScanCap(2);

      // The scan ranked gauges[0..1] and picked gauges[1]; gauges[3] is richer
      // but was never examined. Pre-fix that was indistinguishable from a
      // complete scan, so a partial ranking looked authoritative.
      await jumpInsideVoteWindow(voter);
      const tx = voter.optimiseAndVote();
      await expect(tx).to.emit(voter, "ScanTruncated").withArgs(0, 2, 4);
      await expect(tx)
        .to.emit(voter, "GaugesOptimised")
        .withArgs(0, gauges[1], ethers.parseEther("200"));
    });

    it("stays silent when the scan reached the end of the list", async () => {
      const { voter, deployer } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      const gauges = await seedGauges(3);
      await voter.connect(deployer).setScanCap(10);

      await jumpInsideVoteWindow(voter);
      const tx = voter.optimiseAndVote();
      await expect(tx).to.not.emit(voter, "ScanTruncated");
      // And with full coverage it finds the genuinely richest gauge.
      await expect(tx)
        .to.emit(voter, "GaugesOptimised")
        .withArgs(0, gauges[2], ethers.parseEther("300"));
    });

    it("previewOptimalGauge keeps its two-value shape for the dashboard", async () => {
      const { voter, deployer } = ctx;
      const gauges = await seedGauges(3);

      const [bestGauge, bestScore] = await voter.previewOptimalGauge();
      expect(bestGauge).to.equal(gauges[2]);
      expect(bestScore).to.equal(ethers.parseEther("300"));
    });
  });
});
