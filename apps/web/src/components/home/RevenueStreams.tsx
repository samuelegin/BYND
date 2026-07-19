import { motion } from 'framer-motion';
import { fadeUp, stagger, viewport } from './motion';
import { REVENUE_STREAMS } from './data';

export function RevenueStreams() {
  return (
    <section className="relative z-[1] mx-auto max-w-[1120px] px-5 pb-11 pt-[100px]" id="features">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mx-auto mb-12 max-w-[560px] text-center"
      >
        <h2 className="text-[clamp(28px,4vw,40px)] font-semibold tracking-[-.02em] text-white/[.87]">
          Three revenue streams, one destination
        </h2>
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
          const Icon = r.icon;
          return (
            <motion.article
              key={r.title}
              variants={fadeUp}
              className="overflow-hidden rounded-panel border border-white/[.08] bg-surface-1 transition-[transform,border-color] duration-[.25s] hover:-translate-y-[3px] hover:border-white/[.12]"
            >
              <div className="flex h-[104px] items-center justify-center border-b border-white/[.08] bg-gold/[.07] text-gold">
                <Icon size={30} strokeWidth={1.6} />
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
    </section>
  );
}
