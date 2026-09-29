/**
 * ============================================================================
 * SyncroERP · Raíz de la aplicación
 * ----------------------------------------------------------------------------
 * POR QUÉ LA TIPOGRAFÍA ES LOCAL Y NO `next/font/google`
 *
 * Antes esto decía `import { Inter } from 'next/font/google'`. Eso descarga la
 * fuente desde fonts.gstatic.com CADA VEZ que se compila, y si la descarga no
 * sale —sin internet, con un proxy, detrás del firewall del cliente— Turbopack
 * escribe un CSS con una url que no resuelve y la aplicación NO ARRANCA:
 *
 *     Module not found: Can't resolve
 *     '@vercel/turbopack-next/internal/font/google/font'
 *
 * No es un error de tipografía: es la pantalla de error de Next en lugar del
 * ERP. Un ERP que se instala en el servidor del cliente no puede depender de
 * que Google conteste para levantar.
 *
 * Así que la fuente vive aquí, en el repositorio. Es el archivo variable del
 * subconjunto latino de Inter —48 KB, eje de peso 100–900—, de modo que los
 * cuatro pesos que se usaban (400, 500, 600 y 700) salen de un solo archivo en
 * vez de cuatro descargas. Se comprobó que trae todo lo que el español
 * necesita: á é í ó ú, ñ, Ñ, ü, ¿, ¡, €, ° y «».
 *
 * `display: 'swap'` y la lista de respaldo dejan el texto legible mientras el
 * archivo carga, que con un archivo local es casi instantáneo.
 * ============================================================================
 */

import localFont from 'next/font/local';

import './globals.css';
import { I18nProvider } from '@/components/I18nProvider';
import { ProveedorAvisos } from '@/components/ui';
import { ProveedorDialogos } from '@/components/ui/dialogos';
import { VigilanteSesion } from '@/components/VigilanteSesion';

const inter = localFont({
  src: './fuentes/inter-latina-variable.woff2',
  // Un solo archivo cubre de 100 a 900: el `font-weight` de cada clase de
  // Tailwind (400/500/600/700) se interpola sobre el mismo eje.
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
  fallback: [
    'system-ui',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'sans-serif',
  ],
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
