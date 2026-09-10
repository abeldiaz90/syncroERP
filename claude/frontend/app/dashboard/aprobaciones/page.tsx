"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { confirmarElegante, solicitarTexto } from "@/components/ui/dialogos";
import { useAvisos } from "@/components/ui";

type DatosSolicitud = {
  limiteCredito?: number;
  diasCredito?: number;
  nivelRiesgo?: string;
  clasificacionHotelera?: string | null;
  bloquearCreditoConSaldoVencido?: boolean;
  rfc?: string;
  hotel?: string;
  numeroConvenio?: string;
  tipo?: string;
  vigenciaDesde?: string;
  vigenciaHasta?: string | null;
  bloquearConSaldoVencido?: boolean;
  versionCredito?: number;
  versionSolicitudCredito?: number;
  versionCreditoCliente?: number;
  versionConvenio?: number;
  condicionesActualesCoinciden?: boolean;
  exposicionActual?: {
    saldoVentas: number;
    saldoHotel: number;
    utilizado: number;
    vencido: number;
    disponible?: number;
    disponibleAlAutorizar?: number;
    excedenteSobreLimite?: number;
  } | null;
};

type AprobacionPendiente = {
  id: string;
  proceso: "CREDITO_CLIENTE" | "HOTEL_CONVENIO";
  documentoId: string;
  ciclo: number;
  nivel: number;
  obligatorio: boolean;
  permiteAutoaprobacion: boolean;
  fechaVencimiento?: string;
  titulo: string;
  subtitulo: string;
  importe: number;
  estadoDocumento: string;
  datos?: DatosSolicitud | null;
};


type AprobacionHistorial = {
  id: string;
  proceso: "CREDITO_CLIENTE" | "HOTEL_CONVENIO";
  ciclo: number;
  nivel: number;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA" | "CANCELADA";
  titulo: string;
  subtitulo: string;
  importeSolicitado: number;
  solicitadoPor: string;
  asignadoA: string;
  resueltoPor?: string | null;
  fechaCreacion: string;
  fechaResolucion?: string | null;
  comentario?: string | null;
};

const dinero = (valor: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(valor || 0));

