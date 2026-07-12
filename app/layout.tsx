import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { AppProvider } from '@/components/app-provider';
import './globals.css';

const inter = localFont({
  src: './fonts/inter.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-inter',
});
const newsreader = localFont({
  src: [
    { path: './fonts/newsreader-normal.woff2', weight: '400 500', style: 'normal' },
    { path: './fonts/newsreader-italic.woff2', weight: '400 500', style: 'italic' },
  ],
  variable: '--font-newsreader',
});
const jetbrains = localFont({
  src: './fonts/jetbrains-mono.woff2',
  weight: '100 800',
  style: 'normal',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'Whetstone — Project steward',
  description: 'A quiet steward for the meaningful work no one else is enforcing.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${newsreader.variable} ${jetbrains.variable}`}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
