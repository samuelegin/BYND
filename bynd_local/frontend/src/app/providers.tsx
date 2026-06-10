'use client';

import { ReactNode } from 'react';
import { ProvidersLocal } from './providers-local';

export function Providers({ children }: { children: ReactNode }) {
  return <ProvidersLocal>{children}</ProvidersLocal>;
}
