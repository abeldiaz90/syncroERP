"use client";
/**
 * ============================================================================
 * SyncroERP · Ayuda — lectura de un documento
 * ----------------------------------------------------------------------------
 * El HTML lo produce el servidor (`documentacion/markdown.ts`), que escapa todo
 * el texto ANTES de reconocer nada: lo único que genera etiquetas es ese
 * archivo, y los documentos son del propio repositorio, no texto que nadie
 * escriba desde fuera. Por eso el `dangerouslySetInnerHTML` de más abajo es
 * seguro, y por eso no se renderiza Markdown aquí: el PDF lo arma el servidor y
 * tienen que salir iguales.
 *
 * Dos formas de llevárselo, y las dos están porque una puede fallar:
 *   · **Descargar PDF** — lo compone el servidor. Es el que se ve bien.
 *   · **Imprimir** — el diálogo del navegador, que siempre existe. Si el
 *     servidor no tiene navegador para componer el PDF, el aviso lo dice y
 *     manda aquí, en vez de dejar un botón que falla sin explicar nada.
 * ============================================================================
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Lock, Printer } from 'lucide-react';

import { api, ApiError } from '@/lib/api';
import { useDatos } from '@/hooks/use-datos';
import { Boton, Cargando, EncabezadoPantalla, ErrorPantalla, useAvisos } from '@/components/ui';

interface EntradaIndice {
  nivel: number;
  texto: string;
  ancla: string;
}

interface Documento {
  id: string;
  titulo: string;
  resumen: string;
  restringido: boolean;
  actualizado: string;
  html: string;
  indice: EntradaIndice[];
}

const FECHA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const ESTILOS = `
        .doc {
          color: #1f2937;
          font-size: 14px;
          line-height: 1.68;
          max-width: 72ch;
        }
        .doc h1,
        .doc h2,
        .doc h3,
        .doc h4 {
          color: #0f172a;
          font-weight: 700;
          line-height: 1.3;
          scroll-margin-top: 1rem;
        }
        .doc h1 { font-size: 22px; margin: 1.8em 0 0.5em; }
        .doc h2 {
          font-size: 17px;
          margin: 2em 0 0.6em;
          padding-bottom: 0.35em;
          border-bottom: 1px solid #e2e8f0;
        }
        .doc h3 { font-size: 14.5px; margin: 1.5em 0 0.4em; }
        .doc h4 { font-size: 13.5px; margin: 1.2em 0 0.3em; color: #334155; }
        .doc > h1:first-child,
        .doc > h2:first-child { margin-top: 0; }
        .doc p { margin: 0.75em 0; }
        .doc ul, .doc ol { margin: 0.75em 0; padding-left: 1.35em; }
        .doc ul { list-style: disc; }
        .doc ol { list-style: decimal; }
        .doc li { margin: 0.3em 0; }
        .doc li > ul, .doc li > ol { margin: 0.3em 0; }
        .doc a { color: #1d4ed8; text-decoration: underline; text-underline-offset: 2px; }
        .doc a:hover { color: #1e40af; }
        .doc strong { font-weight: 650; color: #0f172a; }
        .doc code {
          font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
          font-size: 0.87em;
          background: #f1f5f9;
          color: #0f172a;
          padding: 0.1em 0.35em;
          border-radius: 4px;
          overflow-wrap: anywhere;
        }
        .doc pre {
          background: #0f172a;
          color: #e2e8f0;
          padding: 0.9em 1.1em;
          border-radius: 8px;
          overflow-x: auto;
          margin: 1em 0;
          font-size: 12.5px;
          line-height: 1.55;
        }
        .doc pre code { background: none; color: inherit; padding: 0; font-size: 1em; }
        .doc blockquote {
          margin: 1.1em 0;
          padding: 0.1em 0 0.1em 1.1em;
          border-left: 3px solid #cbd5e1;
          color: #475569;
        }
        .doc blockquote p:first-child { margin-top: 0; }
        .doc blockquote p:last-child { margin-bottom: 0; }
        .doc hr { border: 0; border-top: 1px solid #e2e8f0; margin: 2.2em 0; }
        .doc .tabla { overflow-x: auto; margin: 1.1em 0; }
        .doc table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
          min-width: 26rem;
        }
        .doc th, .doc td {
          border: 1px solid #e2e8f0;
          padding: 0.45em 0.65em;
          text-align: left;
          vertical-align: top;
        }
        .doc th { background: #f8fafc; font-weight: 650; color: #0f172a; white-space: nowrap; }
        .doc .casilla { font-family: 'Segoe UI Symbol', sans-serif; margin-right: 0.15em; }

        /* Imprimir desde el navegador da un documento, no una captura. */
        @media print {
          .no-imprimir,
          aside,
          header,
          nav { display: none !important; }
          .doc { max-width: none; font-size: 11pt; color: #000; }
          .doc pre { background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; }
          .doc h1, .doc h2, .doc h3, .doc h4 { break-after: avoid; }
          .doc .tabla, .doc tr, .doc pre, .doc blockquote { break-inside: avoid; }
        }
      `;

export default function DocumentoPage() {
  const id = String(useParams().id ?? '');
  const avisos = useAvisos();
  const [bajando, setBajando] = useState(false);

  const doc = useDatos<Documento>(() => api.get<Documento>(`/documentacion/${id}`), [id]);

  async function descargar() {
    setBajando(true);
    try {
      await api.descargar(`/documentacion/${id}/pdf`, `syncroerp-${id}.pdf`, {
        // Componer un documento largo tarda más que una consulta.
        timeoutMs: 120_000,
      });
    } catch (e) {
      /*
       * El servidor explica qué pasó y que se puede imprimir desde aquí. Se
       * enseña entero: un «no se pudo descargar» a secas deja a la persona sin
       * saber que hay otra salida a un clic.
       */
      avisos.avisar(
        e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo generar el PDF.',
        'error',
      );
    } finally {
      setBajando(false);
    }
  }

  if (doc.cargando) return <Cargando />;
  if (doc.error) {
    return (
      <div>
        <Link
          href="/dashboard/ayuda"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 hover:text-slate-800 mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Ayuda y documentación
        </Link>
        <ErrorPantalla mensaje={doc.error} onReintentar={doc.recargar} />
      </div>
    );
  }

  const d = doc.datos!;
  const secciones = d.indice.filter((e) => e.nivel === 2);

  return (
    <div className="max-w-6xl">
      <Link
        href="/dashboard/ayuda"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 hover:text-slate-800 mb-4 no-imprimir"
        prefetch={false}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Ayuda y documentación
      </Link>

      <div className="no-imprimir">
        <EncabezadoPantalla
          titulo={d.titulo}
          descripcion={`Actualizado el ${FECHA.format(new Date(d.actualizado))}`}
          acciones={
            <>
              <Boton
                variante="neutro"
                icono={<Printer className="w-3.5 h-3.5" />}
                onClick={() => window.print()}
              >
                Imprimir
              </Boton>
              <Boton
                variante="primario"
                cargando={bajando}
                icono={<Download className="w-3.5 h-3.5" />}
                onClick={() => void descargar()}
              >
                Descargar PDF
              </Boton>
            </>
          }
        />
        {d.restringido && (
          <p className="flex items-center gap-1.5 text-[11.5px] text-slate-500 -mt-2 mb-4">
            <Lock className="w-3 h-3" />
            Documentación técnica de la instalación. Sólo la ve el administrador del sistema.
          </p>
        )}
      </div>

      <div className="flex gap-8 items-start">
        {secciones.length > 2 && (
          <nav className="hidden xl:block w-56 shrink-0 sticky top-4 no-imprimir">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              En este documento
            </p>
            <ul className="space-y-1.5 border-l border-slate-200 pl-3">
              {secciones.map((s) => (
                <li key={s.ancla}>
                  <a
                    href={`#${s.ancla}`}
                    className="text-[12px] text-slate-500 hover:text-slate-900 leading-snug block"
                  >
                    {s.texto}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <article
          className="doc min-w-0 flex-1"
          // Seguro: el HTML lo compone el servidor escapando todo el texto.
          dangerouslySetInnerHTML={{ __html: d.html }}
        />
      </div>

      <style dangerouslySetInnerHTML={{ __html: ESTILOS }} />
    </div>
  );
}
