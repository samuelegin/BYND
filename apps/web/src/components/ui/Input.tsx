'use client';

import React from 'react';
import { clsx } from 'clsx';

interface InputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  type?: string;
  max?: string;
  className?: string;
}

export const Input: React.FC<InputProps> = ({
  value, onChange, placeholder, label, hint, type = 'text', max, className = '',
}) => (
  <div className={clsx('space-y-2', className)}>
    {label && (
      <div className="flex justify-between items-center">
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">{label}</span>
        {hint && <span className="font-mono text-[11px] text-white/[.38]">{hint}</span>}
      </div>
    )}
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-control border border-void-border bg-bg text-white/[.87] font-mono text-sm px-4 py-3 outline-none focus:border-gold/50 transition-colors placeholder:text-white/[.38]"
      />
      {max && (
        <button
          type="button"
          onClick={() => onChange(max)}
          className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-gold uppercase tracking-widest hover:text-gold-bright transition-colors"
        >
          Max
        </button>
      )}
    </div>
  </div>
);
