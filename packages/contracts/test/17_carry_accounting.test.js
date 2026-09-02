const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

/**
 * Phase 3 regressions — BYND-04 (double taxation) and BYND-05 (stranded carry).
 *
 * Both tests FAIL against the pre-fix contracts:
 *
 *  - BYND-04: the deferred staker share was banked into `carriedOver`, the
 *    UNTAXED bucket, so the next clearing ran it through the protocol fee and
 *    keeper bounty a second time. Value that had already paid its cut paid it
 *    again, and the keepers of the clearing epoch were paid for work the
 *    deferring epoch's keepers had already been paid for.
 *
 *  - BYND-05: `_distribute` walked only `epochUniqueTokens[epoch]`, which is
 *    rebuilt from the currently-configured gauges every epoch. Dropping a gauge
 *    via setGauges orphaned any token unique to it: the carry was never read
 *    again, and with no sweep function the ERC-20 balance was unrecoverable.
 */
describe("ByNdVoter — carry accounting (BYND-04, BYND-05)", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await deployAll();
  });

  async function stake(user, amount) {
    const { staking, veBYND, deployer } = ctx;
    const role = await veBYND.MINTER_ROLE();
    if (!(await veBYND.hasRole(role, deployer.address))) {
      await veBYND.grantRole(role, deployer.address);
    }
    await veBYND.mint(user.address, amount);
    await veBYND.connect(user).approve(await staking.getAddress(), amount);
    await staking.connect(user).stake(amount);
  }

  async function seedBribe(bribe, token, amount) {
    const { boostVoter, deployer } = ctx;
    await token.mint(deployer.address, amount);
    await token.connect(deployer).approve(await boostVoter.getAddress(), amount);
    await boostVoter.connect(deployer).seedBribe(bribe, amount);
  }

  /**
   * MockBoostVoter.seedBribe() hardcodes its constructor rewardToken
   * (rewardTokenA), so it cannot seed a second token. claimBribes() forwards
   * whatever balance the mock holds of each requested token, so minting
   * straight to the mock has the same effect on the harvest path.
   */
  async function seedBribeDirect(token, amount) {
    const { boostVoter } = ctx;
    await token.mint(await boostVoter.getAddress(), amount);
  }

  async function runEpoch() {
    const { voter } = ctx;
    await jumpInsideVoteWindow(voter);
    await voter.optimiseAndVote();
    await voter.claimBribesBatch(200);
    await voter.harvestAndDistribute();
  }

  describe("BYND-04 — deferred value is taxed exactly once", () => {
    it("does not re-tax the deferred staker share on the epoch that clears it", async () => {
      const { voter, staking, rewardTokenA, treasury, deployer, alice } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);

      // Epoch 0: nobody staked. 1000 in, keepers take 1% (10), and the 990
      // staker share is deferred — already taxed.
      await seedBribe(bribe, rewardTokenA, ethers.parseEther("1000"));
      await runEpoch();

      const treasuryAfterEpoch0 = await rewardTokenA.balanceOf(treasury.address);
      expect(await voter.carriedOverNet(await rewardTokenA.getAddress())).to.equal(
        ethers.parseEther("990")
      );

      // Epoch 1: a staker arrives, no new bribes. The deferred 990 clears.
      await stake(alice, ethers.parseEther("10"));
      await runEpoch();

      // Pre-fix the 990 paid a second 1% bounty here, so the pool received
      // 980.1 and the treasury/keepers took another 9.9. Post-fix it passes
      // through whole.
      expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(
        ethers.parseEther("990")
      );

      // treasury is the fallback for any keeper slot nobody actually filled
      // this epoch, so a second taxation would show up as a treasury
      // balance increase. It must not.
      expect(await rewardTokenA.balanceOf(treasury.address)).to.equal(
        treasuryAfterEpoch0
      );

      expect(await voter.carriedOverNet(await rewardTokenA.getAddress())).to.equal(0);
      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(0);
    });

    it("still taxes the untaxed below-threshold carry exactly once", async () => {
      const { voter, staking, rewardTokenA, deployer, alice } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await stake(alice, ethers.parseEther("10"));
      await voter
        .connect(deployer)
        .setTokenMinHarvestThreshold(
          await rewardTokenA.getAddress(),
          ethers.parseEther("150")
        );

      // Below-threshold value never reaches _settle, so it is still UNTAXED
      // and must pay its full 1% when it finally clears. The BYND-04 fix must
      // not accidentally exempt this path.
      await seedBribe(bribe, rewardTokenA, ethers.parseEther("100"));
      await runEpoch();
      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(
        ethers.parseEther("100")
      );
      expect(await voter.carriedOverNet(await rewardTokenA.getAddress())).to.equal(0);

      await seedBribe(bribe, rewardTokenA, ethers.parseEther("100"));
      await runEpoch();

      // 200 gross at 1% -> 198, not 200. Taxed once, in full.
      expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(
        ethers.parseEther("198")
      );
    });
  });

  describe("BYND-05 — a carry survives its gauge being dropped", () => {
    it("still distributes a carried token after setGauges removes the gauge that produced it", async () => {
      const { voter, staking, boostVoter, rewardTokenA, rewardTokenB, deployer, alice } =
        ctx;

      // Gauge A pays rewardTokenA. Its harvest is held back below threshold,
      // so the value sits in carriedOver.
      const { bribe: bribeA } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await stake(alice, ethers.parseEther("10"));
      await voter
        .connect(deployer)
        .setTokenMinHarvestThreshold(
          await rewardTokenA.getAddress(),
          ethers.parseEther("500")
        );

      await seedBribe(bribeA, rewardTokenA, ethers.parseEther("100"));
      await runEpoch();

      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(
        ethers.parseEther("100")
      );
      // The token is on the persistent registry, not just the epoch snapshot.
      expect(await voter.carriedOverTokens(0)).to.equal(
        await rewardTokenA.getAddress()
      );

      // Governance now drops gauge A entirely and configures gauge B, which
      // pays a completely different token. rewardTokenA no longer appears in
      // any gauge's token list, so epochUniqueTokens will never contain it
      // again.
      const gaugeB = ethers.Wallet.createRandom().address;
      const MockReward = await ethers.getContractFactory("MockReward");
      const bribeContractB = await MockReward.deploy();
      const bribeB = await bribeContractB.getAddress();
      await boostVoter.addGauge(gaugeB, bribeB);
      await voter
        .connect(deployer)
        .setGauges(
          [gaugeB],
          [bribeB],
          ["Gauge B"],
          [10000],
          [[await rewardTokenB.getAddress()]]
        );

      // Drop the threshold so the stranded 100 can clear on its own.
      await voter
        .connect(deployer)
        .setTokenMinHarvestThreshold(
          await rewardTokenA.getAddress(),
          ethers.parseEther("1")
        );

      await seedBribeDirect(rewardTokenB, ethers.parseEther("200"));
      await runEpoch();

      // Pre-fix, rewardTokenA's 100 was invisible from here on: not in the
      // epoch's token set, no sweep function, permanently unrecoverable.
      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(0);
      expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(
        ethers.parseEther("99") // 100 at 1% bounty
      );
      // And the new gauge's token settled normally alongside it.
      expect(await rewardTokenB.balanceOf(await staking.getAddress())).to.equal(
        ethers.parseEther("198")
      );
    });

    it("deregisters a token once its carry clears, keeping the registry bounded", async () => {
      const { voter, rewardTokenA, deployer, alice } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await voter
        .connect(deployer)
        .setTokenMinHarvestThreshold(
          await rewardTokenA.getAddress(),
          ethers.parseEther("150")
        );

      await seedBribe(bribe, rewardTokenA, ethers.parseEther("100"));
      await runEpoch();
      expect(await voter.carriedOverTokens(0)).to.equal(
        await rewardTokenA.getAddress()
      );

      // Clearing the carry must remove the entry, or the registry grows without
      // bound and every later harvest pays to walk dead tokens.
      await stake(alice, ethers.parseEther("10"));
      await seedBribe(bribe, rewardTokenA, ethers.parseEther("100"));
      await runEpoch();

      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(0);
      await expect(voter.carriedOverTokens(0)).to.be.reverted; // empty array
    });

    it("registers value banked by forceCloseEpoch, so it survives a gauge change too", async () => {
      const { voter, rewardTokenA, deployer } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await seedBribe(bribe, rewardTokenA, ethers.parseEther("500"));

      await jumpInsideVoteWindow(voter);
      await voter.optimiseAndVote();
      await voter.claimBribesBatch(200);
      await voter.connect(deployer).forceCloseEpoch();

      expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(
        ethers.parseEther("500")
      );
      // forceCloseEpoch banks into the untaxed bucket AND registers the token —
      // without the registration this 500 would strand on the next setGauges.
      expect(await voter.carriedOverTokens(0)).to.equal(
        await rewardTokenA.getAddress()
      );
    });
  });
});
