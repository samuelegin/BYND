import { Panel, Button, Badge } from "@/components/ui";

export type BadgeVariant = "acid" | "orange" | "muted";

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
      <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-6">
        Epoch flow — call order
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {steps.map((s) => {
          const Icon = s.icon;
          const active = s.can && !s.done;
          return (
            <div
              key={s.id}
              className={`rounded-control border p-5 space-y-4 transition-colors ${active ? "border-gold/30 bg-gold/5" : "border-void-border"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/10 font-mono text-xs font-medium text-gold">
                  {s.step}
                </div>
                <Badge variant={s.badgeVariant}>{s.badge}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Icon
                  size={13}
                  className={`${active ? "text-gold" : "text-white/60"} transition-colors shrink-0 ${s.id === "castVotes" && active ? "animate-spin" : ""}`}
                />
                <p className="font-mono text-[13px] font-medium text-white/[.87]">
                  {s.label}
                </p>
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                {s.description}
              </p>
              <Button
                variant={active ? "primary" : "ghost"}
                size="sm"
                fullWidth
                onClick={s.onClick}
                disabled={(!s.can && !s.done) || s.isLoading}
                isLoading={s.isLoading}
              >
                <span className="font-mono">{s.label}</span>
              </Button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
