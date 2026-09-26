"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeDollarSign,
  Ban,
  Building2,
  CalendarClock,
  Check,
  Clock3,
  CreditCard,
  FileSearch,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { solicitarTexto } from "@/components/ui/dialogos";
import { fechaCorta } from "@/lib/fechas";

type Hotel = { id: string; nombre: string };
type Cliente = {
  id: string;
  nombre: string;
  razonSocial?: string;
  rfc?: string;
  tipoPersona: string;
  limiteCredito: number;
  diasCredito: number;
  estadoCredito?: "SIN_CREDITO" | "EN_REVISION" | "AUTORIZADO" | "RECHAZADO" | "SUSPENDIDO";
  estadoSolicitudCredito?: "NINGUNA" | "PENDIENTE" | "APROBADA" | "RECHAZADA" | "CANCELADA";
  limiteCreditoSolicitado?: number | null;
  diasCreditoSolicitados?: number | null;
  clasificacionHotelera?: "EMPRESA" | "AGENCIA" | null;
  bloquearCreditoConSaldoVencido?: boolean;
};
type CuentaBancaria = {
  id: string;
  nombre: string;
  tipo: string;
};
type Convenio = {
  id: string;
  hotelId: string;
  clienteId: string;
  numeroConvenio: string;
  tipo: "EMPRESA" | "AGENCIA";
  nombreComercial: string;
  /** Snapshot histórico del convenio. */
  limiteCredito: number;
  diasCredito: number;
  limiteCreditoSnapshot?: number;
  diasCreditoSnapshot?: number;
  /** Condiciones maestras operativas actuales. */
  limiteCreditoVigente?: number;
  diasCreditoVigente?: number;
  versionCreditoCliente?: number;
  versionCreditoClienteActual?: number;
  condicionesCreditoVigentes?: boolean;
  estado: string;
  saldoUtilizado: number;
  saldoUtilizadoGlobal?: number;
  creditoDisponible: number;
  estadoCreditoCliente?: string;
  nivelRiesgoCliente?: string | null;
  clasificacionHoteleraCliente?: "EMPRESA" | "AGENCIA" | null;
  bloquearConSaldoVencido?: boolean;
  clienteActivo?: boolean;
  vigenciaDesde: string;
  vigenciaHasta?: string | null;
};
type CuentaCity = {
  id: string;
  convenioId: string;
  folioReferencia: string;
  moneda: string;
  importeOriginal: number;
  saldoPendiente: number;
  ivaOriginal: number;
  ivaReclasificado: number;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: string;
  diasVencidos: number;
  bandaAntiguedad: string;
};
type Diagnostico = {
  totalFoliosCredito: number;
  sinCityLedger: number;
  conPolizaGenerada: number;
  pendientesContables: number;
  advertencia: string;
  filas: Array<Record<string, unknown>>;
};
type Preparacion = {
  listo: boolean;
  bloqueos: string[];
  recomendacion: string;
};

const dinero = (valor: number, moneda = "MXN") =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: moneda,
  }).format(Number(valor || 0));

const hoy = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
};

