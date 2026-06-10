import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/layout/Navbar';

export const metadata: Metadata = {
  title: 'BYND — Liquid Governance & Yield Layer for Mezo',
  description: 'Turn locked veMEZO into liquid veBYND, pool voting power, and earn automated MUSD yield — all without managing votes or staying locked.',
  keywords: ['mezo', 'bitcoin', 'defi', 'vemezo', 'vebynd', 'musd', 'liquid-locker', 'governance'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/favicon.svg" />
      </head>
      <body className="bg-void text-silver antialiased">
        <div className="noise-overlay" />
        <div className="scanline" />
        <Providers>
          <Navbar />
          <main className="pt-16">
            {children}
          </main>

          {/* Sticky bottom banner */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-acid px-6 py-2 text-void text-[10px] font-mono tracking-widest text-center uppercase font-bold">
            Deposit veMEZO → Get liquid veBYND → Stake → Earn MUSD Rewards
          </div>

          <footer className="mb-8 mt-32 border-t border-void-border">
            <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div className="space-y-1">
                <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-void-muted font-bold">
                  BYND Protocol // Liquid Governance for Mezo
                </p>
                <p className="font-mono text-[8px] text-void-muted">
                  Turn locked veMEZO into liquid veBYND and earn MUSD rewards
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-6 font-mono text-[8px] text-void-muted uppercase tracking-widest">
                  <a href="https://docs.mezo.org" target="_blank" rel="noopener noreferrer" className="hover:text-silver transition-colors">Docs</a>
                  <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-silver transition-colors">GitHub</a>
                  <a href="https://explorer.test.mezo.org" target="_blank" rel="noopener noreferrer" className="hover:text-silver transition-colors">Explorer</a>
                  <a href="https://app.mezo.org" target="_blank" rel="noopener noreferrer" className="hover:text-silver transition-colors">Mezo Swap</a>
                </div>
                <p className="font-mono text-[7px] text-void-muted">
                  veBYND/MEZO liquidity pool seeded at launch · Market-based exit via secondary liquidity
                </p>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
