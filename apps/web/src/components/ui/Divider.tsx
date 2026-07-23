'use client';

import React from 'react';

export const Divider: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex items-center gap-4 my-6">
    <div className="flex-1 h-px bg-void-border" />
    {label && <span className="font-mono text-[8px] uppercase tracking-widest text-void-muted">{label}</span>}
    <div className="flex-1 h-px bg-void-border" />
  </div>
);
