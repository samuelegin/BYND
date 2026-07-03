import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  RainbowKitProvider,
  darkTheme,
  connectorsForWallets,
} from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  okxWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { MATSNET_CHAIN_ID } from '@/lib/passport';
import { Navbar } from '@/components/layout/Navbar';
import HomePage from '@/pages/Home';
import TerminalPage from '@/pages/Terminal';
import AnalyticsPage from '@/pages/Analytics';
import KeeperPage from '@/pages/Keeper';
import '@/styles/globals.css';

// Mezo Matsnet chain definition
const matsnetChain = {
  id: MATSNET_CHAIN_ID,
  name: 'Mezo Matsnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.test.mezo.org'] } },
  blockExplorers: {
    default: { name: 'Mezo Explorer', url: 'https://explorer.test.mezo.org' },
  },
  testnet: true,
} as const;

// Custom wallet list — no WalletConnect / no projectId required.
// Xverse and Unisat are Bitcoin-native wallets; they expose an EVM signer
// via their injected provider when connected to an EVM chain like Matsnet.
// We surface them through the generic injectedWallet fallback so the user
// can pick whichever injected wallet is active in their browser.
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        metaMaskWallet,
        okxWallet,          // OKX has a built-in RainbowKit wallet
        injectedWallet,     // catches Xverse, Unisat, and any other injected wallet
      ],
    },
  ],
  {
    appName: 'BYND Protocol',
    projectId: 'none',      // required field but unused — no WalletConnect connector is added
  }
);

const wagmiConfig = createConfig({
  chains: [matsnetChain],
  connectors,
  transports: { [MATSNET_CHAIN_ID]: http('https://rpc.test.mezo.org') },
  ssr: false,
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={matsnetChain}
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
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
