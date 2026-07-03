import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Zap, Shield, TrendingUp, Lock, Droplets } from 'lucide-react';
import { Button, Badge, LiveDot } from '@/components/ui';
import { useWallet } from '@/hooks/useWallet';

const TICKER_ITEMS = [
  'Mezo Matsnet Testnet', 'Liquid Boost Layer', 'veBYND: Liquid veMEZO',
  'MUSD Native Rewards', 'Keeper Bounties: 1%', 'Multi-Token Bribe Harvest',
  'veBYND/MEZO Pool: Live', 'Target Boost Efficiency: 98%', 'Epoch-based Routing',
  'Permanent 4-Year Lock', 'Rebase Auto-Compounding', 'Permissionless Keepers',
];

const STEPS = [
  {
    num: '01',
    title: 'Lock & Mint veBYND',
    body: 'Deposit your veMEZO NFT into the BynD Vault. The protocol permanently locks it for the 4-year maximum to secure maximum boost weight. You instantly receive veBYND 1:1 — a fully liquid ERC-20.',
    icon: Shield,
    tag: 'Vault',
    img: '/images/step-lock.png',
  },
  {
    num: '02',
    title: 'Stake veBYND',
    body: 'Stake your veBYND into the Reward Engine. All bribe tokens harvested from gauges flow here — any ERC-20, not just MUSD. Your share is pro-rata to staked balance.',
    icon: Zap,
    tag: 'Staking',
    img: '/images/step-deposit.png',
  },
  {
    num: '03',
    title: 'Earn & Exit',
    body: "Claim your yield every epoch. When you want to exit, unstake veBYND and sell it on the veBYND/MEZO pool on Mezo Swap. No withdrawal needed — the underlying stays locked, your liquidity doesn't.",
    icon: TrendingUp,
    tag: 'Yield',
    img: '/images/step-deposit.png',
  },
];

const REVENUE_STREAMS = [
  {
    icon: Lock,
    title: 'Gauge Bribes',
    tag: 'Multi-token',
    body: 'Protocols post ERC-20 incentives on gauges to attract veMEZO boost. BynD pools all deposited veMEZO into one optimised boost block and targets the highest bribe gauges — sweeping every token, not just MUSD.',
  },
  {
    icon: Zap,
    title: 'veMEZO Rebase',
    tag: 'Auto-compounds',
    body: "Each epoch, Mezo's RewardsDistributor pays a rebase to all veMEZO holders. BynD calls claimRebases() to compound it back into each NFT's locked balance — growing boost power without any liquid payout.",
  },
  {
    icon: TrendingUp,
    title: 'Keeper Bounties',
    tag: '1% per harvest',
    body: 'Anyone can trigger the four epoch keeper steps — claimRebases, extendLocks, castVotes, harvestAndDistribute — and earn 1% of every token harvested as a bounty. Permissionless.',
  },
];

const COMPARE = [
  { label: 'Solo boost power',        value: '< 0.01%',             bad: true  },
  { label: 'BynD aggregated block',   value: 'Pooled (growing)',     bad: false },
  { label: 'Solo bribe capture',      value: 'Minimal / ignored',   bad: true  },
  { label: 'BynD bribe capture',      value: 'Any token, optimised', bad: false },
  { label: 'Solo rebase claiming',    value: 'Manual, often missed', bad: true  },
  { label: 'BynD rebase',            value: 'Auto-compounds in NFT', bad: false },
  { label: 'Solo exit from lock',     value: 'Wait 4 years',        bad: true  },
  { label: 'veBYND exit liquidity',   value: 'Instant via swap',    bad: false },
];

const EPOCH_STEPS = [
  { num: '00', fn: 'claimRebases()',          who: 'Keeper',  note: 'Compounds veMEZO rebase — no epoch gate' },
  { num: '01', fn: 'extendLocks()',           who: 'Keeper',  note: 'Resets all positions to 4yr max' },
  { num: '02', fn: 'castVotes()',             who: 'Keeper',  note: 'Routes boost power to best gauges' },
  { num: '03', fn: 'harvestAndDistribute()',  who: 'Keeper',  note: 'Sweeps bribes to stakers, 1% to caller' },
];

