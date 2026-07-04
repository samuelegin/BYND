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
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold">
            Staking Terminal
          </p>
          <p className="font-mono text-[8px] text-silver-dim mt-0.5 uppercase tracking-widest">
            Step 02 — Stake veBYND · Activate MUSD Yield
          </p>
        </div>
        <Badge variant={parseFloat(position.stakedBalance) > 0 ? 'acid' : 'muted'}>
          APR ~{stats.avgApr}
        </Badge>
      </div>

      <div className="grid sm:grid-cols-3 gap-6">
        <div className="sm:col-span-1 space-y-4">
          <div>
            <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">
              Wallet (unstaked)
            </p>
            <p className="text-2xl font-black text-silver">
              {parseFloat(position.veByndBalance || '0').toFixed(0)}
              <span className="text-xs text-silver-dim ml-1">veBYND</span>
            </p>
          </div>
          <div>
            <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">
              Staked
            </p>
            <p className="text-2xl font-black text-acid">
              {parseFloat(position.stakedBalance || '0').toFixed(0)}
              <span className="text-xs text-silver-dim ml-1">veBYND</span>
            </p>
          </div>
        </div>
        <div className="sm:col-span-2 flex flex-col justify-end gap-3">
          <Button variant="primary" fullWidth onClick={onStake}>
            <TrendingUp size={12} /> Stake veBYND
          </Button>
          <Button variant="ghost" fullWidth onClick={onUnstake}>
            Unstake
          </Button>
        </div>
      </div>
    </Panel>
  );
}
