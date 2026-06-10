'use client';

import React, { useState } from 'react';
import { Copy, ExternalLink, TrendingUp, Users, Database, Lock, Activity, BarChart3, Zap } from 'lucide-react';
import { Panel, Button, StatRow, Badge, LiveDot, SectionHeader, formatNum, formatTime } from '@/components/ui';
import { useProtocol } from '@/hooks/useProtocol';
import { useWallet } from '@/hooks/useWallet';

export default function AnalyticsPage() {
  const { address, chainId } = useWallet();
  const { stats, epoch, gauges, epochHistory } = useProtocol(address, chainId);
  const [copiedAddr, setCopied] = useState<string | null>(null);

  const copy = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 2000);
  };

  const veByndSupplyNum  = parseFloat(stats.veByndSupply.replace(/,/g, '')) || 0;
  const totalStakedNum   = parseFloat(stats.totalStaked.replace(/,/g, '')) || 0;
  const stakerRatio      = veByndSupplyNum > 0 ? ((totalStakedNum / veByndSupplyNum) * 100).toFixed(1) : '0';

  const PROTOCOL_CARDS = [
    { label: 'Total TVL',        value: stats.tvl,              icon: Database,   sub: 'Total MEZO locked in vault' },
    { label: 'veBYND Supply',    value: stats.veByndSupply,     icon: Lock,       sub: 'Minted 1:1 with deposits' },
    { label: 'Total Staked',     value: stats.totalStaked,      icon: TrendingUp, sub: 'Earning MUSD rewards' },
    { label: 'Staked Ratio',     value: veByndSupplyNum > 0 ? `${stakerRatio}%` : '–', icon: Users, sub: 'veBYND staked vs supply' },
    { label: 'veMEZO Pooled',    value: stats.totalVotingPower, icon: BarChart3,  sub: 'Aggregate voting power' },
    { label: 'Boost Efficiency', value: `Up to ${stats.boostEfficiency}%`, icon: Zap, sub: 'Target optimisation' },
  ];

  const activeGauges = gauges.length > 0 ? gauges : [];
  const networkName  = chainId === 31337 ? 'Hardhat Local' : 'Mezo Matsnet';

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

        {/* ── KPI Strip ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-void-border border border-void-border">
          {PROTOCOL_CARDS.map((c, i) => {
            const Icon = c.icon;
            const isBoost = c.label === 'Boost Efficiency';
            return (
              <div key={i} className={`bg-void-soft p-4 lg:p-5 min-w-0 ${isBoost ? 'border border-acid/20' : ''}`}>
                <div className="flex items-center gap-1.5 mb-3 text-silver-dim">
                  <Icon size={11} className={`shrink-0 ${isBoost ? 'text-acid' : ''}`} />
                  <p className="font-mono text-[7px] uppercase tracking-widest font-bold truncate">{c.label}</p>
                </div>
                <p className={`text-xl lg:text-2xl font-black truncate ${isBoost ? 'text-acid' : 'text-silver'}`}>{c.value}</p>
                <p className="font-mono text-[7px] text-silver-dim mt-1 truncate">{c.sub}</p>
              </div>
            );
          })}
        </div>

        {/* ── Market Stats ──────────────────────────────────────── */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="border border-acid/20 bg-acid/3 clip-corner p-6">
            <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-2">veBYND / veMEZO Ratio</p>
            <p className="text-4xl font-black text-silver">
              {veByndSupplyNum > 0 ? (veByndSupplyNum / veByndSupplyNum).toFixed(4) : '1:1'}
            </p>
            <p className="font-mono text-[8px] text-silver-dim mt-1">Mint rate is always 1:1 on deposit</p>
          </div>
          <div className="border border-void-border p-6 clip-corner">
            <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold mb-2">Staked / Supply</p>
            <p className="text-4xl font-black text-silver">{stakerRatio}%</p>
            <p className="font-mono text-[8px] text-acid mt-1">{totalStakedNum.toLocaleString()} of {veByndSupplyNum.toLocaleString()} veBYND staked</p>
          </div>
          <div className="border border-void-border p-6 clip-corner">
            <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold mb-2">Avg. Staker APR</p>
            <p className="text-4xl font-black text-silver">{stats.avgApr}</p>
            <p className="font-mono text-[8px] text-acid mt-1">MUSD bribes distributed to stakers</p>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">

          {/* ── Left ──────────────────────────────────────────── */}
          <div className="lg:col-span-7 space-y-8">

            {/* Governance Dynamics */}
            <Panel className="p-6">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-acid font-bold mb-1">
                    Governance Dynamics
                  </p>
                  <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest">veBTC Gauge Allocation · Boosted Positions</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <LiveDot />
                    <span className="font-mono text-[9px] text-acid font-bold uppercase">
                      {epoch.currentEpoch > 0 ? 'Active' : 'Awaiting Deployment'}
                    </span>
                  </div>
                  <p className="font-mono text-[8px] text-silver-dim">
                    {epoch.currentEpoch > 0 ? `Epoch #${epoch.currentEpoch}` : '–'}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">Aggregate veMEZO Power</p>
                <p className="text-4xl font-black text-silver">{stats.totalVotingPower}</p>
                <p className="font-mono text-[8px] text-silver-dim mt-1">Grows with each deposit</p>
              </div>

              {activeGauges.length > 0 ? (
                <>
                  <div className="mb-6 h-3 bg-void-border flex overflow-hidden">
                    {activeGauges.map((g, i) => (
                      <div
                        key={i}
                        className="h-full transition-all duration-700"
                        style={{
                          width: `${g.weightBps / 100}%`,
                          backgroundColor: ['#C8FF00', '#7ACC00', '#3D7A00'][i] || '#C8FF00',
                          marginRight: i < activeGauges.length - 1 ? '1px' : 0,
                        }}
                      />
                    ))}
                  </div>
                  <div className="space-y-3">
                    {activeGauges.map((g, i) => (
                      <div key={i} className="border border-void-border p-4 flex items-center gap-4 group hover:border-acid/20 transition-colors">
                        <div
                          className="w-10 h-10 flex items-center justify-center font-mono text-[9px] font-black text-void shrink-0"
                          style={{ backgroundColor: ['#C8FF00', '#7ACC00', '#3D7A00'][i] || '#C8FF00' }}
                        >
                          {(g.weightBps / 100).toFixed(0)}%
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-mono text-[10px] font-black text-silver uppercase">{g.name}</span>
                            <span className="font-mono text-[9px] text-acid font-bold">APR {g.apr}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[8px] text-silver-dim truncate">{g.gauge}</span>
                            <button onClick={() => copy(g.gauge)} className="text-void-muted hover:text-acid transition-colors shrink-0">
                              <Copy size={10} />
                            </button>
                            <a
                              href={`https://explorer.test.mezo.org/address/${g.gauge}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-void-muted hover:text-acid transition-colors shrink-0"
                            >
                              <ExternalLink size={10} />
                            </a>
                          </div>
                          {g.boostedVeBTC && g.boostedVeBTC !== '–' && (
                            <p className="font-mono text-[7px] text-acid mt-1">
                              ↳ {parseInt(g.boostedVeBTC).toLocaleString()} veBTC positions boosted
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest">Pending MUSD</p>
                          <p className="font-mono text-[10px] font-bold text-silver">{g.pendingMUSD}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="border border-void-border p-8 text-center">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim">
                    Gauges populate once contracts are deployed and first epoch votes are cast
                  </p>
                </div>
              )}
            </Panel>

            {/* Epoch History */}
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
                          <td className="py-3 text-acid font-bold">{row.musdHarvested}</td>
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
          </div>

          {/* ── Right ─────────────────────────────────────────── */}
          <div className="lg:col-span-5 space-y-6">

            {/* System Integrity */}
            <div className="bg-void-soft border border-void-border clip-corner relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/40 to-transparent" />
              <div className="p-6">
                <div className="flex items-center gap-2 mb-6 text-silver-dim">
                  <Activity size={13} />
                  <p className="font-mono text-[9px] uppercase tracking-widest font-bold">System Integrity</p>
                </div>

                <div className="mb-4">
                  <p className="font-mono text-[8px] text-silver-dim uppercase tracking-widest mb-1">Pending MUSD in Gauges</p>
                  <p className="text-3xl font-black text-acid">{stats.pendingIncentives}</p>
                </div>

                <div className="mt-4 pt-4 border-t border-void-border space-y-1">
                  <StatRow label="Locks Extended"  value={epoch.epochLocksExtended ? '✓ Yes' : 'No'} accent={epoch.epochLocksExtended} />
                  <StatRow label="Epoch Voted"      value={epoch.epochVoted     ? '✓ Yes' : 'No'} accent={epoch.epochVoted} />
                  <StatRow label="Epoch Harvested"  value={epoch.epochHarvested ? '✓ Yes' : 'No'} accent={epoch.epochHarvested} />
                  <StatRow label="Time to Next"     value={epoch.currentEpoch > 0 ? formatTime(epoch.timeUntilNextVote) : '–'} />
                </div>
              </div>
            </div>

            {/* Protocol Parameters */}
            <Panel className="p-6">
              <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold mb-5">
                Protocol Parameters
              </p>
              <StatRow label="Epoch Duration"       value="7 Days" />
              <StatRow label="Keeper Bounty"        value={`${stats.bountyBps} BPS (${stats.bountyBps / 100}%)`} />
              <StatRow label="Protocol Fee"          value="None (0%)" />
              <StatRow label="Target Boost"         value={`Up to ${stats.boostEfficiency}%`} accent />
              <StatRow label="Gauge Count"          value={gauges.length > 0 ? `${gauges.length} active` : '–'} />
              <StatRow label="veBYND Supply"        value={stats.veByndSupply} />
              <StatRow label="Total Staked"         value={stats.totalStaked} />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
