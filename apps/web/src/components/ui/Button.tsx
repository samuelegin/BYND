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
  const base = 'relative rounded-control font-medium transition-[transform,background,border-color,color] duration-200 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed select-none';
  const sizes = {
    sm: 'text-xs px-4 py-2',
    md: 'text-sm px-5 py-2.5',
    lg: 'text-[15px] px-6 py-3',
  };
  const variants = {
    primary: 'bg-gold text-gold-ink font-semibold hover:bg-gold-bright hover:-translate-y-px active:translate-y-0',
    outline: 'bg-transparent text-white/[.87] border border-white/[.12] hover:bg-surface-1 active:translate-y-px',
    ghost:   'bg-transparent text-white/60 hover:text-white/[.87] hover:bg-surface-1 active:translate-y-px',
    danger:  'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-400 active:translate-y-px',
  };

  return (
    <button
      type={type}
      className={clsx(base, sizes[size], variants[variant], fullWidth && 'w-full', className)}
      onClick={onClick}
      disabled={disabled || isLoading}
    >
      {isLoading ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
};
