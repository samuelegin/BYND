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
      const tokenId = await mintAndDeposit(ctx, alice);
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

    it("ranks gauges by value-weighted bribes via each gauge's own bribe contract, not the old (likely-always-zero on the real chain) claimable(gauge)", async () => {
      const { voter, boostVoter, deployer, musd } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setBribeReferenceToken(await musd.getAddress());
      // The valuation set is what the selector ranks on. MUSD is the value
      // reference, so it weighs 10000 bps == 1x.
      await voter.connect(deployer).setTokenWeights([await musd.getAddress()], [10_000]);

      const MockReward = await ethers.getContractFactory("MockReward");
      const gLow = ethers.Wallet.createRandom().address;
      const gHigh = ethers.Wallet.createRandom().address;
      const bribeLow = await MockReward.deploy();
      const bribeHigh = await MockReward.deploy();
      await boostVoter.addGauge(gLow, await bribeLow.getAddress());
      await boostVoter.addGauge(gHigh, await bribeHigh.getAddress());

      await bribeLow.setTokenRewardsPerEpoch(await musd.getAddress(), ethers.parseEther("100"));
      await bribeHigh.setTokenRewardsPerEpoch(await musd.getAddress(), ethers.parseEther("500"));

      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote())
        .to.emit(voter, "GaugesOptimised")
        .withArgs(0, gHigh, ethers.parseEther("500"));
      expect(await voter.epochVoted(0)).to.equal(true);
    });

    it("does NOT get fooled by a large amount of an UNVALUED token — a gauge holding a big pile of a token governance has not priced contributes nothing to its score", async () => {
      const { voter, boostVoter, deployer, musd, rewardTokenA } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setBribeReferenceToken(await musd.getAddress());
      await voter.connect(deployer).setTokenWeights([await musd.getAddress()], [10_000]);

      const MockReward = await ethers.getContractFactory("MockReward");
      const gWrongToken = ethers.Wallet.createRandom().address;
      const gRealMusd = ethers.Wallet.createRandom().address;
      const bribeWrongToken = await MockReward.deploy();
      const bribeRealMusd = await MockReward.deploy();
      await boostVoter.addGauge(gWrongToken, await bribeWrongToken.getAddress());
      await boostVoter.addGauge(gRealMusd, await bribeRealMusd.getAddress());

      // gWrongToken has a HUGE amount of rewardTokenA, which is NOT in the
      // valuation set, and zero MUSD. Old logic comparing raw claimable()
      // numbers with no token awareness could easily have picked it.
      await bribeWrongToken.setTokenRewardsPerEpoch(await rewardTokenA.getAddress(), ethers.parseEther("1000000"));
      await bribeRealMusd.setTokenRewardsPerEpoch(await musd.getAddress(), ethers.parseEther("50"));

      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote())
        .to.emit(voter, "GaugesOptimised")
        .withArgs(0, gRealMusd, ethers.parseEther("50"));
    });

    it("compares bribes ACROSS tokens by value, not raw amount — 100 of a 50x token beats 500 of the reference token", async () => {
      const { voter, boostVoter, deployer, musd, rewardTokenA } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setBribeReferenceToken(await musd.getAddress());
      // rewardTokenA is priced at 50x the reference token per unit. This is
      // the whole point: 100 MEZO, 100 sats and 100 MUSD are not the same
      // value, so the selector must weigh them before comparing.
      await voter.connect(deployer).setTokenWeights(
        [await musd.getAddress(), await rewardTokenA.getAddress()],
        [10_000, 500_000]
      );

      const MockReward = await ethers.getContractFactory("MockReward");
      const gBigRawAmount = ethers.Wallet.createRandom().address;
      const gHighValue = ethers.Wallet.createRandom().address;
      const bribeBigRaw = await MockReward.deploy();
      const bribeHighValue = await MockReward.deploy();
      await boostVoter.addGauge(gBigRawAmount, await bribeBigRaw.getAddress());
      await boostVoter.addGauge(gHighValue, await bribeHighValue.getAddress());

      // 500 MUSD  -> 500 * 10000/10000  =  500 units of value
      // 100 tokenA -> 100 * 500000/10000 = 5000 units of value  <-- wins
      await bribeBigRaw.setTokenRewardsPerEpoch(await musd.getAddress(), ethers.parseEther("500"));
      await bribeHighValue.setTokenRewardsPerEpoch(await rewardTokenA.getAddress(), ethers.parseEther("100"));

      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote())
        .to.emit(voter, "GaugesOptimised")
        .withArgs(0, gHighValue, ethers.parseEther("5000"));
    });

    it("sums a gauge's value across every valued token, so a spread of small bribes can beat one big single-token bribe", async () => {
      const { voter, boostVoter, deployer, musd, rewardTokenA } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setBribeReferenceToken(await musd.getAddress());
      await voter.connect(deployer).setTokenWeights(
        [await musd.getAddress(), await rewardTokenA.getAddress()],
        [10_000, 20_000]
      );

      const MockReward = await ethers.getContractFactory("MockReward");
      const gSingle = ethers.Wallet.createRandom().address;
      const gMixed = ethers.Wallet.createRandom().address;
      const bribeSingle = await MockReward.deploy();
      const bribeMixed = await MockReward.deploy();
      await boostVoter.addGauge(gSingle, await bribeSingle.getAddress());
      await boostVoter.addGauge(gMixed, await bribeMixed.getAddress());

      // gSingle: 300 MUSD                      -> 300
      // gMixed : 100 MUSD + 150 tokenA (2x)    -> 100 + 300 = 400  <-- wins
      await bribeSingle.setTokenRewardsPerEpoch(await musd.getAddress(), ethers.parseEther("300"));
      await bribeMixed.setTokenRewardsPerEpoch(await musd.getAddress(), ethers.parseEther("100"));
      await bribeMixed.setTokenRewardsPerEpoch(await rewardTokenA.getAddress(), ethers.parseEther("150"));

      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote())
        .to.emit(voter, "GaugesOptimised")
        .withArgs(0, gMixed, ethers.parseEther("400"));
    });

    it("previewOptimalGauge agrees with the gauge optimiseAndVote actually picks", async () => {
      const { voter, boostVoter, deployer, musd, rewardTokenA } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setBribeReferenceToken(await musd.getAddress());
      await voter.connect(deployer).setTokenWeights(
        [await musd.getAddress(), await rewardTokenA.getAddress()],
        [10_000, 500_000]
      );

      const MockReward = await ethers.getContractFactory("MockReward");
      const gLow = ethers.Wallet.createRandom().address;
      const gWin = ethers.Wallet.createRandom().address;
      const bribeLow = await MockReward.deploy();
      const bribeWin = await MockReward.deploy();
      await boostVoter.addGauge(gLow, await bribeLow.getAddress());
      await boostVoter.addGauge(gWin, await bribeWin.getAddress());
      await bribeLow.setTokenRewardsPerEpoch(await musd.getAddress(), ethers.parseEther("900"));
      await bribeWin.setTokenRewardsPerEpoch(await rewardTokenA.getAddress(), ethers.parseEther("100"));

      // The preview drives the dashboard; it must not disagree with the vote.
      const [previewGauge, previewScore] = await voter.previewOptimalGauge();
      expect(previewGauge).to.equal(gWin);
      expect(previewScore).to.equal(ethers.parseEther("5000"));

      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote())
        .to.emit(voter, "GaugesOptimised")
        .withArgs(0, previewGauge, previewScore);
    });

    it("setTokenWeights is governance-only, and rejects malformed valuations", async () => {
      const { voter, deployer, alice, musd } = ctx;
      await expect(
        voter.connect(alice).setTokenWeights([await musd.getAddress()], [10_000])
      ).to.be.reverted;
      await expect(
        voter.connect(deployer).setTokenWeights([await musd.getAddress()], [])
      ).to.be.revertedWith("ByNdVoter: length mismatch");
      await expect(
        voter.connect(deployer).setTokenWeights([ethers.ZeroAddress], [10_000])
      ).to.be.revertedWith("ByNdVoter: zero address");
      await expect(
        voter.connect(deployer).setTokenWeights([await musd.getAddress()], [0])
      ).to.be.revertedWith("ByNdVoter: zero weight");
    });

    it("caps the gauge scan so a large gauge list cannot push the vote past the block gas limit", async () => {
      const { voter, boostVoter, deployer, musd } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setBribeReferenceToken(await musd.getAddress());
      await voter.connect(deployer).setTokenWeights([await musd.getAddress()], [10_000]);

      // An upgraded proxy has scanCap == 0, which must mean "the safe
      // default", NOT "unlimited" — unlimited is the failure mode being
      // guarded against (656 live gauges on Matsnet ~= 11.6M gas vs a 10M
      // block limit).
      expect(await voter.scanCap()).to.equal(0);
      expect(await voter.effectiveScanCap()).to.equal(300);

      await voter.connect(deployer).setScanCap(2);
      expect(await voter.effectiveScanCap()).to.equal(2);

      const MockReward = await ethers.getContractFactory("MockReward");
      // Three gauges, but only the first two are scanned. The richest gauge
      // sits third, so it must NOT win while the cap is 2.
      const gauges = [];
      for (let i = 0; i < 3; i++) {
        const g = ethers.Wallet.createRandom().address;
        const b = await MockReward.deploy();
        await boostVoter.addGauge(g, await b.getAddress());
        await b.setTokenRewardsPerEpoch(
          await musd.getAddress(),
          ethers.parseEther(i === 2 ? "9999" : String(10 * (i + 1)))
        );
        gauges.push(g);
      }

      const [capped] = await voter.previewOptimalGauge();
      expect(capped).to.equal(gauges[1]);

      // Raising the cap reveals the rich third gauge.
      await voter.connect(deployer).setScanCap(10);
      const [uncapped, score] = await voter.previewOptimalGauge();
      expect(uncapped).to.equal(gauges[2]);
      expect(score).to.equal(ethers.parseEther("9999"));
    });

    it("setScanCap is governance-only", async () => {
      const { voter, alice } = ctx;
      await expect(voter.connect(alice).setScanCap(50)).to.be.reverted;
    });

    it("falls back to first-alive-gauge if no valuation is configured (e.g. an upgraded — not freshly deployed — proxy, before governance calls setTokenWeights)", async () => {
      const { voter, boostVoter, deployer } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      // An upgraded proxy starts with an empty valuation set, so no gauge can
      // score. Rather than revert and strand the epoch, the selector votes for
      // the first alive gauge until governance prices some tokens.
      await voter.connect(deployer).setBribeReferenceToken(ethers.ZeroAddress);
      expect(await voter.bribeReferenceToken()).to.equal(ethers.ZeroAddress);
      expect(await voter.getValuedTokenCount()).to.equal(0);

      const gOnly = ethers.Wallet.createRandom().address;
      await boostVoter.addGauge(gOnly, ethers.Wallet.createRandom().address);

      await fastForwardToVoteWindow();
      await expect(voter.optimiseAndVote())
        .to.emit(voter, "GaugesOptimised")
        .withArgs(0, gOnly, 0);
    });

    it("setBribeReferenceToken is governance-only", async () => {
      const { voter, alice, musd } = ctx;
      await expect(
        voter.connect(alice).setBribeReferenceToken(await musd.getAddress())
      ).to.be.reverted;
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
      const { voter, boostVoter, deployer, musd } = ctx;
      await voter.connect(deployer).setManagedTokenId(1);
      await setupSingleGauge(ctx, musd);
      await musd.mint(await boostVoter.getAddress(), ethers.parseEther("100"));
      await fastForwardToVoteWindow();
      await voter.optimiseAndVote();
      await stakeSome(ctx.alice, ethers.parseEther("1"));
      await voter.claimBribesBatch(200);
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
      await voter.connect(keeper).claimBribesBatch(200);

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
      await voter.claimBribesBatch(200);
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
      // ByNdVoter links the external GaugeScan library, so a factory for it
      // can only be built once that library has an address to link against.
      const gaugeScan = await (
        await ethers.getContractFactory("GaugeScan")
      ).deploy();
      await gaugeScan.waitForDeployment();
      const ByNdVoterV2 = await ethers.getContractFactory("ByNdVoter", {
        signer: alice,
        libraries: { GaugeScan: await gaugeScan.getAddress() },
      });
      await expect(
        upgrades.upgradeProxy(await voter.getAddress(), ByNdVoterV2, {
          unsafeAllow: ["external-library-linking"],
        })
      ).to.be.reverted;
    });
  });
});
