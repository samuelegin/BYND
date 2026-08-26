import React, { useState } from 'react';
import { Code2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Panel, Button, Badge } from '@/components/ui';
import type { KeeperStepDef } from '@/components/keeper';

interface KeeperPanelProps {
  // Full step list from useKeeperSteps() — this component filters to the
  // "core" tier itself, so the caller doesn't need to pre-filter. Extended
  // (recovery/maintenance) steps like syncBribesFromVault and retryMerge
  // stay /keeper-only; Terminal is meant to be a quick-glance panel, not
  // the full admin dashboard.
  steps: (KeeperStepDef & { tier: 'core' | 'extended' })[];
}

// Keeper actions shown as human-readable status rows. The underlying
// contract function name is only ever shown when the person explicitly
// opts into developer mode — nobody needs to see optimiseAndVote() to
// understand "Vote is available".
//
// Gating logic used to live here directly and drifted out of sync with the
// separate /keeper page's copy of the same math (that page kept the old,
// pre-fix canClaimBribes for weeks after this panel got patched). All of
// that now lives once, in hooks/useKeeperSteps.ts — this component is pure
// presentation.
export function KeeperPanel({ steps }: KeeperPanelProps) {
  const [devMode, setDevMode] = useState(false);
  const coreSteps = steps.filter((s) => s.tier === 'core');

  return (
    <Panel className="p-6 h-full">
      <div className="flex items-center justify-between mb-1">
        <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38]">
          Keeper
        </p>
        <button
          onClick={() => setDevMode(v => !v)}
          className={clsx(
            'flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors',
            devMode ? 'text-gold' : 'text-white/[.38] hover:text-white/60',
          )}
        >
          <Code2 size={11} /> Dev mode
        </button>
      </div>
      <p className="text-sm text-white/60 mb-5">
        Permissionless. Earn bounties each epoch.
      </p>

      <div className="space-y-2">
        {coreSteps.map(step => {
          const Icon = step.icon;
          const ready = step.badge === 'Ready';
          return (
            <div
              key={step.id}
              className={clsx(
                'rounded-control border p-3 space-y-2 transition-colors',
                ready ? 'border-gold/30 bg-gold/5' : 'border-void-border',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={13} className={clsx(ready ? 'text-gold' : 'text-white/60', 'shrink-0', step.id === 'castVotes' && ready && 'animate-spin')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white/[.87] truncate">
                      {devMode ? step.label : titleFor(step.id)}
                    </p>
                    <p className="text-xs text-white/60 truncate">{step.description}</p>
                  </div>
                </div>
                <Badge variant={step.badgeVariant}>
                  {step.badge}
                </Badge>
              </div>
              <Button
                variant={ready ? 'outline' : 'ghost'}
                size="sm"
                fullWidth
                onClick={step.onClick}
                disabled={(!step.can && !step.done) || step.isLoading}
                isLoading={step.isLoading}
              >
                {devMode ? <span className="font-mono">{step.label}</span> : titleFor(step.id)}
              </Button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// Human-readable title per step id — kept separate from the shared
// description text so this panel's tone (short, glance-friendly) doesn't
// have to match /keeper's fuller dashboard copy.
function titleFor(id: string): string {
  switch (id) {
    case 'claimRebases': return 'Claim rebases';
    case 'extendLocks': return 'Extend locks';
    case 'castVotes': return 'Vote';
    case 'claimBribes': return 'Claim bribes';
    case 'harvest': return 'Harvest rewards';
    default: return id;
  }
}
