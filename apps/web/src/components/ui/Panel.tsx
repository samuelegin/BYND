'use client';

import React from 'react';
import { clsx } from 'clsx';

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  corner?: boolean;
}

export const Panel: React.FC<PanelProps> = ({ children, className = '', glow = false, corner = true }) => (
  <div className={clsx(
    'relative bg-void-soft border border-void-border transition-all duration-300',
    corner && 'clip-corner',
    glow && 'border-acid/20 glow-acid',
    className
  )}>
    {corner && (
      <>
        <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-void-muted pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-void-muted pointer-events-none" />
      </>
    )}
    {children}
  </div>
);
