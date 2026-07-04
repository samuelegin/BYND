'use client';

import React from 'react';

export const SectionHeader: React.FC<{
  label: string;
  title: string;
  subtitle?: string;
}> = ({ label, title, subtitle }) => (
  <div className="space-y-2">
    <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">{label}</span>
    <h2 className="text-3xl md:text-4xl font-black text-silver leading-none">{title}</h2>
    {subtitle && <p className="text-silver-dim text-sm leading-relaxed max-w-lg">{subtitle}</p>}
  </div>
);
