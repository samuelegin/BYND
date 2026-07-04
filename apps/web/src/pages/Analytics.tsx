import React from "react";
import { SectionHeader } from "@/components/ui";
import {
  KpiStrip,
  MarketStats,
  GovernanceDynamics,
  EpochHistoryTable,
  SystemIntegrity,
  ProtocolParameters,
} from "@/components/analytics";
import { useProtocol } from "@/hooks/useProtocol";
import { useWallet } from "@/hooks/useWallet";

export default function AnalyticsPage() {
  const { address, chainId } = useWallet();
  const { stats, epoch, gauges, epochHistory } = useProtocol(address, chainId);

  const veByndSupplyNum = parseFloat(stats.veByndSupply.replace(/,/g, "")) || 0;
  const totalStakedNum = parseFloat(stats.totalStaked.replace(/,/g, "")) || 0;
  const stakerRatio =
    veByndSupplyNum > 0
      ? ((totalStakedNum / veByndSupplyNum) * 100).toFixed(1)
      : "0";

  const networkName = "Mezo Matsnet";

  return (
    <div className="min-h-screen bg-void">
      <div className="border-b border-void-border bg-void-soft">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <SectionHeader
            label="Protocol"
            title="Analytics"
            subtitle={`Live protocol metrics, gauge allocations, and epoch history. Reading from ${networkName}.`}
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
        <KpiStrip
          stats={stats}
          stakerRatio={stakerRatio}
          veByndSupplyNum={veByndSupplyNum}
        />
        <MarketStats
          stats={stats}
          veByndSupplyNum={veByndSupplyNum}
          totalStakedNum={totalStakedNum}
          stakerRatio={stakerRatio}
        />

        <div className="grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-8">
            <GovernanceDynamics epoch={epoch} stats={stats} gauges={gauges} />
            <EpochHistoryTable epochHistory={epochHistory} />
          </div>

          <div className="lg:col-span-5 space-y-6">
            <SystemIntegrity epoch={epoch} stats={stats} />
            <ProtocolParameters stats={stats} gauges={gauges} />
          </div>
        </div>
      </div>
    </div>
  );
}
