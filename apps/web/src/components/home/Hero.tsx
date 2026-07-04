import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Lock } from 'lucide-react';
import { Button, Badge, LiveDot } from '@/components/ui';
import { EPOCH_STEPS } from './data';

interface HeroProps {
  visible: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
}

export function Hero({ visible, isConnected, isConnecting, connect }: HeroProps) {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden grid-bg">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-acid/4 rounded-full blur-[160px] pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 py-24 w-full">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          {/* Left — copy */}
          <div
            className="space-y-8"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(24px)',
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
                BY<span className="text-acid">ND</span>
                <span className="text-acid">.</span>
              </h1>
            </div>

            <p className="text-lg text-silver-dim leading-relaxed max-w-lg">
              A non-custodial boost coordination layer that aggregates veMEZO
              boost liquidity, automates gauge allocation toward the
              highest-yielding veBTC gauges, and issues{' '}
              <span className="text-silver font-bold">veBYND</span> — a liquid
              ERC-20 token representing a transferable claim on the pooled
              position.
            </p>

            {/* Mezo boost callout */}
            <div className="border border-acid/20 bg-acid/3 p-4 clip-corner space-y-1.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-acid font-bold flex items-center gap-2">
                <Lock size={10} /> Mezo Boost Gauges — Powered by BynD
              </p>
              <p className="font-mono text-[9px] text-silver-dim leading-relaxed">
                veMEZO holders vote on boost gauges that amplify veBTC
                positions up to 5x. BynD pools fragmented veMEZO into one
                permanent optimised block — the most credible boost source,
                locked 4 years, rebases auto-compounding every epoch.
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
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => connect()}
                  isLoading={isConnecting}
                >
                  Initialize System <ArrowRight size={14} />
                </Button>
              )}
              <Link to="/analytics">
                <Button variant="outline" size="lg">
                  Protocol Analytics
                </Button>
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
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(32px)',
              transition: 'opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s',
            }}
          >
            <img
              src="/hero-orb.png"
              alt="BynD protocol — veBYND liquid governance"
              style={{ width: '600px', height: '600px', objectFit: 'cover' }}
            />

            <div className="absolute -left-8 top-1/4 bg-void-soft border border-void-border p-4 font-mono text-xs">
              <p className="text-[8px] text-silver-dim uppercase mb-1">
                Pooled Power
              </p>
              <p className="text-xl font-black text-acid">Live</p>
              <p className="text-[8px] text-silver-dim">Read from chain</p>
            </div>

            <div className="absolute -right-8 bottom-1/3 bg-void-soft border border-void-border p-4 font-mono text-xs space-y-2 min-w-[180px]">
              <p className="text-[8px] text-silver-dim uppercase tracking-widest mb-2">
                Epoch Execution
              </p>
              {EPOCH_STEPS.map((s, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-[8px] text-void-muted w-4 shrink-0">
                    {s.num}
                  </span>
                  <div>
                    <p className="text-[9px] text-acid font-black">{s.fn}</p>
                    <p className="text-[7px] text-silver-dim">{s.note}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="absolute -right-8 bottom-4 bg-void-soft border border-acid/20 p-4 font-mono text-xs">
              <p className="text-[8px] text-silver-dim uppercase mb-1">
                Boost Efficiency
              </p>
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
  );
}
