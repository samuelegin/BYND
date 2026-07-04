import React from 'react';
import { Panel, Button, Badge } from '@/components/ui';

export type BadgeVariant = 'acid' | 'orange' | 'muted';

export type KeeperStepDef = {
  id: string;
  step: string;
  label: string;
  icon: React.ElementType;
  can: boolean;
  done: boolean;
  isLoading: boolean;
  description: string;
  onClick: () => void;
  badge: string;
  badgeVariant: BadgeVariant;
};

export function EpochFlowSteps({ steps }: { steps: KeeperStepDef[] }) {
  return (
    <Panel className="p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold mb-6">
        Epoch Flow — Call Order
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {steps.map((s) => {
          const Icon = s.icon;
          const active = s.can && !s.done;
          return (
            <div
              key={s.id}
              className={`border p-5 space-y-4 transition-colors ${active ? 'border-acid/50 bg-acid/3' : 'border-void-border'}`}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className={`p-2 border ${active ? 'border-acid/50 bg-acid/10' : 'border-void-border'}`}>
                    <Icon
                      size={14}
                      className={`${active ? 'text-acid' : 'text-silver-dim'} transition-colors ${s.id === 'castVotes' && active ? 'animate-spin' : ''}`}
                    />
                  </div>
                  <Badge variant={s.badgeVariant}>{s.badge}</Badge>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase font-black text-silver">{s.label}</p>
                  <p className="font-mono text-[7px] text-silver-dim mt-0.5">Step {s.step}</p>
                </div>
              </div>
              <p className="font-mono text-[8px] text-silver-dim leading-relaxed">{s.description}</p>
              <Button
                variant={active ? 'primary' : 'ghost'}
                size="sm"
                fullWidth
                onClick={s.onClick}
                disabled={(!s.can && !s.done) || s.isLoading}
                isLoading={s.isLoading}
              >
                {s.label}
              </Button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
