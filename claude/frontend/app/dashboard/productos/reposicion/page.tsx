"use client";

/**
 * ============================================================================
 * Qué hay que reponer
 * ----------------------------------------------------------------------------
 * La pantalla que le faltaba al módulo.
 *
 * El ERP ya sabía qué había que reponer: `stockMinimo` y `puntoReorden` se
 * capturan en la ficha de cada producto y alimentan un endpoint de stock bajo.
 * Comprobado el 30-sep-2026: **ninguna pantalla lo llamaba**. Se pedía el dato
 * al usuario y nadie le avisaba nunca.
 *
 * Esto es lo que un encargado de ferretería o de abarrotes abre el lunes por la
 * mañana para decidir la compra del día, y por eso:
 *
 *  · Dispara por PUNTO DE REORDEN, no por mínimo. El punto de reorden es «pide
 *    ya, porque lo que queda se acaba antes de que llegue el pedido»; el mínimo
 *    es el suelo de seguridad. Disparar por el mínimo es pedir tarde siempre.
 *  · Dice CUÁNTO pedir, no sólo que falta. Con el múltiplo de compra aplicado:
 *    nadie compra 7 cajas cuando el proveedor vende de 12.
 *  · Separa AGOTADO de CRÍTICO y de BAJO, porque se trabajan distinto: uno es
 *    una venta que ya se perdió, el otro es una que todavía se puede salvar.
 *  · Y termina en una REQUISICIÓN de verdad, que es lo que convierte una lista
 *    en trabajo hecho. De ahí en adelante el circuito de compras ya existe.
 *
 * Dice además cuántos artículos NO pudo evaluar por no tener umbrales
 * configurados. Una lista de reposición que calla lo que no miró se lee como
 * «no falta nada más».
 * ============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, ClipboardList, Loader2, PackageX,
  RefreshCw, TrendingDown,
} from 'lucide-react';

import { api, ApiError } from '@/lib/api';

interface Renglon {
  id: string;
  sku: string;
  nombre: string;
  categoria: string | null;
  unidad: string | null;
  codigoProveedor: string | null;
  precioCompra: number;
  stockActual: number;
  stockMinimo: number;
  puntoReorden: number;
  stockMaximo: number;
  umbral: number;
  sugerido: number;
  costoSugerido: number;
  estado: 'AGOTADO' | 'CRITICO' | 'BAJO';
}

interface Resumen {
  total: number;
  agotados: number;
  criticos: number;
  bajos: number;
  costoEstimado: number;
  sinUmbralConfigurado: number;
  productosEvaluados: number;
}

const dinero = (n: number) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TONO = {
  AGOTADO: { fondo: 'bg-rose-50', borde: 'border-rose-200', texto: 'text-rose-700', etiqueta: 'Agotado' },
  CRITICO: { fondo: 'bg-amber-50', borde: 'border-amber-200', texto: 'text-amber-700', etiqueta: 'Bajo mínimo' },
  BAJO: { fondo: 'bg-slate-50', borde: 'border-slate-200', texto: 'text-slate-600', etiqueta: 'En reorden' },
} as const;

export default function ReposicionPage() {
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  /*
   * Un error no se enseña como una lista vacía. Con la consulta caída, «no hay
   * nada que reponer» es la frase más cara que puede decir esta pantalla.
   */
  const [error, setError] = useState('');
  const [soloCriticos, setSoloCriticos] = useState(false);
  const [elegidos, setElegidos] = useState<Record<string, number>>({});
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await api.get<{ renglones: Renglon[]; resumen: Resumen }>(
        '/catalogo/productos/reposicion',
        { query: soloCriticos ? { soloCriticos: '1' } : {} },
      );
      setRenglones(r.renglones);
      setResumen(r.resumen);
      setError('');
    } catch (e) {
      setRenglones([]);
      setResumen(null);
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : 'No se pudo consultar la reposición.',
      );
    }
    setCargando(false);
  };

  useEffect(() => { void cargar(); /* eslint-disable-next-line */ }, [soloCriticos]);

  /** Lo pedido para un renglón: 0 cuando no está elegido. */
  const pedido = (id: string) => elegidos[id] ?? 0;

  const seleccionados = useMemo(
    () => renglones.filter((r) => pedido(r.id) > 0),
    [renglones, elegidos],
  );
  const costoSeleccion = seleccionados.reduce(
    (a, r) => a + pedido(r.id) * r.precioCompra,
    0,
  );

  const alternar = (r: Renglon) =>
    setElegidos((prev) => {
      const copia = { ...prev };
      if (copia[r.id]) delete copia[r.id];
      else copia[r.id] = r.sugerido;
      return copia;
    });

  const todos = () =>
    setElegidos(
      seleccionados.length === renglones.length
        ? {}
        : Object.fromEntries(renglones.map((r) => [r.id, r.sugerido])),
    );

  const crearRequisicion = async () => {
    if (!seleccionados.length) return;
    setCreando(true);
    try {
      await api.post('/compras/requisiciones', {
        prioridad: seleccionados.some((r) => r.estado === 'AGOTADO')
          ? 'ALTA'
          : 'NORMAL',
        notas: `Reposición automática · ${seleccionados.length} artículo(s) bajo punto de reorden`,
        detalles: seleccionados.map((r) => ({
          productoId: r.id,
          cantidadSolicitada: pedido(r.id),
          notas: `Existencia ${r.stockActual}, reorden ${r.umbral}`,
        })),
      });
      setAviso({
        texto: `Requisición creada con ${seleccionados.length} artículo(s). Sigue en Compras → Requisiciones.`,
        ok: true,
      });
      setElegidos({});
    } catch (e) {
      /*
       * El motivo del servidor, no uno inventado aquí: si falta el
       * departamento —de donde salen los aprobadores— lo dice, y es algo que
       * el usuario no puede adivinar.
       */
      setAviso({
        texto:
          e instanceof ApiError
            ? e.mensajeParaPantalla()
            : 'No se pudo crear la requisición.',
        ok: false,
      });
    }
    setCreando(false);
  };

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <TrendingDown className="w-6 h-6 text-blue-600" /> Qué hay que reponer
          </h1>
          <p className="text-[13px] text-slate-500 mt-1 max-w-2xl">
            Artículos en su punto de reorden o por debajo. La cantidad sugerida
            llena hasta el máximo configurado y respeta el múltiplo de compra.
          </p>
        </div>
        <button
          onClick={() => void cargar()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </header>

      {aviso && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl border text-sm font-medium ${
            aviso.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { etiqueta: 'Agotados', valor: resumen.agotados, color: 'text-rose-600', detalle: 'sin una sola pieza' },
            { etiqueta: 'Bajo mínimo', valor: resumen.criticos, color: 'text-amber-600', detalle: 'por debajo del suelo' },
            { etiqueta: 'En punto de reorden', valor: resumen.bajos, color: 'text-slate-700', detalle: 'toca pedir ya' },
            { etiqueta: 'Compra estimada', valor: dinero(resumen.costoEstimado), color: 'text-blue-700', detalle: 'a costo de reposición' },
          ].map((k) => (
            <div key={k.etiqueta} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{k.etiqueta}</p>
              <p className={`text-2xl font-black mt-1 ${k.color}`}>{k.valor}</p>
              <p className="text-[11.5px] text-slate-400 mt-0.5">{k.detalle}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={soloCriticos}
            onChange={(e) => setSoloCriticos(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600"
          />
          Sólo agotados y bajo mínimo
        </label>
        {renglones.length > 0 && (
          <button onClick={todos} className="text-sm font-bold text-blue-600 hover:underline">
            {seleccionados.length === renglones.length ? 'Quitar todos' : 'Elegir todos'}
          </button>
        )}
      </div>

      {cargando ? (
        <div className="py-20 text-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" />
          <p className="font-bold">Revisando existencias…</p>
        </div>
      ) : error ? (
        <div className="py-16 text-center">
          <AlertTriangle className="w-12 h-12 text-rose-300 mx-auto mb-3" />
          <p className="text-lg font-black text-rose-700">{error}</p>
          <p className="text-sm text-slate-500 mt-1">
            La lista no está vacía: no se pudo consultar.
          </p>
        </div>
      ) : renglones.length === 0 ? (
        <div className="py-16 text-center">
          <PackageX className="w-14 h-14 text-slate-200 mx-auto mb-4" />
          <p className="text-xl font-black text-slate-700">
            {soloCriticos
              ? 'Nada agotado ni bajo mínimo'
              : 'Ningún artículo llegó a su punto de reorden'}
          </p>
          <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto">
            {resumen && resumen.sinUmbralConfigurado > 0 ? (
              <>
                Se evaluaron <b>{resumen.productosEvaluados}</b> artículos.{' '}
                <b>{resumen.sinUmbralConfigurado}</b> no se pudieron evaluar porque
                no tienen mínimo ni punto de reorden configurado: de ésos no se
                sabe nada.
              </>
            ) : (
              <>Se evaluaron todos los artículos con umbral configurado.</>
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  <tr>
                    <th className="px-4 py-3 w-10" />
                    <th className="px-4 py-3 text-left">Artículo</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-right">Existencia</th>
                    <th className="px-4 py-3 text-right">Reorden</th>
                    <th className="px-4 py-3 text-right">Máximo</th>
                    <th className="px-4 py-3 text-right">Pedir</th>
                    <th className="px-4 py-3 text-right">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {renglones.map((r) => {
                    const tono = TONO[r.estado];
                    const elegido = pedido(r.id) > 0;
                    return (
                      <tr key={r.id} className={elegido ? 'bg-blue-50/40' : ''}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={elegido}
                            onChange={() => alternar(r)}
                            className="w-4 h-4 rounded text-blue-600"
                            aria-label={`Incluir ${r.nombre} en la requisición`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900 leading-tight">{r.nombre}</p>
                          <p className="text-[11.5px] text-slate-400">
                            {r.sku}
                            {r.categoria ? ` · ${r.categoria}` : ''}
                            {r.codigoProveedor ? ` · prov. ${r.codigoProveedor}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-1 rounded-lg border text-[11px] font-bold ${tono.fondo} ${tono.borde} ${tono.texto}`}>
                            {tono.etiqueta}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-black ${r.estado === 'AGOTADO' ? 'text-rose-600' : 'text-slate-800'}`}>
                          {r.stockActual} <span className="text-[11px] font-medium text-slate-400">{r.unidad}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">{r.umbral}</td>
                        <td className="px-4 py-3 text-right text-slate-400">
                          {r.stockMaximo > 0 ? r.stockMaximo : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={elegidos[r.id] ?? r.sugerido}
                            onChange={(e) => {
                              const v = Math.max(0, Number(e.target.value) || 0);
                              setElegidos((prev) => {
                                const copia = { ...prev };
                                if (v > 0) copia[r.id] = v;
                                else delete copia[r.id];
                                return copia;
                              });
                            }}
                            className="w-24 px-2 py-1.5 text-right border border-slate-200 rounded-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {dinero((elegidos[r.id] ?? r.sugerido) * r.precioCompra)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {resumen && resumen.sinUmbralConfigurado > 0 && (
            <p className="mt-3 text-[12px] text-slate-500">
              Se evaluaron {resumen.productosEvaluados} artículos.{' '}
              <b>{resumen.sinUmbralConfigurado}</b> quedaron fuera por no tener
              mínimo ni punto de reorden configurado: esta lista no dice nada
              sobre ellos.
            </p>
          )}

          <div className="sticky bottom-4 mt-5 bg-white border border-slate-200 rounded-2xl shadow-lg px-5 py-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-800">
                {seleccionados.length === 0
                  ? 'Elige qué pedir'
                  : `${seleccionados.length} artículo(s) · ${dinero(costoSeleccion)}`}
              </p>
              <p className="text-[12px] text-slate-500">
                La requisición sale a nombre de tu departamento y sigue el circuito
                normal de aprobación.
              </p>
            </div>
            <button
              onClick={() => void crearRequisicion()}
              disabled={!seleccionados.length || creando}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              Crear requisición
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
