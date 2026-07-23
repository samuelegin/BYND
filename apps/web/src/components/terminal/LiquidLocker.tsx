import React from 'react';
import { Database, ArrowUpRight, ArrowDownRight, Shield, Loader2 } from 'lucide-react';
import { Panel, Button, StatRow, Badge } from '@/components/ui';
import type { ProtocolStats, UserPosition } from '@/types';

// NFT placeholder image — shown while scanning, replaced by real NFT art once detected
const NFT_PLACEHOLDER_PROMPT =
  'Glowing veMEZO NFT card inside a dark terminal vault. Gold energy lines sealing it shut. Abstract circuit texture background. Dark palette.';

interface LiquidLockerProps {
  position: UserPosition;
  stats: ProtocolStats;
  isScanning: boolean;
  isLoading: boolean;
  onDeposit: () => void;
  onWithdraw: () => void;
}

export function LiquidLocker({ position, stats, isScanning, isLoading, onDeposit, onWithdraw }: LiquidLockerProps) {
  const hasNFT = position.veMezoTokenIds.length > 0;

  return (
    <Panel className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38]">
            Liquid locker
          </p>
          <p className="text-sm text-white/60 mt-1">
            Step 01 — lock and mint veBYND · permanent 4-year lock
          </p>
        </div>
        <Badge variant={hasNFT ? 'acid' : 'muted'}>
          {hasNFT ? 'Locked' : isScanning ? 'Scanning…' : 'No deposit'}
        </Badge>
      </div>

      <div className="mb-5 rounded-control p-3 border border-gold/20 bg-gold/5 flex items-center gap-3">
        <Shield size={14} className="text-gold shrink-0" />
        <p className="text-sm text-white/60 leading-relaxed">
          <span className="text-gold font-medium">Permanent lock.</span>{' '}
          Your veMEZO NFT is locked for the 4-year maximum to secure
          highest governance weight. You receive liquid{' '}
          <span className="text-white/[.87] font-medium">veBYND</span> 1:1 as
          your receipt — exit via Mezo Swap, not withdrawal.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* NFT display — scanning / detected / empty states */}
        <div className="aspect-square rounded-card border border-void-border bg-bg flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 grid-bg opacity-50" />

          {isScanning ? (
            <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
              <div className="relative">
                <div className="w-14 h-14 rounded-full border border-gold/30 flex items-center justify-center">
                  <Loader2 size={28} strokeWidth={1} className="text-gold animate-spin" />
                </div>
                <div className="absolute inset-0 rounded-full border border-gold/10 scale-110 animate-ping" />
              </div>
              <div>
                <p className="font-mono text-[11px] text-gold uppercase tracking-widest">
                  Scanning chain
                </p>
                <p className="text-sm text-white/60 mt-1 leading-relaxed">
                  Reading veMEZO NFTs
                  <br />
                  from Matsnet…
                </p>
              </div>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-gold rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          ) : hasNFT ? (
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 p-4">
              {/* NFT art — replace src with real token image URL when available */}
              <div className="w-full flex-1 relative rounded-card border border-gold/30 overflow-hidden bg-void-soft flex items-center justify-center min-h-0">
                <div className="absolute inset-0 bg-gold/5" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-gold/20 rounded-full blur-2xl" />
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full border border-gold/40 bg-gold/10 flex items-center justify-center">
                    <Database size={32} strokeWidth={1} className="text-gold" />
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-xs font-medium text-gold uppercase tracking-wide">
                      veMEZO #{position.veMezoTokenIds[0]}
                    </p>
                    <p className="text-xs text-white/60">
                      Permanently locked
                    </p>
                  </div>
                </div>
              </div>
              <div className="w-full flex items-center justify-between px-1">
                <p className="font-mono text-[11px] text-white/[.38] uppercase tracking-widest">
                  Status
                </p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-gold rounded-full animate-pulse" />
                  <p className="text-xs text-gold font-medium">
                    Active · 4yr max
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
              <Database size={48} strokeWidth={1} className="text-white/[.38]" />
              <p className="font-mono text-[11px] text-white/[.38] uppercase tracking-widest">
                No veMEZO detected
              </p>
              <p className="text-xs text-white/[.38] leading-relaxed">
                Deposit a veMEZO NFT
                <br />
                to get started
              </p>
            </div>
          )}

          {!isScanning && (
            <div className="absolute bottom-2 left-2 right-2 rounded-control p-1.5 bg-bg/95 border border-void-border text-[10px] text-white/[.38] opacity-0 group-hover:opacity-100 transition-opacity leading-relaxed">
              {NFT_PLACEHOLDER_PROMPT}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between py-2 space-y-4">
          <div className="space-y-3">
            <div>
              <p className="font-mono text-[11px] text-white/[.38] uppercase tracking-widest mb-1">
                veBYND balance
              </p>
              <p className="text-3xl font-semibold text-gold">
                {isLoading ? (
                  <span className="inline-flex items-center gap-2 text-white/60 text-xl">
                    <Loader2 size={16} className="animate-spin" /> Loading
                  </span>
                ) : (
                  parseFloat(position.veByndBalance || '0').toFixed(2)
                )}
                {!isLoading && (
                  <span className="text-sm text-white/60 ml-2 font-normal">
                    veBYND
                  </span>
                )}
              </p>
            </div>
            <StatRow label="Vault voting power" value={stats.totalVotingPower} />
            <StatRow label="Mint rate" value="1:1 veBYND" accent />
            <StatRow label="Lock duration" value="4 years (max)" accent />
          </div>

          <div className="space-y-3">
            <Button variant="primary" fullWidth onClick={onDeposit}>
              <ArrowUpRight size={14} /> Lock and mint veBYND
            </Button>
            <Button variant="ghost" fullWidth onClick={onWithdraw} disabled>
              <ArrowDownRight size={14} /> Withdraw (permanent lock)
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
