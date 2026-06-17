"use client";

import { usePermiso } from '@/hooks/use-permisos';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import Swal from 'sweetalert2';

// ─────────────────────────────────────────────────────────────────
// Rutas que NO están en el menú pero son válidas.
// Son páginas de detalle con UUID dinámico o sub-rutas de acciones.
// Si el usuario puede ver el listado, puede ver el detalle.
//
// REGLA: si la ruta empieza con alguno de estos prefijos, pasa sin
// validar contra el menú. Nunca hardcodees rutas completas aquí,
// solo los prefijos de secciones.
// ─────────────────────────────────────────────────────────────────
const PREFIJOS_PERMITIDOS_SIN_MENU = [
  '/dashboard',                              // raíz siempre válida
  '/dashboard/compras/ordenes/',             // detalle OC
  '/dashboard/compras/requisiciones/',       // detalle requisición
  '/dashboard/compras/cotizaciones/',        // detalle cotización / PDF
  '/dashboard/inventario/recepciones/',      // detalle recepción
  '/dashboard/ventas/',                      // ticket de venta
  '/dashboard/productos/',                   // kardex de producto
];

export default function ProtectorDeRutas({ children }: { children: React.ReactNode }) {
  const { cargando: cargandoPermisos, isAdmin } = usePermiso();
  const pathname = usePathname();
  const router = useRouter();
  const [verificando, setVerificando] = useState(true);
  const [accesoDenegado, setAccesoDenegado] = useState(false);

  useEffect(() => {
    // Esperar a que el hook de permisos termine de leer localStorage
    if (cargandoPermisos) return;

    // Admin siempre tiene acceso a todo — no necesita verificar el menú
    if (isAdmin) {
      setVerificando(false);
      return;
    }

    const verificarAcceso = async () => {
      const token = localStorage.getItem('syncro_token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

      // ── Primero: ¿es una ruta de detalle/dinámica que siempre pasa? ──
      const esRutaExcluida = PREFIJOS_PERMITIDOS_SIN_MENU.some(prefijo =>
        // Exactamente /dashboard pasa, y cualquier cosa que empiece con prefijo + algo
        pathname === '/dashboard' || (prefijo.endsWith('/') && pathname.startsWith(prefijo))
      );

      if (esRutaExcluida) {
        setVerificando(false);
        return;
      }

      // ── Segundo: consultar el menú del usuario en el backend ──
      try {
        const res = await fetch(`${apiUrl}/auth/menu`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          // Si el backend falla, dejamos pasar (fail-open en navegación)
          setVerificando(false);
          return;
        }

        const menu = await res.json();

        // Extraer todas las rutasFrontend que el rol puede ver
        const rutasPermitidas = new Set<string>();
        for (const seccion of menu) {
          for (const modulo of seccion.modulos ?? []) {
            for (const item of modulo.items ?? []) {
              if (item.rutaFrontend) {
                rutasPermitidas.add(item.rutaFrontend);
              }
            }
          }
        }

        const tieneAcceso = rutasPermitidas.has(pathname);

        if (!tieneAcceso) {
          setAccesoDenegado(true);
          await Swal.fire({
            title: 'Acceso Denegado',
            text: 'No tienes los privilegios necesarios para acceder a esta sección.',
            icon: 'error',
            confirmButtonColor: '#4f46e5',
            confirmButtonText: 'Volver al inicio',
            customClass: {
              popup: 'rounded-[24px] shadow-2xl',
              confirmButton: 'px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200',
            }
          });
          setAccesoDenegado(false);
          router.push('/dashboard');
        }
      } catch {
        // Error de red — dejamos pasar silenciosamente
        // El backend igual devolverá 403 si intentan hacer algo no permitido
      } finally {
        setVerificando(false);
      }
    };

    verificarAcceso();
  }, [cargandoPermisos, pathname, isAdmin, router]);

  // ── Pantalla de carga mientras verifica ──
  if (cargandoPermisos || verificando) {
    return (
      <div className="p-20 text-center flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="animate-spin w-10 h-10 mx-auto text-indigo-500 mb-4" />
        <p className="font-medium text-sm">Verificando acceso...</p>
      </div>
    );
  }

  // ── Pantalla de acceso denegado (flash antes del redirect) ──
  if (accesoDenegado) {
    return (
      <div className="p-20 text-center flex flex-col items-center justify-center text-slate-400">
        <ShieldAlert className="w-12 h-12 text-rose-400 mb-4" />
        <p className="font-bold text-slate-700">Redirigiendo...</p>
      </div>
    );
  }

  return <>{children}</>;
}
