"use client";
/**
 * ============================================================================
 * SyncroERP · Panel principal
 * ----------------------------------------------------------------------------
 * Cambios: los íconos `ti ti-*` (Tabler) nunca se cargaron, así que las nueve
 * tarjetas de módulo salían con un cuadro vacío. Ahora usan lucide-react, que
 * ya estaba instalado. Además cada tarjeta muestra las secciones reales a las
 * que el usuario tiene acceso, no un conteo total que a veces mentía.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Banknote, Receipt, TrendingUp, Users2 } from 'lucide-react';

import { MODULOS } from './module-config';
import { api, intentar, token } from '@/lib/api';
import { leerSesion, puedeEntrar, puedeVerEnlace } from '@/lib/session';
import { Indicador } from '@/components/ui';
import { dinero } from '@/lib/format';
import { esRolAdministrador } from '@/lib/roles';

interface Metricas {
  ventasHoy: number;
  totalHoy: number;
  ticketPromedio: number;
  totalSemana: number;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(d = new Date()) {
  const dia = DIAS[d.getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

const ACCESOS_RAPIDOS = [
  { label: 'Nueva venta',        href: '/dashboard/ventas/pos' },
  { label: 'Nueva póliza',       href: '/dashboard/finanzas/polizas/nueva' },
  { label: 'Corte de caja',      href: '/dashboard/reportes/corte-caja' },
  { label: 'Declaración de IVA', href: '/dashboard/finanzas/declaracion-iva' },
  { label: 'Cartera vencida',    href: '/dashboard/creditos/cartera-vencida' },
  { label: 'Reporte de ventas',  href: '/dashboard/reportes/ventas' },
];

export default function PanelPrincipal() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [porCobrar, setPorCobrar] = useState<number | null>(null);
  const [permisos, setPermisos] = useState<string[] | null>(null);
  const [nombre, setNombre] = useState('');
  const [cargandoKpis, setCargandoKpis] = useState(true);

  useEffect(() => {
    let vivo = true;

    (async () => {
      const s = leerSesion(token.get());
      if (!s) return;
      if (vivo) setNombre(s.nombreCompleto || s.email);

      let rutas: string[];
      if (esRolAdministrador(s.rol)) {
        rutas = ['*'];
      } else {
        const r = await intentar(api.get<{ rutas?: string[] }>('/admin/permisos/mis-rutas'), { rutas: [] });
        rutas = r.rutas ?? [];
      }
      if (vivo) setPermisos(rutas);

      /*
       * ──────────────────────────────────────────────────────────────────────
       * Un indicador que no se pudo leer NO vale cero
       * ----------------------------------------------------------------------
       * Estas dos llamadas responden 403 a quien no tiene ventas ni finanzas
       * —un almacenista, por ejemplo—, `intentar` se traga el error y lo que
       * quedaba en pantalla era «Ventas de hoy $0.00 · 0 transacciones».
       *
       * Eso no es un hueco: es un dato del negocio, y falso. Se vio en la
       * primera sesión de un usuario real: el almacenista entraba y su panel le
       * decía que hoy no se había vendido nada. Si lo repite en voz alta, se
       * toman decisiones con eso.
       *
       * `null` significa «no lo sé» y los indicadores que no se saben no se
       * pintan. Se distingue de «cero de verdad», que sí se pinta.
       * ──────────────────────────────────────────────────────────────────────
       */
      /*
       * No se pregunta lo que ya sabemos que va a responder 403.
       *
       * Estas dos llamadas salian SIEMPRE, para todos los roles. El panel de
       * un comprador o un almacenista abria cada carga con dos peticiones
       * condenadas al 403, tragadas en silencio. No rompia nada, pero llenaba
       * la bitacora del servidor de rechazos legitimos y dejaba sin valor el
       * unico lugar donde se detecta un permiso mal puesto: cuando todo el
       * mundo genera 403 de rutina, el 403 que importa no se ve.
       *
       * Los permisos ya se cargaron arriba, asi que la pregunta se hace solo
       * cuando tiene sentido hacerla. `intentar` se queda igualmente como red:
       * el permiso de pantalla y el del endpoint pueden diferir, y en ese caso
       * el indicador debe quedar en «no lo se», nunca en cero.
       */
      const puedeVerVentas = puedeVerEnlace(rutas, '/dashboard/ventas');
      const puedeVerBalanza = puedeVerEnlace(rutas, '/dashboard/finanzas/balanza');

      const [m, balanza] = await Promise.all([
        puedeVerVentas
          ? intentar(api.get<Metricas>('/ventas/dashboard/metricas'), null as unknown as Metricas)
          : Promise.resolve(null as unknown as Metricas),
        puedeVerBalanza
          ? intentar(
              api.get<Array<{ numeroCuenta?: string; saldoFinal?: number }>>('/finanzas/polizas/balanza'),
              null as unknown as Array<{ numeroCuenta?: string; saldoFinal?: number }>,
            )
          : Promise.resolve(null as unknown as Array<{ numeroCuenta?: string; saldoFinal?: number }>),
      ]);

      if (!vivo) return;
      setMetricas(m ?? null);
      const cxc = Array.isArray(balanza) ? balanza.find((b) => b.numeroCuenta?.startsWith('14')) : null;
      setPorCobrar(Array.isArray(balanza) ? Number(cxc?.saldoFinal ?? 0) : null);
      setCargandoKpis(false);
    })();

    return () => { vivo = false; };
  }, []);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  const modulosVisibles = MODULOS.map((m) => ({
    ...m,
    accesibles: m.items.filter((i) => !i.oculto && puedeVerEnlace(permisos, i.href)),
  })).filter((m) => m.accesibles.length > 0);

  /*
   * Los accesos rápidos son destinos concretos, no secciones: se filtran con
   * `puedeEntrar` y no con `puedeVerEnlace`.
   *
   * La diferencia importa. `puedeVerEnlace` también acepta que el permiso sea
   * DESCENDIENTE del enlace —lo correcto para una sección, que debe verse si
   * algo de dentro es accesible— y por eso al almacenista le aparecían «Corte
   * de caja» y «Reporte de ventas», que no puede abrir. Un botón que lleva a
   * una negativa es peor que no tener el botón.
   */
  const rapidos = ACCESOS_RAPIDOS.filter((a) => puedeEntrar(permisos, a.href));

  return (
    <div className="p-6 lg:p-8 max-w-[1280px] mx-auto">

      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
          {saludo}{nombre ? `, ${nombre.split(' ')[0]}` : ''}
        </h1>
        <p className="text-[12.5px] text-slate-500 mt-0.5">{fechaLarga()}</p>
      </header>

      {/* Indicadores del día — sólo los que este perfil puede leer */}
      {(cargandoKpis || metricas || porCobrar !== null) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {(cargandoKpis || metricas) && (
            <>
              <Indicador
                etiqueta="Ventas de hoy" color="#4f46e5" cargando={cargandoKpis}
                icono={<Receipt className="w-4 h-4" />}
                valor={dinero(metricas?.totalHoy ?? 0)}
                detalle={`${metricas?.ventasHoy ?? 0} transacciones`}
              />
              <Indicador
                etiqueta="Ticket promedio" color="#059669" cargando={cargandoKpis}
                icono={<TrendingUp className="w-4 h-4" />}
                valor={dinero(metricas?.ticketPromedio ?? 0)}
                detalle="promedio del día"
              />
              <Indicador
                etiqueta="Últimos 7 días" color="#0284c7" cargando={cargandoKpis}
                icono={<Banknote className="w-4 h-4" />}
                valor={dinero(metricas?.totalSemana ?? 0)}
                detalle="ventas acumuladas"
              />
            </>
          )}
          {(cargandoKpis || porCobrar !== null) && (
            <Indicador
              etiqueta="Por cobrar" color="#d97706" cargando={cargandoKpis}
              icono={<Users2 className="w-4 h-4" />}
              valor={dinero(porCobrar ?? 0)}
              detalle="saldo de clientes"
            />
          )}
        </div>
      )}

      {/* Módulos */}
      <div className="flex items-baseline justify-between mb-3">
        <p className="eyebrow">Módulos</p>
        {permisos && !permisos.includes('*') && (
          <p className="text-[11.5px] text-slate-400">
            {modulosVisibles.length} de {MODULOS.length} disponibles con tu perfil
          </p>
        )}
      </div>

      {permisos === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="esqueleto h-[132px] rounded-xl" />)}
        </div>
      ) : modulosVisibles.length === 0 ? (
        <div className="panel py-14 text-center">
          <p className="text-[14px] font-semibold text-slate-700">Todavía no tienes módulos asignados</p>
          <p className="text-[12.5px] text-slate-500 mt-1">
            El administrador debe habilitarlos desde Roles y permisos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {modulosVisibles.map((m) => {
            const Icono = m.Icono;
            const destino = m.href;
            return (
              <Link
                key={m.id}
                href={destino}
                className="panel p-4 group transition-shadow hover:shadow-md"
                style={{ borderTop: `2px solid ${m.color}` }}
              >
                <div
                  className="w-9 h-9 rounded-lg grid place-items-center mb-3"
                  style={{ background: m.bg }}
                >
                  <Icono className="w-[18px] h-[18px]" style={{ color: m.color }} />
                </div>

                <p className="text-[13.5px] font-bold text-slate-900 leading-tight">{m.nombre}</p>
                <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{m.desc}</p>

                <div className="flex items-center justify-between mt-3">
                  <span
                    className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                    style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}
                  >
                    {m.accesibles.length} {m.accesibles.length === 1 ? 'sección' : 'secciones'}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Accesos rápidos */}
      {rapidos.length > 0 && (
        <section className="panel mt-6 p-4">
          <p className="eyebrow mb-3">Acciones frecuentes</p>
          <div className="flex flex-wrap gap-2">
            {rapidos.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="btn btn-neutro btn-sm"
              >
                {a.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
