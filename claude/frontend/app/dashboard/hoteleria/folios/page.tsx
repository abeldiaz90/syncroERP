"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BedDouble, CreditCard, Plus, RefreshCw, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type Reserva = {
  id: string;
  codigo: string | null;
  clienteNombre: string | null;
  fechaEntrada: string;
  fechaSalida: string;
  tarifaNoche: number;
  estado: string;
  habitacionId: string | null;
  hotelId: string;
};
type Pago = {
  metodoPago: string;
  importe: number;
  cuentaBancariaId?: string;
  referencia?: string;
  convenioId?: string;
};
type Folio = {
  id: string;
  estado: string;
  estadoContable: string;
  moneda: string;
  subtotal: number;
  iva: number;
  impuestoHospedaje: number;
  total: number;
  totalCobrado: number;
  totalAplicado: number;
  saldoPendiente: number;
  nochesPendientes?: number;
  subtotalCierreEstimado?: number;
  ivaCierreEstimado?: number;
  impuestoHospedajeCierreEstimado?: number;
  totalCierreEstimado?: number;
  cargos?: Array<{ id: string; descripcion: string; importe: number }>;
  pagos?: Array<{
    id: string;
    metodoPago: string;
    importe: number;
    referencia?: string;
  }>;
};
type Cuenta = { id: string; nombre: string; tipo: string; activo: boolean };
type Convenio = {
  id: string;
  numeroConvenio: string;
  tipo: "EMPRESA" | "AGENCIA";
  nombreComercial: string;
  estado: string;
  creditoDisponible: number;
};

const METODOS = [
  "EFECTIVO",
  "TARJETA",
  "TRANSFERENCIA",
  "CHEQUE",
  "CREDITO_EMPRESA",
  "CREDITO_AGENCIA",
  "OTRO",
];
const dinero = (v: number, moneda = "MXN") =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: moneda,
  }).format(Number(v || 0));

