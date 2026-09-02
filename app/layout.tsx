import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
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
  title: 'Ordem — Operação de cultos',
  description: 'Planeje, prepare e conduza cada momento do culto em um só lugar.',
  openGraph: {
    title: 'Ordem — Operação de cultos',
    description: 'Cada momento no tempo certo.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ordem — Operação de cultos',
    description: 'Cada momento no tempo certo.',
    images: ['/og.png'],
  },
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
      </body>
    </html>
  );
}
