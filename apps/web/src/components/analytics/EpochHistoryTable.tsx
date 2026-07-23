import { Panel } from "@/components/ui";

interface EpochHistoryRow {
  epoch: number;
  votingPower: string;
  musdHarvested: string;
  bounty: string;
}

export function EpochHistoryTable({
  epochHistory,
}: {
  epochHistory: EpochHistoryRow[];
}) {
  return (
    <Panel className="p-6">
      <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-6">
        Epoch registry — historical performance
      </p>
      {epochHistory.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-void-border text-white/[.38]">
                <th className="py-3 text-left text-[11px] font-normal uppercase tracking-widest">Epoch</th>
                <th className="py-3 text-left text-[11px] font-normal uppercase tracking-widest">Power used</th>
                <th className="py-3 text-left text-[11px] font-normal uppercase tracking-widest">MUSD harvested</th>
                <th className="py-3 text-left text-[11px] font-normal uppercase tracking-widest">Keeper bounty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-void-border">
              {epochHistory.map((row, i) => (
                <tr key={i} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3 font-mono font-medium text-white/[.87]">#{row.epoch}</td>
                  <td className="py-3 font-mono text-white/60">{row.votingPower}</td>
                  <td className="py-3 font-mono text-gold font-medium">
                    {row.musdHarvested}
                  </td>
                  <td className="py-3 font-mono text-white/60">{row.bounty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-control border border-void-border p-8 text-center">
          <p className="text-sm text-white/60">
            Epoch history appears here after the first harvest cycle
          </p>
        </div>
      )}
    </Panel>
  );
}
