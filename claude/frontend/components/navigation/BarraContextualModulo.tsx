"use client";

import Link from 'next/link';
import { ArrowRight, Grid2X2, Sparkles } from 'lucide-react';
import type { ModuleAction, ModuleConfig, ModuleItem } from '@/app/dashboard/module-config';

interface Props {
  modulo: ModuleConfig;
  items: ModuleItem[];
  activo?: ModuleItem | null;
}

export function BarraContextualModulo({ modulo, items, activo }: Props) {
  const acciones: ModuleAction[] = modulo.acciones?.slice(0, 5) ?? items.slice(0, 4).map((i) => ({ label: i.label, href: i.href }));
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
            {acciones.map((a, index) => (
              <Link
                key={`${a.href}-${a.label}`}
                href={a.href}
                className={`h-8 px-3 rounded-lg text-[11.5px] font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                  a.principal || index === 0
                    ? 'text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                style={a.principal || index === 0 ? { background: modulo.color } : undefined}
              >
                {a.label}
                {(a.principal || index === 0) && <ArrowRight className="w-3 h-3" />}
              </Link>
            ))}
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
