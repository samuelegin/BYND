'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, size = 'md' }) => {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx(
        'relative w-full bg-void-soft border border-void-border clip-corner animate-slide-up',
        widths[size]
      )}>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/50 to-transparent" />
        <div className="flex items-start justify-between p-6 border-b border-void-border">
          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] font-black text-silver">{title}</h3>
            {subtitle && <p className="text-[9px] font-mono text-silver-dim mt-1 uppercase tracking-widest">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-silver-dim hover:text-silver transition-colors p-1 -mr-1">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
        <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-void-border pointer-events-none" />
        <div className="absolute top-6 right-6 w-2 h-2 border-t border-r border-void-muted pointer-events-none" />
      </div>
    </div>
  );
};
