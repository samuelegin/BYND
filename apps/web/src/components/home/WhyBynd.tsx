import React from 'react';
import { COMPARE, EPOCH_STEPS } from './data';

export function WhyBynd() {
  return (
    <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
      <div className="grid lg:grid-cols-2 gap-16 items-start">
        <div>
          <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">
            Advantage
          </span>
          <h2 className="text-4xl font-black text-silver mt-2 mb-6 leading-tight">
            Solo vs. Aggregated
            <br />
            <span className="text-acid">boost liquidity.</span>
          </h2>
          <p className="text-silver-dim leading-relaxed mb-8">
            Mezo's boost gauges let protocols bid for veMEZO allocation to
            amplify veBTC positions. A single fragmented veMEZO holder can't
            move the needle. BynD pools veMEZO into one permanent aggregated
            boost block — the dominant source that protocols bid to attract,
            passing all captured bribe yield to veBYND stakers.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {COMPARE.map((item, i) => (
              <div
                key={i}
                className={`p-3 border ${item.bad ? 'border-void-border' : 'border-acid/30 bg-acid/3'}`}
              >
                <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">
                  {item.label}
                </p>
                <p
                  className={`font-mono text-sm font-black ${item.bad ? 'text-silver-dim' : 'text-acid'}`}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Epoch flow diagram */}
        <div className="border border-void-border bg-void clip-corner p-8 space-y-6">
          <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold">
            Keeper Epoch Flow
          </p>
          <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
            Each epoch, four permissionless on-chain actions maintain the
            protocol. Any wallet can call them — first caller of
            harvestAndDistribute earns the bounty.
          </p>

          <div className="space-y-3">
            {EPOCH_STEPS.map((s, i) => (
              <div key={i} className="flex items-stretch gap-4">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 border border-acid/40 bg-acid/5 flex items-center justify-center font-mono text-[9px] font-black text-acid shrink-0">
                    {s.num}
                  </div>
                  {i < EPOCH_STEPS.length - 1 && (
                    <div className="w-px flex-1 bg-void-border min-h-[16px]" />
                  )}
                </div>
                <div className="pb-4 flex-1">
                  <p className="font-mono text-[10px] font-black text-silver">
                    {s.fn}
                  </p>
                  <p className="font-mono text-[8px] text-silver-dim mt-0.5">
                    {s.note}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-void-border pt-4">
            <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
              <span className="text-acid font-bold">claimRebases()</span> has
              no epoch gate — call any time. The other three are gated: each
              executes exactly once per epoch, enforced on-chain.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
