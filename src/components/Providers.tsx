'use client';

import { EntityProvider } from '@/lib/context/EntityContext';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import dynamic from 'next/dynamic';
const CommandPalette = dynamic(
  () => import('@/components/ui/CommandPalette').then(mod => mod.CommandPalette),
  { ssr: false }
);

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <EntityProvider>
      <ThemeProvider>
        <ToastProvider>
          {children}
          <CommandPalette />
        </ToastProvider>
      </ThemeProvider>
    </EntityProvider>
  );
}
