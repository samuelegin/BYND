'use client';

import React from 'react';
import { clsx } from 'clsx';

export const StatRow: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex justify-between items-center py-2.5 border-b border-void-border last:border-0">
    <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">{label}</span>
    <span className={clsx('font-mono text-sm font-medium', accent ? 'text-gold' : 'text-white/[.87]')}>{value}</span>
  </div>
);
