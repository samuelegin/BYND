const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit } = require("./fixtures");

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
      expect(await vault.totalDeposited()).to.equal(3);
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
    it("extends every managed lock to the new 4-year max and enforces the 7-day cooldown", async () => {
      const { veMEZO, vault, alice } = ctx;
      const tokenId = await mintAndDeposit(ctx, alice);
      const before = await veMEZO.locked(tokenId);

      await vault.extendLocks();
      const after = await veMEZO.locked(tokenId);
      expect(after.end).to.be.gt(before.end);

      await expect(vault.extendLocks()).to.be.revertedWith(
        "ByNdVault: cooldown active"
      );

      await ethers.provider.send("evm_increaseTime", [7 * 86400 + 1]);
      await ethers.provider.send("evm_mine");
      await expect(vault.extendLocks()).to.not.be.reverted;
    });

    it("is callable by anyone (permissionless keeper step)", async () => {
      const { vault, stranger, alice } = ctx;
      await mintAndDeposit(ctx, alice);
      await expect(vault.connect(stranger).extendLocks()).to.not.be.reverted;
    });
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

    it("reverts if there are no deposits yet", async () => {
      const { vault } = ctx;
      await expect(vault.claimRebases()).to.be.revertedWith(
        "ByNdVault: no deposits"
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
