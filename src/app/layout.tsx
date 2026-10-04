import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { QueryProvider } from '@/components/providers/QueryProvider';
import { ru } from '@/shared/i18n/ru';

import './globals.css';

export const metadata: Metadata = {
  title: ru.app.name,
  description: ru.app.description,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body>
        <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4" href="#main">
          {ru.app.skipToContent}
        </a>
        <QueryProvider>
          <main id="main">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
