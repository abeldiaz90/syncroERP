"use client";

/**
 * ============================================================================
 * Permisos — marco con pestañas
 * ----------------------------------------------------------------------------
 * Había dos pantallas de roles y ninguna sabía de la otra: la matriz de
 * permisos del ERP y la correspondencia con el registro externo. Son el mismo
 * tema visto desde dos lados (qué puede hacer un rol aquí, y con qué rol se
 * corresponde allá), así que viven bajo el mismo encabezado.
 *
 * Las rutas no cambian: cada pestaña sigue siendo su propia página.
 * ============================================================================
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Link2 } from 'lucide-react';
import { useContratacion } from '@/lib/contratacion';

const PESTANAS = [
  { href: '/dashboard/permisos', etiqueta: 'Roles y accesos', Icono: Shield, requiereCore: false },
  { href: '/dashboard/permisos/correspondencia', etiqueta: 'Correspondencia con Fineract', Icono: Link2, requiereCore: true },
];

export default function PermisosLayout({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  /*
   * La correspondencia de roles solo existe cuando hay dos sistemas que
   * corresponder. Una empresa que solo usa el ERP no tiene nada que mapear, y
   * la pestaña le proponía una tarea imposible con aire de pendiente.
   */
  const plan = useContratacion();
  const pestanas = PESTANAS.filter(
    (p) => !p.requiereCore || plan?.usaRegistroExterno,
  );

  return (
    <div style={{ padding: '24px 24px 0', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 4 }}>
        {pestanas.map(({ href, etiqueta, Icono }) => {
          const activa = href === '/dashboard/permisos' ? ruta === href : ruta.startsWith(href);
          return (
            <Link key={href} href={href} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', fontSize: 13, fontWeight: 700,
              color: activa ? '#4f46e5' : '#64748b',
              borderBottom: `2px solid ${activa ? '#4f46e5' : 'transparent'}`,
              marginBottom: -1, textDecoration: 'none',
            }}>
              <Icono style={{ width: 15, height: 15 }} />
              {etiqueta}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
