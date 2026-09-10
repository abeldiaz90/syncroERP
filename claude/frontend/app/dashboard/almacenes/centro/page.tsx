"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Boxes, ClipboardCheck, MapPin, PackageCheck, Repeat2, ScanLine, Warehouse } from 'lucide-react';
import { api, intentar } from '@/lib/api';

interface Integridad { total?: number; diferencias?: unknown[]; data?: unknown[] }
interface Pendiente { total?: number }

const accesos = [
  { label: 'Recibir mercancía', detalle: 'Órdenes listas para recepción', href: '/dashboard/inventario/recepciones', Icono: PackageCheck },
  { label: 'Transferir', detalle: 'Mover entre almacenes', href: '/dashboard/inventario/transferencias', Icono: Repeat2 },
  { label: 'Reubicar', detalle: 'Mover entre posiciones', href: '/dashboard/inventario/reubicaciones', Icono: MapPin },
  { label: 'Conteo físico', detalle: 'Conteos y reconteos', href: '/dashboard/inventario/conteos', Icono: ClipboardCheck },
  { label: 'Consultar stock', detalle: 'Existencias por ubicación y lote', href: '/dashboard/almacenes/existencias', Icono: Boxes },
  { label: 'Ajuste o merma', detalle: 'Regularización controlada', href: '/dashboard/inventario/ajustes', Icono: ScanLine },
];

export default function CentroAlmacenes() {
  const [diferencias, setDiferencias] = useState<number | null>(null);
  const [transferencias, setTransferencias] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      intentar(api.get<Integridad>('/catalogo/wms/integridad-ubicaciones'), {}),
      intentar(api.get<Pendiente>('/configuracion/pendientes'), {}),
    ]).then(([i, p]) => {
      if (!vivo) return;
      const lista = Array.isArray(i) ? i : (i.diferencias ?? i.data ?? []);
      setDiferencias(Array.isArray(lista) ? lista.length : Number(i.total ?? 0));
      setTransferencias(Number(p.total ?? 0));
    });
    return () => { vivo = false; };
  }, []);

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
          {accesos.map(({ label, detalle, href, Icono }) => (
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
