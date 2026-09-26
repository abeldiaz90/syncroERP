"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { abrirPuntoDeVenta } from '@/lib/pos';
import { useParams } from 'next/navigation';
import { ArrowRight, Layers3, Link2, Sparkles, ExternalLink } from 'lucide-react';
import { MODULOS, agruparItems } from '../../module-config';
import { api, intentar, token } from '@/lib/api';
import { esRolAdministrador } from '@/lib/roles';
import { leerSesion, puedeVerEnlace } from '@/lib/session';
import { usePermiso } from '@/hooks/use-permisos';
import { useContratacion, contratado } from '@/lib/contratacion';

export default function CentroModuloPage() {
  const params = useParams<{ modulo: string }>();
  const modulo = useMemo(() => MODULOS.find((m) => m.id === params.modulo), [params.modulo]);
  const [permisos, setPermisos] = useState<string[] | null>(null);
  const { tienePermiso } = usePermiso();
  /*
   * Lo contratado se pregunta aquí igual que en el menú lateral: el centro de
   * trabajo es la otra puerta al mismo sitio, y filtrar sólo una de las dos
   * deja la pantalla ofrecida por la que se olvidó.
   */
  const plan = useContratacion();

  useEffect(() => {
    let vivo = true;
    (async () => {
      const sesion = leerSesion(token.get());
      if (esRolAdministrador(sesion?.rol)) {
        if (vivo) setPermisos(['*']);
        return;
      }
      /*
       * Un fallo de la consulta NO es una lista vacía de permisos. Envuelta en
       * `intentar(..., { rutas: [] })`, un backend reiniciándose dejaba el
       * centro de trabajo sin un solo enlace, igual que si al usuario le
       * hubieran quitado el módulo entero. `permisos` se queda en null —que
       * esta pantalla ya trata como «todavía no se sabe»— y no se pinta un
       * vacío que miente.
       */
      try {
        const r = await api.get<{ rutas?: string[] }>('/admin/permisos/mis-rutas');
        if (vivo) setPermisos(r.rutas ?? []);
      } catch {
        if (vivo) setPermisos(null);
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (!modulo) return <div className="p-8">Módulo no encontrado.</div>;
  const items = modulo.items.filter(
    (i) =>
      !i.oculto && puedeVerEnlace(permisos, i.href) && contratado(plan, i),
  );
  const grupos = agruparItems(items);
  /*
   * Un botón de la barra se ofrece solo si la persona puede EJECUTARLO.
   *
   * `ModuleAction.accion` declara la acción de servidor que dispara cada
   * botón, y existe justamente para esto —"abrir no es poder"—, pero hasta
   * hoy ningún componente lo lea: el campo estaba declarado, documentado y
   * muerto. El filtro miraba solo la ruta de pantalla.
   *
   * Se vio el 21-sep-2026 con el comprador: al vedarle recibir la mercancía
   * que él mismo ordena, el permiso quedó en false y el botón "Recibir compra"
   * siguió apareciendo, porque la pantalla de recepciones sí la puede abrir
   * para consultar. Habría llegado hasta el 403 al confirmar la recepción.
   *
   * Las acciones de ventana (la caja) no pasan por el filtro de rutas: no son
   * una pantalla del área de trabajo. Lo que se puede hacer DENTRO lo sigue
   * decidiendo el servidor, acción por acción; esto solo evita ofrecer el
   * camino a una negativa.
   */
  const acciones = (modulo.acciones ?? []).filter((a) => {
    if (a.accion && !tienePermiso(a.accion.metodo, a.accion.ruta)) return false;
    return a.ventana || puedeVerEnlace(permisos, a.href);
  });
  const relacionados = (modulo.relacionados ?? []).filter((a) => puedeVerEnlace(permisos, a.href));

  return (
    <div className="p-5 lg:p-8 max-w-[1380px] mx-auto space-y-6">
      <header className="rounded-2xl border p-6" style={{ borderColor: modulo.border, background: `linear-gradient(135deg, ${modulo.bg}, white 65%)` }}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: 'white', border: `1px solid ${modulo.border}` }}>
            <modulo.Icono className="w-6 h-6" style={{ color: modulo.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: modulo.color }}>Centro de trabajo</p>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">{modulo.nombre}</h1>
            <p className="text-[13px] text-slate-600 mt-1 max-w-2xl">{modulo.desc}. Desde aquí tienes a la mano las tareas, catálogos y procesos relacionados.</p>
          </div>
        </div>

        {acciones.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {acciones.map((a, index) => {
              const destacada = index === 0 || a.principal;
              const clases = `rounded-xl px-4 py-3 min-w-[170px] border transition-shadow hover:shadow-sm text-left ${destacada ? 'text-white border-transparent' : 'bg-white text-slate-800 border-slate-200'}`;
              const estilo = destacada ? { background: modulo.color } : undefined;
              const cuerpo = (
                <>
                  <span className="flex items-center justify-between gap-3 text-[12.5px] font-bold">
                    {a.label}
                    {a.ventana ? <ExternalLink className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  </span>
                  {a.descripcion && <span className={`block text-[11px] mt-1 ${destacada ? 'text-white/75' : 'text-slate-500'}`}>{a.descripcion}</span>}
                </>
              );
              return a.ventana ? (
                <button key={a.href} type="button" onClick={abrirPuntoDeVenta} className={clases} style={estilo} title="Se abre en su propia ventana">
                  {cuerpo}
                </button>
              ) : (
                <Link key={a.href} href={a.href} className={clases} style={estilo}>
                  {cuerpo}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      <section>
        <div className="flex items-center gap-2 mb-3"><Layers3 className="w-4 h-4 text-slate-500" /><h2 className="text-[14px] font-bold text-slate-900">Todo el módulo</h2></div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {grupos.map(([grupo, opciones]) => (
            <div key={grupo} className="panel p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2.5">{grupo}</p>
              <div className="space-y-1">
                {opciones.map((it) => (
                  <Link key={it.href} href={it.href} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 text-[12.5px] text-slate-700">
                    <span>{it.label}</span><ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {relacionados.length > 0 && (
        <section className="panel p-4">
          <div className="flex items-center gap-2 mb-3"><Link2 className="w-4 h-4 text-slate-500" /><h2 className="text-[14px] font-bold text-slate-900">Procesos relacionados</h2></div>
          <div className="flex flex-wrap gap-2">
            {relacionados.map((a) => <Link key={a.href} href={a.href} className="btn btn-neutro btn-sm"><Sparkles className="w-3 h-3" />{a.label}</Link>)}
          </div>
        </section>
      )}
    </div>
  );
}
