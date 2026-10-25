"use client";
/**
 * ============================================================================
 * SyncroERP · Ayuda y documentación
 * ----------------------------------------------------------------------------
 * El índice se arma con lo que ESTE lector puede abrir. Los cuatro documentos
 * técnicos —variables de entorno, claves de servicio, lo que falta por probar—
 * sólo los lista el servidor para el administrador, así que nadie ve aquí un
 * documento que al pulsarlo le va a contestar que no.
 * ============================================================================
 */

import Link from 'next/link';
import { BookOpen, FileText, Lock } from 'lucide-react';

import { api } from '@/lib/api';
import { useDatos } from '@/hooks/use-datos';
import { Cargando, EncabezadoPantalla, ErrorPantalla, Panel, SinDatos } from '@/components/ui';

import { useT } from '@/components/I18nProvider';
interface DocumentoListado {
  id: string;
  titulo: string;
  resumen: string;
  restringido: boolean;
  actualizado: string | null;
}

interface Respuesta {
  disponible: boolean;
  motivo?: string;
  documentos: DocumentoListado[];
}

const FECHA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function AyudaPage() {
  const t = useT();
  const lista = useDatos<Respuesta>(() => api.get<Respuesta>('/documentacion'), []);

  if (lista.cargando) return <Cargando />;
  if (lista.error) return <ErrorPantalla mensaje={t(lista.error)} onReintentar={lista.recargar} />;

  const datos = lista.datos;
  const documentos = datos?.documentos ?? [];

  return (
    <div className="max-w-5xl">
      <EncabezadoPantalla
        titulo={t("Ayuda y documentación")}
        descripcion={t("La documentación del sistema, tal como está en el repositorio. Se lee aquí o se descarga en PDF.")}
      />

      {/*
        * Cuando falta la carpeta, esto NO se queda vacío y en silencio: dice
        * dónde se buscó, que es lo único que le sirve a quien lo arregla.
        */}
      {datos && !datos.disponible && (
        <Panel className="mb-4">
          <div className="flex gap-3">
            <FileText className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[13px] text-slate-700">
              <p className="font-semibold text-slate-900 mb-1">
                
                {t("No se encontró la carpeta de documentación en el servidor.")}
              </p>
              <p className="text-slate-600">{t(datos.motivo)}</p>
            </div>
          </div>
        </Panel>
      )}

      {documentos.length === 0 ? (
        <SinDatos
          titulo={t("No hay documentos publicados")}
          descripcion={t("La documentación vive en la carpeta docs/ del repositorio del ERP.")}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {documentos.map((d) => (
            <Link
              key={d.id}
              href={`/dashboard/ayuda/${d.id}`}
              className="panel p-4 hover:border-slate-300 transition-colors block"
            >
              <div className="flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-slate-900">{t(d.titulo)}</h3>
                    {d.restringido && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                        title={t("Documentación técnica: sólo la ve el administrador del sistema.")}
                      >
                        <Lock className="w-3 h-3" />  {t("Técnica")}
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-slate-600 mt-1 leading-relaxed">{t(d.resumen)}</p>
                  {d.actualizado && (
                    <p className="text-[11px] text-slate-400 mt-2">
                      {t("Actualizado el {n0}", { n0: FECHA.format(new Date(d.actualizado)) })}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
