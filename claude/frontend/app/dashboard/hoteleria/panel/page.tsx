"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BedDouble,
  CalendarCheck,
  CircleDollarSign,
  ClipboardCheck,
  Hotel,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { fechaCorta } from "@/lib/fechas";

type Propiedad = { id: string; nombre: string };
type Panel = {
  fechaOperativa: string;
  habitaciones: {
    total: number;
    operativas: number;
    ocupadas: number;
    disponibles: number;
    limpieza: number;
    inspeccion: number;
    mantenimiento: number;
    bloqueadas: number;
    ocupacionPorcentaje: number;
  };
  operacion: {
    llegadasHoy: number;
    salidasHoy: number;
    huespedesEnCasa: number;
    reservacionesActivas: number;
    foliosAbiertos: number;
    saldoFoliosAbiertos: number;
  };
};

const dinero = (valor: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(valor || 0);

export default function PanelHoteleroPage() {
  const [hoteles, setHoteles] = useState<Propiedad[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargarHoteles = useCallback(async () => {
    try {
      const datos = await api.get<Propiedad[]>("/hoteleria/config/hoteles");
      setHoteles(datos);
      setHotelId((actual) =>
        datos.some((hotel) => hotel.id === actual)
          ? actual
          : (datos[0]?.id ?? ""),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudieron cargar las propiedades.",
      );
    }
  }, []);

  const cargarPanel = useCallback(async () => {
    if (!hotelId) return;
    setCargando(true);
    setError("");
    try {
      setPanel(
        await api.get<Panel>("/hoteleria/operacion/panel", {
          query: { hotelId },
        }),
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : "No se pudo cargar la operación hotelera.",
      );
    } finally {
      setCargando(false);
    }
  }, [hotelId]);

  useEffect(() => {
    void cargarHoteles();
  }, [cargarHoteles]);
  useEffect(() => {
    void cargarPanel();
  }, [cargarPanel]);

  const hotel = hoteles.find((item) => item.id === hotelId);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white md:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-teal-300">
              Centro de operación
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {hotel?.nombre ?? "Panel hotelero"}
            </h1>
            <p className="mt-2 text-sm text-white/60">
              Fecha operativa {fechaCorta(panel?.fechaOperativa)}
            </p>
          </div>
          <div className="flex gap-2">
            {hoteles.length > 1 && (
              <select
                value={hotelId}
                onChange={(e) => setHotelId(e.target.value)}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm"
              >
                {hoteles.map((item) => (
                  <option
                    className="text-slate-900"
                    key={item.id}
                    value={item.id}
                  >
                    {item.nombre}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => void cargarPanel()}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900"
            >
              <RefreshCw className="mr-2 inline h-4 w-4" /> Actualizar
            </button>
          </div>
        </div>
        {panel && (
          <div className="mt-8 flex items-end gap-3">
            <span className="text-6xl font-semibold tabular-nums">
              {panel.habitaciones.ocupacionPorcentaje}
            </span>
            <span className="mb-2 text-xl text-white/50">% ocupación</span>
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}
      {cargando ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
        </div>
      ) : panel ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Llegadas de hoy",
                panel.operacion.llegadasHoy,
                CalendarCheck,
                "text-blue-600",
              ],
              [
                "Salidas de hoy",
                panel.operacion.salidasHoy,
                BedDouble,
                "text-violet-600",
              ],
              [
                "Huéspedes en casa",
                panel.operacion.huespedesEnCasa,
                Users,
                "text-emerald-600",
              ],
              [
                "Folios abiertos",
                panel.operacion.foliosAbiertos,
                CircleDollarSign,
                "text-amber-600",
              ],
            ].map(([titulo, valor, Icono, color]) => {
              const Icon = Icono as typeof Hotel;
              return (
                <div
                  key={String(titulo)}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <Icon className={`h-5 w-5 ${color}`} />
                  <p className="mt-5 text-3xl font-semibold tabular-nums">
                    {String(valor)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {String(titulo)}
                  </p>
                </div>
              );
            })}
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="mb-5 flex items-center gap-2">
                <Hotel className="h-5 w-5 text-slate-500" />
                <h2 className="font-semibold">Estado de habitaciones</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  [
                    "Disponibles",
                    panel.habitaciones.disponibles,
                    "bg-emerald-500",
                  ],
                  ["Ocupadas", panel.habitaciones.ocupadas, "bg-rose-500"],
                  ["Limpieza", panel.habitaciones.limpieza, "bg-amber-500"],
                  [
                    "Inspección",
                    panel.habitaciones.inspeccion,
                    "bg-violet-500",
                  ],
                  [
                    "Mantenimiento",
                    panel.habitaciones.mantenimiento,
                    "bg-slate-400",
                  ],
                  ["Bloqueadas", panel.habitaciones.bloqueadas, "bg-slate-700"],
                ].map(([etiqueta, valor, color]) => (
                  <div
                    key={String(etiqueta)}
                    className="rounded-xl bg-slate-50 p-4"
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${color}`}
                    />
                    <p className="mt-2 text-2xl font-semibold">
                      {String(valor)}
                    </p>
                    <p className="text-xs text-slate-500">{String(etiqueta)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-teal-700 p-6 text-white">
              <ClipboardCheck className="h-6 w-6 text-teal-200" />
              <p className="mt-8 text-sm text-white/60">
                Saldo en folios abiertos
              </p>
              <p className="mt-1 text-4xl font-semibold tracking-tight">
                {dinero(panel.operacion.saldoFoliosAbiertos)}
              </p>
              <p className="mt-6 text-sm text-white/70">
                {panel.operacion.reservacionesActivas} reservaciones activas y{" "}
                {panel.habitaciones.operativas} habitaciones operativas.
              </p>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
