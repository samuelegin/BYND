'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronDown, Zap, Shield, TrendingUp, Lock } from 'lucide-react';
import { Button, Badge, LiveDot } from '@/components/ui';
import { ConnectModal } from '@/components/modals';
import { useWallet } from '@/hooks/useWallet';

const TICKER_ITEMS = [
  'Mezo Matsnet Testnet', 'Boost Coordination Layer', 'veBYND: Liquid veMEZO',
  'Any Bribe Token Rewards', 'Keeper Bounties: 1%', 'Weekly Lock Refresh',
  'veBYND/MEZO Pool: Live', 'Target Boost Efficiency: 98%', 'Epoch-based Voting',
  'Permanent 4-Year Lock',
];

const STEPS = [
  {
    num: '01',
    title: 'Lock & Mint veBYND',
    body: 'Deposit your veMEZO NFT into the BynD Vault. The protocol permanently locks it for the 4-year maximum to secure the highest boost weight. You instantly receive veBYND 1:1 — a fully liquid ERC-20 that tracks your claim on the pooled position.',
    icon: Shield,
    img: '/images/step-lock.png',
  },
  {
    num: '02',
    title: 'Stake veBYND',
    body: 'Stake your veBYND into the Reward Engine to activate yield. BynD pools all deposited veMEZO into a single permanent voting block, routes boost to the highest-bribe gauges each epoch, and distributes captured bribe tokens pro-rata to stakers.',
    icon: Zap,
    img: '/images/step-deposit.png',
  },
  {
    num: '03',
    title: 'Earn & Exit',
    body: 'Claim your bribe token yield every epoch. When you want to exit, unstake veBYND and sell it on the veBYND/MEZO pool on Mezo Swap. No withdrawal needed — the underlying stays locked, your liquidity doesn\'t.',
    icon: TrendingUp,
    img: '/images/step-stake.png',
  },
];

const STATS = [
  { label: 'Network',            value: 'Mezo',     delta: 'Bitcoin L2' },
  { label: 'Keeper Bounty',      value: '1%',       delta: 'Per harvest' },
  { label: 'Boost Efficiency',   value: '98%',      delta: 'Target optimisation' },
  { label: 'Lock Duration',      value: '4 yrs',    delta: 'Maximum' },
];

const COMPARE = [
  { label: 'Voting power alone',          value: '< 0.01%',           bad: true  },
  { label: 'BynD aggregated block',       value: 'Pooled (growing)',   bad: false },
  { label: 'Solo boost cap',              value: 'Hard to reach 5x',   bad: true  },
  { label: 'BynD boost matching',         value: 'Optimised up to 5x', bad: false },
  { label: 'Solo bribe capture',          value: 'Minimal / ignored',  bad: true  },
  { label: 'BynD bribe capture',          value: 'Whale-tier optim.',  bad: false },
  { label: 'Solo exit from lock',         value: 'Wait 4 years',       bad: true  },
  { label: 'veBYND exit liquidity',       value: 'Instant via swap',   bad: false },
];

const REVENUE_STREAMS = [
  {
    icon: '🗳️',
    title: 'Gauge Bribes',
    body: 'veBTC holders post bribe tokens on boost gauges that amplify veBTC positions up to 5x. BynD pools all deposited veMEZO into a single permanent voting block and routes boost to the highest-bribe gauges, capturing rewards for stakers.',
  },
  {
    icon: '⚡',
    title: 'Boost Routing',
    body: 'BynD votes its pooled veMEZO toward the highest-bribe gauges each epoch, auto-compounds rebases weekly, and distributes captured bribe tokens to stakers. No manual effort required.',
  },
  {
    icon: '🔄',
    title: 'Keeper Bounties',
    body: 'Community keepers trigger claimRebases(), extendLocks(), castVotes(), and harvestAndDistribute() each epoch, earning 1% of harvested bribe tokens.',
  },
];