export default function HomePage() {
  const { isConnected, isConnecting, connect } = useWallet();
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen">

      {/* Ticker */}
      <div className="border-b border-void-border bg-void-soft overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap py-2.5">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-4 mx-8 font-mono text-[9px] uppercase tracking-widest text-void-muted">
              <span className="w-1 h-1 bg-acid rounded-full" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden grid-bg">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-acid/4 rounded-full blur-[160px] pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 py-24 w-full">
          <div className="grid lg:grid-cols-2 gap-20 items-center">

            {/* Left — copy */}
            <div
              className="space-y-8"
              style={{
                opacity:   heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(24px)',
                transition: 'opacity 0.7s ease, transform 0.7s ease',
              }}
            >
              <div className="flex items-center gap-3">
                <LiveDot />
                <Badge variant="acid">Mezo Matsnet · Testnet Live</Badge>
              </div>

              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-silver-dim font-bold mb-4">
                  Liquid Boost Layer for Mezo
                </p>
                <h1 className="text-[80px] sm:text-[100px] lg:text-[128px] font-black leading-none tracking-tighter text-silver">
                  BY<span className="text-acid">ND</span><span className="text-acid">.</span>
                </h1>
              </div>

              <p className="text-lg text-silver-dim leading-relaxed max-w-lg">
                A non-custodial boost coordination layer that aggregates veMEZO boost liquidity,
                automates gauge allocation toward the highest-yielding veBTC gauges, and issues{' '}
                <span className="text-silver font-bold">veBYND</span>{' '}
                — a liquid ERC-20 token representing a transferable claim on the pooled position.
              </p>

              {/* Mezo boost callout */}
              <div className="border border-acid/20 bg-acid/3 p-4 clip-corner space-y-1.5">
                <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold flex items-center gap-2">
                  <Lock size={10} /> Mezo Boost Gauges — Powered by BynD
                </p>
                <p className="font-mono text-[9px] text-silver-dim leading-relaxed">
                  veMEZO holders vote on boost gauges that amplify veBTC positions up to 5x. BynD pools fragmented veMEZO into one permanent optimised block — the most credible boost source, locked 4 years, rebases auto-compounding every epoch.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                {isConnected ? (
                  <Link to="/terminal">
                    <Button variant="primary" size="lg">
                      Open Terminal <ArrowRight size={14} />
                    </Button>
                  </Link>
                ) : (
                  <Button variant="primary" size="lg" onClick={() => connect()} isLoading={isConnecting}>
                    Initialize System <ArrowRight size={14} />
                  </Button>
                )}
                <Link to="/analytics">
                  <Button variant="outline" size="lg">Protocol Analytics</Button>
                </Link>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <div className="w-8 h-8 border border-void-border flex items-center justify-center shrink-0">
                  <Lock size={14} className="text-silver-dim" />
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold">
                    Mezo Passport Native
                  </p>
                  <p className="font-mono text-[8px] text-void-muted">
                    Connect via Xverse, Unisat, or MetaMask
                  </p>
                </div>
              </div>
            </div>

            {/* Right — hero illustration */}
            <div
              className="hidden lg:block relative"
              style={{
                opacity:   heroVisible ? 1 : 0,
                transform: heroVisible ? 'translateY(0)' : 'translateY(32px)',
                transition: 'opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s',
              }}
            >
              <img
                src="/hero-orb.png"
                alt="BynD protocol — veBYND liquid governance"
                style={{ width: '600px', height: '600px', objectFit: 'cover' }}
              />

              <div className="absolute -left-8 top-1/4 bg-void-soft border border-void-border p-4 font-mono text-xs">
                <p className="text-[8px] text-silver-dim uppercase mb-1">Pooled Power</p>
                <p className="text-xl font-black text-acid">Live</p>
                <p className="text-[8px] text-silver-dim">Read from chain</p>
              </div>

              <div className="absolute -right-8 bottom-1/3 bg-void-soft border border-void-border p-4 font-mono text-xs space-y-2 min-w-[180px]">
                <p className="text-[8px] text-silver-dim uppercase tracking-widest mb-2">Epoch Execution</p>
                {EPOCH_STEPS.map((s, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-[8px] text-void-muted w-4 shrink-0">{s.num}</span>
                    <div>
                      <p className="text-[9px] text-acid font-black">{s.fn}</p>
                      <p className="text-[7px] text-silver-dim">{s.note}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="absolute -right-8 bottom-4 bg-void-soft border border-acid/20 p-4 font-mono text-xs">
                <p className="text-[8px] text-silver-dim uppercase mb-1">Boost Efficiency</p>
                <p className="text-xl font-black text-acid">98%</p>
                <p className="text-[8px] text-silver-dim">Target efficiency</p>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown size={20} className="text-void-muted" />
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-void-border bg-void-soft">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-void-border">
            {[
              { label: 'Network',           value: 'Mezo',  delta: 'Bitcoin L2' },
              { label: 'veBYND Staker APR', value: 'Live',  delta: 'Read from chain' },
              { label: 'Boost Efficiency',  value: '98%',   delta: 'Target optimisation' },
              { label: 'Bribe Tokens',      value: 'Any',   delta: 'Multi-ERC-20 harvest' },
            ].map((s, i) => (
              <div key={i} className="px-8 py-8">
                <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold mb-2">{s.label}</p>
                <p className="text-3xl font-black text-silver">{s.value}</p>
                <p className="font-mono text-[8px] text-acid mt-1">{s.delta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-32">
        <div className="mb-16">
          <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">Protocol</span>
          <h2 className="text-5xl font-black text-silver mt-2 leading-none">How it works.</h2>
          <p className="text-silver-dim mt-4 max-w-xl">
            Three steps. One liquid position. Maximum boost yield without the lockup tradeoff.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="group relative border border-void-border hover:border-acid/30 transition-all duration-300 clip-corner overflow-hidden">
                {/* Visual block */}
                <div className="relative h-52 bg-void-soft border-b border-void-border flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 grid-bg opacity-40" />
                  <img
                    src={step.img}
                    alt={step.title}
                    className="relative z-10 h-full w-full object-cover"
                  />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-void-muted group-hover:border-acid/50 transition-colors" />
                </div>

                <div className="p-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[9px] text-acid font-black">{step.num}</span>
                    <div className="h-px flex-1 bg-void-border" />
                  </div>
                  <h3 className="text-xl font-black text-silver">{step.title}</h3>
                  <p className="font-mono text-[10px] text-silver-dim leading-relaxed">{step.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Revenue Streams */}
      <section className="border-t border-void-border bg-void-soft">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
          <div className="mb-12">
            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">Revenue</span>
            <h2 className="text-4xl font-black text-silver mt-2 leading-none">
              Three revenue streams.<br />
              <span className="text-acid">All flow to veBYND stakers.</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {REVENUE_STREAMS.map((r, i) => {
              const Icon = r.icon;
              return (
                <div key={i} className="border border-void-border p-6 clip-corner hover:border-acid/20 transition-colors space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 border border-acid/30 bg-acid/5 flex items-center justify-center">
                      <Icon size={18} strokeWidth={1.5} className="text-acid" />
                    </div>
                    <span className="font-mono text-[7px] uppercase tracking-widest text-acid border border-acid/30 px-2 py-0.5">
                      {r.tag}
                    </span>
                  </div>
                  <h3 className="font-mono text-[11px] font-black text-silver uppercase tracking-wider">{r.title}</h3>
                  <p className="font-mono text-[9px] text-silver-dim leading-relaxed">{r.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why BynD */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">Advantage</span>
            <h2 className="text-4xl font-black text-silver mt-2 mb-6 leading-tight">
              Solo vs. Aggregated<br />
              <span className="text-acid">boost liquidity.</span>
            </h2>
            <p className="text-silver-dim leading-relaxed mb-8">
              Mezo's boost gauges let protocols bid for veMEZO allocation to amplify veBTC positions. A single fragmented veMEZO holder can't move the needle. BynD pools veMEZO into one permanent aggregated boost block — the dominant source that protocols bid to attract, passing all captured bribe yield to veBYND stakers.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {COMPARE.map((item, i) => (
                <div key={i} className={`p-3 border ${item.bad ? 'border-void-border' : 'border-acid/30 bg-acid/3'}`}>
                  <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">{item.label}</p>
                  <p className={`font-mono text-sm font-black ${item.bad ? 'text-silver-dim' : 'text-acid'}`}>
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
              Each epoch, four permissionless on-chain actions maintain the protocol. Any wallet can call them — first caller of harvestAndDistribute earns the bounty.
            </p>

            <div className="space-y-3">
              {EPOCH_STEPS.map((s, i) => (
                <div key={i} className="flex items-stretch gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 border border-acid/40 bg-acid/5 flex items-center justify-center font-mono text-[9px] font-black text-acid shrink-0">
                      {s.num}
                    </div>
                    {i < EPOCH_STEPS.length - 1 && <div className="w-px flex-1 bg-void-border min-h-[16px]" />}
                  </div>
                  <div className="pb-4 flex-1">
                    <p className="font-mono text-[10px] font-black text-silver">{s.fn}</p>
                    <p className="font-mono text-[8px] text-silver-dim mt-0.5">{s.note}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-void-border pt-4">
              <p className="font-mono text-[8px] text-silver-dim leading-relaxed">
                <span className="text-acid font-bold">claimRebases()</span> has no epoch gate — call any time. The other three are gated: each executes exactly once per epoch, enforced on-chain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
        <div className="relative border border-acid/20 bg-acid/3 clip-corner p-12 md:p-16 text-center overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/60 to-transparent" />

          <div className="relative">
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-acid font-bold mb-4">
              Ready to optimise your boost?
            </p>
            <h2 className="text-5xl md:text-6xl font-black text-silver mb-6 leading-none">
              Mint veBYND.<br />Earn Rewards.
            </h2>
            <p className="text-silver-dim max-w-lg mx-auto mb-10 leading-relaxed">
              BynD aggregates veMEZO into a dominant permanent boost block, capturing bribe rewards in any token for every veBYND staker. Deposit veMEZO, receive veBYND, stake for real yield.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isConnected ? (
                <Link to="/terminal">
                  <Button variant="primary" size="lg">Open Terminal <ArrowRight size={14} /></Button>
                </Link>
              ) : (
                <Button variant="primary" size="lg" onClick={() => connect()}>
                  Initialize System <ArrowRight size={14} />
                </Button>
              )}
              <a href="https://docs.mezo.org" target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="lg">Read the Docs</Button>
              </a>
            </div>
          </div>
        </div>
      </section>


    </div>
  );
}
