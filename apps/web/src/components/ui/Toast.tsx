'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

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
