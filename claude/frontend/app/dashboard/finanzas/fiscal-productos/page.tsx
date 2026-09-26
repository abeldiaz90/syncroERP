"use client";
/**
 * ============================================================================
 * SyncroERP · Impuestos del catálogo
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTA PANTALLA
 *
 * El impuesto de un producto vive en su ficha, y esa ficha sólo la abre el
 * almacenista —el único rol con el módulo de inventario—, que a propósito no
 * tiene el catálogo de impuestos: quien acomoda mercancía no decide el IVA
 * aplicable.
 *
 * El resultado, medido el 26-sep-2026: nadie podía asignarle un impuesto a un
 * producto. Contabilidad lee los impuestos y no abre la ficha; el almacén abre
 * la ficha y no lee los impuestos. Cuatro de los siete productos del catálogo
 * llevaban meses sin impuesto — y un producto sin impuesto se vende con IVA
 * cero en silencio, que no es lo mismo que exento ni que tasa 0 %.
 *
 * Aquí Contabilidad ve el catálogo con lo único que le toca —qué impuesto lleva
 * cada producto y si tiene las claves del SAT— y lo deja facturable.
 * ============================================================================
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Receipt, RefreshCw } from "lucide-react";

import { api, ApiError } from "@/lib/api";

type Fila = {
  id: string;
  sku: string | null;
  nombre: string;
  activo: boolean;
  impuestoId: string | null;
  impuestoNombre: string | null;
  tipoFactor: "TASA" | "EXENTO" | "NO_OBJETO" | null;
  porcentaje: number | null;
  claveSAT: string | null;
  claveUnidadSAT: string | null;
  facturable: boolean;
};

type Impuesto = {
  id: string;
  nombre: string;
  porcentaje: number;
  tipoFactor: "TASA" | "EXENTO" | "NO_OBJETO";
  activo: boolean;
};

const ETIQUETA_FACTOR: Record<string, string> = {
  TASA: "Gravado",
  EXENTO: "Exento",
  NO_OBJETO: "No objeto",
};

export default function FiscalProductosPage() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [impuestos, setImpuestos] = useState<Impuesto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);

  /*
    Las dos consultas son de módulos distintos —el catálogo de productos es de
    Inventario y el de impuestos de Precios—, así que cada una responde por sí
    misma: que falte una no puede presentarse como un catálogo vacío.
  */
  const cargar = useCallback(async () => {
    setCargando(true);
    const problemas: string[] = [];
    const [p, i] = await Promise.all([
      api.get<Fila[]>("/catalogo/productos/fiscal").catch((e: unknown) => {
        problemas.push(
          e instanceof ApiError && e.esSinPermisos
            ? "Tu perfil no incluye el panel fiscal del catálogo."
            : "No se pudo consultar el catálogo de productos.",
        );
        return null;
      }),
      api.get<Impuesto[]>("/catalogo/impuestos").catch((e: unknown) => {
        problemas.push(
          e instanceof ApiError && e.esSinPermisos
            ? "Tu perfil no incluye el catálogo de impuestos: podrás ver el estado, no cambiarlo."
            : "No se pudo consultar el catálogo de impuestos.",
        );
        return null;
      }),
    ]);
    if (p) setFilas(p);
    if (i) setImpuestos(i.filter((x) => x.activo !== false));
    setError(problemas.join(" "));
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const asignar = async (fila: Fila, impuestoId: string) => {
    setGuardando(fila.id);
    setAviso(null);
    try {
      await api.patch(`/catalogo/productos/${fila.id}/impuesto`, {
        impuestoId: impuestoId || null,
      });
      const elegido = impuestos.find((x) => x.id === impuestoId) ?? null;
      setFilas((prev) =>
        prev.map((f) =>
          f.id === fila.id
            ? {
                ...f,
                impuestoId: impuestoId || null,
                impuestoNombre: elegido?.nombre ?? null,
                tipoFactor: elegido?.tipoFactor ?? null,
                porcentaje: elegido ? Number(elegido.porcentaje) : null,
                facturable: Boolean(
                  f.claveSAT && f.claveUnidadSAT && impuestoId,
                ),
              }
            : f,
        ),
      );
      setAviso({
        texto: elegido
          ? `«${fila.nombre}» queda como ${elegido.nombre}.`
          : `«${fila.nombre}» se quedó sin impuesto asignado: no se podrá facturar.`,
        ok: Boolean(elegido),
      });
    } catch (e) {
      setAviso({
        texto:
          e instanceof ApiError
            ? e.mensajeParaPantalla()
            : "No se pudo guardar el impuesto.",
        ok: false,
      });
    } finally {
      setGuardando(null);
    }
  };

  const resumen = useMemo(() => {
    const activos = filas.filter((f) => f.activo);
    return {
      total: activos.length,
      listos: activos.filter((f) => f.facturable).length,
      sinImpuesto: activos.filter((f) => !f.impuestoId).length,
      sinClaves: activos.filter((f) => !f.claveSAT || !f.claveUnidadSAT).length,
    };
  }, [filas]);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto text-slate-800">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">
            Finanzas
          </p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Receipt className="w-8 h-8 text-indigo-500" /> Impuestos del catálogo
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Qué impuesto lleva cada producto y si puede facturarse. Un producto
            sin impuesto asignado se vende con IVA cero sin que nadie lo haya
            decidido.
          </p>
        </div>
        <button
          onClick={() => void cargar()}
          className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm"
          aria-label="Actualizar"
        >
          <RefreshCw className={`w-4 h-4 ${cargando ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {aviso && (
        <div
          className={`mb-6 rounded-xl px-4 py-3 text-sm border ${
            aviso.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { t: "Productos activos", v: resumen.total, c: "text-slate-900" },
          { t: "Listos para facturar", v: resumen.listos, c: "text-emerald-600" },
          { t: "Sin impuesto asignado", v: resumen.sinImpuesto, c: "text-rose-600" },
          { t: "Sin claves del SAT", v: resumen.sinClaves, c: "text-amber-600" },
        ].map((k) => (
          <div
            key={k.t}
            className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
          >
            <p className="text-xs font-bold uppercase text-slate-500 mb-1">
              {k.t}
            </p>
            <p className={`text-2xl font-black tabular-nums ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Cargando catálogo…</p>
          </div>
        ) : error && filas.length === 0 ? (
          <div className="p-16 text-center text-rose-700 font-semibold">
            El catálogo no está vacío: no se pudo consultar.
          </div>
        ) : filas.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            No hay productos en el catálogo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Impuesto</th>
                  <th className="px-4 py-3">Claves SAT</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((f) => (
                  <tr key={f.id} className={f.activo ? "" : "opacity-50"}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{f.nombre}</p>
                      <p className="text-xs text-slate-400 font-mono">
                        {f.sku || "sin SKU"}
                        {!f.activo && " · dado de baja"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={f.impuestoId ?? ""}
                        disabled={guardando === f.id || impuestos.length === 0}
                        onChange={(e) => void asignar(f, e.target.value)}
                        className={`w-56 px-3 py-2 border rounded-lg text-sm bg-white ${
                          f.impuestoId
                            ? "border-slate-300"
                            : "border-rose-300 bg-rose-50"
                        }`}
                      >
                        <option value="">Sin impuesto asignado</option>
                        {impuestos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre} · {ETIQUETA_FACTOR[i.tipoFactor] ?? i.tipoFactor}
                          </option>
                        ))}
                      </select>
                      {impuestos.length === 0 && (
                        <p className="text-xs text-slate-400 mt-1">
                          Sin catálogo de impuestos no se puede cambiar.
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {f.claveSAT && f.claveUnidadSAT ? (
                        <span className="text-slate-600">
                          {f.claveSAT} · {f.claveUnidadSAT}
                        </span>
                      ) : (
                        <span className="text-amber-700">
                          {[
                            !f.claveSAT ? "falta clave de producto" : null,
                            !f.claveUnidadSAT ? "falta clave de unidad" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {f.facturable ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 text-xs font-bold">
                          <CheckCircle2 className="w-4 h-4" /> Facturable
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-rose-700 text-xs font-bold">
                          <AlertTriangle className="w-4 h-4" /> No facturable
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Las claves del SAT se capturan en la ficha del producto, en Datos
        generales; ahí las llena quien mantiene el catálogo. El impuesto se
        decide aquí, y es lo que distingue una venta gravada de una a tasa 0 %,
        de una exenta y de una que no es objeto del impuesto.
      </p>
    </div>
  );
}
