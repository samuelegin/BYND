import { ethers } from 'hardhat';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('Using wallet:', signer.address);

  const veMEZO = new ethers.Contract(
    '0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b',
    ['function unlockPermanent(uint256 tokenId) external'],
    signer
  );

  const tx = await veMEZO.unlockPermanent(805);
  console.log('tx hash:', tx.hash);
  await tx.wait();
  console.log('Done — token #805 is now a time-based lock, deposit will work now');
}

main().catch(console.error);