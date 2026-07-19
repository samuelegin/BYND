import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { fadeUp, viewport } from './motion';
import { COMPARE, EPOCH_STEPS } from './data';

export function WhyBynd() {
  return (
    <section className="relative z-[1] mx-auto max-w-[1120px] px-5 pb-11 pt-[100px]">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mx-auto mb-12 max-w-[600px] text-center"
      >
        <h2 className="text-[clamp(28px,4vw,40px)] font-semibold tracking-[-.02em] text-white/[.87]">
          Solo vs. aggregated boost liquidity
        </h2>
        <p className="mt-4 text-[15.5px] leading-[1.62] text-white/60">
          Mezo&apos;s boost gauges let protocols bid for veMEZO allocation to amplify veBTC
          positions. Bynd pools veMEZO into one permanent aggregated block — the dominant
          source protocols bid to attract.
        </p>
      </motion.div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_.9fr] max-[900px]:grid-cols-1 max-[900px]:gap-5">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          className="overflow-hidden rounded-panel border border-white/[.08] bg-surface-1"
        >
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className="border-b border-white/[.08] p-[15px_18px]">
                  <span className="sr-only">Dimension</span>
                </th>
                <th
                  scope="col"
                  className="border-b border-white/[.08] p-[15px_18px] text-left font-mono text-[11px] uppercase tracking-[.08em] text-white/[.38] max-[480px]:p-3"
                >
                  Solo veMEZO
                </th>
                <th
                  scope="col"
                  className="border-b border-white/[.08] bg-gold/[.05] p-[15px_18px] text-left font-mono text-[11px] uppercase tracking-[.08em] text-gold max-[480px]:p-3"
                >
                  Bynd aggregated
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row.dim} className="border-b border-white/[.08] last:border-b-0">
                  <td className="p-[15px_18px] text-[13.5px] text-white/60 max-[480px]:p-3 max-[480px]:text-xs">
                    {row.dim}
                  </td>
                  <td className="p-[15px_18px] max-[480px]:p-3">
                    <span className="flex items-center gap-2 text-[13.5px] text-white/[.38] max-[480px]:text-xs">
                      <X size={16} className="shrink-0 text-white/[.38]" />
                      {row.solo}
                    </span>
                  </td>
                  <td className="bg-gold/[.05] p-[15px_18px] max-[480px]:p-3">
                    <span className="flex items-center gap-2 text-[13.5px] font-medium text-white/[.87] max-[480px]:text-xs">
                      <Check size={16} className="shrink-0 text-gold" />
                      {row.bynd}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          className="rounded-panel border border-white/[.08] bg-surface-1 p-[30px_28px]"
        >
          <p className="font-mono text-[11.5px] font-medium uppercase tracking-[.12em] text-gold">
            Keeper epoch flow
          </p>
          <p className="mt-3 text-[13.5px] leading-[1.6] text-white/60">
            Each epoch, four permissionless on-chain actions maintain the protocol. Any
            wallet can call them.
          </p>

          <div className="mt-[26px]">
            {EPOCH_STEPS.map((s, i) => (
              <div key={s.fn} className="relative flex items-start gap-4 pb-[22px] last:pb-0">
                {i < EPOCH_STEPS.length - 1 && (
                  <span className="absolute left-4 top-[34px] bottom-0 w-px bg-white/[.08]" />
                )}
                <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[.08] bg-surface-2 font-mono text-xs text-white/60">
                  {s.num}
                </span>
                <div>
                  <p className="font-mono text-[13.5px] font-medium text-gold">{s.fn}</p>
                  <p className="mt-1 text-xs leading-[1.55] text-white/60">{s.note}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
