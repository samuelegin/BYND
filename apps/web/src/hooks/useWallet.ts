'use client';

import { useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { MATSNET_CHAIN_ID, isSupportedChain, chainName } from '@/lib/passport';

export function useWallet() {
  const { address, chainId, status, isConnected } = useAccount();
  const { disconnect }                             = useDisconnect();
  const publicClient                               = usePublicClient({ chainId: MATSNET_CHAIN_ID });
  const { data: walletClient }                     = useWalletClient({ chainId: MATSNET_CHAIN_ID });
  const { switchChain, isPending: isSwitching }    = useSwitchChain();
  const { openConnectModal }                       = useConnectModal();
  const { isPending: isConnectPending }            = useConnect();

  // Always delegate to RainbowKit modal — it shows MetaMask, OKX, Unisat, Xverse, WalletConnect
  const connect = useCallback(async (_walletId?: string) => {
    if (openConnectModal) openConnectModal();
  }, [openConnectModal]);

  const switchToMatsnet = useCallback(() => {
    switchChain({ chainId: MATSNET_CHAIN_ID });
  }, [switchChain]);

  const formatAddress = useCallback((addr: string | undefined) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }, []);

  return {
    isConnected,
    isConnecting:     status === 'connecting' || isConnectPending,
    address,
    chainId,
    isCorrectNetwork: isSupportedChain(chainId),
    isSwitching,
    publicClient,
    walletClient,
    connect,
    disconnect,
    switchToMatsnet,
    formatAddress,
    currentChainName: chainName(chainId),
    btcAddress:    null as string | null,
    networkFamily: 'evm' as const,
  };
}
