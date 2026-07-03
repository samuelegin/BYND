// Shim for sats-connect — stubs out the Bitcoin wallet SDK so orangekit's
// Xverse provider compiles in a Vite/browser build without the native BTC lib.
// At runtime, Xverse will inject its own provider directly into window.XverseProviders.

const noop = () => {};
const noopAsync = async () => {};

export const AddressPurpose = {
  Payment: 'payment',
  Ordinals: 'ordinals',
  Stacks: 'stacks',
} as const;

export const RpcErrorCode = {
  USER_REJECTION: -32000,
  METHOD_NOT_FOUND: -32601,
  INTERNAL_ERROR: -32603,
} as const;

export const MessageSigningProtocols = {
  BIP322: 'BIP322',
  ECDSA: 'ECDSA',
} as const;

export const setDefaultProvider = noop;
export const getProviders = () => [];
export const getDefaultProvider = () => null;
export const request = noopAsync;
export const sendBtcTransaction = noopAsync;
export const signMessage = noopAsync;
export const signTransaction = noopAsync;
export const getAddress = noopAsync;
export const createInscription = noopAsync;
export const createRepeatInscriptions = noopAsync;

const Wallet = {
  request: noopAsync,
  disconnect: noopAsync,
};

export default Wallet;