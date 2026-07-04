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
        <span className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold">{label}</span>
        {hint && <span className="font-mono text-[9px] text-silver-dim/60">{hint}</span>}
      </div>
    )}
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-void border border-void-border text-silver font-mono text-sm px-4 py-3 outline-none focus:border-acid/50 transition-colors placeholder:text-void-muted"
      />
      {max && (
        <button
          type="button"
          onClick={() => onChange(max)}
          className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] text-acid uppercase tracking-widest hover:text-acid-dim transition-colors"
        >
          MAX
        </button>
      )}
    </div>
  </div>
);
