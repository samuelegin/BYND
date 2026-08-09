const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit } = require("./fixtures");
const { jumpInsideExtendWindow } = require("./epochTime");

/**
 * Phase 4 regressions — BYND-02, BYND-01, BYND-09.
 *
 * BYND-02 is the one that loses principal. extendLocks() capped its loop at
 * MAX_BATCH but ALWAYS started at index 0, with no cursor. Any token at index
 * >= 200 was therefore never extended — not this epoch, not any epoch — while
 * LocksExtended still emitted success. Those locks decayed to expiry, and
 * because ByNdVault has no withdrawal path, the principal became unrecoverable.
 */
describe("ByNdVault — batching, merge retry, observability", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await deployAll();
  });

  /**
   * Puts `n` stragglers in allTokenIds. Depositing normally merges everything
   * into the canonical lock, so the only way to get a large allTokenIds is to
   * make each merge fail — which is exactly the real-world condition BYND-02
   * matters under. setVotedForTest makes MockVeMEZO.merge revert.
   */
  async function seedStragglers(n) {
    const { veMEZO, vault, alice } = ctx;
    const ids = [];
    for (let i = 0; i < n; i++) {
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
      // Canonical is set by the first deposit and never merges, so only the
      // later ones need to fail.
      if (i > 0) await veMEZO.setVotedForTest(tokenId, true);
      await veMEZO.connect(alice).approve(await vault.getAddress(), tokenId);
      await vault.connect(alice).deposit(tokenId);
      ids.push(tokenId);
    }
    return ids;
  }

  describe("BYND-02 — extendLocks reaches every lock", () => {
    it("extends a token past index MAX_BATCH across successive calls", async () => {
      const { vault, voter, veMEZO } = ctx;
      const MAX_BATCH = Number(await vault.MAX_BATCH());

      // One more than a single batch can hold, so index MAX_BATCH exists and is
      // out of reach of a cursorless first pass.
      const ids = await seedStragglers(MAX_BATCH + 1);
      expect(await vault.totalDeposited()).to.equal(MAX_BATCH + 1);

      const tailId = ids[MAX_BATCH];
      const endBefore = (await veMEZO.locked(tailId)).end;

      // Pass 1 covers [0, MAX_BATCH) and must NOT close the epoch — the tail is
      // still unvisited.
      await jumpInsideExtendWindow(voter);
      await vault.extendLocks();
      expect(await vault.extendCursor()).to.equal(MAX_BATCH);
      expect(await voter.epochLocksExtended(0)).to.equal(false);

      // The tail is untouched at this point. Pre-fix this was its permanent
      // state: the cursorless loop restarted at 0 every call, so index
      // MAX_BATCH was never reached in any epoch.
      expect((await veMEZO.locked(tailId)).end).to.equal(endBefore);

      // Pass 2 picks up where pass 1 stopped and finishes the set.
      await vault.extendLocks();
      expect((await veMEZO.locked(tailId)).end).to.be.gt(endBefore);

      // Full pass complete: cursor wraps and the epoch closes.
      expect(await vault.extendCursor()).to.equal(0);
      expect(await voter.epochLocksExtended(0)).to.equal(true);
    });

    it("reports cursor progress and whether the pass completed", async () => {
      const { vault, voter } = ctx;
      const MAX_BATCH = Number(await vault.MAX_BATCH());
      await seedStragglers(MAX_BATCH + 1);

      await jumpInsideExtendWindow(voter);
      // A partial sweep was previously indistinguishable from a complete one:
      // LocksExtended fired either way.
      await expect(vault.extendLocks())
        .to.emit(vault, "ExtendProgress")
        .withArgs(0, MAX_BATCH, MAX_BATCH + 1, false);

      await expect(vault.extendLocks())
        .to.emit(vault, "ExtendProgress")
        .withArgs(MAX_BATCH, MAX_BATCH + 1, MAX_BATCH + 1, true);
    });

    it("closes the epoch in one call when everything fits in a single batch", async () => {
      const { vault, voter, alice } = ctx;
      await mintAndDeposit(ctx, alice);

      await jumpInsideExtendWindow(voter);
      await expect(vault.extendLocks())
        .to.emit(vault, "ExtendProgress")
        .withArgs(0, 1, 1, true);
      expect(await vault.extendCursor()).to.equal(0);
      expect(await voter.epochLocksExtended(0)).to.equal(true);
    });

    it("credits the caller as keeper, not tx.origin (BYND-10)", async () => {
      const { vault, voter, alice } = ctx;
      await mintAndDeposit(ctx, alice);

      await jumpInsideExtendWindow(voter);
      await vault.connect(alice).extendLocks();
      expect(await voter.epochKeeperExtendLocks(0)).to.equal(alice.address);
    });
  });

  describe("BYND-01 — retryMerge consolidates stragglers", () => {
    it("merges a straggler once the condition that blocked it clears", async () => {
      const { vault, voter, veMEZO, alice } = ctx;
      const ids = await seedStragglers(2);
      const straggler = ids[1];

      expect(await vault.totalDeposited()).to.equal(2);
      expect(await voter.getManagedTokenCount()).to.equal(2);

      // Still blocked — retrying now must surface the reason, not swallow it.
      await expect(vault.retryMerge(straggler)).to.be.revertedWith(
        "MockVeMEZO: already voted"
      );

      // The lock is no longer voted, so the merge can go through.
      await veMEZO.setVotedForTest(straggler, false);
      await expect(vault.retryMerge(straggler))
        .to.emit(vault, "StragglerMerged")
        .withArgs(straggler, await vault.canonicalTokenId());

      // Dropped from both registries, so no later vote or rebase claim wastes
      // gas on a burned NFT.
      expect(await vault.totalDeposited()).to.equal(1);
      expect(await voter.getManagedTokenCount()).to.equal(1);
      const remaining = await vault.getAllTokenIds();
      expect(remaining.map(Number)).to.deep.equal([Number(ids[0])]);
    });

    it("is permissionless — it can only consolidate the vault's own holdings", async () => {
      const { vault, veMEZO, alice, stranger } = ctx;
      const ids = await seedStragglers(2);
      await veMEZO.setVotedForTest(ids[1], false);

      await expect(vault.connect(stranger).retryMerge(ids[1])).to.not.be
        .reverted;
    });

    it("rejects the canonical token and anything the vault does not hold", async () => {
      const { vault, alice } = ctx;
      const ids = await seedStragglers(2);

      await expect(
        vault.retryMerge(await vault.canonicalTokenId())
      ).to.be.revertedWith("ByNdVault: token is canonical");

      await expect(vault.retryMerge(99999)).to.be.revertedWith(
        "ByNdVault: not a vault token"
      );
    });

    it("keeps extendCursor in range after removing a token", async () => {
      const { vault, voter, veMEZO } = ctx;
      const MAX_BATCH = Number(await vault.MAX_BATCH());
      const ids = await seedStragglers(MAX_BATCH + 1);

      // Advance the cursor to the tail, then shrink the array under it.
      await jumpInsideExtendWindow(voter);
      await vault.extendLocks();
      expect(await vault.extendCursor()).to.equal(MAX_BATCH);

      await veMEZO.setVotedForTest(ids[MAX_BATCH], false);
      await vault.retryMerge(ids[MAX_BATCH]);

      // A stale cursor at the old length would skip a whole pass; it wraps.
      expect(await vault.extendCursor()).to.equal(0);
      await expect(vault.extendLocks()).to.not.be.reverted;
    });
  });

  describe("BYND-09 — bookkeeping failures are visible", () => {
    it("emits VoterCallFailed instead of silently diverging from the voter", async () => {
      const { vault, voter, veMEZO, deployer, alice } = ctx;

      // Point the voter at a different vault, so the real vault's
      // addManagedTokenId call is rejected by the `only vault` check.
      await voter.connect(deployer).setVault(deployer.address);

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
      await veMEZO.connect(alice).approve(await vault.getAddress(), tokenId);

      // The deposit must still succeed — bookkeeping must never block a
      // deposit — but the divergence is now on-chain rather than silent.
      await expect(vault.connect(alice).deposit(tokenId)).to.emit(
        vault,
        "VoterCallFailed"
      );

      // The vault custodies it; the voter does not know about it.
      expect(await vault.totalDeposited()).to.equal(1);
      expect(await voter.getManagedTokenCount()).to.equal(0);
    });
  });

  describe("permanent locks are accepted by default (BYND-01 policy)", () => {
    it("accepts a permanent lock unless governance turns the guard on", async () => {
      const { vault, veMEZO, deployer, alice } = ctx;
      expect(await vault.rejectPermanentLocks()).to.equal(false);

      // 115 permanent locks exist on Matsnet, and the Phase 0 probe could not
      // confirm they fail to merge, so the default must not exclude them.
      await veMEZO.mintCustom(
        alice.address,
        5000,
        ethers.parseEther("1000"),
        (await ethers.provider.getBlock("latest")).timestamp + 4 * 365 * 86400
      );
      await veMEZO.setPermanentForTest(5000, true);
      await veMEZO.connect(alice).approve(await vault.getAddress(), 5000);
      await expect(vault.connect(alice).deposit(5000)).to.not.be.reverted;

      // And governance can flip it the moment a real merge failure is observed.
      await vault.connect(deployer).setRejectPermanentLocks(true);
      await veMEZO.mintCustom(
        alice.address,
        5001,
        ethers.parseEther("1000"),
        (await ethers.provider.getBlock("latest")).timestamp + 4 * 365 * 86400
      );
      await veMEZO.setPermanentForTest(5001, true);
      await veMEZO.connect(alice).approve(await vault.getAddress(), 5001);
      await expect(
        vault.connect(alice).deposit(5001)
      ).to.be.revertedWith("ByNdVault: lock expired");
    });
  });
});
