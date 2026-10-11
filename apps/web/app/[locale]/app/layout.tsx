import React from 'react';
import { AppContextProvider } from '@/context/AppContext';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <AppContextProvider>
      <AppShell locale={locale}>{children}</AppShell>
    </AppContextProvider>
  );
}
