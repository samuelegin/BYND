import { Clock, Repeat, Coins, Users } from "lucide-react";
import { Panel } from "@/components/ui";

const NOTES = [
  {
    icon: Clock,
    title: "No epoch gate",
    body: "claimRebases() is permissionless and callable any time. Rebase compounds locked MEZO in-place — no tokens leave the vault.",
  },
  {
    icon: Repeat,
    title: "Epoch-gated steps",
    body: "Steps 01–03 each execute once per epoch. Repeat calls revert.",
  },
  {
    icon: Coins,
    title: "Multi-token harvest",
    body: "harvestAndDistribute() sweeps any ERC-20 bribe token. Keepers earn 1% in each token harvested.",
  },
  {
    icon: Users,
    title: "Permissionless",
    body: "Any wallet can call any step. First caller of harvestAndDistribute() earns the bounty.",
  },
];

export function KeeperNotes() {
  return (
    <Panel className="p-6">
      <p className="font-mono text-[11px] uppercase tracking-[.14em] text-white/[.38] mb-5">
        Keeper design
      </p>
      <div className="grid sm:grid-cols-2 gap-5">
        {NOTES.map((n) => {
          const Icon = n.icon;
          return (
            <div key={n.title} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
                <Icon size={14} strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm font-medium text-white/[.87]">{n.title}</p>
                <p className="mt-1 text-xs text-white/60 leading-relaxed">{n.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
