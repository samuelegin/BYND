import heroWaveWebp from '@/assets/illustrations/mascot/mascot-hero-wave.webp';
import heroWavePng from '@/assets/illustrations/mascot/mascot-hero-wave.png';
import buildWallWebp from '@/assets/illustrations/mascot/mascot-build-wall.webp';
import buildWallPng from '@/assets/illustrations/mascot/mascot-build-wall.png';
import flagPlantWebp from '@/assets/illustrations/mascot/mascot-flag-plant.webp';
import flagPlantPng from '@/assets/illustrations/mascot/mascot-flag-plant.png';
import celebrateWebp from '@/assets/illustrations/mascot/mascot-celebrate.webp';
import celebratePng from '@/assets/illustrations/mascot/mascot-celebrate.png';

export interface MascotAvatar {
  webp: string;
  png: string;
  width: number;
  height: number;
  alt: string;
}

// One pose per NFT identity tile. Order matters only in that it gives
// each pose a stable index — see mascotForToken below.
export const MASCOT_AVATARS: MascotAvatar[] = [
  { webp: heroWaveWebp, png: heroWavePng, width: 400, height: 400, alt: 'Mascot waving hello' },
  { webp: buildWallWebp, png: buildWallPng, width: 220, height: 220, alt: 'Mascot building a wall' },
  { webp: flagPlantWebp, png: flagPlantPng, width: 188, height: 220, alt: 'Mascot planting a flag' },
  { webp: celebrateWebp, png: celebratePng, width: 163, height: 220, alt: 'Mascot celebrating' },
];

/**
 * Deterministic pose per tokenId — same NFT always shows the same mascot
 * (so it doesn't flicker on re-render), but different NFTs in the same
 * wallet land on different poses, same idea as the per-token gradient tile.
 */
export function mascotForToken(tokenId: number): MascotAvatar {
  const idx = ((tokenId % MASCOT_AVATARS.length) + MASCOT_AVATARS.length) % MASCOT_AVATARS.length;
  return MASCOT_AVATARS[idx];
}
