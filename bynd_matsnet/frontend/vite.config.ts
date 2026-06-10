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
    include: ['buffer'],
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
