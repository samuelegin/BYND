import { motion } from 'framer-motion';
import { fadeUp, stagger, viewport } from './motion';
import { REVENUE_STREAMS } from './data';
import { PixelArt } from '@/components/ui';
import mapWebp from '@/assets/illustrations/sections/scene-map-table.webp';
import mapPng from '@/assets/illustrations/sections/scene-map-table.png';
import celebrateWebp from '@/assets/illustrations/mascot/mascot-celebrate.webp';
import celebratePng from '@/assets/illustrations/mascot/mascot-celebrate.png';
import iconBellWebp from '@/assets/illustrations/icons/icon-bell.webp';
import iconBellPng from '@/assets/illustrations/icons/icon-bell.png';
import iconTreeWebp from '@/assets/illustrations/icons/icon-money-tree.webp';
import iconTreePng from '@/assets/illustrations/icons/icon-money-tree.png';
import iconCoinBagWebp from '@/assets/illustrations/icons/icon-coin-bag.webp';
import iconCoinBagPng from '@/assets/illustrations/icons/icon-coin-bag.png';
import iconCoinStackWebp from '@/assets/illustrations/icons/icon-coin-stack.webp';
import iconCoinStackPng from '@/assets/illustrations/icons/icon-coin-stack.png';

const STREAM_ICON: Record<string, { webp: string; png: string; w: number; h: number }> = {
  'Bigger rewards, together': { webp: iconTreeWebp, png: iconTreePng, w: 240, h: 214 },
  'Paid to vote': { webp: iconCoinBagWebp, png: iconCoinBagPng, w: 230, h: 240 },
  'A share of the fees': { webp: iconCoinStackWebp, png: iconCoinStackPng, w: 240, h: 217 },
};

export function RevenueStreams() {
  return (
    <section className="relative z-[1] mx-auto max-w-[1120px] px-5 pb-11 pt-[100px]" id="features">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mx-auto mb-12 flex max-w-[560px] flex-col items-center gap-3 text-center"
      >
        <PixelArt
          webp={mapWebp}
          png={mapPng}
          width={420}
          height={392}
          alt="Mascot pouring coins onto a treasure map, charting where revenue comes from"
          className="h-[90px] w-auto sm:h-[130px] motion-safe:animate-illo-float"
        />
        <div className="flex items-center gap-2">
          <h2 className="text-[clamp(28px,4vw,40px)] font-semibold tracking-[-.02em] text-white/[.87]">
            Three revenue streams, one destination
          </h2>
          <PixelArt
            webp={iconBellWebp}
            png={iconBellPng}
            width={206}
            height={240}
            alt=""
            className="h-6 w-auto motion-safe:animate-illo-sparkle"
          />
        </div>
        <p className="mt-4 text-[15.5px] leading-[1.6] text-white/60">
          Every source of yield Bynd captures flows straight to veBYND stakers.
        </p>
      </motion.div>

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="grid gap-5 md:grid-cols-3"
      >
        {REVENUE_STREAMS.map((r) => {
          const icon = STREAM_ICON[r.title];
          return (
            <motion.article
              key={r.title}
              variants={fadeUp}
              className="overflow-hidden rounded-panel border border-white/[.08] bg-surface-1 transition-[transform,border-color] duration-[.25s] hover:-translate-y-[3px] hover:border-white/[.12]"
            >
              <div className="flex h-[104px] items-center justify-center border-b border-white/[.08] bg-gold/[.07]">
                {icon && (
                  <PixelArt
                    webp={icon.webp}
                    png={icon.png}
                    width={icon.w}
                    height={icon.h}
                    alt=""
                    className="h-[52px] w-auto"
                  />
                )}
              </div>
              <div className="p-[26px_26px_28px]">
                <h3 className="text-[18px] font-semibold text-white/[.87]">{r.title}</h3>
                <p className="mt-2.5 text-sm leading-[1.62] text-white/60">{r.body}</p>
                <p className="mt-5 font-mono text-[11px] uppercase tracking-[.1em] text-white/[.38]">
                  {r.tag} <span className="text-gold">→ veBYND</span>
                </p>
              </div>
            </motion.article>
          );
        })}
      </motion.div>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mt-10 flex justify-center"
      >
        <PixelArt
          webp={celebrateWebp}
          png={celebratePng}
          width={312}
          height={420}
          alt=""
          className="h-[64px] w-auto motion-safe:animate-illo-bob"
        />
      </motion.div>
    </section>
  );
}
