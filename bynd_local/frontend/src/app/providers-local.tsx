'use client';

import { ReactNode } from 'react';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { LOCALHOST_CHAIN_ID } from '@/lib/passport';

const hardhatChain = {
  id: LOCALHOST_CHAIN_ID,
  name: 'Hardhat Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
} as const;

const wagmiConfig = createConfig({
  chains:     [hardhatChain],
  connectors: [injected()],
  transports: { [LOCALHOST_CHAIN_ID]: http('http://127.0.0.1:8545') },
  ssr: false,
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000 } },
});

export function ProvidersLocal({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={hardhatChain}
          theme={darkTheme({
            accentColor:           '#C8FF00',
            accentColorForeground: '#0a0a0a',
            borderRadius:          'none',
            fontStack:             'system',
            overlayBlur:           'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
