"use client";

import { useMemo, useState } from "react";
import { confirmarElegante } from '@/components/ui/dialogos';
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Package,
  RefreshCw,
  Scale,
  Users,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useDatos } from "@/hooks/use-datos";

type ClaveArea = "CAJA" | "BANCOS" | "CLIENTES" | "PROVEEDORES" | "INVENTARIO";
type EstadoResolucion = "CONFIRMADA" | "JUSTIFICADA" | "REQUIERE_AJUSTE";

interface Detalle {
  id: string;
  nombre: string;
  referencia?: string;
  numeroCuenta?: string;
  documentos?: number;
  cantidad?: number;
  saldo: number;
  vinculada?: boolean;
  lotesCostoCero?: number;
}

interface Area {
  clave: ClaveArea;
  titulo: string;
  saldoContable: number;
  saldoAuxiliar: number;
  diferencia: number;
  disponible: boolean;
  cuadra: boolean;
  detalle: Detalle[];
  advertencias: string[];
}

interface Resolucion {
  estado: EstadoResolucion;
  justificacion?: string;
  fecha: string;
}

interface Conciliacion {
  id: string;
  fechaCorte: string;
  estado: "BORRADOR" | "CON_DIFERENCIAS" | "CONCILIADA";
  version: number;
  snapshot: {
    fechaCorte: string;
    generadoEn: string;
    areas: Area[];
    resumen: {
      cuadradas: number;
      conDiferencia: number;
      sinEvidencia: number;
    };
  };
  resoluciones: Partial<Record<ClaveArea, Resolucion>>;
  fechaCreacion: string;
  fechaConfirmacion?: string | null;
}

const iconos = {
  CAJA: Banknote,
  BANCOS: Building2,
  CLIENTES: Users,
  PROVEEDORES: ClipboardCheck,
  INVENTARIO: Package,
};

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function mensajeError(error: unknown) {
  return error instanceof ApiError
    ? error.mensajeParaPantalla()
    : "No se pudo completar la operación.";
}

function etiquetaResolucion(estado?: EstadoResolucion) {
  if (estado === "CONFIRMADA") return "Coincide";
  if (estado === "JUSTIFICADA") return "Diferencia justificada";
  if (estado === "REQUIERE_AJUSTE") return "Requiere corrección";
  return "Pendiente de revisión";
}

