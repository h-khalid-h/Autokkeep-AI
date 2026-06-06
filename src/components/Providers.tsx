'use client';

import { EntityProvider } from '@/lib/context/EntityContext';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { LandingProvider } from '@/lib/context/LandingContext';
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
          <LandingProvider>
            {children}
            <CommandPalette />
          </LandingProvider>
        </ToastProvider>
      </ThemeProvider>
    </EntityProvider>
  );
}
