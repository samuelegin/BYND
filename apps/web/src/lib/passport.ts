export const MATSNET_CHAIN_ID = 31611;

export function isSupportedChain(chainId: number | undefined): boolean {
  return chainId === MATSNET_CHAIN_ID;
}

export function chainName(chainId: number | undefined): string {
  if (chainId === MATSNET_CHAIN_ID) return 'Mezo Matsnet';
  return `Chain ${chainId ?? '?'}`;
}