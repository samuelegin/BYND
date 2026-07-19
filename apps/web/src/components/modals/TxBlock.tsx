'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import type { TxStatus } from '@/types';

export const TxBlock: React.FC<{ status: TxStatus }> = ({ status }) => {
  if (!status.type) return null;
  return (
    <div className={clsx(
      'flex items-center gap-3 rounded-control p-4 border text-sm mt-4',
      status.type === 'loading' && 'border-void-border bg-bg text-white/60',
      status.type === 'success' && 'border-gold/30 bg-gold/5 text-gold',
      status.type === 'error'   && 'border-red-500/30 bg-red-500/5 text-red-400',
    )}>
      {status.type === 'loading' && <div className="w-3.5 h-3.5 border border-white/60 border-t-transparent rounded-full animate-spin shrink-0" />}
      {status.type === 'success' && <CheckCircle2 size={16} className="shrink-0" />}
      {status.type === 'error'   && <AlertTriangle size={16} className="shrink-0" />}
      <span>{status.message}</span>
      {status.hash && (
        <a href={`https://explorer.test.mezo.org/tx/${status.hash}`} target="_blank" rel="noopener noreferrer"
           className="ml-auto flex items-center gap-1 text-gold hover:text-gold-bright shrink-0">
          Tx <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
};
