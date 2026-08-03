const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit } = require("./fixtures");
const { jumpInsideExtendWindow, jumpOutsideVoteWindow } = require("./epochTime");

describe("ByNdVault", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  describe("initialize", () => {
    it("sets veMEZO and veBYND, and cannot be re-initialized", async () => {
      const { vault, veMEZO, veBYND } = ctx;
      expect(await vault.veMEZO()).to.equal(await veMEZO.getAddress());
      expect(await vault.veBYND()).to.equal(await veBYND.getAddress());
      await expect(
        vault.initialize(await veMEZO.getAddress(), await veBYND.getAddress())
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("rejects zero addresses at deploy time", async () => {
      const ByNdVault = await ethers.getContractFactory("ByNdVault");
      const { upgrades } = require("hardhat");
      await expect(
        upgrades.deployProxy(
          ByNdVault,
          [ethers.ZeroAddress, await ctx.veBYND.getAddress()],
          { kind: "uups" }
        )
      ).to.be.reverted;
    });
  });

  describe("deposit", () => {
    it("mints veBYND 1:1 with locked amount and transfers the NFT into the vault", async () => {
      const { veMEZO, vault, veBYND, alice } = ctx;
      const tokenId = await mintAndDeposit(ctx, alice);

      expect(await veMEZO.ownerOf(tokenId)).to.equal(await vault.getAddress());
      expect(await veBYND.balanceOf(alice.address)).to.equal(
        ethers.parseEther("1000")
      );
      expect(await vault.depositorOf(tokenId)).to.equal(alice.address);
      expect(await vault.totalDeposited()).to.equal(1);
      expect(await vault.getAllTokenIds()).to.deep.equal([tokenId]);
      expect(await vault.getUserTokens(alice.address)).to.deep.equal([
        tokenId,
      ]);
    });

    it("reverts if the caller does not own the NFT", async () => {
      const { veMEZO, vault, alice, bob } = ctx;
      await veMEZO.mint(alice.address, 0);
      const tokenId = 1;
      await veMEZO.connect(alice).approve(await vault.getAddress(), tokenId);
      await expect(vault.connect(bob).deposit(tokenId)).to.be.revertedWith(
        "ByNdVault: not owner"
      );
    });

    it("reverts on an empty lock", async () => {
      const { veMEZO, vault, alice } = ctx;
      const end = (await ethers.provider.getBlock("latest")).timestamp + 4 * 365 * 86400;
      await veMEZO.mintCustom(alice.address, 999, 0, end);
      await veMEZO.connect(alice).approve(await vault.getAddress(), 999);
      await expect(vault.connect(alice).deposit(999)).to.be.revertedWith(
        "ByNdVault: empty lock"
      );
    });

    it("reverts on an already-expired lock", async () => {
      const { veMEZO, vault, alice } = ctx;
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await veMEZO.mintCustom(alice.address, 998, ethers.parseEther("10"), now + 1);
      await ethers.provider.send("evm_increaseTime", [10]);
      await ethers.provider.send("evm_mine");
      await veMEZO.connect(alice).approve(await vault.getAddress(), 998);
      await expect(vault.connect(alice).deposit(998)).to.be.revertedWith(
        "ByNdVault: lock expired"
      );
    });

    it("registers the deposited tokenId with the voter as a managed tokenId", async () => {
      const { voter, alice } = ctx;
      const tokenId = await mintAndDeposit(ctx, alice);
      expect(await voter.getManagedTokenIds()).to.deep.equal([tokenId]);
    });
  });

  describe("depositBatch", () => {
    it("mints veBYND for every NFT in the batch", async () => {
      const { veMEZO, vault, veBYND, alice } = ctx;
      await veMEZO.mint(alice.address, 0);
      await veMEZO.mint(alice.address, 0);
      await veMEZO.mint(alice.address, 0);
      await veMEZO.connect(alice).setApprovalForAll(await vault.getAddress(), true);
      await vault.connect(alice).depositBatch([1, 2, 3]);

      expect(await veBYND.balanceOf(alice.address)).to.equal(
        ethers.parseEther("3000")
      );
      // veBYND minting is unaffected by consolidation (still 1:1 per
      // deposit), but the 2nd and 3rd NFTs get merged into the first
      // (canonical) one, so only 1 tokenId is actually still managed.
      expect(await vault.totalDeposited()).to.equal(1);
      expect(await vault.canonicalTokenId()).to.equal(1n);
    });

    it("reverts on an empty array", async () => {
      const { vault, alice } = ctx;
      await expect(vault.connect(alice).depositBatch([])).to.be.revertedWith(
        "ByNdVault: empty array"
      );
    });

    it("reverts above the 50-item cap", async () => {
      const { vault, alice } = ctx;
      const ids = Array.from({ length: 51 }, (_, i) => i + 1);
      await expect(
        vault.connect(alice).depositBatch(ids)
      ).to.be.revertedWith("ByNdVault: max 50 per batch");
    });
  });

  describe("extendLocks", () => {
    it("extends every managed lock toward the new 4-year max, then refuses a second call in the same epoch", async () => {
      const { veMEZO, vault, voter, alice } = ctx;
      const tokenId = await mintAndDeposit(ctx, alice);
      const before = await veMEZO.locked(tokenId);

      await jumpInsideExtendWindow(voter);
      await vault.extendLocks();
      const after = await veMEZO.locked(tokenId);
      expect(after.end).to.be.gt(before.end);

      // Only the first caller each epoch is credited a keeper slot, so a
      // second call is now rejected up front rather than silently burning
      // gas on a full loop whose markLocksExtended() would be swallowed.
      await expect(vault.extendLocks()).to.be.revertedWith(
        "ByNdVault: locks already extended this epoch"
      );
      const afterSecond = await veMEZO.locked(tokenId);
      expect(afterSecond.end).to.equal(after.end);
    });

    it("is closed outside the extend window", async () => {
      const { vault, alice } = ctx;
      await mintAndDeposit(ctx, alice);
      await jumpOutsideVoteWindow(); // 1h past a boundary — a whole week early
      await expect(vault.extendLocks()).to.be.revertedWith(
        "ByNdVault: extend window not open"
      );
    });

    it("is callable by anyone (permissionless keeper step), and now takes no arguments — it always processes every currently-managed tokenId itself", async () => {
      const { vault, voter, stranger, alice } = ctx;
      await mintAndDeposit(ctx, alice);
      await jumpInsideExtendWindow(voter);
      await expect(vault.connect(stranger).extendLocks()).to.not.be.reverted;
    });

    // NOTE: extendLocks() no longer takes a caller-supplied tokenId array
    // (see ByNdVault's class-level comment on merge-consolidation), so the
    // old "empty batch" / "batch too large" revert-message tests no longer
    // apply — there's no batch argument left to validate. The MAX_BATCH
    // constant still exists as an internal defensive cap on allTokenIds
    // (in case merge() failures ever pile up stragglers at scale), but it's
    // not externally observable as a revert; it just silently caps how many
    // tokenIds a single call processes.
  });

  describe("claimRebases", () => {
    it("reverts if no rewards distributor is configured", async () => {
      const ByNdVault = await ethers.getContractFactory("ByNdVault");
      const { upgrades } = require("hardhat");
      const freshVault = await upgrades.deployProxy(
        ByNdVault,
        [await ctx.veMEZO.getAddress(), await ctx.veBYND.getAddress()],
        { kind: "uups" }
      );
      await expect(freshVault.claimRebases()).to.be.revertedWith(
        "ByNdVault: distributor not set"
      );
    });

    it("reverts if there's nothing deposited yet", async () => {
      const ByNdVault = await ethers.getContractFactory("ByNdVault");
      const { upgrades } = require("hardhat");
      const freshVault = await upgrades.deployProxy(
        ByNdVault,
        [await ctx.veMEZO.getAddress(), await ctx.veBYND.getAddress()],
        { kind: "uups" }
      );
      await freshVault.setRewardsDistributor(
        await ctx.rewardsDistributor.getAddress()
      );
      await expect(freshVault.claimRebases()).to.be.revertedWith(
        "ByNdVault: nothing to claim"
      );
    });

    it("succeeds once there is at least one deposit and notifies the voter", async () => {
      const { vault, voter, alice, keeper } = ctx;
      await mintAndDeposit(ctx, alice);
      await expect(vault.connect(keeper).claimRebases())
        .to.emit(vault, "RebasesClaimed")
        .withArgs(keeper.address, 1);
      expect(await voter.epochRebasesClaimed(0)).to.equal(true);
      expect(await voter.epochKeeperClaimRebases(0)).to.equal(keeper.address);
    });
  });

  describe("merge-consolidation into a single canonical NFT", () => {
    it("merges every deposit after the first into canonicalTokenId, so allTokenIds stays at length 1", async () => {
      const { vault, alice, bob } = ctx;
      const tokenIdAlice = await mintAndDeposit(ctx, alice);
      expect(await vault.canonicalTokenId()).to.equal(tokenIdAlice);
      expect((await vault.getAllTokenIds()).length).to.equal(1);

      const tokenIdBob = await mintAndDeposit(ctx, bob);
      // Bob's deposit should have been merged into (burned into) Alice's
      // canonical tokenId rather than added as a second managed NFT.
      expect(await vault.canonicalTokenId()).to.equal(tokenIdAlice);
      const all = await vault.getAllTokenIds();
      expect(all.length).to.equal(1);
      expect(all[0]).to.equal(tokenIdAlice);

      // Both users still got veBYND minted 1:1 for what they deposited —
      // consolidation only affects the underlying voting NFT, not accounting.
      expect(await ctx.veBYND.balanceOf(alice.address)).to.be.gt(0);
      expect(await ctx.veBYND.balanceOf(bob.address)).to.be.gt(0);
      // tokenIdBob no longer exists as an NFT — it was burned by merge().
      await expect(ctx.veMEZO.ownerOf(tokenIdBob)).to.be.reverted;
    });

    it("falls back to individually managing a deposit that merge() rejects (e.g. already voted this epoch), rather than losing it", async () => {
      const { vault, veMEZO, alice, bob } = ctx;
      const tokenIdAlice = await mintAndDeposit(ctx, alice);

      // Mint Bob a lock but mark it as already-voted so the mock's merge()
      // rejects it, exactly like Mezo's real Escrow.merge() would for an NFT
      // that already voted elsewhere this epoch.
      await veMEZO.mint(bob.address, 0);
      const tokenIdBob = tokenIdAlice + 1n;
      await veMEZO.setVotedForTest(tokenIdBob, true);
      await veMEZO.connect(bob).approve(await vault.getAddress(), tokenIdBob);

      await expect(vault.connect(bob).deposit(tokenIdBob))
        .to.emit(vault, "MergeFailedFallback")
        .withArgs(tokenIdBob);

      // Both tokenIds are now individually managed — nothing was lost.
      const all = await vault.getAllTokenIds();
      expect(all.length).to.equal(2);
      expect(all).to.include(tokenIdAlice);
      expect(all).to.include(tokenIdBob);
      // tokenIdBob still exists as a real NFT (not burned) since it was
      // never actually merged.
      expect(await veMEZO.ownerOf(tokenIdBob)).to.equal(await vault.getAddress());
    });
  });

  describe("views", () => {
    it("totalLockedMEZO / totalVotingPower aggregate across all deposits", async () => {
      const { vault, alice, bob } = ctx;
      await mintAndDeposit(ctx, alice);
      await mintAndDeposit(ctx, bob);
      expect(await vault.totalLockedMEZO()).to.equal(ethers.parseEther("2000"));
      expect(await vault.totalVotingPower()).to.equal(ethers.parseEther("2000"));
    });
  });

  describe("admin", () => {
    it("only the owner can set the rewards distributor / voter", async () => {
      const { vault, alice, rewardsDistributor, voter } = ctx;
      await expect(
        vault.connect(alice).setRewardsDistributor(await rewardsDistributor.getAddress())
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        vault.connect(alice).setVoter(await voter.getAddress())
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("rejects zero address for distributor/voter", async () => {
      const { vault } = ctx;
      await expect(vault.setRewardsDistributor(ethers.ZeroAddress)).to.be.revertedWith(
        "ByNdVault: zero address"
      );
      await expect(vault.setVoter(ethers.ZeroAddress)).to.be.revertedWith(
        "ByNdVault: zero address"
      );
    });
  });

  describe("UUPS upgrade authorization", () => {
    it("only the owner can authorize an upgrade", async () => {
      const ByNdVaultV2 = await ethers.getContractFactory("ByNdVault", ctx.alice);
      const { upgrades } = require("hardhat");
      await expect(
        upgrades.upgradeProxy(await ctx.vault.getAddress(), ByNdVaultV2)
      ).to.be.reverted;
    });

    it("the owner can upgrade and state is preserved", async () => {
      const { vault, alice } = ctx;
      const tokenId = await mintAndDeposit(ctx, alice);
      const ByNdVaultV2 = await ethers.getContractFactory("ByNdVault");
      const { upgrades } = require("hardhat");
      const upgraded = await upgrades.upgradeProxy(
        await vault.getAddress(),
        ByNdVaultV2
      );
      expect(await upgraded.depositorOf(tokenId)).to.equal(alice.address);
      expect(await upgraded.totalDeposited()).to.equal(1);
    });
  });
});
