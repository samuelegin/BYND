const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit, setupSingleGauge } = require("./fixtures");
const {
  jumpInsideExtendWindow,
  jumpInsideVoteWindow,
  jumpOutsideVoteWindow,
  nextBoundary,
  WEEK,
} = require("./epochTime");

const HOUR = 3600;
const DAY = 24 * HOUR;

describe("extendLocks — once-per-epoch window", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await deployAll();
  });

  describe("defaults", () => {
    it("defaults to a 24h window that fully contains the 3h vote window", async () => {
      const { voter } = ctx;
      expect(await voter.extendWindow()).to.equal(DAY);
      expect(await voter.voteWindow()).to.equal(3 * 60 * 60);
      expect(await voter.extendWindow()).to.be.gt(await voter.voteWindow());
    });
  });

  describe("time gate", () => {
    it("rejects a call a week early, and the lock is left untouched", async () => {
      const { vault, veMEZO, alice } = ctx;
      const tokenId = await mintAndDeposit(ctx, alice);
      const before = await veMEZO.locked(tokenId);

      await jumpOutsideVoteWindow();
      await expect(vault.extendLocks()).to.be.revertedWith(
        "ByNdVault: extend window not open"
      );
      expect((await veMEZO.locked(tokenId)).end).to.equal(before.end);
    });

    it("opens exactly 24h before the boundary", async () => {
      const { vault, voter, alice } = ctx;
      await mintAndDeposit(ctx, alice);

      const latest = await ethers.provider.getBlock("latest");
      // Aim at the *following* boundary so the pre-window target is always in
      // the future regardless of where in the week the suite happens to be.
      const boundary = nextBoundary(latest.timestamp) + WEEK;

      await ethers.provider.send("evm_setNextBlockTimestamp", [boundary - DAY - 60]);
      await ethers.provider.send("evm_mine");
      expect(await voter.extendWindowOpen()).to.equal(false);
      await expect(vault.extendLocks()).to.be.revertedWith(
        "ByNdVault: extend window not open"
      );

      // Exactly at the open.
      await ethers.provider.send("evm_setNextBlockTimestamp", [boundary - DAY]);
      await ethers.provider.send("evm_mine");
      expect(await voter.extendWindowOpen()).to.equal(true);
      await expect(vault.extendLocks()).to.not.be.reverted;
    });

    it("is still open inside the vote window, so a keeper can extend then vote in one run", async () => {
      const { vault, voter, alice } = ctx;
      await mintAndDeposit(ctx, alice);

      await jumpInsideVoteWindow(voter);
      expect(await voter.extendWindowOpen()).to.equal(true);
      await expect(vault.extendLocks()).to.not.be.reverted;
      expect(await voter.epochLocksExtended(0)).to.equal(true);
    });

    it("exposes extendWindow so a client can derive the countdown the same way it does for voteWindow", async () => {
      const { voter } = ctx;
      // There is no timeUntilExtendWindow() view on purpose (ByNdVoter is
      // ~150 bytes under EIP-170). Clients compute the open from
      // boostVoter.epochNext(now) - extendWindow, exactly as they already do
      // for the vote window. Pin that the inputs for that are readable and
      // that extendWindowOpen() agrees with the arithmetic.
      await jumpOutsideVoteWindow();
      const extendWindow = Number(await voter.extendWindow());
      const latest = await ethers.provider.getBlock("latest");
      const opensAt = nextBoundary(latest.timestamp) - extendWindow;

      expect(latest.timestamp).to.be.lt(opensAt);
      expect(await voter.extendWindowOpen()).to.equal(false);

      await jumpInsideExtendWindow(voter);
      const inside = await ethers.provider.getBlock("latest");
      expect(inside.timestamp).to.be.gte(opensAt);
      expect(await voter.extendWindowOpen()).to.equal(true);
    });
  });

  describe("once per epoch", () => {
    it("rejects a second call in the same epoch even though the window is still open", async () => {
      const { vault, voter, keeper, stranger, alice } = ctx;
      await mintAndDeposit(ctx, alice);

      await jumpInsideExtendWindow(voter);
      await vault.connect(keeper).extendLocks();

      // Window is still open — this is the per-epoch rule biting, not the clock.
      expect(await voter.extendWindowOpen()).to.equal(true);
      await expect(vault.connect(stranger).extendLocks()).to.be.revertedWith(
        "ByNdVault: locks already extended this epoch"
      );
    });

    it("credits only the first caller, and does not let a later caller steal the slot", async () => {
      const { vault, voter, keeper, stranger, alice } = ctx;
      await mintAndDeposit(ctx, alice);

      await jumpInsideExtendWindow(voter);
      await vault.connect(keeper).extendLocks();
      expect(await voter.epochKeeperExtendLocks(0)).to.equal(keeper.address);

      await expect(vault.connect(stranger).extendLocks()).to.be.reverted;
      expect(await voter.epochKeeperExtendLocks(0)).to.equal(keeper.address);
    });

    it("becomes callable again in the next epoch", async () => {
      const { vault, voter, deployer, keeper, stranger, alice } = ctx;
      await mintAndDeposit(ctx, alice);

      await jumpInsideExtendWindow(voter);
      await vault.connect(keeper).extendLocks();
      expect(await voter.epochLocksExtended(0)).to.equal(true);

      // Advance the voter's epoch counter without needing a full harvest.
      await setupSingleGauge(ctx, ctx.musd);
      await voter.connect(deployer).setManagedTokenId(1);
      await jumpInsideVoteWindow(voter);
      await voter.optimiseAndVote();
      await voter.connect(deployer).forceCloseEpoch();
      expect(await voter.currentEpoch()).to.equal(1);

      await jumpInsideExtendWindow(voter);
      await expect(vault.connect(stranger).extendLocks()).to.not.be.reverted;
      expect(await voter.epochKeeperExtendLocks(1)).to.equal(stranger.address);
    });
  });

  describe("governance", () => {
    it("setExtendWindow is governance-only", async () => {
      const { voter, alice } = ctx;
      await expect(
        voter.connect(alice).setExtendWindow(12 * HOUR)
      ).to.be.revertedWith("ByNdVoter: not governance");
    });

    it("rejects a window that does not cover the vote window", async () => {
      const { voter, deployer } = ctx;
      // voteWindow is 3h; a 1h extend window would mean a keeper voting at
      // T-2h could never have extended the locks it is voting with.
      await expect(
        voter.connect(deployer).setExtendWindow(HOUR)
      ).to.be.revertedWith("ByNdVoter: window below voteWindow");
    });

    it("rejects a window larger than half the epoch", async () => {
      const { voter, deployer } = ctx;
      await expect(
        voter.connect(deployer).setExtendWindow(5 * DAY)
      ).to.be.revertedWith("ByNdVoter: window too large");
    });

    it("honours a widened window", async () => {
      const { vault, voter, deployer, alice } = ctx;
      await mintAndDeposit(ctx, alice);

      await expect(voter.connect(deployer).setExtendWindow(3 * DAY))
        .to.emit(voter, "ExtendWindowUpdated")
        .withArgs(3 * DAY);

      const latest = await ethers.provider.getBlock("latest");
      const boundary = nextBoundary(latest.timestamp) + WEEK;
      // 2 days out: inside the new 3-day window, outside the old 24h one.
      await ethers.provider.send("evm_setNextBlockTimestamp", [boundary - 2 * DAY]);
      await ethers.provider.send("evm_mine");
      await expect(vault.extendLocks()).to.not.be.reverted;
    });

    it("a zero window disables the time gate but keeps the once-per-epoch rule", async () => {
      const { vault, voter, deployer, alice } = ctx;
      await mintAndDeposit(ctx, alice);
      await voter.connect(deployer).setExtendWindow(0);

      await jumpOutsideVoteWindow(); // nowhere near a boundary
      expect(await voter.extendWindowOpen()).to.equal(true);
      await expect(vault.extendLocks()).to.not.be.reverted;

      await expect(vault.extendLocks()).to.be.revertedWith(
        "ByNdVault: locks already extended this epoch"
      );
    });
  });

  describe("unwired vault", () => {
    it("skips both gates when no voter is set, so deploy-order wiring still works", async () => {
      const { veMEZO, veBYND, alice } = ctx;
      const { upgrades } = require("hardhat");

      const ByNdVault = await ethers.getContractFactory("ByNdVault");
      const freshVault = await upgrades.deployProxy(
        ByNdVault,
        [await veMEZO.getAddress(), await veBYND.getAddress()],
        { kind: "uups" }
      );
      await veBYND.grantRole(
        await veBYND.MINTER_ROLE(),
        await freshVault.getAddress()
      );

      const tx = await veMEZO.mint(alice.address, 0);
      const receipt = await tx.wait();
      let tokenId;
      for (const log of receipt.logs) {
        try {
          const parsed = veMEZO.interface.parseLog(log);
          if (parsed && parsed.name === "Transfer") {
            tokenId = parsed.args[2];
            break;
          }
        } catch (_) {}
      }
      await veMEZO.connect(alice).approve(await freshVault.getAddress(), tokenId);
      await freshVault.connect(alice).deposit(tokenId);

      await jumpOutsideVoteWindow();
      await expect(freshVault.extendLocks()).to.not.be.reverted;
      await expect(freshVault.extendLocks()).to.not.be.reverted;
    });
  });
});
