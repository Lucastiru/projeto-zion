import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { PwaClient } from '@/components/pwa-client';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Zion Church | Ordem',
  description: 'Planeje, prepare e conduza cada evento da Zion Church em um só lugar.',
  applicationName: 'Operação Igreja',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Operação Igreja',
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: 'Zion Church | Ordem',
    description: 'Cada evento, equipe e momento no tempo certo.',
    images: ['/zion-logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zion Church | Ordem',
    description: 'Cada evento, equipe e momento no tempo certo.',
    images: ['/zion-logo.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#15382d',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <PwaClient />
      </body>
    </html>
  );
}