export default function CityLedgerPage() {
  const [hoteles, setHoteles] = useState<Hotel[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>(
    [],
  );
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [cartera, setCartera] = useState<CuentaCity[]>([]);
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [preparacion, setPreparacion] = useState<Preparacion | null>(null);
  const [pestana, setPestana] = useState<"CARTERA" | "CONVENIOS" | "AUDITORIA">(
    "CARTERA",
  );
  const [modalConvenio, setModalConvenio] = useState(false);
  const [convenioRenovar, setConvenioRenovar] = useState<Convenio | null>(null);
  const [cuentaCobro, setCuentaCobro] = useState<CuentaCity | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  /*
    Las tres consultas iban en un solo `Promise.all` y la de cuentas bancarias
    pedia el catalogo completo —CLABE y numero de cuenta, de Tesoreria—, que
    hoteleria no tiene. El 403 tumbaba tambien las otras dos: sin hoteles no
    habia hotel seleccionado, sin hotel no se consultaba la cartera, y la
    pantalla mostraba cero en todo como si la cartera estuviera limpia. Ahora
    cada consulta responde por si misma y la de cajas usa la lista corta.
  */
  const cargarBase = useCallback(async () => {
    setCargando(true);
    setError("");
    const problemas: string[] = [];
    const fallo = (e: unknown, sinPermiso: string, generico: string) => {
      problemas.push(
        e instanceof ApiError && e.esSinPermisos ? sinPermiso : generico,
      );
      return null;
    };
    const [listaHoteles, listaClientes, cuentas] = await Promise.all([
      api
        .get<Hotel[]>("/hoteleria/config/hoteles")
        .catch((e: unknown) =>
          fallo(
            e,
            "Tu perfil no puede consultar las propiedades.",
            "No se pudieron consultar las propiedades.",
          ),
        ),
      api
        .get<Cliente[]>("/clientes?activos=true")
        .catch((e: unknown) =>
          fallo(
            e,
            "Tu perfil no puede consultar clientes: no podrás abrir convenios nuevos.",
            "No se pudo consultar la lista de clientes.",
          ),
        ),
      api
        .get<CuentaBancaria[]>("/credito/cuentas-bancarias/para-cobro")
        .catch((e: unknown) =>
          fallo(
            e,
            "Tu perfil no puede elegir caja: podrás ver la cartera, no cobrarla.",
            "No se pudo consultar la lista de cajas.",
          ),
        ),
    ]);
    if (listaHoteles) {
      setHoteles(listaHoteles);
      setHotelId((actual) => actual || listaHoteles[0]?.id || "");
    }
    if (listaClientes)
      setClientes(
        listaClientes.filter((cliente) => cliente.tipoPersona === "MORAL"),
      );
    if (cuentas) setCuentasBancarias(cuentas);
    setError(problemas.join(" "));
    setCargando(false);
  }, []);

  const cargarOperacion = useCallback(async () => {
    if (!hotelId) return;
    setCargando(true);
    setError("");
    try {
      const [listaConvenios, listaCartera] = await Promise.all([
        api.get<Convenio[]>(
          `/hoteleria/city-ledger/convenios?hotelId=${hotelId}`,
        ),
        api.get<CuentaCity[]>("/hoteleria/city-ledger/cartera"),
      ]);
      setConvenios(listaConvenios);
      setCartera(
        listaCartera.filter((cuenta) =>
          listaConvenios.some((convenio) => convenio.id === cuenta.convenioId),
        ),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo consultar la cartera.",
      );
    } finally {
      setCargando(false);
    }
  }, [hotelId]);

  useEffect(() => {
    void cargarBase();
  }, [cargarBase]);
  useEffect(() => {
    void cargarOperacion();
  }, [cargarOperacion]);

  const resumen = useMemo(() => {
    const abiertas = cartera.filter((cuenta) => cuenta.estado !== "LIQUIDADA");
    return {
      saldo: abiertas.reduce(
        (suma, cuenta) => suma + Number(cuenta.saldoPendiente),
        0,
      ),
      vencido: abiertas
        .filter((cuenta) => cuenta.diasVencidos > 0)
        .reduce((suma, cuenta) => suma + Number(cuenta.saldoPendiente), 0),
      disponible: Array.from(
        new Map(
          convenios
            .filter((convenio) => convenio.estado === "APROBADO")
            .map((convenio) => [convenio.clienteId, convenio.creditoDisponible]),
        ).values(),
      ).reduce((suma, disponible) => suma + Number(disponible), 0),
      cuentas: abiertas.length,
    };
  }, [cartera, convenios]);
  const tarjetas: Array<{
    etiqueta: string;
    valor: string;
    Icono: LucideIcon;
  }> = [
    {
      etiqueta: "Saldo en cartera",
      valor: dinero(resumen.saldo),
      Icono: BadgeDollarSign,
    },
    {
      etiqueta: "Saldo vencido",
      valor: dinero(resumen.vencido),
      Icono: Clock3,
    },
    {
      etiqueta: "Crédito disponible",
      valor: dinero(resumen.disponible),
      Icono: CreditCard,
    },
    {
      etiqueta: "Cuentas abiertas",
      valor: String(resumen.cuentas),
      Icono: Building2,
    },
  ];


  const requiereRenovacion = (convenio: Convenio) =>
    ["VENCIDO", "CANCELADO"].includes(convenio.estado) ||
    Boolean(convenio.vigenciaHasta && convenio.vigenciaHasta < hoy());

  const reenviarConvenio = async (convenio: Convenio) => {
    if (requiereRenovacion(convenio)) {
      setConvenioRenovar(convenio);
      return;
    }
    setError("");
    try {
      await api.post(
        `/hoteleria/city-ledger/convenios/${convenio.id}/reenviar`,
        {},
      );
      setMensaje("Convenio reenviado a la bandeja central de aprobaciones");
      await cargarOperacion();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo reenviar el convenio.",
      );
    }
  };

  const suspenderConvenio = async (convenio: Convenio) => {
    const comentario = await solicitarTexto(
      `Indica por qué se suspenderá el convenio ${convenio.numeroConvenio}. La cartera existente se conservará y se bloquearán nuevos cargos.`,
      { titulo: "Suspender convenio", obligatorio: true },
    );
    if (comentario === null) return;
    setError("");
    try {
      await api.patch(
        `/hoteleria/city-ledger/convenios/${convenio.id}/suspender`,
        { comentario },
      );
      setMensaje(
        "Convenio suspendido. La cartera histórica permanece disponible para cobranza.",
      );
      await cargarOperacion();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo suspender el convenio.",
      );
    }
  };

  const cancelarConvenio = async (convenio: Convenio) => {
    const motivo = await solicitarTexto(
      `Indica por qué se cancelará el convenio ${convenio.numeroConvenio}. La cartera existente se conservará y sólo se bloquearán nuevos cargos.`,
      { titulo: "Cancelar convenio", obligatorio: true },
    );
    if (motivo === null) return;
    setError("");
    try {
      await api.patch(
        `/hoteleria/city-ledger/convenios/${convenio.id}/cancelar`,
        { motivo },
      );
      setMensaje(
        "Convenio cancelado. Los saldos existentes permanecen disponibles para cobranza.",
      );
      await cargarOperacion();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo cancelar el convenio.",
      );
    }
  };

  const cargarDiagnostico = async () => {
    setCargando(true);
    setError("");
    try {
      const [historico, preflight] = await Promise.all([
        api.get<Diagnostico>("/hoteleria/city-ledger/diagnostico-historico"),
        api.get<Preparacion>("/hoteleria/city-ledger/preparacion-produccion"),
      ]);
      setDiagnostico(historico);
      setPreparacion(preflight);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo ejecutar el diagnóstico.",
      );
    } finally {
      setCargando(false);
    }
  };

  if (cargando && !hoteles.length) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-900 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-200">
              <ShieldCheck className="h-4 w-4" /> Crédito hotelero controlado
            </div>
            <h1 className="text-3xl font-bold">City Ledger</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Convenios que consumen una sola línea maestra, cartera global,
              antigüedad de saldos y cobranza conectada con Finanzas.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={hotelId}
              onChange={(e) => setHotelId(e.target.value)}
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
            >
              {hoteles.map((hotel) => (
                <option
                  className="text-slate-900"
                  key={hotel.id}
                  value={hotel.id}
                >
                  {hotel.nombre}
                </option>
              ))}
            </select>
            <button
              onClick={() => void cargarOperacion()}
              className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20"
              title="Actualizar"
            >
              <RefreshCw
                className={`h-5 w-5 ${cargando ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tarjetas.map(({ etiqueta, valor, Icono }) => (
            <div
              key={String(etiqueta)}
              className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur"
            >
              <Icono className="mb-3 h-5 w-5 text-cyan-300" />
              <p className="text-xs text-slate-300">{etiqueta}</p>
              <p className="mt-1 text-xl font-bold">{valor}</p>
            </div>
          ))}
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}
      {mensaje && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {mensaje}
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-2">
        {(["CARTERA", "CONVENIOS", "AUDITORIA"] as const).map((item) => (
          <button
            key={item}
            onClick={() => {
              setPestana(item);
              if (item === "AUDITORIA" && !diagnostico)
                void cargarDiagnostico();
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${pestana === item ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {item === "AUDITORIA"
              ? "Auditoría histórica"
              : item.charAt(0) + item.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {pestana === "CARTERA" && (
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="font-bold text-slate-900">
              Estado de cuenta consolidado
            </h2>
            <p className="text-sm text-slate-500">
              Cada saldo conserva su folio, vencimiento e IVA pendiente de
              reclasificar.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Folio",
                    "Convenio",
                    "Emisión",
                    "Vencimiento",
                    "Antigüedad",
                    "Original",
                    "Saldo",
                    "Estado",
                    "",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {cartera.map((cuenta) => {
                  const convenio = convenios.find(
                    (item) => item.id === cuenta.convenioId,
                  );
                  return (
                    <tr key={cuenta.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold">
                        {cuenta.folioReferencia}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {convenio?.nombreComercial || "—"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {convenio?.numeroConvenio}
                        </p>
                      </td>
                      <td className="px-4 py-3">{fechaCorta(cuenta.fechaEmision)}</td>
                      <td className="px-4 py-3">
                        {fechaCorta(cuenta.fechaVencimiento)}
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold ${cuenta.diasVencidos > 0 ? "text-rose-600" : "text-emerald-600"}`}
                      >
                        {cuenta.diasVencidos > 0
                          ? `${cuenta.diasVencidos} días`
                          : "Corriente"}
                      </td>
                      <td className="px-4 py-3">
                        {dinero(cuenta.importeOriginal, cuenta.moneda)}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {dinero(cuenta.saldoPendiente, cuenta.moneda)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${cuenta.estado === "LIQUIDADA" ? "bg-emerald-50 text-emerald-700" : cuenta.diasVencidos > 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
                        >
                          {cuenta.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {cuenta.estado !== "LIQUIDADA" && (
                          <button
                            onClick={() => setCuentaCobro(cuenta)}
                            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                          >
                            Registrar cobro
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Vacio de verdad, no vacio por consulta caida. */}
          {!cartera.length && !error && (
            <div className="p-12 text-center text-slate-500">
              No hay cuentas por cobrar para esta propiedad.
            </div>
          )}
        </section>
      )}

      {pestana === "CONVENIOS" && (
        <section className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setModalConvenio(true)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              Solicitar convenio
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {convenios.map((convenio) => (
              <article
                key={convenio.id}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-indigo-600">
                      {convenio.numeroConvenio}
                    </p>
                    <h3 className="mt-1 text-lg font-bold">
                      {convenio.nombreComercial}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {convenio.tipo} · {convenio.diasCreditoVigente ?? convenio.diasCredito} días · Línea v{convenio.versionCreditoClienteActual ?? convenio.versionCreditoCliente ?? 1}
                    </p>
                  </div>
                  <span
                    className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${convenio.estado === "APROBADO" ? "bg-emerald-50 text-emerald-700" : convenio.estado === "PENDIENTE" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}
                  >
                    {convenio.estado}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Línea maestra</p>
                    <p className="font-bold">
                      {dinero(convenio.limiteCreditoVigente ?? convenio.limiteCredito)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Exposición global</p>
                    <p className="font-bold">
                      {dinero(convenio.saldoUtilizadoGlobal ?? convenio.saldoUtilizado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Disponible global</p>
                    <p className="font-bold text-emerald-700">
                      {dinero(convenio.creditoDisponible)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Saldo originado por este convenio: {dinero(convenio.saldoUtilizado)}.
                  La disponibilidad considera también ventas a crédito y otros hoteles.
                </p>
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  Vigencia: <strong>{convenio.vigenciaDesde}</strong> a{" "}
                  <strong>{convenio.vigenciaHasta || "sin fecha final"}</strong> ·
                  Vencidos: <strong>{convenio.bloquearConSaldoVencido === false ? "excepción maestra" : "bloquean nuevos cargos"}</strong>
                </div>
                {(convenio.versionCreditoClienteActual ?? convenio.versionCreditoCliente ?? 1) !== (convenio.versionCreditoCliente ?? 1) && (
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Evidencia del ciclo anterior: línea {dinero(convenio.limiteCreditoSnapshot ?? convenio.limiteCredito)} a {convenio.diasCreditoSnapshot ?? convenio.diasCredito} días, versión {convenio.versionCreditoCliente ?? 1}.
                  </p>
                )}
                {convenio.condicionesCreditoVigentes === false && (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                    La línea maestra cambió después de aprobar este convenio. El convenio debe reenviarse a aprobación antes de aceptar nuevos cargos.
                  </p>
                )}
                {convenio.estado === "PENDIENTE" && (
                  <div className="mt-5 border-t pt-4">
                    <Link
                      href="/dashboard/aprobaciones"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 px-3 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Ver en bandeja de aprobaciones
                    </Link>
                  </div>
                )}
                {["RECHAZADO", "SUSPENDIDO", "VENCIDO", "CANCELADO"].includes(
                  convenio.estado,
                ) && (
                  <div className="mt-5 border-t pt-4">
                    <button
                      onClick={() => void reenviarConvenio(convenio)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 px-3 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-50"
                    >
                      {requiereRenovacion(convenio) ? (
                        <CalendarClock className="h-4 w-4" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {requiereRenovacion(convenio)
                        ? "Renovar y enviar a aprobación"
                        : "Reenviar a aprobación"}
                    </button>
                  </div>
                )}
                {convenio.estado === "APROBADO" && (
                  <div className="mt-2">
                    <button
                      onClick={() => void suspenderConvenio(convenio)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50"
                    >
                      <Clock3 className="h-4 w-4" />
                      Suspender nuevos cargos
                    </button>
                  </div>
                )}
                {convenio.estado !== "CANCELADO" && (
                  <div className="mt-2">
                    <button
                      onClick={() => void cancelarConvenio(convenio)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                    >
                      <Ban className="h-4 w-4" />
                      Cancelar convenio
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {pestana === "AUDITORIA" && (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 font-bold">
                <FileSearch className="h-5 w-5 text-indigo-600" />
                Diagnóstico histórico de crédito hotelero
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Sólo lectura: identifica cierres anteriores sin City Ledger;
                nunca modifica pólizas automáticamente.
              </p>
            </div>
            <button
              onClick={() => void cargarDiagnostico()}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Ejecutar
            </button>
          </div>
          {diagnostico && (
            <>
              {preparacion && (
                <div
                  className={`mt-5 rounded-2xl border p-4 ${preparacion.listo ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
                >
                  <p className="font-bold">
                    {preparacion.listo
                      ? "Estructura mínima lista"
                      : "Crédito hotelero bloqueado para producción"}
                  </p>
                  <p className="mt-1 text-sm">{preparacion.recomendacion}</p>
                  {!!preparacion.bloqueos.length && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                      {preparacion.bloqueos.map((bloqueo) => (
                        <li key={bloqueo}>{bloqueo}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {[
                  ["Folios a crédito", diagnostico.totalFoliosCredito],
                  ["Sin City Ledger", diagnostico.sinCityLedger],
                  ["Con póliza", diagnostico.conPolizaGenerada],
                  ["Pendientes", diagnostico.pendientesContables],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">{l}</p>
                    <p className="mt-1 text-2xl font-bold">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {diagnostico.advertencia}
              </div>
            </>
          )}
        </section>
      )}

      {modalConvenio && (
        <ModalConvenio
          hotelId={hotelId}
          clientes={clientes}
          onClose={() => setModalConvenio(false)}
          onOk={async () => {
            setModalConvenio(false);
            setMensaje("Convenio enviado a aprobación");
            await cargarOperacion();
          }}
        />
      )}
      {convenioRenovar && (
        <ModalRenovarConvenio
          convenio={convenioRenovar}
          onClose={() => setConvenioRenovar(null)}
          onOk={async () => {
            setConvenioRenovar(null);
            setMensaje("Convenio renovado y enviado a aprobación");
            await cargarOperacion();
          }}
        />
      )}
      {cuentaCobro && (
        <ModalCobro
          cuenta={cuentaCobro}
          cuentas={cuentasBancarias}
          onClose={() => setCuentaCobro(null)}
          onOk={async () => {
            setCuentaCobro(null);
            setMensaje("Cobro registrado y enviado a contabilidad");
            await cargarOperacion();
          }}
        />
      )}
    </main>
  );
}

function ModalConvenio({
  hotelId,
  clientes,
  onClose,
  onOk,
}: {
  hotelId: string;
  clientes: Cliente[];
  onClose: () => void;
  onOk: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    numeroConvenio: "",
    vigenciaDesde: hoy(),
    vigenciaHasta: "",
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const clienteSeleccionado = useMemo(
    () => clientes.find((cliente) => cliente.id === clienteId) ?? null,
    [clienteId, clientes],
  );

  const terminoBusqueda = busqueda.trim().toLocaleLowerCase("es-MX");
  const visibles = useMemo(() => {
    const candidatos = terminoBusqueda
      ? clientes.filter((cliente) =>
          `${cliente.razonSocial || cliente.nombre} ${cliente.nombre} ${cliente.rfc || ""}`
            .toLocaleLowerCase("es-MX")
            .includes(terminoBusqueda),
        )
      : clientes;
    return candidatos.slice(0, 8);
  }, [clientes, terminoBusqueda]);

  const seleccionarCliente = (cliente: Cliente) => {
    if (cliente.estadoCredito !== "AUTORIZADO") {
      setError(
        `La línea maestra de ${cliente.razonSocial || cliente.nombre} está en estado ${
          cliente.estadoCredito ?? "SIN_CREDITO"
        }. Autorízala primero desde Clientes y la bandeja central.`,
      );
      return;
    }
    if (cliente.estadoSolicitudCredito === "PENDIENTE") {
      setError(
        `Existe una propuesta de cambio de crédito pendiente para ${cliente.razonSocial || cliente.nombre}. Resuélvela antes de crear un convenio basado en esa línea.`,
      );
      return;
    }
    if (!cliente.clasificacionHotelera) {
      setError(
        `Clasifica a ${cliente.razonSocial || cliente.nombre} como EMPRESA o AGENCIA en Clientes antes de solicitar el convenio.`,
      );
      return;
    }
    setClienteId(cliente.id);
    setBusqueda(cliente.razonSocial || cliente.nombre);
    setSelectorAbierto(false);
    setError("");
  };

  const limpiarSeleccion = () => {
    setClienteId("");
    setBusqueda("");
    setSelectorAbierto(true);
    setError("");
    requestAnimationFrame(() => buscadorRef.current?.focus());
  };

  const guardar = async () => {
    if (!clienteSeleccionado) {
      setError("Selecciona una empresa o agencia de la lista de resultados.");
      setSelectorAbierto(true);
      requestAnimationFrame(() => buscadorRef.current?.focus());
      return;
    }
    if (clienteSeleccionado.estadoCredito !== "AUTORIZADO") {
      setError("La línea maestra del cliente debe estar autorizada.");
      return;
    }
    if (clienteSeleccionado.estadoSolicitudCredito === "PENDIENTE") {
      setError("Resuelve primero la propuesta de cambio de crédito del cliente.");
      return;
    }
    if (!clienteSeleccionado.clasificacionHotelera) {
      setError("El cliente debe estar clasificado como EMPRESA o AGENCIA en el catálogo de Clientes.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await api.post("/hoteleria/city-ledger/convenios", {
        hotelId,
        clienteId: clienteSeleccionado.id,
        numeroConvenio: form.numeroConvenio,
        vigenciaDesde: form.vigenciaDesde,
        vigenciaHasta: form.vigenciaHasta || undefined,
      });
      onOk();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo solicitar el convenio.",
      );
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between border-b p-5">
          <div>
            <h3 className="text-xl font-bold">Solicitar convenio</h3>
            <p className="text-sm text-slate-500">
              El límite y plazo se heredan de la línea maestra del cliente.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="convenio-cliente"
              className="mb-1 block text-xs font-bold text-slate-600"
            >
              Empresa o agencia <span className="text-rose-600">*</span>
            </label>

            {clienteSeleccionado ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                      <Check className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {clienteSeleccionado.razonSocial ||
                          clienteSeleccionado.nombre}
                      </span>
                    </div>
                    <p className="mt-0.5 pl-6 text-xs text-emerald-700">
                      {clienteSeleccionado.rfc || "RFC no registrado"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={limpiarSeleccion}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    Cambiar
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-white/70 p-3 text-xs">
                  <div>
                    <p className="text-slate-500">Línea autorizada</p>
                    <p className="mt-1 font-black text-slate-900">
                      {dinero(clienteSeleccionado.limiteCredito)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Plazo autorizado</p>
                    <p className="mt-1 font-black text-slate-900">
                      {clienteSeleccionado.diasCredito} días
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  ref={buscadorRef}
                  id="convenio-cliente"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={selectorAbierto}
                  aria-controls="convenio-clientes-resultados"
                  autoComplete="off"
                  value={busqueda}
                  onFocus={() => setSelectorAbierto(true)}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setClienteId("");
                    setSelectorAbierto(true);
                    if (error) setError("");
                  }}
                  className={`w-full rounded-xl border py-2.5 pl-9 pr-3 outline-none transition focus:ring-2 focus:ring-indigo-100 ${
                    error && !clienteId
                      ? "border-rose-300 focus:border-rose-400"
                      : "focus:border-indigo-400"
                  }`}
                  placeholder="Escribe razón social, nombre o RFC"
                />

                {selectorAbierto && (
                  <div
                    id="convenio-clientes-resultados"
                    role="listbox"
                    className="absolute z-20 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl"
                  >
                    {clientes.length === 0 ? (
                      <div className="p-3 text-sm text-slate-600">
                        <p className="font-semibold text-slate-800">
                          No hay personas morales activas registradas.
                        </p>
                        <p className="mt-1 text-xs">
                          Registra primero la empresa o agencia en Clientes.
                        </p>
                      </div>
                    ) : visibles.length === 0 ? (
                      <div className="p-3 text-sm text-slate-600">
                        No se encontraron coincidencias para “{busqueda.trim()}”.
                      </div>
                    ) : (
                      visibles.map((cliente) => {
                        const autorizado =
                          cliente.estadoCredito === "AUTORIZADO" &&
                          cliente.estadoSolicitudCredito !== "PENDIENTE" &&
                          Boolean(cliente.clasificacionHotelera);
                        return (
                          <button
                            type="button"
                            role="option"
                            aria-selected={clienteId === cliente.id}
                            key={cliente.id}
                            onClick={() => seleccionarCliente(cliente)}
                            className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 p-3 text-left last:border-0 ${
                              autorizado
                                ? "hover:bg-indigo-50"
                                : "cursor-not-allowed bg-slate-50 opacity-65"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">
                                {cliente.razonSocial || cliente.nombre}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {cliente.rfc || "Sin RFC"} · {cliente.clasificacionHotelera || "Sin clasificación hotelera"} · {dinero(cliente.limiteCredito)} · {cliente.diasCredito} días{cliente.estadoSolicitudCredito === "PENDIENTE" ? " · cambio en aprobación" : ""}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${
                                autorizado
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {cliente.estadoCredito ?? "SIN_CREDITO"}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800">
            <strong>Una sola fuente de verdad:</strong> el convenio no crea una
            segunda línea. Usa el límite y los días aprobados en el catálogo de
            Clientes; la disponibilidad se calcula con ventas a crédito y City
            Ledger de todos los hoteles.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Campo label="Número de convenio">
              <input
                value={form.numeroConvenio}
                onChange={(e) =>
                  setForm({ ...form, numeroConvenio: e.target.value })
                }
                maxLength={30}
                className="w-full rounded-xl border p-2.5"
              />
            </Campo>
            <Campo label="Clasificación heredada">
              <div className="w-full rounded-xl border bg-slate-50 p-2.5 text-sm font-bold text-slate-700">
                {clienteSeleccionado?.clasificacionHotelera || "Selecciona un cliente clasificado"}
              </div>
            </Campo>
            <Campo label="Vigente desde">
              <input
                type="date"
                value={form.vigenciaDesde}
                onChange={(e) =>
                  setForm({ ...form, vigenciaDesde: e.target.value })
                }
                className="w-full rounded-xl border p-2.5"
              />
            </Campo>
            <Campo label="Vigente hasta (opcional)">
              <input
                type="date"
                value={form.vigenciaHasta}
                onChange={(e) =>
                  setForm({ ...form, vigenciaHasta: e.target.value })
                }
                className="w-full rounded-xl border p-2.5"
              />
            </Campo>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Política heredada de la línea maestra:</strong>{" "}
              {clienteSeleccionado?.bloquearCreditoConSaldoVencido === false
                ? "la matriz autorizó operar aun con saldo vencido global."
                : "se bloquearán nuevas operaciones cuando exista saldo vencido global en Ventas o City Ledger."}
              <p className="mt-1 text-xs">
                El convenio no puede modificar esta regla; cualquier cambio debe solicitarse desde Clientes y volver a aprobación.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2">
            Cancelar
          </button>
          <button
            onClick={() => void guardar()}
            disabled={
              guardando ||
              !clienteSeleccionado ||
              clienteSeleccionado.estadoCredito !== "AUTORIZADO" ||
              form.numeroConvenio.trim().length < 3 ||
              !form.vigenciaDesde
            }
            title={
              clienteSeleccionado
                ? "Enviar a la bandeja central de aprobaciones"
                : "Selecciona primero una empresa o agencia"
            }
            className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "Enviando…" : "Enviar a aprobación"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalRenovarConvenio({
  convenio,
  onClose,
  onOk,
}: {
  convenio: Convenio;
  onClose: () => void;
  onOk: () => void;
}) {
  const [form, setForm] = useState({
    numeroConvenio: convenio.numeroConvenio,
    vigenciaDesde: hoy(),
    vigenciaHasta: "",
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (form.vigenciaHasta && form.vigenciaHasta < form.vigenciaDesde) {
      setError("La vigencia final no puede ser anterior a la inicial.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await api.post(
        `/hoteleria/city-ledger/convenios/${convenio.id}/reenviar`,
        {
          numeroConvenio: form.numeroConvenio,
          vigenciaDesde: form.vigenciaDesde,
          vigenciaHasta: form.vigenciaHasta || null,
        },
      );
      onOk();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo renovar el convenio.",
      );
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-between border-b p-5">
          <div>
            <h3 className="text-xl font-bold">Renovar convenio</h3>
            <p className="text-sm text-slate-500">
              {convenio.nombreComercial} · la línea y el plazo seguirán heredándose del cliente.
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <Campo label="Número de convenio">
            <input
              value={form.numeroConvenio}
              onChange={(event) =>
                setForm({ ...form, numeroConvenio: event.target.value })
              }
              maxLength={30}
              className="w-full rounded-xl border p-2.5"
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nueva vigencia desde">
              <input
                type="date"
                value={form.vigenciaDesde}
                onChange={(event) =>
                  setForm({ ...form, vigenciaDesde: event.target.value })
                }
                className="w-full rounded-xl border p-2.5"
              />
            </Campo>
            <Campo label="Vigente hasta (opcional)">
              <input
                type="date"
                value={form.vigenciaHasta}
                onChange={(event) =>
                  setForm({ ...form, vigenciaHasta: event.target.value })
                }
                className="w-full rounded-xl border p-2.5"
              />
            </Campo>
          </div>
          <div className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700">
            La renovación crea un nuevo ciclo de aprobación. No modifica ni cancela la cartera histórica del convenio.
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2">
            Cancelar
          </button>
          <button
            disabled={
              guardando ||
              form.numeroConvenio.trim().length < 3 ||
              !form.vigenciaDesde
            }
            onClick={() => void guardar()}
            className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            {guardando ? "Enviando…" : "Renovar y solicitar aprobación"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalCobro({
  cuenta,
  cuentas,
  onClose,
  onOk,
}: {
  cuenta: CuentaCity;
  cuentas: CuentaBancaria[];
  onClose: () => void;
  onOk: () => void;
}) {
  const [form, setForm] = useState({
    importe: Number(cuenta.saldoPendiente),
    metodoPago: "TRANSFERENCIA",
    cuentaBancariaId: cuentas.find((item) => item.tipo === "BANCO")?.id || "",
    referencia: "",
    fechaPago: hoy(),
  });
  const tipoCuentaEsperado =
    form.metodoPago === "EFECTIVO"
      ? "CAJA"
      : form.metodoPago === "TARJETA"
        ? "TPV"
        : ["TRANSFERENCIA", "CHEQUE"].includes(form.metodoPago)
          ? "BANCO"
          : null;
  const cuentasCompatibles = tipoCuentaEsperado
    ? cuentas.filter((item) => item.tipo === tipoCuentaEsperado)
    : cuentas;
  const requiereReferencia = ["TRANSFERENCIA", "CHEQUE", "TARJETA"].includes(
    form.metodoPago,
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      await api.post("/hoteleria/city-ledger/cobros", {
        cuentaCobrarId: cuenta.id,
        ...form,
        importe: Number(form.importe),
        claveIdempotencia: crypto.randomUUID(),
      });
      onOk();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo registrar el cobro.",
      );
      setGuardando(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between border-b p-5">
          <div>
            <h3 className="text-xl font-bold">Registrar cobro</h3>
            <p className="text-sm text-slate-500">
              {cuenta.folioReferencia} · Saldo{" "}
              {dinero(cuenta.saldoPendiente, cuenta.moneda)}
            </p>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <Campo label="Importe">
            <input
              type="number"
              min="0.01"
              max={cuenta.saldoPendiente}
              step="0.01"
              value={form.importe}
              onChange={(e) =>
                setForm({ ...form, importe: Number(e.target.value) })
              }
              className="w-full rounded-xl border p-2.5"
            />
          </Campo>
          <Campo label="Método">
            <select
              value={form.metodoPago}
              onChange={(e) => {
                const metodoPago = e.target.value;
                const tipoEsperado =
                  metodoPago === "EFECTIVO"
                    ? "CAJA"
                    : metodoPago === "TARJETA"
                      ? "TPV"
                      : ["TRANSFERENCIA", "CHEQUE"].includes(metodoPago)
                        ? "BANCO"
                        : null;
                const cuentaCompatible = tipoEsperado
                  ? cuentas.find((item) => item.tipo === tipoEsperado)
                  : cuentas[0];
                setForm({
                  ...form,
                  metodoPago,
                  cuentaBancariaId: cuentaCompatible?.id || "",
                });
              }}
              className="w-full rounded-xl border p-2.5"
            >
              <option>TRANSFERENCIA</option>
              <option>CHEQUE</option>
              <option>TARJETA</option>
              <option>EFECTIVO</option>
              <option>OTRO</option>
            </select>
          </Campo>
          <Campo label={tipoCuentaEsperado === "CAJA" ? "Caja receptora" : tipoCuentaEsperado === "TPV" ? "Terminal receptora" : "Cuenta receptora"}>
            <select
              value={form.cuentaBancariaId}
              onChange={(e) =>
                setForm({ ...form, cuentaBancariaId: e.target.value })
              }
              className="w-full rounded-xl border p-2.5"
            >
              <option value="">Seleccionar</option>
              {cuentasCompatibles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre} · {item.tipo}
                </option>
              ))}
            </select>
          </Campo>
          {cuentasCompatibles.length === 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              No hay una cuenta activa de tipo {tipoCuentaEsperado ?? "financiera"}.
              {tipoCuentaEsperado === "CAJA"
                ? " Configura una caja y abre un turno antes de recibir efectivo."
                : " Configúrala en Crédito y cobranza antes de registrar el cobro."}
            </div>
          )}
          <Campo label={requiereReferencia ? "Referencia obligatoria" : "Referencia (opcional)"}>
            <input
              value={form.referencia}
              onChange={(e) => setForm({ ...form, referencia: e.target.value })}
              className="w-full rounded-xl border p-2.5"
            />
          </Campo>
          <Campo label="Fecha de cobro">
            <input
              type="date"
              value={form.fechaPago}
              onChange={(e) => setForm({ ...form, fechaPago: e.target.value })}
              className="w-full rounded-xl border p-2.5"
            />
          </Campo>
          <div className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-700">
            El sistema registrará Tesorería, abonará Clientes CxC y
            reclasificará sólo el IVA proporcional efectivamente cobrado. Los
            cobros en efectivo también entran al turno de Caja abierto.
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2">
            Cancelar
          </button>
          <button
            disabled={
              guardando ||
              !form.cuentaBancariaId ||
              Number(form.importe) <= 0 ||
              (requiereReferencia && !form.referencia.trim())
            }
            onClick={() => void guardar()}
            className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white disabled:opacity-50"
          >
            {guardando ? "Aplicando…" : "Aplicar cobro"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
