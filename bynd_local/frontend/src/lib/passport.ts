export const MATSNET_CHAIN_ID   = 31611;
export const LOCALHOST_CHAIN_ID = 31337;

export function isSupportedChain(chainId: number | undefined): boolean {
  return chainId === MATSNET_CHAIN_ID || chainId === LOCALHOST_CHAIN_ID;
}

export function chainName(chainId: number | undefined): string {
  if (chainId === MATSNET_CHAIN_ID)   return 'Mezo Matsnet';
  if (chainId === LOCALHOST_CHAIN_ID) return 'Hardhat Local';
  return `Chain ${chainId ?? '?'}`;
}
