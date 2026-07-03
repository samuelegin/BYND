import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'sats-connect': path.resolve(__dirname, 'src/shims/empty.ts'),
      'pino-pretty': path.resolve(__dirname, 'src/shims/empty.ts'),
      'encoding':    path.resolve(__dirname, 'src/shims/empty.ts'),
    },
  },
  define: {
    global: 'globalThis',
    'process.env': '{}',
    'process.browser': 'true',
    'process.version': '""',
    'process.versions': '{}',
  },
  optimizeDeps: {
    include: [
      'buffer',
      // CJS deps inside the excluded @mezo-org/passport tree must still be
      // pre-bundled so their named ESM exports resolve under pnpm's layout.
      '@mezo-org/passport > @mezo-org/sign-in-with-wallet > bitcoinjs-lib',
      '@mezo-org/passport > @mezo-org/orangekit > @mezo-org/orangekit-smart-account > bitcoinjs-lib',
      '@mezo-org/passport > @mezo-org/orangekit > @mezo-org/orangekit-smart-account > @safe-global/protocol-kit',
      '@mezo-org/passport > @mezo-org/orangekit > @mezo-org/orangekit-smart-account > @safe-global/protocol-kit/dist/src/utils',
      '@mezo-org/passport > @mezo-org/orangekit > @mezo-org/orangekit-smart-account > @safe-global/safe-core-sdk-types',
      '@mezo-org/passport > @mezo-org/orangekit > @mezo-org/orangekit-smart-account > @gelatonetwork/relay-sdk',
      '@mezo-org/passport > @mezo-org/orangekit > @mezo-org/orangekit-smart-account > @gelatonetwork/relay-sdk/dist/lib/types',
    ],
    exclude: ['@mezo-org/passport'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
        'process.env': '{}',
        'process.browser': 'true',
      },
    },
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'UNRESOLVED_IMPORT') return;
        warn(warning);
      },
    },
  },
});
