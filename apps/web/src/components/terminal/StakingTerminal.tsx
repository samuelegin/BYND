import React from 'react';
import { TrendingUp } from 'lucide-react';
import { Panel, Button, Badge } from '@/components/ui';
import type { ProtocolStats, UserPosition } from '@/types';

interface StakingTerminalProps {
  position: UserPosition;
  stats: ProtocolStats;
  onStake: () => void;
  onUnstake: () => void;
}

export function StakingTerminal({ position, stats, onStake, onUnstake }: StakingTerminalProps) {
  return (
    <Panel className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38]">
            Staking terminal
          </p>
          <p className="text-sm text-white/60 mt-1">
            Step 02 — stake veBYND · activate MUSD yield
          </p>
        </div>
        <Badge variant={parseFloat(position.stakedBalance) > 0 ? 'acid' : 'muted'}>
          APR ~{stats.avgApr}
        </Badge>
      </div>

      <div className="grid sm:grid-cols-3 gap-6">
        <div className="sm:col-span-1 space-y-4">
          <div>
            <p className="font-mono text-[11px] text-white/[.38] uppercase tracking-widest mb-1">
              Wallet (unstaked)
            </p>
            <p className="text-2xl font-semibold text-white/[.87]">
              {parseFloat(position.veByndBalance || '0').toFixed(0)}
              <span className="text-xs text-white/60 ml-1">veBYND</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-[11px] text-white/[.38] uppercase tracking-widest mb-1">
              Staked
            </p>
            <p className="text-2xl font-semibold text-gold">
              {parseFloat(position.stakedBalance || '0').toFixed(0)}
              <span className="text-xs text-white/60 ml-1">veBYND</span>
            </p>
          </div>
        </div>
        <div className="sm:col-span-2 flex flex-col justify-end gap-3">
          <Button variant="primary" fullWidth onClick={onStake}>
            <TrendingUp size={14} /> Stake veBYND
          </Button>
          <Button variant="ghost" fullWidth onClick={onUnstake}>
            Unstake
          </Button>
        </div>
      </div>
    </Panel>
  );
}
