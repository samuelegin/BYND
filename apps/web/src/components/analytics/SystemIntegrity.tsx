import { Activity } from "lucide-react";
import { Panel, StatRow, formatTime } from "@/components/ui";
import type { EpochState, ProtocolStats } from "@/types";

interface SystemIntegrityProps {
  epoch: EpochState;
  stats: ProtocolStats;
}

export function SystemIntegrity({ epoch, stats }: SystemIntegrityProps) {
  return (
    <Panel className="p-6">
      <div className="flex items-center gap-2 mb-6 text-white/[.38]">
        <Activity size={14} />
        <p className="font-mono text-[11px] uppercase tracking-[.14em]">
          System integrity
        </p>
      </div>

      <div className="mb-4">
        <p className="text-[13px] text-white/[.38] mb-1">
          Pending MUSD in gauges
        </p>
        <p className="font-mono text-3xl font-medium text-gold">
          {stats.pendingIncentives}
        </p>
      </div>

      <div className="mt-4 pt-4 border-t border-void-border">
        <StatRow
          label="Locks extended"
          value={epoch.epochLocksExtended ? "✓ Yes" : "No"}
          accent={epoch.epochLocksExtended}
        />
        <StatRow
          label="Epoch voted"
          value={epoch.epochVoted ? "✓ Yes" : "No"}
          accent={epoch.epochVoted}
        />
        <StatRow
          label="Epoch harvested"
          value={epoch.epochHarvested ? "✓ Yes" : "No"}
          accent={epoch.epochHarvested}
        />
        <StatRow
          label="Time to next"
          value={
            epoch.currentEpoch > 0 ? formatTime(epoch.timeUntilNextVote) : "–"
          }
        />
      </div>
    </Panel>
  );
}
