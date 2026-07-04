import React from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button, LiveDot } from '@/components/ui';

interface TerminalHeaderProps {
  isLoading: boolean;
  isScanning: boolean;
  networkError: string | null;
  contractsDeployed: boolean;
  refresh: () => void;
}

export function TerminalHeader({ isLoading, isScanning, networkError, contractsDeployed, refresh }: TerminalHeaderProps) {
  return (
    <>
      <div className="border-b border-void-border bg-void-soft">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LiveDot />
            <span className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">
              Terminal // Mezo Matsnet
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      {networkError && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-3 flex items-center gap-3">
          <div className="w-2 h-2 bg-red-500 rounded-full shrink-0" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-red-400 font-bold">
            {networkError}
          </p>
        </div>
      )}
      {!networkError && !contractsDeployed && (
        <div className="bg-acid/5 border-b border-acid/20 px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-acid rounded-full animate-pulse shrink-0" />
            <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold">
              Connected to Mezo Matsnet — BynD contracts pending deployment.
            </p>
          </div>
          <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest shrink-0">
            Run: npm run deploy:matsnet
          </p>
        </div>
      )}
      {!networkError && contractsDeployed && (
        <div className="bg-acid/5 border-b border-acid/20 px-6 py-3 flex items-center gap-3">
          <div className="w-2 h-2 bg-acid rounded-full shrink-0" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold">
            Live — reading from Mezo Matsnet (chainId 31611)
          </p>
        </div>
      )}

      {isScanning && (
        <div className="bg-void-soft border-b border-acid/10 px-6 py-3 flex items-center gap-3">
          <Loader2 size={12} className="text-acid animate-spin shrink-0" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">
            Scanning chain for your veMEZO NFTs — this takes a few seconds…
          </p>
        </div>
      )}
    </>
  );
}