export default function HomePage() {
  const { isConnected, isConnecting, connect } = useWallet();
  const [connectOpen, setConnectOpen] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen">

      {/* ── Ticker Bar ─────────────────────────────────────────────────── */}
      <div className="border-b border-void-border bg-void-soft overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap py-2.5">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-4 mx-8 font-mono text-[9px] uppercase tracking-widest text-void-muted"
            >
              <span className="w-1 h-1 bg-acid rounded-full" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden grid-bg">

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-acid/4 rounded-full blur-[140px] pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 py-24 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

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
                <div className="font-mono text-[10px] uppercase tracking-[0.5em] text-silver-dim font-bold mb-4">
                  Liquid Governance for Mezo
                </div>
                <h1 className="text-[80px] sm:text-[100px] lg:text-[120px] font-black leading-none tracking-tighter text-silver">
                  BY<span className="text-acid">ND</span>
                  <span className="text-acid">.</span>
                </h1>
              </div>

              <p className="text-lg text-silver-dim leading-relaxed max-w-lg">
                A non-custodial boost coordination layer that aggregates veMEZO boost liquidity,
                automates gauge allocation toward the highest-yielding veBTC gauges, and issues{' '}
                <span className="text-silver font-bold">veBYND</span>{' '}
                — a liquid ERC-20 token representing a transferable claim on the pooled position.
              </p>

              {/* Mezo gauge callout */}
              <div className="border border-acid/20 bg-acid/3 p-4 clip-corner space-y-1">
                <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold flex items-center gap-2">
                  <Lock size={10} /> Mezo Boost Gauges — Powered by BynD
                </p>
                <p className="font-mono text-[9px] text-silver-dim leading-relaxed">
                  veMEZO holders vote on boost gauges that amplify veBTC positions up to 5x. BynD pools fragmented veMEZO into one permanent optimised block — the most credible boost source, locked 4 years, rebases auto-compounding every epoch.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                {isConnected ? (
                  <Link href="/terminal">
                    <Button variant="primary" size="lg">
                      Open Terminal <ArrowRight size={14} />
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => setConnectOpen(true)}
                    isLoading={isConnecting}
                  >
                    Initialize System <ArrowRight size={14} />
                  </Button>
                )}
                <Link href="/analytics">
                  <Button variant="outline" size="lg">Protocol Analytics</Button>
                </Link>
              </div>

              {/* Mezo Passport callout */}
              <div className="flex items-center gap-3 pt-2">
                <span className="text-2xl">🛂</span>
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
              <Image
                src="/images/hero-orb.png"
                alt="BynD protocol — veBYND liquid governance"
                width={600}
                height={600}
                className="object-cover"
                priority
              />

              <div className="absolute -left-8 top-1/4 bg-void-soft border border-void-border p-4 font-mono text-xs">
                <p className="text-[8px] text-silver-dim uppercase mb-1">Pooled Power</p>
                <p className="text-xl font-black text-acid">Live</p>
                <p className="text-[8px] text-silver-dim">Read from chain</p>
              </div>

              <div className="absolute -right-8 bottom-1/3 bg-void-soft border border-void-border p-4 font-mono text-xs space-y-2 min-w-[180px]">
                <p className="text-[8px] text-silver-dim uppercase tracking-widest mb-2">Epoch Execution</p>
                {[
                  { n: '00', fn: 'claimRebases()',        sub: 'Compounds veMEZO rebase' },
                  { n: '01', fn: 'extendLocks()',         sub: 'Resets all positions to 4yr max' },
                  { n: '02', fn: 'castVotes()',           sub: 'Routes boost power to best gauges' },
                  { n: '03', fn: 'harvestAndDistribute()', sub: 'Sweeps bribes to stakers, 1% to caller' },
                ].map(({ n, fn, sub }) => (
                  <div key={n} className="flex gap-2 items-start">
                    <span className="text-[8px] text-void-muted w-4 shrink-0">{n}</span>
                    <div>
                      <p className="text-[9px] text-acid font-black">{fn}</p>
                      <p className="text-[7px] text-silver-dim">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="absolute -right-8 bottom-1/10 bg-void-soft border border-acid/20 p-4 font-mono text-xs">
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

      {/* ── Stats Bar ──────────────────────────────────────────────────── */}
      <section className="border-y border-void-border bg-void-soft">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-void-border">
            {STATS.map((s, i) => (
              <div key={i} className="px-8 py-8">
                <p className="font-mono text-[9px] uppercase tracking-widest text-silver-dim font-bold mb-2">
                  {s.label}
                </p>
                <p className="text-3xl font-black text-silver">{s.value}</p>
                <p className="font-mono text-[8px] text-acid mt-1">{s.delta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it Works ───────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-32">
        <div className="mb-16">
          <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">
            Protocol
          </span>
          <h2 className="text-5xl font-black text-silver mt-2 leading-none">
            How it works.
          </h2>
          <p className="text-silver-dim mt-4 max-w-xl">
            Three steps. One liquid position. Maximum governance yield without the lockup tradeoff.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="group relative border border-void-border hover:border-acid/30 transition-all duration-300 clip-corner overflow-hidden"
            >
              <Image
                src={step.img}
                alt={step.title}
                width={600}
                height={300}
                className="w-full object-cover"
              />

              <div className="p-6 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[9px] text-acid font-black">
                    {step.num}
                  </span>
                  <div className="h-px flex-1 bg-void-border" />
                </div>
                <h3 className="text-xl font-black text-silver">{step.title}</h3>
                <p className="font-mono text-[10px] text-silver-dim leading-relaxed">
                  {step.body}
                </p>
              </div>

              <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-void-muted group-hover:border-acid/50 transition-colors" />
            </div>
          ))}
        </div>
      </section>

      {/* ── Revenue Streams ────────────────────────────────────────────── */}
      <section className="border-t border-void-border bg-void-soft">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
          <div className="mb-12">
            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">
              Revenue
            </span>
            <h2 className="text-4xl font-black text-silver mt-2 leading-none">
              Three revenue streams.<br />
              <span className="text-acid">All flow to veBYND stakers.</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {REVENUE_STREAMS.map((r, i) => (
              <div key={i} className="border border-void-border p-6 clip-corner hover:border-acid/20 transition-colors">
                <div className="text-3xl mb-4">{r.icon}</div>
                <h3 className="font-mono text-[11px] font-black text-silver uppercase tracking-wider mb-2">{r.title}</h3>
                <p className="font-mono text-[9px] text-silver-dim leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why BynD ───────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          <div>
            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-acid font-bold">
              Advantage
            </span>
            <h2 className="text-4xl font-black text-silver mt-2 mb-6 leading-tight">
              Solo vs. Aggregated<br />
              <span className="text-acid">Governance power.</span>
            </h2>
            <p className="text-silver-dim leading-relaxed mb-8">
              Mezo's boost gauges let veBTC holders amplify their positions up to 5x by attracting veMEZO votes. A single fragmented veMEZO holder can't move the needle. BynD pools veMEZO into one permanent aggregated block — the dominant boost source that protocols bid bribe tokens to attract, passing all captured yield to veBYND stakers.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {COMPARE.map((item, i) => (
                <div
                  key={i}
                  className={`p-3 border ${
                    item.bad ? 'border-void-border' : 'border-acid/30 bg-acid/3'
                  }`}
                >
                  <p className="font-mono text-[8px] uppercase tracking-widest text-silver-dim mb-1">
                    {item.label}
                  </p>
                  <p className={`font-mono text-sm font-black ${
                    item.bad ? 'text-silver-dim' : 'text-acid'
                  }`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Architecture diagram */}
          <div className="relative border border-void-border bg-void clip-corner p-8">
            <Image
              src="/images/architecture-flow.png"
              alt="BynD architecture — matching market diagram"
              width={600}
              height={600}
              className="object-cover w-full"
            />
          </div>

        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
        <div className="relative border border-acid/20 bg-acid/3 clip-corner p-12 md:p-16 text-center overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-acid/60 to-transparent" />

          <div className="relative">
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-acid font-bold mb-4">
              Ready to bind your power?
            </p>
            <h2 className="text-5xl md:text-6xl font-black text-silver mb-6 leading-none">
              Mint veBYND.<br />Earn Bribe Rewards.
            </h2>
            <p className="text-silver-dim max-w-lg mx-auto mb-10 leading-relaxed">
              BynD coordinates veMEZO that would otherwise sit fragmented across many holders.
              Deposit veMEZO → receive veBYND → stake for real yield.
              BynD keeps positions active, refreshes locks weekly, and routes the group's combined boost to the strongest gauges.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isConnected ? (
                <Link href="/terminal">
                  <Button variant="primary" size="lg">
                    Open Terminal <ArrowRight size={14} />
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setConnectOpen(true)}
                >
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

      <ConnectModal
        isOpen={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnect={() => { connect(); setConnectOpen(false); }}
        isConnecting={isConnecting}
        error={null}
      />

    </div>
  );
}
