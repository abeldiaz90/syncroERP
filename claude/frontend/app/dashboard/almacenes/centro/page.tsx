"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Boxes, ClipboardCheck, MapPin, PackageCheck, Repeat2, ScanLine, Warehouse } from 'lucide-react';
import { api, intentar } from '@/lib/api';
import { usePermiso } from '@/hooks/use-permisos';

interface Integridad { total?: number; diferencias?: unknown[]; data?: unknown[] }
interface Pendiente { total?: number }

/*
 * Cada operación declara la acción de servidor que dispara.
 *
 * Esta lista estaba fija y SIN filtro de ninguna clase: no por permiso de
 * acción y ni siquiera por permiso de pantalla. Cualquier rol que llegara al
 * centro WMS veía las seis operaciones, incluidas «Ajuste o merma» y
 * «Transferir». Verificado el 21-sep-2026 con el comprador, que tiene las seis
 * escrituras de inventario negadas y a quien además se le acababa de vedar
 * recibir: el centro de Compras ya no le ofrecía «Recibir compra», y esta
 * pantalla se la seguía ofreciendo. Dos puertas al mismo cuarto, una cerrada.
 *
 * «Consultar stock» no lleva acción: mirar existencias es lectura, y el
 * permiso de pantalla es el filtro que corresponde.
 */
const accesos: Array<{
  label: string;
  detalle: string;
  href: string;
  Icono: typeof PackageCheck;
  accion?: { metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; ruta: string };
}> = [
  { label: 'Recibir mercancía', detalle: 'Órdenes listas para recepción', href: '/dashboard/inventario/recepciones', Icono: PackageCheck,
    accion: { metodo: 'PATCH', ruta: '/api/compras/ordenes/:id/recibir' } },
  { label: 'Transferir', detalle: 'Mover entre almacenes', href: '/dashboard/inventario/transferencias', Icono: Repeat2,
    accion: { metodo: 'POST', ruta: '/api/catalogo/wms/transferencias' } },
  { label: 'Reubicar', detalle: 'Mover entre posiciones', href: '/dashboard/inventario/reubicaciones', Icono: MapPin,
    accion: { metodo: 'POST', ruta: '/api/catalogo/wms/reubicaciones' } },
  { label: 'Conteo físico', detalle: 'Conteos y reconteos', href: '/dashboard/inventario/conteos', Icono: ClipboardCheck,
    accion: { metodo: 'POST', ruta: '/api/catalogo/wms/conteos' } },
  { label: 'Consultar stock', detalle: 'Existencias por ubicación y lote', href: '/dashboard/almacenes/existencias', Icono: Boxes },
  { label: 'Ajuste o merma', detalle: 'Regularización controlada', href: '/dashboard/inventario/ajustes', Icono: ScanLine,
    accion: { metodo: 'POST', ruta: '/api/catalogo/inventario/productos/ajuste' } },
];

