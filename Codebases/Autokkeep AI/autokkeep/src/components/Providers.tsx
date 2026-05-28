'use client';

import { EntityProvider } from '@/lib/context/EntityContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <EntityProvider>
      {children}
    </EntityProvider>
  );
}
