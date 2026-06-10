'use client';

import { useCallback } from 'react';
import { useAccount, useDisconnect, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { MATSNET_CHAIN_ID, LOCALHOST_CHAIN_ID, isSupportedChain, chainName } from '@/lib/passport';

export function useWallet(preferLocal: boolean = false) {
  const targetChainId = preferLocal ? LOCALHOST_CHAIN_ID : MATSNET_CHAIN_ID;

  const { address, chainId, status, isConnected } = useAccount();
  const { disconnect }                             = useDisconnect();
  const publicClient                               = usePublicClient({ chainId: targetChainId });
  const { data: walletClient }                     = useWalletClient({ chainId: targetChainId });
  const { switchChain, isPending: isSwitching }    = useSwitchChain();
  const { openConnectModal }                       = useConnectModal();

  const connect = useCallback(() => {
    if (openConnectModal) openConnectModal();
  }, [openConnectModal]);

  const switchToTarget = useCallback(() => {
    switchChain({ chainId: targetChainId });
  }, [switchChain, targetChainId]);

  // kept for backward compat
  const switchToMatsnet = useCallback(() => {
    switchChain({ chainId: MATSNET_CHAIN_ID });
  }, [switchChain]);

  const formatAddress = useCallback((addr: string | undefined) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }, []);

  return {
    isConnected,
    isConnecting:    status === 'connecting',
    address,
    chainId,
    isCorrectNetwork: isSupportedChain(chainId),
    isSwitching,
    publicClient,
    walletClient,
    connect,
    disconnect,
    switchToTarget,
    switchToMatsnet,
    formatAddress,
    currentChainName: chainName(chainId),
    btcAddress:    null as string | null,
    networkFamily: 'evm' as const,
  };
}
