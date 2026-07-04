'use client';

import React from 'react';
import { clsx } from 'clsx';

export const LiveDot: React.FC<{ active?: boolean }> = ({ active = true }) => (
  <span className="relative flex h-2 w-2">
    {active && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-acid opacity-75" />}
    <span className={clsx('relative inline-flex rounded-full h-2 w-2', active ? 'bg-acid' : 'bg-void-muted')} />
  </span>
);