const fecha = (valor?: string | null) =>
  valor
    ? new Date(`${valor.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX")
    : "Sin límite";

export default function BandejaAprobacionesPage() {
  const { avisar } = useAvisos();
  const [pendientes, setPendientes] = useState<AprobacionPendiente[]>([]);
  const [historial, setHistorial] = useState<AprobacionHistorial[]>([]);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const pendientesApi = await api.get<AprobacionPendiente[]>(
        "/aprobaciones/pendientes",
      );
      setPendientes(pendientesApi ?? []);
      try {
        setHistorial(
          (await api.get<AprobacionHistorial[]>(
            "/aprobaciones/historial?limite=100",
          )) ?? [],
        );
        setErrorHistorial(null);
      } catch (error) {
        setHistorial([]);
        setErrorHistorial(
          error instanceof ApiError
            ? error.mensajeParaPantalla()
            : "No se pudo consultar la trazabilidad histórica.",
        );
      }
    } catch (error) {
      avisar(
        error instanceof ApiError
          ? error.mensajeParaPantalla()
          : "No se pudo consultar la bandeja de aprobaciones.",
        "error",
      );
    } finally {
      setCargando(false);
    }
  }, [avisar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resolver = async (
    aprobacion: AprobacionPendiente,
    estado: "APROBADA" | "RECHAZADA",
  ) => {
    let comentario: string;
    if (estado === "RECHAZADA") {
      const texto = await solicitarTexto(
        `Explica por qué se rechaza “${aprobacion.titulo}”. El motivo quedará en la trazabilidad.`,
        { titulo: "Rechazar solicitud", obligatorio: true },
      );
      if (texto === null) return;
      comentario = texto;
    } else {
      const confirmado = await confirmarElegante(
        `¿Aprobar “${aprobacion.titulo}” con las condiciones mostradas?`,
        { titulo: "Aprobar solicitud" },
      );
      if (!confirmado) return;
      comentario = "Condiciones revisadas y autorizadas desde la bandeja central.";
    }

    setProcesando(aprobacion.id);
    try {
      const resultado = await api.patch<{
        procesoCompletado: boolean;
        resultado: string;
      }>(`/aprobaciones/${aprobacion.id}/resolver`, {
        estado,
        comentario,
      });
      avisar(
        resultado.procesoCompletado
          ? `Proceso ${resultado.resultado.toLowerCase()} correctamente.`
          : "Nivel resuelto; el documento avanzó al siguiente aprobador.",
        "exito",
      );
      await cargar();
    } catch (error) {
      avisar(
        error instanceof ApiError
          ? error.mensajeParaPantalla()
          : "No fue posible resolver la aprobación.",
        "error",
      );
    } finally {
      setProcesando(null);
    }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-700">
            <ShieldCheck className="h-4 w-4" /> Gobierno y segregación de
            funciones
          </div>
          <h1 className="text-3xl font-black text-slate-950">
            Bandeja central de aprobaciones
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Crédito de clientes y convenios hoteleros usan niveles secuenciales,
            snapshot de condiciones y versión del documento. Todos los niveles
            son obligatorios y el solicitante no puede resolver su propia
            solicitud.
          </p>
        </div>
        <button
          onClick={() => void cargar()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </header>

      {cargando ? (
        <div className="flex min-h-72 items-center justify-center rounded-3xl border bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : pendientes.length === 0 ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="mt-4 text-xl font-black text-emerald-950">
            No tienes aprobaciones pendientes
          </h2>
          <p className="mt-2 text-sm text-emerald-700">
            La bandeja muestra únicamente el siguiente nivel asignado a tu
            usuario o rol.
          </p>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {pendientes.map((item) => {
            const Icono =
              item.proceso === "HOTEL_CONVENIO" ? Building2 : CreditCard;
            const slaExcedido = Boolean(
              item.fechaVencimiento &&
                new Date(item.fechaVencimiento).getTime() < Date.now(),
            );
            const coincide = item.datos?.condicionesActualesCoinciden !== false;
            const exposicion = item.datos?.exposicionActual;
            const excedente = Number(exposicion?.excedenteSobreLimite ?? 0);

            return (
              <article
                key={item.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
                    <Icono className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                        {item.proceso === "HOTEL_CONVENIO"
                          ? "CONVENIO HOTELERO"
                          : "CRÉDITO DE CLIENTE"}
                      </span>
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">
                        Ciclo {item.ciclo} · Nivel {item.nivel}
                      </span>
                    </div>
                    <h2 className="mt-3 truncate text-lg font-black text-slate-950">
                      {item.titulo}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.subtitulo}
                    </p>
                  </div>
                </div>

                {!coincide && (
                  <div className="mt-4 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    El documento cambió después de iniciar el ciclo. Actualiza la
                    bandeja; el backend impedirá aprobar condiciones obsoletas.
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">
                      Línea maestra evaluada
                    </p>
                    <p className="mt-1 font-black text-slate-900">
                      {dinero(item.importe)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">
                      Plazo propuesto
                    </p>
                    <p className="mt-1 font-black text-slate-900">
                      {Number(item.datos?.diasCredito ?? 0)} días
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">
                      Estado del documento
                    </p>
                    <p className="mt-1 font-black text-slate-900">
                      {item.estadoDocumento.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">
                      Versión sometida
                    </p>
                    <p className="mt-1 font-black text-slate-900">
                      {item.proceso === "HOTEL_CONVENIO"
                        ? `Convenio ${item.datos?.versionConvenio ?? "—"} · Crédito ${item.datos?.versionCreditoCliente ?? "—"}`
                        : `Solicitud ${item.datos?.versionSolicitudCredito ?? "—"}`}
                    </p>
                  </div>
                </div>

                {exposicion && (
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 p-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        Ventas a crédito
                      </p>
                      <p className="mt-1 font-black text-slate-900">
                        {dinero(exposicion.saldoVentas)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        City Ledger
                      </p>
                      <p className="mt-1 font-black text-slate-900">
                        {dinero(exposicion.saldoHotel)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        Exposición global
                      </p>
                      <p className="mt-1 font-black text-slate-900">
                        {dinero(exposicion.utilizado)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">
                        Saldo vencido
                      </p>
                      <p className={`mt-1 font-black ${exposicion.vencido > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {dinero(exposicion.vencido)}
                      </p>
                    </div>
                  </div>
                )}

                {excedente > 0 && (
                  <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    La exposición actual supera en {dinero(excedente)} la línea solicitada. Aprobar no elimina la deuda: dejará el disponible en cero y bloqueará nuevos consumos hasta regularizarla.
                  </div>
                )}

                {item.proceso === "CREDITO_CLIENTE" ? (
                  <div className="mt-3 rounded-xl border border-slate-100 p-3 text-xs text-slate-600">
                    RFC: <strong>{item.datos?.rfc || "No registrado"}</strong> ·
                    Riesgo: <strong>{item.datos?.nivelRiesgo || "MEDIO"}</strong> ·
                    Hotelería: <strong>{item.datos?.clasificacionHotelera || "NO APLICA"}</strong> ·
                    Vencidos: <strong>{item.datos?.bloquearCreditoConSaldoVencido === false ? "EXCEPCIÓN AUTORIZADA" : "BLOQUEAR"}</strong>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-slate-100 p-3 text-xs text-slate-600">
                    Vigencia: <strong>{fecha(item.datos?.vigenciaDesde)}</strong> a{" "}
                    <strong>{fecha(item.datos?.vigenciaHasta)}</strong> · Bloqueo
                    por vencido:{" "}
                    <strong>
                      {item.datos?.bloquearConSaldoVencido ? "Sí" : "No"}
                    </strong>
                  </div>
                )}

                {item.fechaVencimiento && (
                  <div
                    className={`mt-4 flex items-center gap-2 text-xs font-semibold ${
                      slaExcedido ? "text-rose-600" : "text-slate-500"
                    }`}
                  >
                    <Clock3 className="h-4 w-4" />
                    {slaExcedido ? "SLA excedido desde " : "Atender antes de "}
                    {new Date(item.fechaVencimiento).toLocaleString("es-MX")}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t pt-4">
                  <button
                    disabled={procesando === item.id || !coincide}
                    onClick={() => void resolver(item, "RECHAZADA")}
                    className="flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" /> Rechazar
                  </button>
                  <button
                    disabled={procesando === item.id || !coincide}
                    onClick={() => void resolver(item, "APROBADA")}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Aprobar
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <History className="h-4 w-4" /> Trazabilidad
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              Historial de decisiones
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Conserva cada ciclo y nivel, incluyendo cancelaciones automáticas
              por cambios de condiciones o vigencia.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            Últimos {historial.length} movimientos
          </span>
        </div>

        {errorHistorial ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {errorHistorial} Guarda nuevamente las matrices financieras para
            sincronizar el permiso del historial con los roles aprobadores.
          </div>
        ) : historial.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Todavía no existen decisiones registradas en los flujos centrales.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Ciclo / nivel</th>
                    <th className="px-4 py-3">Responsables</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Comentario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historial.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{item.titulo}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.subtitulo}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-indigo-700">
                          {dinero(item.importeSolicitado)}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        Ciclo {item.ciclo} · Nivel {item.nivel}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p>
                          Solicitó: <strong>{item.solicitadoPor}</strong>
                        </p>
                        <p className="mt-1">
                          Asignado: <strong>{item.asignadoA}</strong>
                        </p>
                        {item.resueltoPor && (
                          <p className="mt-1">
                            Resolvió: <strong>{item.resueltoPor}</strong>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                            item.estado === "APROBADA"
                              ? "bg-emerald-100 text-emerald-800"
                              : item.estado === "RECHAZADA"
                                ? "bg-rose-100 text-rose-800"
                                : item.estado === "CANCELADA"
                                  ? "bg-slate-200 text-slate-700"
                                  : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p>
                          Creada: {new Date(item.fechaCreacion).toLocaleString("es-MX")}
                        </p>
                        {item.fechaResolucion && (
                          <p className="mt-1">
                            Resuelta: {new Date(item.fechaResolucion).toLocaleString("es-MX")}
                          </p>
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-slate-600">
                        {item.comentario || "Sin comentario"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
