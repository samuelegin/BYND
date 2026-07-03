import { ethers } from 'hardhat';

const VEMEZO = '0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b';

// Try every known function name for unlocking a permanent lock
const FULL_ABI = [
  'function locked(uint256 tokenId) external view returns (int128 amount, uint256 end, bool isPermanent)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function votingPowerOfNFT(uint256 tokenId) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  // Try all possible unlock function names
  'function unlock_permanent(uint256 tokenId) external',
  'function unlockPermanent(uint256 tokenId) external',
  'function unlock(uint256 tokenId) external',
  'function withdraw(uint256 tokenId) external',
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('Wallet:', signer.address);

  const ve = new ethers.Contract(VEMEZO, FULL_ABI, signer);

  // 1. Check token 805 locked state
  console.log('\n--- Token #805 state ---');
  try {
    const lock = await ve.locked(805);
    console.log('amount:      ', lock.amount.toString());
    console.log('end:         ', lock.end.toString());
    console.log('isPermanent: ', lock.isPermanent);
  } catch (e: any) {
    console.log('locked() error:', e.message);
  }

  // 2. Check owner
  try {
    const owner = await ve.ownerOf(805);
    console.log('owner:       ', owner);
  } catch (e: any) {
    console.log('ownerOf() error:', e.message);
  }

  // 3. Check voting power
  try {
    const vp = await ve.votingPowerOfNFT(805);
    console.log('votingPower: ', vp.toString());
  } catch (e: any) {
    console.log('votingPowerOfNFT() error:', e.message);
  }

  // 4. Try to static-call each unlock variant to see which one exists
  console.log('\n--- Testing unlock function names (static call) ---');
  const provider = signer.provider!;
  const iface = new ethers.Interface(FULL_ABI);

  const candidates = [
    { name: 'unlock_permanent', data: iface.encodeFunctionData('unlock_permanent', [805]) },
    { name: 'unlockPermanent',  data: iface.encodeFunctionData('unlockPermanent',  [805]) },
  ];

  for (const c of candidates) {
    try {
      await provider.call({ to: VEMEZO, data: c.data });
      console.log(c.name + ': EXISTS (static call succeeded)');
    } catch (e: any) {
      const msg = e?.info?.error?.message ?? e?.message ?? '';
      if (msg.includes('execution reverted')) {
        console.log(c.name + ': EXISTS but reverts —', msg);
      } else {
        console.log(c.name + ': does not exist or wrong sig —', msg.slice(0, 80));
      }
    }
  }

  // 5. Check wallet's other tokens
  console.log('\n--- All tokens owned by wallet ---');
  try {
    const count = await ve.balanceOf(signer.address);
    console.log('total NFTs:', count.toString());
    for (let i = 0; i < Number(count); i++) {
      const tid = await ve.tokenOfOwnerByIndex(signer.address, i);
      const lock = await ve.locked(tid);
      console.log(`  token #${tid}: amount=${lock.amount}, end=${lock.end}, isPermanent=${lock.isPermanent}`);
    }
  } catch (e: any) {
    console.log('enumeration error:', e.message);
  }
}

main().catch(console.error);
