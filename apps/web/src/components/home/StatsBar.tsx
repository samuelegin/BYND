import { motion } from 'framer-motion';
import { fadeUp } from './motion';
import { PixelArt } from '@/components/ui';
import iconYKeyWebp from '@/assets/illustrations/icons/icon-y-key.webp';
import iconYKeyPng from '@/assets/illustrations/icons/icon-y-key.png';
import iconCannonWebp from '@/assets/illustrations/icons/icon-cannon.webp';
import iconCannonPng from '@/assets/illustrations/icons/icon-cannon.png';
import iconCoinBagWebp from '@/assets/illustrations/icons/icon-coin-bag.webp';
import iconCoinBagPng from '@/assets/illustrations/icons/icon-coin-bag.png';

const STATS = [
  { icon: iconYKeyWebp, iconPng: iconYKeyPng, w: 159, h: 240, label: 'Network', value: 'Mezo Matsnet' },
  { icon: iconCannonWebp, iconPng: iconCannonPng, w: 230, h: 240, label: 'Boost efficiency', value: '98%' },
  { icon: iconCoinBagWebp, iconPng: iconCoinBagPng, w: 230, h: 240, label: 'Bribe tokens', value: 'Any ERC-20' },
];

export function StatsBar() {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="relative z-[1] mx-auto mt-2.5 max-w-[1120px] px-5"
      aria-label="Protocol at a glance"
    >
      <div className="grid grid-cols-1 divide-y divide-white/[.08] rounded-card border border-white/[.08] bg-surface-1 max-[640px]:grid-cols-1 min-[640px]:grid-cols-3 min-[640px]:divide-x min-[640px]:divide-y-0">
        {STATS.map((s) => {
          return (
            <div key={s.label} className="flex items-center gap-3.5 px-[22px] py-5">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-gold/10">
                <PixelArt
                  webp={s.icon}
                  png={s.iconPng}
                  width={s.w}
                  height={s.h}
                  alt=""
                  className="h-[26px] w-auto"
                />
              </span>
              <div>
                <p className="mb-0.5 text-[12.5px] text-white/[.38]">{s.label}</p>
                <p className="font-mono text-[16px] font-medium text-white/[.87]">{s.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
