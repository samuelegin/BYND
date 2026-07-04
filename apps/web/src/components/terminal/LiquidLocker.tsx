import React from 'react';
import { Database, ArrowUpRight, ArrowDownRight, Shield, Loader2 } from 'lucide-react';
import { Panel, Button, StatRow, Badge } from '@/components/ui';
import type { ProtocolStats, UserPosition } from '@/types';

// NFT placeholder image — shown while scanning, replaced by real NFT art once detected
const NFT_PLACEHOLDER_PROMPT =
  'Glowing veMEZO NFT card inside a dark terminal vault. Acid-green energy lines sealing it shut. Abstract circuit texture background. Dark void palette.';

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
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold">
            Liquid Locker
          </p>
          <p className="font-mono text-[8px] text-silver-dim mt-0.5 uppercase tracking-widest">
            Step 01 — Lock & Mint veBYND · Permanent 4-Year Lock
          </p>
        </div>
        <Badge variant={hasNFT ? 'acid' : 'muted'}>
          {hasNFT ? 'Locked' : isScanning ? 'Scanning…' : 'No Deposit'}
        </Badge>
      </div>

      <div className="mb-5 p-3 border border-acid/20 bg-acid/3 flex items-center gap-3">
        <Shield size={12} className="text-acid shrink-0" />
        <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
          <span className="text-acid font-bold">Permanent lock.</span>{' '}
          Your veMEZO NFT is locked for the 4-year maximum to secure
          highest governance weight. You receive liquid{' '}
          <span className="text-silver font-bold">veBYND</span> 1:1 as
          your receipt — exit via Mezo Swap, not withdrawal.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* NFT display — scanning / detected / empty states */}
        <div className="aspect-square border border-void-border bg-void flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 grid-bg opacity-50" />

          {isScanning ? (
            <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
              <div className="relative">
                <div className="w-14 h-14 border border-acid/30 flex items-center justify-center">
                  <Loader2 size={28} strokeWidth={1} className="text-acid animate-spin" />
                </div>
                <div className="absolute inset-0 border border-acid/10 scale-110 animate-ping" />
              </div>
              <div>
                <p className="font-mono text-[9px] text-acid uppercase tracking-widest font-bold">
                  Scanning Chain
                </p>
                <p className="font-mono text-[8px] text-silver-dim mt-1 leading-relaxed">
                  Reading veMEZO NFTs
                  <br />
                  from Matsnet…
                </p>
              </div>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-acid rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          ) : hasNFT ? (
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center gap-3 p-4">
              {/* NFT art — replace src with real token image URL when available */}
              <div className="w-full flex-1 relative border border-acid/30 overflow-hidden bg-void-soft flex items-center justify-center min-h-0">
                <div className="absolute inset-0 bg-acid/5" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-24 bg-acid/20 rounded-full blur-2xl" />
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-16 h-16 border border-acid/50 bg-acid/10 flex items-center justify-center">
                    <Database size={32} strokeWidth={1} className="text-acid" />
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-[8px] font-black text-acid uppercase tracking-wider">
                      veMEZO #{position.veMezoTokenIds[0]}
                    </p>
                    <p className="font-mono text-[7px] text-silver-dim">
                      Permanently Locked
                    </p>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-acid/50" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-acid/50" />
              </div>
              <div className="w-full flex items-center justify-between px-1">
                <p className="font-mono text-[7px] text-silver-dim uppercase tracking-widest">
                  Status
                </p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-acid rounded-full animate-pulse" />
                  <p className="font-mono text-[7px] text-acid font-bold uppercase">
                    Active · 4yr max
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
              <Database size={48} strokeWidth={1} className="text-void-muted" />
              <p className="font-mono text-[9px] text-silver-dim uppercase tracking-widest">
                No veMEZO Detected
              </p>
              <p className="font-mono text-[7px] text-void-muted leading-relaxed">
                Deposit a veMEZO NFT
                <br />
                to get started
              </p>
            </div>
          )}

          {!isScanning && (
            <div className="absolute bottom-2 left-2 right-2 p-1.5 bg-void/95 border border-void-border font-mono text-[6px] text-void-muted opacity-0 group-hover:opacity-100 transition-opacity leading-relaxed">
              📸 {NFT_PLACEHOLDER_PROMPT}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between py-2 space-y-4">
          <div className="space-y-3">
            <div>
              <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">
                veBYND Balance
              </p>
              <p className="text-3xl font-black text-silver">
                {isLoading ? (
                  <span className="inline-flex items-center gap-2 text-silver-dim text-xl">
                    <Loader2 size={16} className="animate-spin" /> Loading
                  </span>
                ) : (
                  parseFloat(position.veByndBalance || '0').toFixed(2)
                )}
                {!isLoading && (
                  <span className="text-sm text-silver-dim ml-2 font-normal">
                    veBYND
                  </span>
                )}
              </p>
            </div>
            <StatRow label="Vault Voting Power" value={stats.totalVotingPower} />
            <StatRow label="Mint Rate" value="1:1 veBYND" accent />
            <StatRow label="Lock Duration" value="4 Years (max)" accent />
          </div>

          <div className="space-y-3">
            <Button variant="primary" fullWidth onClick={onDeposit}>
              <ArrowUpRight size={12} /> Lock & Mint veBYND
            </Button>
            <Button variant="ghost" fullWidth onClick={onWithdraw} disabled>
              <ArrowDownRight size={12} /> Withdraw (Permanent Lock)
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