export default function FoliosHotelPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [seleccion, setSeleccion] = useState<Reserva | null>(null);
  const [folio, setFolio] = useState<Folio | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([
    { metodoPago: "EFECTIVO", importe: 0 },
  ]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [r, c] = await Promise.all([
        api.get<Reserva[]>("/hoteleria/operacion/reservaciones"),
        api.get<Cuenta[]>("/credito/cuentas-bancarias"),
      ]);
      setReservas(r.filter((x) => x.estado === "CHECK_IN"));
      setCuentas(c.filter((x) => x.activo));
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo cargar la operación hotelera.",
      );
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const abrir = async (r: Reserva) => {
    setSeleccion(r);
    setError("");
    try {
      const [f, conveniosHotel] = await Promise.all([
        api.get<Folio>(`/hoteleria/operacion/reservaciones/${r.id}/folio`),
        api.get<Convenio[]>(
          `/hoteleria/city-ledger/convenios?hotelId=${r.hotelId}`,
        ),
      ]);
      setFolio(f);
      setConvenios(
        conveniosHotel.filter(
          (convenio) =>
            convenio.estado === "APROBADO" &&
            Number(convenio.creditoDisponible) > 0,
        ),
      );
      const cierre = Number(f.totalCierreEstimado ?? f.total);
      setPagos([
        {
          metodoPago: "EFECTIVO",
          importe: cierre,
          cuentaBancariaId: cuentas.find((c) => c.tipo === "CAJA")?.id,
        },
      ]);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo abrir el folio.",
      );
    }
  };
  const totalPagos = useMemo(
    () => pagos.reduce((s, p) => s + Number(p.importe || 0), 0),
    [pagos],
  );
  const agregar = () =>
    setPagos((p) => [
      ...p,
      {
        metodoPago: "TARJETA",
        importe: 0,
        cuentaBancariaId: cuentas.find((c) => c.tipo === "TPV")?.id,
      },
    ]);
  const quitar = (i: number) =>
    setPagos((prev) => prev.filter((_, idx) => idx !== i));
  const cambiar = (i: number, campo: keyof Pago, valor: string | number) =>
    setPagos((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)),
    );
  const cambiarMetodo = (i: number, metodoPago: string) => {
    const esCredito = metodoPago.startsWith("CREDITO_");
    if (esCredito && folio) {
      const tipo = metodoPago === "CREDITO_EMPRESA" ? "EMPRESA" : "AGENCIA";
      const convenio = convenios.find((item) => item.tipo === tipo);
      const cierre = Number(folio.totalCierreEstimado ?? folio.total);
      setPagos([
        {
          metodoPago,
          importe: cierre,
          convenioId: convenio?.id,
        },
      ]);
      return;
    }
    setPagos((prev) =>
      prev.map((pago, indice) =>
        indice === i
          ? {
              metodoPago,
              importe: pago.importe,
              cuentaBancariaId: cuentas.find((cuenta) =>
                metodoPago === "EFECTIVO"
                  ? cuenta.tipo === "CAJA"
                  : metodoPago === "TARJETA"
                    ? cuenta.tipo === "TPV"
                    : cuenta.tipo !== "CAJA",
              )?.id,
              convenioId: undefined,
            }
          : pago,
      ),
    );
  };
  const checkout = async () => {
    if (!seleccion || !folio) return;
    setGuardando(true);
    setError("");
    try {
      await api.post(
        `/hoteleria/operacion/reservaciones/${seleccion.id}/check-out`,
        {
          claveIdempotencia: crypto.randomUUID(),
          pagos: pagos.map((p) => ({
            ...p,
            importe: Number(p.importe),
            moneda: folio.moneda,
          })),
        },
      );
      setSeleccion(null);
      setFolio(null);
      await cargar();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo cerrar el folio.",
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-700">Recepción y caja</p>
          <h1 className="text-3xl font-bold text-slate-900">
            Folios y check-out
          </h1>
          <p className="text-slate-600">
            Cobros mixtos, impuestos, tesorería y estado contable del hospedaje.
          </p>
        </div>
        <button
          onClick={() => void cargar()}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-white"
        >
          <RefreshCw size={17} className={cargando ? "animate-spin" : ""} />
          Actualizar
        </button>
      </header>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reservas.map((r) => (
          <button
            key={r.id}
            onClick={() => void abrir(r)}
            className="rounded-2xl border bg-white p-5 text-left shadow-sm hover:border-teal-400"
          >
            <div className="flex items-center justify-between">
              <BedDouble className="text-teal-700" />
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
                CHECK-IN
              </span>
            </div>
            <h2 className="mt-4 text-lg font-bold">
              {r.codigo || "Reservación"}
            </h2>
            <p className="text-slate-600">{r.clienteNombre || "Huésped"}</p>
            <p className="mt-3 text-sm text-slate-500">
              {r.fechaEntrada} → {r.fechaSalida}
            </p>
          </button>
        ))}
      </section>
      {!cargando && reservas.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-slate-500">
          No hay huéspedes con check-in pendiente de salida.
        </div>
      )}
      {seleccion && folio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex justify-between gap-3">
              <div>
                <p className="text-sm text-teal-700">{seleccion.codigo}</p>
                <h2 className="text-2xl font-bold">
                  Folio de {seleccion.clienteNombre}
                </h2>
              </div>
              <button
                onClick={() => {
                  setSeleccion(null);
                  setFolio(null);
                }}
              >
                <X />
              </button>
            </div>
            {Number(folio.nochesPendientes || 0) > 0 && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                El cierre incluirá {folio.nochesPendientes} noche(s) aún no
                posteadas. El total mostrado ya las considera.
              </div>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-5">
              {[
                ["Subtotal", folio.subtotalCierreEstimado ?? folio.subtotal],
                ["IVA", folio.ivaCierreEstimado ?? folio.iva],
                [
                  "Imp. hospedaje",
                  folio.impuestoHospedajeCierreEstimado ??
                    folio.impuestoHospedaje,
                ],
                ["Total", folio.totalCierreEstimado ?? folio.total],
                ["Cobrado", folio.totalCobrado],
              ].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{l}</p>
                  <p className="font-bold">{dinero(Number(v), folio.moneda)}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <h3 className="font-bold">Aplicaciones de pago</h3>
              <button
                onClick={agregar}
                className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm"
              >
                <Plus size={15} />
                Agregar medio
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {pagos.map((p, i) => (
                <div
                  key={i}
                  className="grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
                >
                  <select
                    value={p.metodoPago}
                    onChange={(e) => cambiarMetodo(i, e.target.value)}
                    className="rounded-lg border p-2"
                  >
                    {METODOS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={p.importe}
                    onChange={(e) =>
                      cambiar(i, "importe", Number(e.target.value))
                    }
                    className="rounded-lg border p-2"
                  />
                  {p.metodoPago.startsWith("CREDITO_") ? (
                    <select
                      value={p.convenioId || ""}
                      onChange={(e) => cambiar(i, "convenioId", e.target.value)}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 p-2"
                    >
                      <option value="">Convenio aprobado</option>
                      {convenios
                        .filter(
                          (convenio) =>
                            convenio.tipo ===
                            (p.metodoPago === "CREDITO_EMPRESA"
                              ? "EMPRESA"
                              : "AGENCIA"),
                        )
                        .map((convenio) => (
                          <option key={convenio.id} value={convenio.id}>
                            {convenio.numeroConvenio} ·{" "}
                            {convenio.nombreComercial} ·{" "}
                            {dinero(convenio.creditoDisponible)}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <select
                      value={p.cuentaBancariaId || ""}
                      onChange={(e) =>
                        cambiar(i, "cuentaBancariaId", e.target.value)
                      }
                      className="rounded-lg border p-2"
                    >
                      <option value="">Cuenta/caja</option>
                      {cuentas
                        .filter((c) =>
                          p.metodoPago === "EFECTIVO"
                            ? c.tipo === "CAJA"
                            : p.metodoPago === "TARJETA"
                              ? c.tipo === "TPV"
                              : c.tipo !== "CAJA",
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} · {c.tipo}
                          </option>
                        ))}
                    </select>
                  )}
                  <input
                    value={p.referencia || ""}
                    onChange={(e) => cambiar(i, "referencia", e.target.value)}
                    placeholder="Referencia"
                    className="rounded-lg border p-2"
                  />
                  <button
                    disabled={pagos.length === 1}
                    onClick={() => quitar(i)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                    title="Quitar medio"
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
            {(() => {
              const cierre = Number(folio.totalCierreEstimado ?? folio.total);
              return (
                <>
                  <div
                    className={`mt-4 rounded-xl p-4 ${Math.abs(totalPagos - cierre) < 0.01 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
                  >
                    Pagos: <strong>{dinero(totalPagos, folio.moneda)}</strong> ·
                    Total al cierre:{" "}
                    <strong>{dinero(cierre, folio.moneda)}</strong>
                  </div>
                  <button
                    disabled={
                      guardando ||
                      pagos.some((p) => Number(p.importe) <= 0) ||
                      pagos.some(
                        (p) =>
                          p.metodoPago.startsWith("CREDITO_") && !p.convenioId,
                      ) ||
                      Math.abs(totalPagos - cierre) >= 0.01
                    }
                    onClick={() => void checkout()}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-40"
                  >
                    <CreditCard size={18} />
                    {guardando
                      ? "Procesando..."
                      : "Cerrar folio y registrar pagos"}
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </main>
  );
}
