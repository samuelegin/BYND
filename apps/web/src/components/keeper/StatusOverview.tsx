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
    { label: "Current epoch", value: `#${mezoEpoch}` },
    { label: "Time remaining", value: formatTime(liveCountdown) },
    {
      label: "Pending rewards",
      value:
        pendingIncentives === "–"
          ? "–"
          : parseFloat(pendingIncentives).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            }) +
            " " +
            rewardTokenSymbol,
    },
    { label: "Keeper bounty", value: `${bountyBps / 100}% of harvest` },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-void-border rounded-card border border-void-border bg-void-soft overflow-hidden">
      {items.map((s, i) => (
        <div key={i} className="p-6">
          <p className="text-[13px] text-white/[.38] mb-1.5">{s.label}</p>
          <p className="font-mono text-xl font-medium text-gold">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
