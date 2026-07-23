'use client';

import React from 'react';
import { clsx } from 'clsx';

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const Panel: React.FC<PanelProps> = ({ children, className = '', hover = false }) => (
  <div
    className={clsx(
      'rounded-card border border-void-border bg-void-soft transition-[transform,border-color,background] duration-300',
      hover && 'hover:-translate-y-[3px] hover:border-white/[.12] hover:bg-surface-2',
      className,
    )}
  >
    {children}
  </div>
);
