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
  title: 'Zion Church | Ordem',
  description: 'Planeje, prepare e conduza cada evento da Zion Church em um só lugar.',
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
