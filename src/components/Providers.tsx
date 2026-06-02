'use client';

import { EntityProvider } from '@/lib/context/EntityContext';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { CommandPalette } from '@/components/ui/CommandPalette';

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
