"use client";

import Link from 'next/link';
import { ArrowRight, ExternalLink, Grid2X2, Sparkles } from 'lucide-react';
import { abrirPuntoDeVenta } from '@/lib/pos';
import { puedeEntrar } from '@/lib/session';
import { usePermiso } from '@/hooks/use-permisos';
import type { ModuleAction, ModuleConfig, ModuleItem } from '@/app/dashboard/module-config';

interface Props {
  modulo: ModuleConfig;
  items: ModuleItem[];
  activo?: ModuleItem | null;
  /** Rutas que este perfil puede abrir. `null` mientras se resuelven. */
  permisos: string[] | null;
}

export function BarraContextualModulo({ modulo, items, activo, permisos }: Props) {
  /*
   * Las acciones también se filtran por permisos.
   *
   * Se tomaban de `modulo.acciones` tal cual, mientras la pantalla del centro
   * del módulo sí las filtraba: la misma barra, dos comportamientos. Con un
   * usuario real se vio el efecto — al almacenista, en Finanzas, la barra le
   * ofrecía «Nueva póliza», «Balanza» y «Cierre mensual» en botones
   * destacados, y las tres terminan en «esta sección no está en tu perfil».
   *
   * Las acciones de ventana —hoy sólo la caja— no pasan por el filtro de
   * PANTALLA, porque no son una pantalla del área de trabajo. Pero sí por el
   * de ACCIÓN. Antes se saltaban los dos, con el argumento de que lo que se
   * puede hacer dentro lo decide el servidor: cierto, y aun así el botón
   * «Abrir caja» salía primario para gerencia, contabilidad y crédito, y la
   * ventana se abría sólo para decirles «tu perfil no incluye la caja».
   * Ofrecer un camino a una negativa es el mismo defecto que ya se corrigió
   * en el centro de trabajo; esta barra es la otra puerta y se había quedado
   * sin la regla.
   */
  const { tienePermiso } = usePermiso();
  /*
   * Y además por lo que la acción HACE, no sólo por la pantalla que abre.
   * Poder abrir «Requisiciones» en consulta no es poder crear una: ese botón
   * llevaba al almacenista a llenar un formulario que terminaba en 403.
   */
  const accionesDelModulo = (modulo.acciones ?? []).filter((a) => {
    if (a.accion && !tienePermiso(a.accion.metodo, a.accion.ruta)) return false;
    return a.ventana || puedeEntrar(permisos, a.href);
  });
  const acciones: ModuleAction[] = accionesDelModulo.length
    ? accionesDelModulo.slice(0, 5)
    : items.slice(0, 4).map((i) => ({ label: i.label, href: i.href }));
  const grupoActivo = activo?.grupo ?? 'General';
  const vecinos = items.filter((i) => (i.grupo ?? 'General') === grupoActivo).slice(0, 7);

  return (
    <section className="border-b border-slate-200 bg-white" data-imprimir="no">
      <div className="px-4 lg:px-6 py-3">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={modulo.href}
              className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
              style={{ background: modulo.bg, border: `1px solid ${modulo.border}` }}
              title={`Centro de ${modulo.nombre}`}
            >
              <modulo.Icono className="w-4.5 h-4.5" style={{ color: modulo.color }} />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link href={modulo.href} className="text-[13.5px] font-bold text-slate-900 hover:underline truncate">
                  {modulo.nombre}
                </Link>
                <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: modulo.color, background: modulo.bg }}>
                  Centro de trabajo
                </span>
              </div>
              <p className="text-[11.5px] text-slate-500 truncate">{modulo.desc}</p>
            </div>
          </div>

          <div className="xl:ml-auto flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0">
            <span className="hidden lg:flex items-center gap-1 text-[10.5px] font-semibold text-slate-400 mr-1 shrink-0">
              <Sparkles className="w-3 h-3" /> Acciones
            </span>
            {acciones.map((a, index) => {
              const destacada = a.principal || index === 0;
              const clases = `h-8 px-3 rounded-lg text-[11.5px] font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                destacada ? 'text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`;
              const estilo = destacada ? { background: modulo.color } : undefined;

              // Una acción de ventana no navega: abre. Si fuera un <Link>, el
              // área de trabajo cargaría la caja dentro de sí misma, que es
              // justo lo que se quiso evitar.
              if (a.ventana) {
                return (
                  <button
                    key={`${a.href}-${a.label}`}
                    type="button"
                    onClick={abrirPuntoDeVenta}
                    className={clases}
                    style={estilo}
                    title="Se abre en su propia ventana"
                  >
                    {a.label}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                );
              }

              return (
                <Link key={`${a.href}-${a.label}`} href={a.href} className={clases} style={estilo}>
                  {a.label}
                  {destacada && <ArrowRight className="w-3 h-3" />}
                </Link>
              );
            })}
          </div>
        </div>

        {vecinos.length > 1 && (
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto">
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-400 mr-1 whitespace-nowrap">
              <Grid2X2 className="w-3 h-3" /> {grupoActivo}
            </span>
            {vecinos.map((it) => {
              const esActivo = activo?.href === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`h-7 px-2.5 rounded-md text-[11.5px] whitespace-nowrap border transition-colors ${
                    esActivo
                      ? 'font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                  style={esActivo ? { color: modulo.color, background: modulo.bg, borderColor: modulo.border } : undefined}
                >
                  {it.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
