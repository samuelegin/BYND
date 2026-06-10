import path from 'node:path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@mezo-org/passport',
    '@mezo-org/orangekit',
    '@mezo-org/orangekit-contracts',
    '@mezo-org/orangekit-smart-account',
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage':
        path.resolve('./src/lib/async-storage-shim.ts'),
      'sats-connect': false,
      'pino-pretty': false,
      'encoding': false,
    };
    return config;
  },
};

export default nextConfig;