import { AlertTriangle } from "lucide-react";
import { Panel } from "@/components/ui";

export function KeeperNotes() {
  return (
    <Panel className="p-6 border-acid/10">
      <div className="flex gap-3">
        <AlertTriangle size={16} className="text-acid shrink-0 mt-0.5" />
        <div className="space-y-2 font-mono text-[9px] text-silver-dim leading-relaxed">
          <p className="uppercase tracking-widest font-bold text-silver">
            Keeper Design
          </p>
          <p>
            •{" "}
            <span className="text-silver">
              claimRebases() is permissionless and has no epoch gate.
            </span>{" "}
            Call it any time. Rebase compounds locked MEZO in-place — no tokens
            leave the vault.
          </p>
          <p>
            • <span className="text-silver">Epoch-gated steps 01–03.</span> Each
            executes once per epoch. Repeat calls revert.
          </p>
          <p>
            • <span className="text-silver">Multi-token harvest.</span>{" "}
            harvestAndDistribute() sweeps any ERC-20 bribe token. Keepers earn
            1% in each token harvested.
          </p>
          <p>
            • <span className="text-silver">Permissionless.</span> Any wallet
            can call any step. First caller of harvestAndDistribute() earns the
            bounty.
          </p>
        </div>
      </div>
    </Panel>
  );
}
