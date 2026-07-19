'use client';

import React from 'react';
import { clsx } from 'clsx';

export const Badge: React.FC<{ children: React.ReactNode; variant?: 'acid' | 'muted' | 'red' | 'orange' }> = ({
  children, variant = 'muted',
}) => {
  const variants = {
    acid:   'bg-gold/10 text-gold border-gold/30',
    muted:  'bg-white/[.06] text-white/60 border-white/[.08]',
    red:    'bg-red-500/10 text-red-400 border-red-500/30',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full font-mono text-[10px] uppercase tracking-widest font-medium px-2.5 py-1 border', variants[variant])}>
      {children}
    </span>
  );
};
