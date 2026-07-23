const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll } = require("./fixtures");

describe("VeBYND — extra coverage", function () {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  it("uses 18 decimals", async () => {
    const { veBYND } = ctx;
    expect(await veBYND.decimals()).to.equal(18);
  });

  it("totalSupply increases on mint and decreases on burn", async () => {
    const { veBYND, deployer, alice } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.grantRole(await veBYND.BURNER_ROLE(), deployer.address);

    expect(await veBYND.totalSupply()).to.equal(0);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    expect(await veBYND.totalSupply()).to.equal(ethers.parseEther("10"));
    await veBYND.burn(alice.address, ethers.parseEther("4"));
    expect(await veBYND.totalSupply()).to.equal(ethers.parseEther("6"));
  });

  it("supports standard transfer between holders", async () => {
    const { veBYND, deployer, alice, bob } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));

    await veBYND.connect(alice).transfer(bob.address, ethers.parseEther("3"));
    expect(await veBYND.balanceOf(alice.address)).to.equal(ethers.parseEther("7"));
    expect(await veBYND.balanceOf(bob.address)).to.equal(ethers.parseEther("3"));
  });

  it("supports approve + transferFrom and decrements allowance", async () => {
    const { veBYND, deployer, alice, bob, carol } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));

    await veBYND.connect(alice).approve(bob.address, ethers.parseEther("5"));
    await veBYND.connect(bob).transferFrom(alice.address, carol.address, ethers.parseEther("2"));

    expect(await veBYND.allowance(alice.address, bob.address)).to.equal(ethers.parseEther("3"));
    expect(await veBYND.balanceOf(carol.address)).to.equal(ethers.parseEther("2"));
  });

  it("reverts a transferFrom beyond the approved allowance", async () => {
    const { veBYND, deployer, alice, bob } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(bob.address, ethers.parseEther("1"));

    await expect(
      veBYND.connect(bob).transferFrom(alice.address, bob.address, ethers.parseEther("2"))
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("reverts burning more than the holder's balance", async () => {
    const { veBYND, deployer, alice } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.grantRole(await veBYND.BURNER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("1"));

    await expect(
      veBYND.burn(alice.address, ethers.parseEther("2"))
    ).to.be.revertedWith("ERC20: burn amount exceeds balance");
  });

  it("admin can grant and later revoke MINTER_ROLE", async () => {
    const { veBYND, deployer, alice } = ctx;
    const MINTER_ROLE = await veBYND.MINTER_ROLE();

    await veBYND.grantRole(MINTER_ROLE, alice.address);
    expect(await veBYND.hasRole(MINTER_ROLE, alice.address)).to.equal(true);
    await veBYND.connect(alice).mint(alice.address, 100); // works now that alice holds the role

    await veBYND.revokeRole(MINTER_ROLE, alice.address);
    expect(await veBYND.hasRole(MINTER_ROLE, alice.address)).to.equal(false);
    await expect(veBYND.connect(alice).mint(alice.address, 100)).to.be.revertedWith(
      /AccessControl: account .* is missing role/
    );
  });

  it("cannot be initialized a second time", async () => {
    const { veBYND, deployer } = ctx;
    await expect(veBYND.initialize(deployer.address)).to.be.revertedWith(
      "Initializable: contract is already initialized"
    );
  });
});