export default function CentroAlmacenes() {
  const [diferencias, setDiferencias] = useState<number | null>(null);
  const [transferencias, setTransferencias] = useState<number | null>(null);
  const { tienePermiso } = usePermiso();

  useEffect(() => {
    let vivo = true;
    Promise.all([
      intentar(api.get<Integridad>('/catalogo/wms/integridad-ubicaciones'), null),
      intentar(api.get<Pendiente>('/configuracion/pendientes'), null),
    ]).then(([i, p]) => {
      if (!vivo) return;
      /*
       * Un indicador que no se pudo leer vale «no lo sé», nunca cero.
       *
       * /configuracion/pendientes responde 403 a quien no administra la
       * configuración —el comprador, por ejemplo—; `intentar` devolvía `{}` y
       * `Number(undefined ?? 0)` pintaba un 0 redondo. El tablero afirmaba
       * «Pendientes operativos: 0» sobre un dato que nunca llegó a leer.
       *
       * El otro KPI ya distinguía el caso con `=== null ? '—'`. Este no podía
       * llegar nunca a null porque el respaldo era un objeto.
       */
      const lista = i === null ? null : (Array.isArray(i) ? i : (i.diferencias ?? i.data ?? []));
      setDiferencias(lista === null ? null : (Array.isArray(lista) ? lista.length : Number(i!.total ?? 0)));
      setTransferencias(p === null || p.total === undefined ? null : Number(p.total));
    });
    return () => { vivo = false; };
  }, []);

  const accesosVisibles = accesos.filter(
    (a) => !a.accion || tienePermiso(a.accion.metodo, a.accion.ruta),
  );

  return (
    <div className="p-5 lg:p-8 max-w-[1380px] mx-auto space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600">WMS · Centro operativo</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Almacenes</h1>
          <p className="text-[13px] text-slate-500 mt-1">Todo lo necesario para recibir, localizar, mover, contar y surtir mercancía.</p>
        </div>
        <Link href="/dashboard/almacenes/existencias" className="btn btn-primario">Ver existencias <ArrowRight className="w-3.5 h-3.5" /></Link>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Integridad física" value={diferencias === null ? '—' : diferencias === 0 ? 'Sin diferencias' : `${diferencias} diferencias`} Icono={diferencias ? AlertTriangle : Warehouse} alerta={Boolean(diferencias)} />
        <Kpi label="Pendientes operativos" value={transferencias === null ? '—' : String(transferencias)} Icono={Repeat2} />
        <Kpi label="Control principal" value="Ubicación + lote" Icono={MapPin} />
        <Kpi label="Método de salida" value="FEFO localizado" Icono={Boxes} />
      </div>

      <section>
        <h2 className="text-[14px] font-bold text-slate-900 mb-3">Operaciones frecuentes</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {accesosVisibles.map(({ label, detalle, href, Icono }) => (
            <Link key={href} href={href} className="panel p-4 flex items-center gap-3 group hover:shadow-md transition-shadow">
              <span className="w-10 h-10 rounded-xl bg-emerald-50 grid place-items-center"><Icono className="w-5 h-5 text-emerald-600" /></span>
              <span className="min-w-0"><span className="block text-[13px] font-bold text-slate-900">{label}</span><span className="block text-[11.5px] text-slate-500 mt-0.5">{detalle}</span></span>
              <ArrowRight className="w-4 h-4 text-slate-300 ml-auto group-hover:text-emerald-600" />
            </Link>
          ))}
        </div>
      </section>

      <section className="grid lg:grid-cols-3 gap-3">
        <Bloque titulo="Entradas" links={[
          ['Recepciones de compra', '/dashboard/inventario/recepciones'],
          ['Transferencias por recibir', '/dashboard/inventario/transferencias'],
          ['Stock inicial', '/dashboard/inventario/stock-inicial'],
        ]} />
        <Bloque titulo="Control físico" links={[
          ['Existencias por posición', '/dashboard/almacenes/existencias'],
          ['Conteos físicos', '/dashboard/inventario/conteos'],
          ['Ubicaciones', '/dashboard/inventario/ubicaciones'],
        ]} />
        <Bloque titulo="Salidas y movimientos" links={[
          ['Transferencias', '/dashboard/inventario/transferencias'],
          ['Reubicaciones', '/dashboard/inventario/reubicaciones'],
          ['Ajustes y mermas', '/dashboard/inventario/ajustes'],
        ]} />
      </section>
    </div>
  );
}

function Kpi({ label, value, Icono, alerta = false }: { label: string; value: string; Icono: typeof Warehouse; alerta?: boolean }) {
  return <div className="panel p-4"><div className="flex items-center gap-2 text-[11.5px] text-slate-500"><Icono className={`w-4 h-4 ${alerta ? 'text-amber-500' : 'text-emerald-600'}`} />{label}</div><p className="text-[16px] font-bold text-slate-900 mt-2">{value}</p></div>;
}
function Bloque({ titulo, links }: { titulo: string; links: [string, string][] }) {
  return <div className="panel p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">{titulo}</p>{links.map(([l,h]) => <Link key={h} href={h} className="flex items-center justify-between py-2.5 text-[12.5px] text-slate-700 hover:text-emerald-700 border-b border-slate-100 last:border-0">{l}<ArrowRight className="w-3.5 h-3.5" /></Link>)}</div>;
}
