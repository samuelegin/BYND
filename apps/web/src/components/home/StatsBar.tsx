import { motion } from 'framer-motion';
import { Network, TrendingUp, Zap } from 'lucide-react';
import { fadeUp } from './motion';

const STATS = [
  { icon: Network, label: 'Network', value: 'Mezo Matsnet' },
  { icon: TrendingUp, label: 'Boost efficiency', value: '98%' },
  { icon: Zap, label: 'Bribe tokens', value: 'Any ERC-20' },
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
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-3.5 px-[22px] py-5">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-gold/10 text-gold">
                <Icon size={18} strokeWidth={1.75} />
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
