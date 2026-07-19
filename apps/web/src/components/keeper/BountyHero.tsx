interface BountyHeroProps {
  estimatedBounty: string;
  rewardTokenSymbol: string;
  bountyBps: number;
  pendingIncentives: string;
}

export function BountyHero({
  estimatedBounty,
  rewardTokenSymbol,
  bountyBps,
  pendingIncentives,
}: BountyHeroProps) {
  return (
    <div className="rounded-panel border border-gold/20 bg-gold/5 p-8 text-center relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="relative">
        <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-2">
          Available keeper bounty this epoch
        </p>
        <p className="text-[56px] font-semibold text-gold leading-none">
          ~${estimatedBounty}
        </p>
        <p className="text-sm text-white/60 mt-2">
          {rewardTokenSymbol} · {bountyBps / 100}% of{" "}
          {pendingIncentives === "–"
            ? "–"
            : parseFloat(pendingIncentives).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
          {rewardTokenSymbol} pending
        </p>
      </div>
    </div>
  );
}
