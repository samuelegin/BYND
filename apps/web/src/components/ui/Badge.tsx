'use client';

import React from 'react';
import { clsx } from 'clsx';

export const Badge: React.FC<{ children: React.ReactNode; variant?: 'acid' | 'muted' | 'red' | 'orange' }> = ({
  children, variant = 'muted',
}) => {
  const variants = {
    acid:   'bg-acid/10 text-acid border-acid/30',
    muted:  'bg-void-border text-silver-dim border-void-muted',
    red:    'bg-red-500/10 text-red-400 border-red-500/30',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-widest font-bold px-2 py-1 border', variants[variant])}>
      {children}
    </span>
  );
};