export default function ConciliacionInicialPage() {
  const consulta = useDatos<Conciliacion | null>(
    () => api.get("/finanzas/conciliacion-inicial"),
    [],
  );
  const [abierta, setAbierta] = useState<ClaveArea | null>(null);
  const [justificaciones, setJustificaciones] = useState<
    Partial<Record<ClaveArea, string>>
  >({});
  const [procesando, setProcesando] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const conciliacion = consulta.datos;

  const pendientes = useMemo(() => {
    if (!conciliacion) return 0;
    return conciliacion.snapshot.areas.filter(
      (area) => !conciliacion.resoluciones[area.clave],
    ).length;
  }, [conciliacion]);

  const requiereAjuste = useMemo(
    () =>
      (Object.values(conciliacion?.resoluciones ?? {}) as Resolucion[]).some(
        (resolucion) => resolucion?.estado === "REQUIERE_AJUSTE",
      ),
    [conciliacion],
  );

  async function iniciar(recalcular = false) {
    if (
      recalcular &&
      !await confirmarElegante(
        "Se tomará una nueva fotografía y se reiniciarán las revisiones de esta pantalla. No se borran pólizas ni movimientos. ¿Continuar?",
      )
    ) {
      return;
    }
    setProcesando("iniciar");
    setErrorAccion(null);
    try {
      await api.post("/finanzas/conciliacion-inicial/iniciar", {
        fechaCorte: hoyLocal(),
      });
      setAbierta(null);
      setJustificaciones({});
      await consulta.recargar();
    } catch (error) {
      setErrorAccion(mensajeError(error));
    } finally {
      setProcesando(null);
    }
  }

  async function resolver(area: Area, estado: EstadoResolucion) {
    if (!conciliacion) return;
    const justificacion = justificaciones[area.clave]?.trim();
    if (estado !== "CONFIRMADA" && (!justificacion || justificacion.length < 10)) {
      setErrorAccion(
        "Explica la diferencia o la corrección necesaria con al menos 10 caracteres.",
      );
      return;
    }
    setProcesando(area.clave);
    setErrorAccion(null);
    try {
      await api.put(
        `/finanzas/conciliacion-inicial/${conciliacion.id}/areas/${area.clave}`,
        { estado, justificacion },
      );
      await consulta.recargar();
    } catch (error) {
      setErrorAccion(mensajeError(error));
    } finally {
      setProcesando(null);
    }
  }

  async function confirmar() {
    if (!conciliacion) return;
    setProcesando("confirmar");
    setErrorAccion(null);
    try {
      await api.post(
        `/finanzas/conciliacion-inicial/${conciliacion.id}/confirmar`,
      );
      await consulta.recargar();
    } catch (error) {
      setErrorAccion(mensajeError(error));
    } finally {
      setProcesando(null);
    }
  }

  if (consulta.cargando) {
    return (
      <div className="p-10 max-w-6xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <RefreshCw className="w-7 h-7 animate-spin text-violet-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Preparando la revisión de saldos…</p>
        </div>
      </div>
    );
  }

  if (consulta.error) {
    return (
      <div className="p-10 max-w-6xl mx-auto">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
          <p className="font-semibold text-rose-800">{consulta.error}</p>
          <button
            onClick={() => void consulta.recargar()}
            className="mt-4 px-4 py-2 rounded-xl bg-white border border-rose-200 text-sm font-semibold text-rose-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-600 mb-1">
            Finanzas · revisión guiada
          </p>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
            <Scale className="w-7 h-7 text-violet-600" />
            Conciliación inicial
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Compara la contabilidad con cajas, bancos, clientes, proveedores e
            inventario, una sección a la vez.
          </p>
        </div>
        {conciliacion && (
          <button
            disabled={procesando !== null}
            onClick={() => void iniciar(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Tomar nueva fotografía
          </button>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 text-sm text-blue-900">
        <p className="font-bold">Esta revisión no crea ni modifica pólizas.</p>
        <p className="text-blue-700 mt-1">
          Guarda una fotografía y tus decisiones. Si hay diferencias, primero
          identifica la causa; el sistema no inventará un asiento para forzar el
          balance.
        </p>
      </div>

      {errorAccion && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 mb-5 text-sm">
          {errorAccion}
        </div>
      )}

      {!conciliacion ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 md:p-12 text-center">
          <ClipboardCheck className="w-12 h-12 text-violet-500 mx-auto mb-4" />
          <h2 className="text-xl font-black text-slate-900">
            Revisemos que tus saldos coincidan
          </h2>
          <p className="text-sm text-slate-500 max-w-xl mx-auto mt-2">
            Usaremos los saldos actuales del día de hoy. Podrás revisar el detalle
            y explicar cualquier diferencia antes de confirmar.
          </p>
          <button
            disabled={procesando !== null}
            onClick={() => void iniciar()}
            className="mt-6 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50"
          >
            {procesando === "iniciar" ? "Calculando…" : "Comenzar revisión"}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Resumen
              etiqueta="Coinciden"
              valor={conciliacion.snapshot.resumen.cuadradas}
              color="text-emerald-600"
            />
            <Resumen
              etiqueta="Con diferencia"
              valor={conciliacion.snapshot.resumen.conDiferencia}
              color="text-amber-600"
            />
            <Resumen
              etiqueta="Sin evidencia"
              valor={conciliacion.snapshot.resumen.sinEvidencia}
              color="text-slate-500"
            />
            <Resumen
              etiqueta="Por revisar"
              valor={pendientes}
              color="text-violet-600"
            />
          </div>

          {conciliacion.estado === "CONCILIADA" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mb-5 flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold text-emerald-900">Revisión concluida</p>
                <p className="text-sm text-emerald-700 mt-0.5">
                  Todas las áreas fueron revisadas. La fotografía y las
                  justificaciones quedaron guardadas como evidencia.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {conciliacion.snapshot.areas.map((area) => {
              const Icono = iconos[area.clave];
              const resolucion = conciliacion.resoluciones[area.clave];
              const expandida = abierta === area.clave;
              const bloqueada = conciliacion.estado === "CONCILIADA";
              return (
                <section
                  key={area.clave}
                  className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setAbierta(expandida ? null : area.clave)}
                    className="w-full p-4 md:p-5 text-left flex items-center gap-4 hover:bg-slate-50"
                  >
                    <span
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        resolucion?.estado === "REQUIERE_AJUSTE"
                          ? "bg-rose-50 text-rose-600"
                          : area.cuadra
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      <Icono className="w-5 h-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-bold text-slate-900 block">
                        {area.titulo}
                      </span>
                      <span className="text-xs text-slate-500">
                        {etiquetaResolucion(resolucion?.estado)}
                      </span>
                    </span>
                    <span className="hidden md:grid grid-cols-3 gap-7 text-right">
                      <Cifra etiqueta="Contabilidad" valor={area.saldoContable} />
                      <Cifra etiqueta="Auxiliar" valor={area.saldoAuxiliar} />
                      <Cifra etiqueta="Diferencia" valor={area.diferencia} />
                    </span>
                    {expandida ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {expandida && (
                    <div className="border-t border-slate-100 p-4 md:p-5">
                      <div className="md:hidden grid grid-cols-3 gap-2 mb-4">
                        <Cifra etiqueta="Contabilidad" valor={area.saldoContable} />
                        <Cifra etiqueta="Auxiliar" valor={area.saldoAuxiliar} />
                        <Cifra etiqueta="Diferencia" valor={area.diferencia} />
                      </div>

                      {!area.disponible && (
                        <Aviso>
                          No hay movimientos o saldos auxiliares suficientes para
                          comprobar esta sección automáticamente. Esto no significa
                          que el saldo sea cero.
                        </Aviso>
                      )}
                      {area.advertencias.map((texto) => (
                        <Aviso key={texto}>{texto}</Aviso>
                      ))}

                      {area.detalle.length > 0 && (
                        <div className="border border-slate-200 rounded-xl overflow-x-auto mb-4">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="text-left px-4 py-2.5">Detalle auxiliar</th>
                                <th className="text-right px-4 py-2.5">Documentos</th>
                                <th className="text-right px-4 py-2.5">Saldo</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {area.detalle.map((item) => (
                                <tr key={item.id}>
                                  <td className="px-4 py-3">
                                    <p className="font-medium text-slate-800">
                                      {item.nombre}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                      {item.referencia || item.numeroCuenta || ""}
                                    </p>
                                  </td>
                                  <td className="px-4 py-3 text-right text-slate-500">
                                    {item.documentos ?? "—"}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                    {moneda.format(item.saldo)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {resolucion?.justificacion && (
                        <div className="bg-slate-50 rounded-xl p-3 mb-4 text-sm">
                          <p className="text-xs font-bold uppercase text-slate-500 mb-1">
                            Explicación guardada
                          </p>
                          <p className="text-slate-700">{resolucion.justificacion}</p>
                        </div>
                      )}

                      {!bloqueada && (
                        <div>
                          {area.cuadra && area.disponible ? (
                            <button
                              disabled={procesando !== null}
                              onClick={() => void resolver(area, "CONFIRMADA")}
                              className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
                            >
                              Confirmar que coincide
                            </button>
                          ) : (
                            <>
                              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                ¿Qué explica la diferencia o qué debe corregirse?
                              </label>
                              <textarea
                                rows={3}
                                maxLength={500}
                                value={justificaciones[area.clave] ?? ""}
                                onChange={(e) =>
                                  setJustificaciones((actual) => ({
                                    ...actual,
                                    [area.clave]: e.target.value,
                                  }))
                                }
                                placeholder="Ejemplo: falta vincular la cuenta bancaria con su cuenta contable…"
                                className="w-full mt-1.5 mb-3 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                              />
                              <div className="flex flex-wrap gap-2">
                                <button
                                  disabled={procesando !== null}
                                  onClick={() => void resolver(area, "JUSTIFICADA")}
                                  className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50"
                                >
                                  Guardar justificación
                                </button>
                                <button
                                  disabled={procesando !== null}
                                  onClick={() =>
                                    void resolver(area, "REQUIERE_AJUSTE")
                                  }
                                  className="px-4 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-700 text-sm font-bold disabled:opacity-50"
                                >
                                  Marcar para corregir
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {conciliacion.estado !== "CONCILIADA" && (
            <div className="mt-6 bg-slate-900 text-white rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-bold">Finalizar revisión</p>
                <p className="text-sm text-slate-300 mt-0.5">
                  {pendientes > 0
                    ? `Aún faltan ${pendientes} sección(es).`
                    : requiereAjuste
                      ? "Hay correcciones pendientes. Corrígelas y toma una nueva fotografía."
                      : "Todo está revisado; ya puedes guardar la conciliación."}
                </p>
              </div>
              <button
                disabled={pendientes > 0 || requiereAjuste || procesando !== null}
                onClick={() => void confirmar()}
                className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black disabled:bg-slate-700 disabled:text-slate-400"
              >
                {procesando === "confirmar"
                  ? "Guardando…"
                  : "Confirmar conciliación"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Resumen({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string;
  valor: number;
  color: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {etiqueta}
      </p>
      <p className={`text-2xl font-black mt-1 ${color}`}>{valor}</p>
    </div>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  const alerta = etiqueta === "Diferencia" && Math.abs(valor) >= 0.01;
  return (
    <span>
      <span className="block text-[10px] uppercase tracking-wide text-slate-400">
        {etiqueta}
      </span>
      <span
        className={`block text-sm font-bold tabular-nums ${
          alerta ? "text-rose-600" : "text-slate-700"
        }`}
      >
        {moneda.format(valor)}
      </span>
    </span>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-3 text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}
