import { motion } from "framer-motion";
import {
  Boxes,
  Zap,
  ShieldCheck,
  TrendingUp,
  Target,
  Layers,
  BarChart3,
} from "lucide-react";
import { fadeUp, stagger, viewport } from "./motion";
import { LiveDot } from "./LiveDot";

const GLANCE_STATS = [
  { label: "Network", value: "Mezo", live: false },
  { label: "veBYND staker APR", value: "Live", live: true },
  { label: "Boost efficiency", value: "98%", live: false },
  { label: "Bribe tokens", value: "Any", live: false },
];

const TILE_ICONS = [
  Boxes,
  Target,
  ShieldCheck,
  TrendingUp,
  Layers,
  Zap,
  BarChart3,
];
const ACTIVE_TILES = new Set([2, 9, 14, 21, 25]);
const TILE_COUNT = 28;

export function Glance() {
  return (
    <section
      className="relative z-[1] overflow-hidden py-[96px] pb-11"
      aria-labelledby="glance-title"
    >
      <div className="mx-auto max-w-[960px] px-5 text-center">
        <motion.h2
          id="glance-title"
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          className="text-[clamp(26px,3.6vw,36px)] font-semibold tracking-[-.01em] text-white/[.87]"
        >
          The protocol at a glance
        </motion.h2>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          className="mx-auto mt-[46px] grid max-w-[720px] grid-cols-2 gap-y-[34px] gap-x-6 min-[560px]:grid-cols-4 min-[560px]:gap-y-[26px] min-[560px]:gap-x-7"
        >
          {GLANCE_STATS.map((s) => (
            <motion.div key={s.label} variants={fadeUp}>
              <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38]">
                {s.label}
              </p>
              <p className="mt-3 inline-flex items-center gap-2 text-[clamp(26px,3vw,32px)] font-semibold leading-none text-gold">
                {s.live && <LiveDot size={8} />}
                {s.value}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={viewport}
        className="mx-auto mt-16 grid max-w-[900px] justify-center gap-4 px-5"
        style={{
          gridTemplateColumns: "repeat(auto-fill, 62px)",
          justifyItems: "center",
        }}
        aria-hidden="true"
      >
        {Array.from({ length: TILE_COUNT }).map((_, i) => {
          const Icon = TILE_ICONS[i % TILE_ICONS.length];
          const active = ACTIVE_TILES.has(i);
          return (
            <div
              key={i}
              className={
                "flex h-9 w-9 rotate-45 items-center justify-center rounded-[11px] border " +
                (active
                  ? "border-gold/[.38] bg-gold/[.12] text-gold"
                  : "border-white/[.08] bg-white/[.04] text-white/[.38]")
              }
            >
              <Icon size={14} strokeWidth={1.6} className="-rotate-45" />
            </div>
          );
        })}
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[150px] bg-gradient-to-t from-bg to-transparent" />
    </section>
  );
}
