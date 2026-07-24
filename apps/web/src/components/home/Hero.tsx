import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { fadeUp, stagger } from "./motion";
import { RoutingDiagram } from "./RoutingDiagram";
import { PixelArt } from "@/components/ui";
import heroMascotWebp from "@/assets/illustrations/hero/mascot-key-raise.webp";
import heroMascotPng from "@/assets/illustrations/hero/mascot-key-raise.png";
import coinWebp from "@/assets/illustrations/icons/icon-vebynd-coin.webp";
import coinPng from "@/assets/illustrations/icons/icon-vebynd-coin.png";
import chestWebp from "@/assets/illustrations/icons/icon-chest.webp";
import chestPng from "@/assets/illustrations/icons/icon-chest.png";
import coinPileWebp from "@/assets/illustrations/icons/icon-coin-pile.webp";
import coinPilePng from "@/assets/illustrations/icons/icon-coin-pile.png";

interface HeroProps {
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
}

export function Hero({ isConnected, isConnecting, connect }: HeroProps) {
  return (
    <section className="relative z-[1] mx-auto max-w-[1120px] px-5 pb-10 pt-[140px] max-[960px]:pb-7 max-[960px]:pt-[104px] lg:pb-7 lg:pt-[112px]">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid items-center gap-14 lg:grid-cols-[1.05fr_.95fr] lg:items-stretch lg:gap-10 max-[960px]:gap-11"
      >
        <div>
          <motion.div
            variants={fadeUp}
            className="relative mb-5 h-[150px] w-[150px] sm:h-[220px] sm:w-[220px] lg:mb-3 lg:h-[256px] lg:w-[256px] xl:h-[288px] xl:w-[288px]"
          >
            <PixelArt
              webp={heroMascotWebp}
              png={heroMascotPng}
              width={431}
              height={520}
              alt="The BYND pixel-art mascot triumphantly raising a glowing veBYND key"
              priority
              className="h-full w-full motion-safe:animate-illo-bob"
            />
            <PixelArt
              webp={coinWebp}
              png={coinPng}
              width={218}
              height={240}
              alt=""
              className="absolute -right-2 top-1 h-[15%] w-[15%] min-h-[22px] min-w-[22px] motion-safe:animate-illo-float"
            />
            <PixelArt
              webp={coinPileWebp}
              png={coinPilePng}
              width={238}
              height={240}
              alt=""
              className="absolute -left-3 top-[38%] h-[13%] w-[13%] min-h-[18px] min-w-[18px] motion-safe:animate-illo-float [animation-delay:.8s]"
            />
            <PixelArt
              webp={chestWebp}
              png={chestPng}
              width={240}
              height={226}
              alt=""
              className="absolute -bottom-2 right-[6%] h-[20%] w-[20%] min-h-[26px] min-w-[26px] motion-safe:animate-illo-bob [animation-delay:.4s]"
            />
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="max-w-[14ch] text-[clamp(37px,5.6vw,58px)] font-semibold leading-[1.06] tracking-[-.02em] text-white/[.87]"
          >
            <span className="text-gold">Liquidity</span> and{" "}
            <span className="text-gold">automation</span> for your{" "}
            <span className="text-white/[.38]">veMEZO</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-[22px] max-w-[480px] text-[17px] leading-[1.65] text-white/60 lg:mt-4"
          >
            BynD pools veMEZO together, automatically votes it toward the
            gauges with the strongest incentives, and gives you back{" "}
            <b className="font-semibold text-white/[.87]">veBYND</b>, a token
            you can stake, trade, or exit anytime.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-[34px] flex flex-wrap gap-3 lg:mt-6"
          >
            {isConnected ? (
              <Link
                to="/terminal"
                className="inline-flex items-center gap-2 rounded-control bg-gold px-[22px] py-[13px] text-[15px] font-semibold text-gold-ink transition-[transform,background] duration-200 hover:-translate-y-px hover:bg-gold-bright"
              >
                Explore BynD
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

        <motion.div variants={fadeUp} className="hidden lg:block lg:h-full">
          <RoutingDiagram />
        </motion.div>
      </motion.div>
    </section>
  );
}
