'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

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
