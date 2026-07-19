'use client';

import React from 'react';

export const SectionHeader: React.FC<{
  label: string;
  title: string;
  subtitle?: string;
}> = ({ label, title, subtitle }) => (
  <div className="space-y-3">
    <span className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38]">{label}</span>
    <h2 className="text-[clamp(28px,4vw,36px)] font-semibold text-white/[.87] leading-tight">{title}</h2>
    {subtitle && <p className="text-[15px] text-white/60 leading-relaxed max-w-lg">{subtitle}</p>}
  </div>
);
