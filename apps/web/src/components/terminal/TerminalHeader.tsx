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
    <div className="max-w-[1120px] mx-auto px-5 pt-6">
      <div className="rounded-card border border-void-border bg-void-soft overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LiveDot />
            <span className="font-mono text-[11px] uppercase tracking-widest text-white/[.38]">
              Terminal · Mezo Matsnet
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>

        {networkError && (
          <div className="border-t border-void-border bg-red-500/5 px-6 py-3 flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
            <p className="text-sm text-red-400">{networkError}</p>
          </div>
        )}
        {!networkError && !contractsDeployed && (
          <div className="border-t border-void-border bg-gold/5 px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-gold rounded-full animate-pulse shrink-0" />
              <p className="text-sm text-gold">
                Connected to Mezo Matsnet — Bynd contracts pending deployment.
              </p>
            </div>
            <p className="font-mono text-[11px] text-white/[.38] shrink-0">
              Run: npm run deploy:matsnet
            </p>
          </div>
        )}
        {!networkError && contractsDeployed && (
          <div className="border-t border-void-border bg-gold/5 px-6 py-3 flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-gold rounded-full shrink-0" />
            <p className="text-sm text-gold">
              Live — reading from Mezo Matsnet (chain ID 31611)
            </p>
          </div>
        )}

        {isScanning && (
          <div className="border-t border-void-border px-6 py-3 flex items-center gap-3">
            <Loader2 size={14} className="text-gold animate-spin shrink-0" />
            <p className="text-sm text-white/60">
              Scanning chain for your veMEZO NFTs — this takes a few seconds…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
