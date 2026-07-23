import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { fadeUp, viewport } from './motion';
import { TABS, STEPS, type TabKey } from './data';
import { PixelArt } from '@/components/ui';

import vaultWebp from '@/assets/illustrations/sections/scene-vault.webp';
import vaultPng from '@/assets/illustrations/sections/scene-vault.png';
import routingWebp from '@/assets/illustrations/sections/scene-routing-machine.webp';
import routingPng from '@/assets/illustrations/sections/scene-routing-machine.png';
import forgeWebp from '@/assets/illustrations/sections/scene-forge-vebynd.webp';
import forgePng from '@/assets/illustrations/sections/scene-forge-vebynd.png';
import smelterWebp from '@/assets/illustrations/sections/scene-smelter.webp';
import smelterPng from '@/assets/illustrations/sections/scene-smelter.png';
import chestRunWebp from '@/assets/illustrations/sections/scene-chest-run.webp';
import chestRunPng from '@/assets/illustrations/sections/scene-chest-run.png';
import bellWebp from '@/assets/illustrations/sections/scene-bell-reward.webp';
import bellPng from '@/assets/illustrations/sections/scene-bell-reward.png';
import buildWallWebp from '@/assets/illustrations/mascot/mascot-build-wall.webp';
import buildWallPng from '@/assets/illustrations/mascot/mascot-build-wall.png';
import treeWebp from '@/assets/illustrations/sections/scene-money-tree-water.webp';
import treePng from '@/assets/illustrations/sections/scene-money-tree-water.png';
import signpostWebp from '@/assets/illustrations/sections/scene-signpost-key.webp';
import signpostPng from '@/assets/illustrations/sections/scene-signpost-key.png';
import anvilWebp from '@/assets/illustrations/icons/icon-anvil.webp';
import anvilPng from '@/assets/illustrations/icons/icon-anvil.png';

// Every step gets its own, distinct illustration — never reused within this section.
const STEP_ART: Record<string, { webp: string; png: string; w: number; h: number; alt: string }> = {
  'boost-1': { webp: vaultWebp, png: vaultPng, w: 420, h: 359, alt: 'Mascot opening a bank vault full of coins' },
  'boost-2': { webp: routingWebp, png: routingPng, w: 420, h: 333, alt: 'Mascot operating a coin-routing gear machine' },
  'boost-3': { webp: forgeWebp, png: forgePng, w: 420, h: 367, alt: 'Mascot forging a glowing veBYND token on an anvil' },
  'rewards-1': { webp: smelterWebp, png: smelterPng, w: 410, h: 420, alt: 'Mascot pouring coins into a glowing furnace' },
  'rewards-2': { webp: chestRunWebp, png: chestRunPng, w: 398, h: 420, alt: 'Mascot running with an overflowing treasure chest of coins' },
  'rewards-3': { webp: bellWebp, png: bellPng, w: 388, h: 420, alt: 'Mascot ringing a bell labeled Reward' },
  'keeper-1': { webp: buildWallWebp, png: buildWallPng, w: 220, h: 220, alt: 'Mascot building and maintaining a wall of gold bricks' },
  'keeper-2': { webp: treeWebp, png: treePng, w: 420, h: 405, alt: 'Mascot watering a money tree that grows coins' },
  'keeper-3': { webp: signpostWebp, png: signpostPng, w: 420, h: 393, alt: 'Mascot raising a key at a crossroads signpost' },
};

export function HowItWorks() {
  const [active, setActive] = useState<TabKey>('boost');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0, opacity: 0 });

  function moveTo(key: string) {
    const el = tabRefs.current[key];
    if (!el) return;
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth, opacity: 1 });
  }

  useEffect(() => {
    moveTo(active);
    const onResize = () => moveTo(active);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <section className="relative z-[1] mx-auto max-w-[1120px] px-5 pb-11 pt-[100px]" id="how">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mb-8 text-center"
      >
        <h2 className="text-[clamp(28px,4vw,40px)] font-semibold tracking-[-.02em] text-white/[.87]">
          Earn with Bynd
        </h2>
      </motion.div>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        role="tablist"
        aria-label="Earn mechanisms"
        className="relative mx-auto mb-11 flex w-fit gap-0.5 rounded-full border border-white/[.08] bg-surface-1 p-1.5"
      >
        <span
          className="pointer-events-none absolute bottom-1.5 top-1.5 rounded-full border border-gold/30 bg-gold/[.13] transition-[left,width,opacity] duration-[.34s] ease-[cubic-bezier(.4,0,.2,1)]"
          style={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity }}
          aria-hidden="true"
        />
        {TABS.map((tab) => (
          <button
            key={tab.key}
            ref={(el) => { tabRefs.current[tab.key] = el; }}
            role="tab"
            type="button"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={clsx(
              'relative z-[1] whitespace-nowrap rounded-full px-[18px] py-2.5 text-sm transition-colors max-[520px]:px-3 max-[520px]:text-[13px]',
              active === tab.key ? 'text-gold' : 'text-white/60 hover:text-white/[.87]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </motion.div>

      <div className="grid gap-5 md:grid-cols-3">
        <AnimatePresence mode="wait">
          {STEPS[active].map((step) => {
            const art = STEP_ART[`${active}-${step.num}`];
            return (
              <motion.article
                key={`${active}-${step.num}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="rounded-card border border-white/[.08] bg-surface-1 p-[28px_26px] transition-[transform,border-color,background] duration-[.25s] hover:-translate-y-[3px] hover:border-white/[.12] hover:bg-surface-2"
              >
                <div className="mb-[18px] flex items-start justify-between">
                  <PixelArt
                    webp={art.webp}
                    png={art.png}
                    width={art.w}
                    height={art.h}
                    alt={art.alt}
                    className="h-[86px] w-auto motion-safe:animate-illo-float"
                  />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/[.12] font-mono text-[13px] font-medium text-gold">
                    {step.num}
                  </div>
                </div>
                {active === 'boost' && step.num === 3 && (
                  <PixelArt
                    webp={anvilWebp}
                    png={anvilPng}
                    width={240}
                    height={238}
                    alt=""
                    className="mb-2 h-4 w-auto opacity-60"
                  />
                )}
                <h3 className="text-[19px] font-semibold text-white/[.87]">{step.title}</h3>
                <p className="mt-2.5 text-[14.5px] leading-[1.62] text-white/60">{step.body}</p>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
