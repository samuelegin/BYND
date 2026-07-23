import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
(window as any).Buffer = Buffer;

// Polyfill process for libraries that expect Node.js environment
if (typeof globalThis.process === 'undefined') {
  (globalThis as any).process = { env: {}, browser: true, version: '', versions: {} };
}
(window as any).process = (globalThis as any).process;
