import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { fadeUp, viewport } from './motion';
import { TABS, STEPS, type TabKey } from './data';

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
          {STEPS[active].map((step) => (
            <motion.article
              key={`${active}-${step.num}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="rounded-card border border-white/[.08] bg-surface-1 p-[28px_26px] transition-[transform,border-color,background] duration-[.25s] hover:-translate-y-[3px] hover:border-white/[.12] hover:bg-surface-2"
            >
              <div className="mb-[22px] flex h-[42px] w-[42px] items-center justify-center rounded-full bg-gold/[.12] font-mono text-[15px] font-medium text-gold">
                {step.num}
              </div>
              <h3 className="text-[19px] font-semibold text-white/[.87]">{step.title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-[1.62] text-white/60">{step.body}</p>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
