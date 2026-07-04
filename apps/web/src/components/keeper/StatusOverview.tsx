import { formatTime } from "@/components/ui";

interface StatusOverviewProps {
  mezoEpoch: number;
  liveCountdown: number;
  pendingIncentives: string;
  rewardTokenSymbol: string;
  bountyBps: number;
}

export function StatusOverview({
  mezoEpoch,
  liveCountdown,
  pendingIncentives,
  rewardTokenSymbol,
  bountyBps,
}: StatusOverviewProps) {
  const items = [
    { label: "Current Epoch", value: `#${mezoEpoch}` },
    { label: "Time Remaining", value: formatTime(liveCountdown) },
    {
      label: "Pending Rewards",
      value:
        pendingIncentives === "–"
          ? "–"
          : parseFloat(pendingIncentives).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            }) +
            " " +
            rewardTokenSymbol,
    },
    { label: "Keeper Bounty", value: `${bountyBps / 100}% of harvest` },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-void-border border border-void-border">
      {items.map((s, i) => (
        <div key={i} className="bg-void-soft p-6">
          <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim font-bold mb-2">
            {s.label}
          </p>
          <p className="font-mono text-xl font-black text-silver">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
