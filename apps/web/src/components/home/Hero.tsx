import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { fadeUp, stagger } from "./motion";
import { RoutingDiagram } from "./RoutingDiagram";

interface HeroProps {
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
}

export function Hero({ isConnected, isConnecting, connect }: HeroProps) {
  return (
    <section className="relative z-[1] mx-auto max-w-[1120px] px-5 pb-10 pt-[140px] max-[960px]:pb-7 max-[960px]:pt-[104px]">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid items-center gap-14 lg:grid-cols-[1.05fr_.95fr] max-[960px]:gap-11"
      >
        <div>
          <motion.h1
            variants={fadeUp}
            className="max-w-[12ch] text-[clamp(37px,5.6vw,58px)] font-semibold leading-[1.06] tracking-[-.02em] text-white/[.87]"
          >
            Turn <span className="text-white/[.38]">locked veMEZO</span> into{" "}
            <span className="text-gold">liquid veBYND</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-[22px] max-w-[480px] text-[17px] leading-[1.65] text-white/60"
          >
            Bynd pools fragmented veMEZO into one permanent aggregated boost
            block, routes it to the highest-yielding gauges, and mints{" "}
            <b className="font-semibold text-white/[.87]">veBYND</b> — a liquid{" "}
            <span className="font-mono text-[.92em] text-gold">ERC-20</span>{" "}
            claim you can stake, trade, or exit anytime.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-[34px] flex flex-wrap gap-3"
          >
            {isConnected ? (
              <Link
                to="/terminal"
                className="inline-flex items-center gap-2 rounded-control bg-gold px-[22px] py-[13px] text-[15px] font-semibold text-gold-ink transition-[transform,background] duration-200 hover:-translate-y-px hover:bg-gold-bright"
              >
                Open terminal
                <ArrowRight size={16} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => connect()}
                disabled={isConnecting}
                className="inline-flex items-center gap-2 rounded-control bg-gold px-[22px] py-[13px] text-[15px] font-semibold text-gold-ink transition-[transform,background] duration-200 hover:-translate-y-px hover:bg-gold-bright disabled:opacity-60"
              >
                {isConnecting ? "Initializing…" : "Initialize system"}
                <ArrowRight size={16} />
              </button>
            )}
            <Link
              to="/analytics"
              className="inline-flex items-center gap-2 rounded-control border border-white/[.12] px-[22px] py-[13px] text-[15px] font-medium text-white/[.87] transition-colors hover:bg-surface-1"
            >
              Protocol analytics
            </Link>
          </motion.div>
        </div>

        <motion.div variants={fadeUp} className="hidden lg:block">
          <RoutingDiagram />
        </motion.div>
      </motion.div>
    </section>
  );
}
