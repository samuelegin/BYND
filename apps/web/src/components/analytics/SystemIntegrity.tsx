import { Activity } from "lucide-react";
import { StatRow, formatTime } from "@/components/ui";
import type { EpochState, ProtocolStats } from "@/types";

interface SystemIntegrityProps {
  epoch: EpochState;
  stats: ProtocolStats;
}

export function SystemIntegrity({ epoch, stats }: SystemIntegrityProps) {
  return (
    <div className="bg-void-soft border border-void-border clip-corner relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/40 to-transparent" />
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6 text-silver-dim">
          <Activity size={13} />
          <p className="font-mono text-[9px] uppercase tracking-widest font-bold">
            System Integrity
          </p>
        </div>

        <div className="mb-4">
          <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">
            Pending MUSD in Gauges
          </p>
          <p className="text-3xl font-black text-acid">
            {stats.pendingIncentives}
          </p>
        </div>

        <div className="mt-4 pt-4 border-t border-void-border space-y-1">
          <StatRow
            label="Locks Extended"
            value={epoch.epochLocksExtended ? "✓ Yes" : "No"}
            accent={epoch.epochLocksExtended}
          />
          <StatRow
            label="Epoch Voted"
            value={epoch.epochVoted ? "✓ Yes" : "No"}
            accent={epoch.epochVoted}
          />
          <StatRow
            label="Epoch Harvested"
            value={epoch.epochHarvested ? "✓ Yes" : "No"}
            accent={epoch.epochHarvested}
          />
          <StatRow
            label="Time to Next"
            value={
              epoch.currentEpoch > 0 ? formatTime(epoch.timeUntilNextVote) : "–"
            }
          />
        </div>
      </div>
    </div>
  );
}
