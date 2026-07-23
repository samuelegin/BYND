const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit, setupSingleGauge } = require("./fixtures");
const { jumpOutsideVoteWindow, jumpInsideVoteWindow } = require("./epochTime");

const DAY = 86400;

describe("ByNdVoter", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  async function fastForwardToVoteWindow() {
    await jumpInsideVoteWindow(ctx.voter);
  }

  describe("markRebasesClaimed / markLocksExtended", () => {
    it("only the vault can call these", async () => {
      const { voter, alice } = ctx;
      await expect(
        voter.connect(alice).markRebasesClaimed(alice.address)
      ).to.be.revertedWith("ByNdVoter: only vault");
      await expect(
        voter.connect(alice).markLocksExtended()
      ).to.be.revertedWith("ByNdVoter: only vault");
    });

    it("cannot be marked twice in the same epoch", async () => {
      const { vault, voter, alice } = ctx;
      await mintAndDeposit(ctx, alice);
      await vault.claimRebases();
      expect(await voter.epochRebasesClaimed(0)).to.equal(true);
      // second claimRebases in the same epoch should not revert the vault call
      // (claimRebases has no epoch gate itself) but the voter-side flag is
      // guarded and should reject a second mark
      const voterAddr = await voter.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [await vault.getAddress()]);
      await ethers.provider.send("hardhat_setBalance", [await vault.getAddress(), "0x56BC75E2D63100000"]);
      const vaultSigner = await ethers.getSigner(await vault.getAddress());
      await expect(
        voter.connect(vaultSigner).markRebasesClaimed(alice.address)
      ).to.be.revertedWith("ByNdVoter: already marked");
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [await vault.getAddress()]);
    });
  });

  describe("optimiseAndVote", () => {
    it("reverts before the vote window opens", async () => {
      const { voter } = ctx;
      await jumpOutsideVoteWindow();
      await expect(voter.optimiseAndVote()).to.be.revertedWith(
        "ByNdVoter: vote window not open"
      );
    });

    it("reverts with no managed tokenIds even inside the window", async () => {
      const { voter } = ctx;
      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote()).to.be.revertedWith(
        "ByNdVoter: no managed tokenIds"
      );
    });

    it("falls back to on-chain gauge selection (highest claimable) when no gauges are configured", async () => {
      const { voter, boostVoter, deployer } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);

      const gLow = ethers.Wallet.createRandom().address;
      const gHigh = ethers.Wallet.createRandom().address;
      await boostVoter.addGauge(gLow, ethers.Wallet.createRandom().address);
      await boostVoter.addGauge(gHigh, ethers.Wallet.createRandom().address);
      // MockValidatorsVoter.claimable() reads claimableAmount which is only set
      // by seedBribe; fake it by seeding bribes with the reward token
      const { rewardTokenA } = ctx;
      await rewardTokenA.mint(deployer.address, ethers.parseEther("500"));
      await rewardTokenA.approve(await boostVoter.getAddress(), ethers.parseEther("500"));
      const bribeHigh = await boostVoter.gaugeToBribe(gHigh);
      await boostVoter.seedBribe(bribeHigh, ethers.parseEther("500"));

      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote())
        .to.emit(voter, "GaugesOptimised")
        .withArgs(0, gHigh, ethers.parseEther("500"));
      expect(await voter.epochVoted(0)).to.equal(true);
    });

    it("uses the governance-configured gauge list when present", async () => {
      const { voter, deployer, musd } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      const { gauge } = await setupSingleGauge(ctx, musd);

      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote())
        .to.emit(voter, "VotesCast")
        .withArgs(0, 1, 1);
    });

    it("cannot be voted twice in the same epoch", async () => {
      const { voter, deployer, musd } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await setupSingleGauge(ctx, musd);
      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await expect(voter.optimiseAndVote()).to.be.revertedWith(
        "ByNdVoter: already voted"
      );
    });
  });

  describe("harvestAndDistribute", () => {
    async function stakeSome(user, amount) {
      const { staking, veBYND, deployer } = ctx;
      await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
      await veBYND.mint(user.address, amount);
      await veBYND.connect(user).approve(await staking.getAddress(), amount);
      await staking.connect(user).stake(amount);
    }

    it("reverts if votes have not been cast this epoch", async () => {
      const { voter } = ctx;
      await expect(voter.harvestAndDistribute()).to.be.revertedWith(
        "ByNdVoter: votes not cast"
      );
    });

    it("reverts on a second harvest of the same epoch", async () => {
      const { voter, deployer, musd } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await setupSingleGauge(ctx, musd);
      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await stakeSome(ctx.alice, ethers.parseEther("1"));
      await voter.harvestAndDistribute();
      // currentEpoch has advanced, so a second call now fails on "votes not cast"
      // for the *new* epoch rather than "already harvested" for the old one
      await expect(voter.harvestAndDistribute()).to.be.revertedWith(
        "ByNdVoter: votes not cast"
      );
    });

    it("splits the 1% bounty five ways and routes 99% to stakers", async () => {
      const { voter, boostVoter, staking, treasury, deployer, keeper, musd, alice } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await setupSingleGauge(ctx, musd);
      await stakeSome(alice, ethers.parseEther("100"));

      // fund the mock boost voter with the bribe payout that claimBribes will sweep
      await musd.mint(await boostVoter.getAddress(), ethers.parseEther("1000"));

      await fastForwardToVoteWindow();
      // keeper (not deployer/governance) is the one who calls optimiseAndVote
      // here, so it's credited for that step's bounty share too
      await voter.connect(keeper).optimiseAndVote();

      const treasuryBefore = await musd.balanceOf(treasury.address);
      const keeperBefore = await musd.balanceOf(keeper.address);

      await expect(voter.connect(keeper).harvestAndDistribute())
        .to.emit(voter, "Harvested")
        .withArgs(0, keeper.address, ethers.parseEther("10"));

      // claimRebases and extendLocks were never routed through the vault in
      // this isolated test, so those 2 keeper slots default to treasury; add
      // treasury's own fixed slot => 3 shares of 2 MUSD = 6 MUSD to treasury.
      // keeper called both optimiseAndVote and harvestAndDistribute => 2
      // shares of 2 MUSD = 4 MUSD to keeper.
      expect((await musd.balanceOf(treasury.address)) - treasuryBefore).to.equal(
        ethers.parseEther("6")
      );
      expect((await musd.balanceOf(keeper.address)) - keeperBefore).to.equal(
        ethers.parseEther("4")
      );

      // 99% (990 MUSD) flowed into staking for the single staker
      expect(
        await staking.claimable(await musd.getAddress(), alice.address)
      ).to.equal(ethers.parseEther("990"));
    });

    it("leaves the staker share sitting in the voter (not lost) if nobody is staked yet", async () => {
      const { voter, boostVoter, staking, deployer, musd } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await setupSingleGauge(ctx, musd);
      await musd.mint(await boostVoter.getAddress(), ethers.parseEther("1000"));

      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await voter.harvestAndDistribute();

      // notifyRewardAmount no-ops when totalStaked == 0, so the 99% share
      // never left the voter contract
      expect(await musd.balanceOf(await voter.getAddress())).to.equal(
        ethers.parseEther("990")
      );
      expect(await staking.rewardTokenCount()).to.equal(0);
    });
  });

  describe("setGauges", () => {
    it("requires weights to sum to 10000 bps", async () => {
      const { voter, boostVoter, deployer, musd } = ctx;
      const gauge = ethers.Wallet.createRandom().address;
      const bribe = ethers.Wallet.createRandom().address;
      await boostVoter.addGauge(gauge, bribe);
      await expect(
        voter
          .connect(deployer)
          .setGauges([gauge], [bribe], ["G"], [9000], [[await musd.getAddress()]])
      ).to.be.revertedWith("ByNdVoter: weights must sum to 10000");
    });

    it("requires the gauge to be alive on the boost voter", async () => {
      const { voter, boostVoter, deployer, musd } = ctx;
      const gauge = ethers.Wallet.createRandom().address;
      const bribe = ethers.Wallet.createRandom().address;
      await boostVoter.addGauge(gauge, bribe);
      await boostVoter.killGauge(gauge);
      await expect(
        voter
          .connect(deployer)
          .setGauges([gauge], [bribe], ["G"], [10000], [[await musd.getAddress()]])
      ).to.be.revertedWith("ByNdVoter: gauge not alive");
    });

    it("only governance can configure gauges", async () => {
      const { voter, alice, musd } = ctx;
      await expect(
        voter.connect(alice).setGauges([], [], [], [], [])
      ).to.be.revertedWith("ByNdVoter: not governance");
    });

    it("an empty gauge array clears the configured list", async () => {
      const { voter, deployer, musd } = ctx;
      await setupSingleGauge(ctx, musd);
      expect(await voter.getGaugeCount()).to.equal(1);
      await voter.connect(deployer).setGauges([], [], [], [], []);
      expect(await voter.getGaugeCount()).to.equal(0);
    });
  });

  describe("managed tokenIds", () => {
    it("only the vault or governance can add managed tokenIds", async () => {
      const { voter, alice } = ctx;
      await expect(
        voter.connect(alice).addManagedTokenId(5)
      ).to.be.revertedWith("ByNdVoter: not vault");
    });

    it("does not add the same tokenId twice, and matches the batch variant's skip-dupe behavior", async () => {
      const { voter } = ctx;
      const vaultAddr = await ctx.vault.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [vaultAddr]);
      await ethers.provider.send("hardhat_setBalance", [vaultAddr, "0x56BC75E2D63100000"]);
      const vaultSigner = await ethers.getSigner(vaultAddr);

      await voter.connect(vaultSigner).addManagedTokenId(7);
      // a repeat single add is now a silent no-op instead of a revert, so a
      // retried single deposit can't fail on a dupe tokenId
      await expect(
        voter.connect(vaultSigner).addManagedTokenId(7)
      ).to.not.be.reverted;
      expect(await voter.getManagedTokenCount()).to.equal(1);

      await expect(
        voter.connect(vaultSigner).addManagedTokenIds([7, 8])
      ).to.not.be.reverted;
      expect(await voter.getManagedTokenCount()).to.equal(2); // 7 skipped, 8 added

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [vaultAddr]);
    });

    it("removeManagedTokenId is governance-only and swap-removes correctly", async () => {
      const { voter, deployer, alice } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).addManagedTokenId(2);
      await expect(
        voter.connect(alice).removeManagedTokenId(1)
      ).to.be.revertedWith("ByNdVoter: not governance");
      await voter.connect(deployer).removeManagedTokenId(1);
      expect(await voter.getManagedTokenIds()).to.deep.equal([2n]);
    });
  });

  describe("admin", () => {
    it("gates every setter behind onlyGovernance", async () => {
      const { voter, alice, treasury, boostVoter } = ctx;
      await expect(voter.connect(alice).setVault(alice.address)).to.be.revertedWith(
        "ByNdVoter: not governance"
      );
      await expect(
        voter.connect(alice).setBoostVoter(await boostVoter.getAddress())
      ).to.be.revertedWith("ByNdVoter: not governance");
      await expect(
        voter.connect(alice).setTreasury(treasury.address)
      ).to.be.revertedWith("ByNdVoter: not governance");
      await expect(voter.connect(alice).setBountyBps(200)).to.be.revertedWith(
        "ByNdVoter: not governance"
      );
      await expect(
        voter.connect(alice).setEpochDuration(2 * DAY)
      ).to.be.revertedWith("ByNdVoter: not governance");
    });

    it("caps the bounty at 5%", async () => {
      const { voter, deployer } = ctx;
      await expect(voter.connect(deployer).setBountyBps(501)).to.be.revertedWith(
        "ByNdVoter: max 5%"
      );
      await expect(voter.connect(deployer).setBountyBps(500)).to.not.be.reverted;
    });

    it("transferGovernance moves admin rights to the new address", async () => {
      const { voter, deployer, alice } = ctx;
      await voter.connect(deployer).transferGovernance(alice.address);
      expect(await voter.governance()).to.equal(alice.address);
      await expect(
        voter.connect(deployer).setBountyBps(50)
      ).to.be.revertedWith("ByNdVoter: not governance");
      await expect(voter.connect(alice).setBountyBps(50)).to.not.be.reverted;
    });
  });

  describe("UUPS upgrade authorization", () => {
    it("only governance can authorize an upgrade", async () => {
      const { voter, alice } = ctx;
      const { upgrades } = require("hardhat");
      const ByNdVoterV2 = await ethers.getContractFactory("ByNdVoter", alice);
      await expect(
        upgrades.upgradeProxy(await voter.getAddress(), ByNdVoterV2)
      ).to.be.reverted;
    });
  });
});
