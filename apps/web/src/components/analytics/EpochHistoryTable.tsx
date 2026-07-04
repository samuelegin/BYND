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
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold mb-6">
        Epoch Registry — Historical Performance
      </p>
      {epochHistory.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[10px]">
            <thead>
              <tr className="border-b border-void-border text-silver-dim uppercase tracking-widest">
                <th className="py-3 text-left font-black">Epoch</th>
                <th className="py-3 text-left font-black">Power Used</th>
                <th className="py-3 text-left font-black">MUSD Harvested</th>
                <th className="py-3 text-left font-black">Keeper Bounty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-void-border/50">
              {epochHistory.map((row, i) => (
                <tr key={i} className="hover:bg-void-soft/50 transition-colors">
                  <td className="py-3 font-black text-silver">#{row.epoch}</td>
                  <td className="py-3 text-silver-dim">{row.votingPower}</td>
                  <td className="py-3 text-acid font-bold">
                    {row.musdHarvested}
                  </td>
                  <td className="py-3 text-silver-dim">{row.bounty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-void-border p-8 text-center">
          <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">
            Epoch history appears here after the first harvest cycle
          </p>
        </div>
      )}
    </Panel>
  );
}
