import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { metaMaskWallet } from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import {
  getConfig,
  getDefaultWallets,
  preconfiguredWalletConnectWallet,
} from '@mezo-org/passport/dist/src/config';
import { PassportProvider } from '@mezo-org/passport/dist/src/provider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Navbar } from '@/components/layout/Navbar';
import HomePage from '@/pages/Home';
import TerminalPage from '@/pages/Terminal';
import AnalyticsPage from '@/pages/Analytics';
import KeeperPage from '@/pages/Keeper';
import '@/styles/globals.css';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '00000000000000000000000000000000';

// Use passport's getConfig with mezoNetwork: 'testnet' — it resolves the
// correct chain internally. Extend the default Bitcoin wallets with MetaMask.
const wagmiConfig = getConfig({
  appName: 'BYND Protocol',
  appDescription: 'Liquid Governance for Mezo',
  appUrl: 'https://bynd-kohl.vercel.app',
  appIcon: 'https://bynd-kohl.vercel.app/favicon.png',
  mezoNetwork: 'testnet',
  walletConnectProjectId: PROJECT_ID,
  ssr: false,
  wallets: [
    ...getDefaultWallets('testnet'),           // Unisat, OKX, Xverse + WalletConnect
    {
      groupName: 'Ethereum',
      wallets: [
        metaMaskWallet,                         // MetaMask
        ({ projectId }: { projectId: string }) =>
          preconfiguredWalletConnectWallet(projectId),
      ],
    },
  ],
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <PassportProvider environment="testnet">
          <RainbowKitProvider
            theme={darkTheme({
              accentColor:           '#C8FF00',
              accentColorForeground: '#0a0a0a',
              borderRadius:          'none',
              fontStack:             'system',
              overlayBlur:           'small',
            })}
          >
            <BrowserRouter>
              <div className="noise-overlay" />
              <div className="scanline" />
              <Navbar />
              <main className="pt-16">
                <Routes>
                  <Route path="/"          element={<HomePage />} />
                  <Route path="/terminal"  element={<TerminalPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/keeper"    element={<KeeperPage />} />
                </Routes>
              </main>
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
            </BrowserRouter>
          </RainbowKitProvider>
        </PassportProvider>
      </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
