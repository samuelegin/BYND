import { motion } from "framer-motion";
import { fadeUp, stagger, viewport } from "./motion";
import { LiveDot } from "./LiveDot";
import { PixelArt } from "@/components/ui";
import altarWebp from "@/assets/illustrations/sections/scene-analytics-altar.webp";
import altarPng from "@/assets/illustrations/sections/scene-analytics-altar.png";
import iconCompassWebp from "@/assets/illustrations/icons/icon-compass.webp";
import iconCompassPng from "@/assets/illustrations/icons/icon-compass.png";
import iconMapWebp from "@/assets/illustrations/icons/icon-treasure-map.webp";
import iconMapPng from "@/assets/illustrations/icons/icon-treasure-map.png";
import iconYKeyWebp from "@/assets/illustrations/icons/icon-y-key.webp";
import iconYKeyPng from "@/assets/illustrations/icons/icon-y-key.png";
import iconCoinWebp from "@/assets/illustrations/icons/icon-vebynd-coin.webp";
import iconCoinPng from "@/assets/illustrations/icons/icon-vebynd-coin.png";
import iconGearWebp from "@/assets/illustrations/icons/icon-emblem-gear-a.webp";
import iconGearPng from "@/assets/illustrations/icons/icon-emblem-gear-a.png";
import iconSignpostWebp from "@/assets/illustrations/icons/icon-signpost-a.webp";
import iconSignpostPng from "@/assets/illustrations/icons/icon-signpost-a.png";

const GLANCE_STATS = [
  { label: "Network", value: "Mezo", live: false },
  { label: "veBYND staker APR", value: "Live", live: true },
  { label: "Boost efficiency", value: "98%", live: false },
  { label: "Bribe tokens", value: "Any", live: false },
];

const TILE_ICONS = [
  { webp: iconCompassWebp, png: iconCompassPng, w: 240, h: 237 },
  { webp: iconMapWebp, png: iconMapPng, w: 240, h: 212 },
  { webp: iconYKeyWebp, png: iconYKeyPng, w: 159, h: 240 },
  { webp: iconCoinWebp, png: iconCoinPng, w: 218, h: 240 },
  { webp: iconGearWebp, png: iconGearPng, w: 240, h: 224 },
  { webp: iconSignpostWebp, png: iconSignpostPng, w: 197, h: 240 },
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
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={viewport}
          className="mb-5 flex justify-center"
        >
          <PixelArt
            webp={altarWebp}
            png={altarPng}
            width={300}
            height={283}
            alt="Mascot at a glowing altar surrounded by floating analytics icons"
            className="h-[110px] w-[110px] sm:h-[150px] sm:w-[150px] motion-safe:animate-illo-float"
          />
        </motion.div>

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
          const icon = TILE_ICONS[i % TILE_ICONS.length];
          const active = ACTIVE_TILES.has(i);
          return (
            <div
              key={i}
              className={
                "flex h-9 w-9 rotate-45 items-center justify-center rounded-[11px] border " +
                (active
                  ? "border-gold/[.38] bg-gold/[.12]"
                  : "border-white/[.08] bg-white/[.04]")
              }
            >
              <PixelArt
                webp={icon.webp}
                png={icon.png}
                width={icon.w}
                height={icon.h}
                alt=""
                className={
                  "-rotate-45 h-[15px] w-auto" +
                  (active ? "" : " opacity-40")
                }
              />
            </div>
          );
        })}
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[150px] bg-gradient-to-t from-bg to-transparent" />
    </section>
  );
}
