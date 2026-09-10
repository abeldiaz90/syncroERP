"use client";
import Link from 'next/link';
import {
  BarChart2, Package, ShoppingCart, DollarSign,
  TrendingUp, FileText, Users, Receipt
} from 'lucide-react';

const REPORTES = [
  {
    href:    '/dashboard/reportes/ventas',
    icon:    BarChart2,
    titulo:  'Ventas por Período',
    desc:    'Ventas totales, por cliente, por método de pago y por producto.',
    color:   '#4f46e5',
    badge:   'Gerencia',
  },
  {
    href:    '/dashboard/reportes/inventario',
    icon:    Package,
    titulo:  'Inventario Valorizado',
    desc:    'Stock actual × costo unitario = valor total en almacén.',
    color:   '#059669',
    badge:   'Almacén',
  },
  {
    href:    '/dashboard/reportes/compras',
    icon:    ShoppingCart,
    titulo:  'Compras por Período',
    desc:    'Órdenes de compra, por proveedor y por producto.',
    color:   '#0891b2',
    badge:   'Compras',
  },
  {
    href:    '/dashboard/reportes/corte-caja',
    icon:    Receipt,
    titulo:  'Corte de Caja',
    desc:    'Resumen de ingresos y egresos de efectivo del día.',
    color:   '#d97706',
    badge:   'Caja',
  },
  {
    href:    '/dashboard/reportes/top-productos',
    icon:    TrendingUp,
    titulo:  'Top Productos',
    desc:    'Los productos más vendidos por cantidad e importe.',
    color:   '#db2777',
    badge:   'Ventas',
  },
  {
    href:    '/dashboard/reportes/estado-cuenta',
    icon:    Users,
    titulo:  'Estado de Cuenta',
    desc:    'Ventas, abonos y saldo pendiente por cliente.',
    color:   '#7c3aed',
    badge:   'Cobranza',
  },
  {
    href:    '/dashboard/reportes/ejecutivo',
    icon:    BarChart2,
    titulo:  'Dashboard Ejecutivo',
    desc:    'KPIs en tiempo real, alertas, gráfica 30 días y top productos.',
    color:   '#0f172a',
    badge:   'Gerencia',
  },
];

export default function ReportesHubPage() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Sistema</p>
        <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
          <FileText className="w-8 h-8 text-indigo-500"/> Centro de Reportes
        </h1>
        <p className="text-slate-500 text-sm mt-1">Todos los reportes gerenciales y operativos en un solo lugar.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {REPORTES.map(r => {
          const Icon = r.icon;
          return (
            <Link key={r.href} href={r.href}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: r.color + '15' }}>
                  <Icon className="w-6 h-6" style={{ color: r.color }}/>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full border"
                  style={{ color: r.color, borderColor: r.color + '40', background: r.color + '10' }}>
                  {r.badge}
                </span>
              </div>
              <h3 className="font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">
                {r.titulo}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">{r.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
