'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

// ── Panel / Card ──────────────────────────────────────────────────────────────

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

// ── Button ────────────────────────────────────────────────────────────────────

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  type?: 'button' | 'submit';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children, variant = 'primary', size = 'md', className = '',
  onClick, disabled, isLoading, type = 'button', fullWidth = false,
}) => {
  const base = 'relative font-mono font-bold uppercase tracking-[0.15em] transition-all duration-200 clip-corner-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed select-none';
  const sizes = {
    sm: 'text-[9px] px-4 py-2',
    md: 'text-[10px] px-6 py-3',
    lg: 'text-[11px] px-8 py-4',
  };
  const variants = {
    primary: 'bg-acid text-void hover:bg-acid-dim active:scale-[0.98]',
    outline: 'bg-transparent text-acid border border-acid/40 hover:border-acid hover:bg-acid/5 active:scale-[0.98]',
    ghost:   'bg-transparent text-silver-dim hover:text-silver hover:bg-void-border active:scale-[0.98]',
    danger:  'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-400 active:scale-[0.98]',
  };

  return (
    <button
      type={type}
      className={clsx(base, sizes[size], variants[variant], fullWidth && 'w-full', className)}
      onClick={onClick}
      disabled={disabled || isLoading}
    >
      {isLoading ? <Loader2 size={12} className="animate-spin" /> : children}
    </button>
  );
};

// ── Input ─────────────────────────────────────────────────────────────────────

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

// ── Stat Row ──────────────────────────────────────────────────────────────────

export const StatRow: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex justify-between items-center py-2.5 border-b border-void-border last:border-0">
    <span className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold">{label}</span>
    <span className={clsx('font-mono text-sm font-bold', accent ? 'text-acid' : 'text-silver')}>{value}</span>
  </div>
);

// ── Badge ─────────────────────────────────────────────────────────────────────

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

// ── Divider ───────────────────────────────────────────────────────────────────

export const Divider: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex items-center gap-4 my-6">
    <div className="flex-1 h-px bg-void-border" />
    {label && <span className="font-mono text-[8px] uppercase tracking-widest text-void-muted">{label}</span>}
    <div className="flex-1 h-px bg-void-border" />
  </div>
);

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastProps {
  type: 'loading' | 'success' | 'error';
  message: string;
  hash?: string;
}

export const Toast: React.FC<ToastProps> = ({ type, message, hash }) => {
  const colors = {
    loading: 'border-void-border bg-void-soft',
    success: 'border-acid/40 bg-acid/5',
    error:   'border-red-500/40 bg-red-500/5',
  };
  const icons = {
    loading: <Loader2 size={14} className="animate-spin text-silver-dim" />,
    success: <div className="w-3.5 h-3.5 rounded-full bg-acid" />,
    error:   <div className="w-3.5 h-3.5 rounded-full bg-red-500" />,
  };

  return (
    <div className={clsx(
      'flex items-center gap-3 px-5 py-4 border font-mono text-[10px] uppercase tracking-wider animate-slide-up',
      colors[type]
    )}>
      {icons[type]}
      <span className="text-silver">{message}</span>
      {hash && (
        <a
          href={`https://explorer.test.mezo.org/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-acid underline ml-2"
        >
          View
        </a>
      )}
    </div>
  );
};

// ── Section Header ────────────────────────────────────────────────────────────

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

// ── Live Indicator ────────────────────────────────────────────────────────────

export const LiveDot: React.FC<{ active?: boolean }> = ({ active = true }) => (
  <span className="relative flex h-2 w-2">
    {active && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-acid opacity-75" />}
    <span className={clsx('relative inline-flex rounded-full h-2 w-2', active ? 'bg-acid' : 'bg-void-muted')} />
  </span>
);

// ── Number formatter ──────────────────────────────────────────────────────────

export const formatNum = (n: string | number, decimals = 2): string => {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '–';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000)     return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(decimals);
};

export const formatTime = (seconds: number): string => {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};
