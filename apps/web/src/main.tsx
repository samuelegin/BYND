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
import { App } from '@/App';
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
              accentColor:           '#E5B567',
              accentColorForeground: '#2A1E08',
              borderRadius:          'medium',
              fontStack:             'system',
              overlayBlur:           'small',
            })}
          >
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </RainbowKitProvider>
        </PassportProvider>
      </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
