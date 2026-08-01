import type { Metadata } from 'next';
import { Fjalla_One, Lora } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Tape } from '@/components/Tape';

const fjalla = Fjalla_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-fjalla',
  display: 'swap',
});

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-lora',
  display: 'swap',
});

const themeInitScript = `(function(){try{var t=localStorage.getItem('curta_demo_theme_v1');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'Curta — vídeos explicativos animados com IA',
  description:
    'Crie vídeos explicativos animados de 30 ou 60 segundos, com narração e trilha sonora geradas por IA.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fjalla.variable} ${lora.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <Tape />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}