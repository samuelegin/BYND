const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll } = require("./fixtures");

// BYND-15 -- a straggler carrying a live gauge vote could never be consolidated.
// veMEZO rejects merge() with AlreadyVoted() while a vote is outstanding, and the
// vault had no way to clear one: it held the NFTs but never referenced
// BoostVoter, where vote state actually lives.
//
// Found on Matsnet. Token 829 held 541.48 veMEZO of voting weight from a June
// vote and was the only one of five deposits that would not merge -- every other
// token merged cleanly. Verified by staticcalling the live contracts as the
// vault: merge(829, 860) reverts AlreadyVoted(), reset(829) succeeds, and
// increaseUnlockTime(829, 208 weeks) succeeds.
//
// That last one matters and corrects a natural assumption: extension is NOT
// gated on the vote. A voted token extends fine. So this finding costs
// consolidation and per-vote gas, not principal -- the melt in BYND-14 was the
// expensive half.
describe("ByNdVault -- clearing a straggler's vote to merge (BYND-15)", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await deployAll();
  });

  // Deposits `n` tokens where everything after the first is blocked from
  // merging by a live VOTE specifically -- the Matsnet condition -- rather than
  // by the generic merge-blocked flag used in test/18's cursor tests.
  async function seedVotedStragglers(n) {
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
      if (i > 0) await veMEZO.setVotedForTest(tokenId, true);
      await veMEZO.connect(alice).approve(await vault.getAddress(), tokenId);
      await vault.connect(alice).deposit(tokenId);
      ids.push(tokenId);
    }
    return ids;
  }

  it("clears the vote and merges a token that AlreadyVoted() had blocked", async () => {
    const { vault, voter, veMEZO } = ctx;
    const ids = await seedVotedStragglers(2);
    const straggler = ids[1];

    // The deposit-time merge failed, which is why it is a straggler at all.
    expect(await vault.totalDeposited()).to.equal(2);
    expect(await veMEZO.voted(straggler)).to.equal(true);

    // Pre-fix this reverted "MockVeMEZO: already voted" and the token was stuck
    // permanently -- the vault had no path to clear a vote.
    await expect(vault.retryMerge(straggler))
      .to.emit(vault, "StragglerVoteReset")
      .withArgs(straggler)
      .and.to.emit(vault, "StragglerMerged")
      .withArgs(straggler, await vault.canonicalTokenId());

    expect(await veMEZO.voted(straggler)).to.equal(false);
    expect(await vault.totalDeposited()).to.equal(1);
    expect(await voter.getManagedTokenCount()).to.equal(1);
  });

  it("still works when boostVoter is unset, for an un-migrated proxy", async () => {
    // boostVoter appends to storage, so a proxy upgraded but not yet configured
    // reads address(0). retryMerge must degrade to its old behaviour rather
    // than revert on a zero-address call.
    const { veMEZO, vault, alice } = ctx;
    const ByNdVault = await ethers.getContractFactory("ByNdVault");
    const { upgrades } = require("hardhat");
    const fresh = await upgrades.deployProxy(
      ByNdVault,
      [await veMEZO.getAddress(), await ctx.veBYND.getAddress()],
      { kind: "uups" }
    );
    await ctx.veBYND.grantRole(await ctx.veBYND.MINTER_ROLE(), await fresh.getAddress());
    expect(await fresh.boostVoter()).to.equal(ethers.ZeroAddress);

    const ids = [];
    for (let i = 0; i < 2; i++) {
      const tx = await veMEZO.mint(alice.address, 0);
      const receipt = await tx.wait();
      for (const log of receipt.logs) {
        try {
          const p = veMEZO.interface.parseLog(log);
          if (p && p.name === "Transfer") { ids.push(p.args[2]); break; }
        } catch (_) {}
      }
      await veMEZO.connect(alice).approve(await fresh.getAddress(), ids[i]);
    }
    await veMEZO.setMergeBlockedForTest(ids[1], true);
    await fresh.connect(alice).deposit(ids[0]);
    await fresh.connect(alice).deposit(ids[1]);

    // No reset attempted, so the underlying merge reason surfaces unchanged.
    await expect(fresh.retryMerge(ids[1])).to.be.revertedWith("MockVeMEZO: merge blocked");

    await veMEZO.setMergeBlockedForTest(ids[1], false);
    await expect(fresh.retryMerge(ids[1])).to.emit(fresh, "StragglerMerged");
  });

  it("surfaces the merge reason when reset does not unblock it", async () => {
    // reset() clears the vote but this token is blocked for a different reason,
    // so the merge still fails -- and its own revert is what the caller sees,
    // not a swallowed reset failure.
    const { vault, veMEZO } = ctx;
    const ids = await seedVotedStragglers(2);
    await veMEZO.setMergeBlockedForTest(ids[1], true);

    await expect(vault.retryMerge(ids[1])).to.be.revertedWith("MockVeMEZO: merge blocked");
  });

  it("only ever resets a token the vault already custodies", async () => {
    // The reset is reachable by anyone, so the guard that matters is scope:
    // retryMerge rejects any token the vault does not hold, which is what stops
    // it clearing a third party's vote.
    const { vault, veMEZO, stranger } = ctx;
    // A canonical lock has to exist first, or the earlier guard fires and this
    // asserts nothing about scope.
    await seedVotedStragglers(1);

    // Minted to someone else and never deposited: exactly the token a caller
    // would want the vault to reset on their behalf.
    const tx = await veMEZO.mint(stranger.address, 0);
    const receipt = await tx.wait();
    let outsideId;
    for (const log of receipt.logs) {
      try {
        const p = veMEZO.interface.parseLog(log);
        if (p && p.name === "Transfer") { outsideId = p.args[2]; break; }
      } catch (_) {}
    }
    await veMEZO.setVotedForTest(outsideId, true);

    await expect(vault.retryMerge(outsideId)).to.be.revertedWith(
      "ByNdVault: not a vault token"
    );
    // The vote survives, which is the point: the vault refused before reaching
    // reset(), so it cannot be used to clear votes it does not own.
    expect(await veMEZO.voted(outsideId)).to.equal(true);
  });

  it("exposes boostVoter and rejects a zero address", async () => {
    const { vault, veMEZO } = ctx;
    expect(await vault.boostVoter()).to.equal(await veMEZO.getAddress());
    await expect(vault.setBoostVoter(ethers.ZeroAddress)).to.be.revertedWith(
      "ByNdVault: zero address"
    );
  });
});
