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
  // Rendered OUTSIDE the scrollable body, pinned to the bottom of the card —
  // use for primary actions (Cancel/Confirm) so they're never lost below a
  // scroll fold when body content overflows. Without this, a tall modal's
  // buttons scroll away with no visual cue that more content exists below.
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, footer, size = 'md' }) => {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx(
        // max-h + flex-col caps the whole card to the viewport; the body
        // below scrolls internally instead of pushing header/buttons off
        // screen when content is tall (e.g. DepositModal with 3+ NFT rows).
        'relative w-full max-h-[85vh] flex flex-col rounded-panel border border-void-border bg-void-soft animate-slide-up shadow-[0_24px_60px_rgba(0,0,0,.45)]',
        widths[size]
      )}>
        <div className="shrink-0 flex items-start justify-between p-6 border-b border-void-border">
          <div>
            <h3 className="font-display text-[17px] font-semibold text-white/[.87]">{title}</h3>
            {subtitle && <p className="text-sm text-white/60 mt-1">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 -mr-1 text-white/60 hover:bg-surface-2 hover:text-white/[.87] transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto min-h-0">{children}</div>
        {footer && (
          <div className="shrink-0 p-4 border-t border-void-border bg-void-soft rounded-b-panel">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
