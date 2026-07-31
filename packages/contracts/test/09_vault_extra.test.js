const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit } = require("./fixtures");

describe("ByNdVault — extra coverage", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  it("tracks depositorOf and getUserTokens as a full historical record across multiple users, even though t2 and t3 get merged away", async () => {
    const { vault, alice, bob } = ctx;
    const t1 = await mintAndDeposit(ctx, alice); // becomes canonicalTokenId
    const t2 = await mintAndDeposit(ctx, bob);   // merged into t1 (Vault owns
    const t3 = await mintAndDeposit(ctx, alice); // both sides of every merge,
    // regardless of which user originally deposited which NFT — merge()'s
    // ownership check is on the caller (the Vault), not the original
    // depositor, so cross-user consolidation works exactly like same-user
    // consolidation.)

    // Historical "who deposited what" record is untouched by later merges —
    // this is display/bookkeeping data, not the live-management list.
    expect(await vault.depositorOf(t1)).to.equal(alice.address);
    expect(await vault.depositorOf(t2)).to.equal(bob.address);
    expect(await vault.depositorOf(t3)).to.equal(alice.address);
    expect(await vault.getUserTokens(alice.address)).to.deep.equal([t1, t3]);
    expect(await vault.getUserTokens(bob.address)).to.deep.equal([t2]);

    // But the live-management list only ever has the canonical NFT — t2 and
    // t3 were merged into t1 and burned, so they don't appear here.
    expect(await vault.getAllTokenIds()).to.deep.equal([t1]);
    expect(await vault.totalDeposited()).to.equal(1);
    expect(await vault.canonicalTokenId()).to.equal(t1);
  });

  it("emits Deposited with the correct minted amount", async () => {
    const { vault, veMEZO, alice } = ctx;
    await veMEZO.mint(alice.address, 0);
    const tokenId = 1;
    await veMEZO.connect(alice).approve(await vault.getAddress(), tokenId);
    await expect(vault.connect(alice).deposit(tokenId))
      .to.emit(vault, "Deposited")
      .withArgs(alice.address, tokenId, ethers.parseEther("1000"));
  });

  it("emits BatchDeposited with the summed minted amount", async () => {
    const { vault, veMEZO, alice } = ctx;
    await veMEZO.mint(alice.address, 0);
    await veMEZO.mint(alice.address, 0);
    await veMEZO.connect(alice).approve(await vault.getAddress(), 1);
    await veMEZO.connect(alice).approve(await vault.getAddress(), 2);
    await expect(vault.connect(alice).depositBatch([1, 2]))
      .to.emit(vault, "BatchDeposited")
      .withArgs(alice.address, 2, ethers.parseEther("2000"));
  });

  it("rejects re-depositing the same tokenId once the vault already owns it", async () => {
    const { vault, alice } = ctx;
    const tokenId = await mintAndDeposit(ctx, alice);
    await expect(vault.connect(alice).deposit(tokenId)).to.be.revertedWith(
      "ByNdVault: not owner"
    );
  });

  it("depositBatch rolls back entirely if any single tokenId in the batch is invalid", async () => {
    const { vault, veMEZO, alice } = ctx;
    await veMEZO.mint(alice.address, 0); // tokenId 1, valid
    await veMEZO.connect(alice).approve(await vault.getAddress(), 1);
    // tokenId 2 was never minted, so ownerOf() reverts inside the loop
    await expect(vault.connect(alice).depositBatch([1, 2])).to.be.reverted;
    // and the valid one must NOT have been partially committed
    expect(await vault.totalDeposited()).to.equal(0);
    expect(await vault.depositorOf(1)).to.equal(ethers.ZeroAddress);
  });

  it("totalLockedMEZO and totalVotingPower aggregate correctly and exclude tokens with no lock", async () => {
    const { vault, alice } = ctx;
    await mintAndDeposit(ctx, alice); // 1000 ether locked, ~4y voting power
    await mintAndDeposit(ctx, alice);
    expect(await vault.totalLockedMEZO()).to.equal(ethers.parseEther("2000"));
    expect(await vault.totalVotingPower()).to.equal(ethers.parseEther("2000"));
  });

  it("setRewardsDistributor and setVoter revert on zero address and for non-owner callers", async () => {
    const { vault, alice } = ctx;
    await expect(
      vault.connect(alice).setRewardsDistributor(alice.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      vault.setRewardsDistributor(ethers.ZeroAddress)
    ).to.be.revertedWith("ByNdVault: zero address");
    await expect(vault.connect(alice).setVoter(alice.address)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
    await expect(vault.setVoter(ethers.ZeroAddress)).to.be.revertedWith(
      "ByNdVault: zero address"
    );
  });

  it("totalPendingRebase is 0 with no distributor wired, and still resolves cleanly (no revert) once one is set and deposits exist", async () => {
    const { vault, veMEZO, veBYND, alice } = ctx;
    const ByNdVault = await ethers.getContractFactory("ByNdVault");
    const { upgrades } = require("hardhat");
    const freshVault = await upgrades.deployProxy(
      ByNdVault,
      [await veMEZO.getAddress(), await veBYND.getAddress()],
      { kind: "uups" }
    );
    expect(await freshVault.totalPendingRebase()).to.equal(0);

    await mintAndDeposit(ctx, alice);
    expect(await vault.totalPendingRebase()).to.equal(0);
  });
});
