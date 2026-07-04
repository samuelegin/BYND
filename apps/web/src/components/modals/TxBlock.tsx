'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import type { TxStatus } from '@/types';

export const TxBlock: React.FC<{ status: TxStatus }> = ({ status }) => {
  if (!status.type) return null;
  return (
    <div className={clsx(
      'flex items-center gap-3 p-4 border font-mono text-[10px] mt-4',
      status.type === 'loading' && 'border-void-border bg-void text-silver-dim',
      status.type === 'success' && 'border-acid/30 bg-acid/5 text-acid',
      status.type === 'error'   && 'border-red-500/30 bg-red-500/5 text-red-400',
    )}>
      {status.type === 'loading' && <div className="w-3 h-3 border border-silver-dim border-t-transparent rounded-full animate-spin" />}
      {status.type === 'success' && <CheckCircle2 size={14} />}
      {status.type === 'error'   && <AlertTriangle size={14} />}
      <span className="uppercase tracking-wider">{status.message}</span>
      {status.hash && (
        <a href={`https://explorer.test.mezo.org/tx/${status.hash}`} target="_blank" rel="noopener noreferrer"
           className="ml-auto flex items-center gap-1 text-acid hover:underline">
          Tx <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
};
