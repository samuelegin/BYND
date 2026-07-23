const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { deployAll } = require("./fixtures");

describe("VeBYND", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  it("sets up name/symbol and grants the admin roles on initialize", async () => {
    const { veBYND, deployer } = ctx;
    expect(await veBYND.name()).to.equal("veBYND");
    expect(await veBYND.symbol()).to.equal("veBYND");
    expect(
      await veBYND.hasRole(await veBYND.DEFAULT_ADMIN_ROLE(), deployer.address)
    ).to.equal(true);
    expect(
      await veBYND.hasRole(await veBYND.UPGRADER_ROLE(), deployer.address)
    ).to.equal(true);
  });

  it("only MINTER_ROLE can mint", async () => {
    const { veBYND, alice, vault } = ctx;
    await expect(
      veBYND.connect(alice).mint(alice.address, 100)
    ).to.be.revertedWith(
      /AccessControl: account .* is missing role/
    );
    // vault holds MINTER_ROLE from the fixture wiring
    expect(
      await veBYND.hasRole(await veBYND.MINTER_ROLE(), await vault.getAddress())
    ).to.equal(true);
  });

  it("only BURNER_ROLE can burn", async () => {
    const { veBYND, deployer, alice } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await expect(
      veBYND.connect(alice).burn(alice.address, ethers.parseEther("1"))
    ).to.be.revertedWith(/AccessControl: account .* is missing role/);
  });

  it("only UPGRADER_ROLE can authorize an upgrade", async () => {
    const { veBYND, alice } = ctx;
    const VeBYNDv2 = await ethers.getContractFactory("VeBYND", alice);
    await expect(
      upgrades.upgradeProxy(await veBYND.getAddress(), VeBYNDv2)
    ).to.be.reverted;
  });

  it("preserves balances across a UUPS upgrade", async () => {
    const { veBYND, deployer, alice } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("42"));
    const VeBYNDv2 = await ethers.getContractFactory("VeBYND");
    const upgraded = await upgrades.upgradeProxy(
      await veBYND.getAddress(),
      VeBYNDv2
    );
    expect(await upgraded.balanceOf(alice.address)).to.equal(
      ethers.parseEther("42")
    );
  });
});
