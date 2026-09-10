import { Inter } from 'next/font/google';
import './globals.css';
import { I18nProvider } from '@/components/I18nProvider';
import { ProveedorAvisos } from '@/components/ui';
import { ProveedorDialogos } from '@/components/ui/dialogos';
import { VigilanteSesion } from '@/components/VigilanteSesion';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});

export const metadata = {
  title: 'Syncro ERP',
  description: 'Sistema inteligente de control y punto de venta',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="font-sans bg-gray-50 text-gray-800">
        <VigilanteSesion />
        <I18nProvider><ProveedorAvisos><ProveedorDialogos>{children}</ProveedorDialogos></ProveedorAvisos></I18nProvider>
      </body>
    </html>
  );
}
