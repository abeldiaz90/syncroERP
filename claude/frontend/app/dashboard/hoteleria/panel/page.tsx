"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Hotel,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { solicitarTexto } from "@/components/ui/dialogos";
import { fechaCorta } from "@/lib/fechas";
import { plural } from "@/lib/format";

import { useT } from '@/components/I18nProvider';
type Propiedad = { id: string; nombre: string };
type OcupadaSinHuesped = { id: string; numero: string };
type Panel = {
  fechaOperativa: string;
  /*
   * Una habitación OCUPADA sin nadie dentro no se puede vender y no se puede
   * liberar con un check-out, porque no hay a quién hacérselo. Si no sale
   * aquí, no sale en ningún lado.
   */
  integridad: {
    ok: boolean;
    ocupadasSinHuesped: OcupadaSinHuesped[];
    huespedSinHabitacionOcupada: {
      reservacionId: string;
      codigo: string;
      huesped: string | null;
      habitacion: string | null;
    }[];
  };
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
  const t = useT();
  const [hoteles, setHoteles] = useState<Propiedad[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [liberando, setLiberando] = useState("");

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
          : t("No se pudieron cargar las propiedades."),
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
          : t("No se pudo cargar la operación hotelera."),
      );
    } finally {
      setCargando(false);
    }
  }, [hotelId]);

  /*
   * El motivo no es un trámite: es lo único que explica, meses después, por
   * qué una habitación ocupada dejó de estarlo sin pasar por caja.
   */
  const liberar = useCallback(
    async (hab: OcupadaSinHuesped) => {
      const motivo = await solicitarTexto(
        `La ${hab.numero} figura ocupada y no hay nadie dentro. Queda en limpieza y el motivo se guarda en la bitácora. ¿Por qué se libera?`,
        {
          titulo: `Liberar la habitación ${hab.numero}`,
          obligatorio: true,
          minimo: 10,
        },
      );
      if (!motivo) return;
      setLiberando(hab.id);
      setError("");
      try {
        await api.post(
          `/hoteleria/housekeeping/habitaciones/${hab.id}/liberar-sin-huesped`,
          { motivo },
        );
        await cargarPanel();
      } catch (e) {
        setError(
          e instanceof ApiError
            ? e.mensajeParaPantalla()
            : t("No se pudo liberar la habitación."),
        );
      } finally {
        setLiberando("");
      }
    },
    [cargarPanel],
  );

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
              
              {t("Centro de operación")}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {hotel?.nombre ?? t("Panel hotelero")}
            </h1>
            <p className="mt-2 text-sm text-white/60">
              {t("Fecha operativa {n0}", { n0: fechaCorta(panel?.fechaOperativa) })}</p>
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
                    {t(item.nombre)}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => void cargarPanel()}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900"
            >
              <RefreshCw className="mr-2 inline h-4 w-4" />  {t("Actualizar")}
            </button>
          </div>
        </div>
        {panel && (
          <div className="mt-8 flex items-end gap-3">
            <span className="text-6xl font-semibold tabular-nums">
              {panel.habitaciones.ocupacionPorcentaje}
            </span>
            <span className="mb-2 text-xl text-white/50">{t("% ocupación")}</span>
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {t(error)}
        </div>
      )}
      {cargando ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
        </div>
      ) : panel ? (
        <>
          <section
            className={`rounded-2xl border p-4 ${
              panel.integridad.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="flex items-start gap-3">
              {panel.integridad.ok ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              ) : (
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              )}
              <div className="min-w-0">
                <b className="text-sm">
                  {panel.integridad.ok
                    ? t("El rack coincide con quién está en casa")
                    : t("El rack no coincide con quién está en casa")}
                </b>
                {panel.integridad.ok ? (
                  <p className="mt-1 text-sm">
                    
                    {t("Cada habitación ocupada tiene su huésped, y cada huésped su habitación.")}
                  </p>
                ) : (
                  <div className="mt-2 space-y-3 text-sm">
                    {panel.integridad.ocupadasSinHuesped.length > 0 && (
                      <div>
                        <p>
                          {t("{n0}{n1} sin nadie dentro. Una habitación así no se puede vender, y tampoco se libera con un check-out: no hay huésped a quien hacérselo.", { n0: plural(
                            panel.integridad.ocupadasSinHuesped.length,
                            t("habitación figura ocupada"),
                            t("habitaciones figuran ocupadas"),
                          ), n1: " " })}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {panel.integridad.ocupadasSinHuesped.map((hab) => (
                            <button
                              key={hab.id}
                              onClick={() => void liberar(hab)}
                              disabled={liberando === hab.id}
                              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold disabled:opacity-50"
                            >
                              {liberando === hab.id
                                ? t("Liberando…")
                                : `Liberar ${hab.numero}`}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-amber-800/80">
                          Liberar la deja en <b>{t("limpieza")}</b>, nunca disponible:
                          lo que estuvo ocupado se limpia e inspecciona antes de
                          volver a venderse. Pide el motivo y queda en la
                          bitácora.
                        </p>
                      </div>
                    )}
                    {panel.integridad.huespedSinHabitacionOcupada.length > 0 && (
                      <div>
                        <p>
                          {t("{n0}{n1} y su habitación no figura ocupada. Esto se resuelve en recepción, no desde aquí: revisa el check-in.", { n0: plural(
                            panel.integridad.huespedSinHabitacionOcupada.length,
                            t("huésped está en casa"),
                            t("huéspedes están en casa"),
                          ), n1: " " })}</p>
                        <ul className="mt-1 list-disc pl-5">
                          {panel.integridad.huespedSinHabitacionOcupada.map(
                            (r) => (
                              <li key={r.reservacionId}>
                                {r.codigo}
                                {r.huesped ? ` · ${r.huesped}` : ""}
                                {r.habitacion
                                  ? ` · habitación ${r.habitacion}`
                                  : t("· sin habitación asignada")}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                t("Llegadas del día"),
                panel.operacion.llegadasHoy,
                CalendarCheck,
                "text-blue-600",
              ],
              [
                t("Salidas del día"),
                panel.operacion.salidasHoy,
                BedDouble,
                "text-violet-600",
              ],
              [
                t("Huéspedes en casa"),
                panel.operacion.huespedesEnCasa,
                Users,
                "text-emerald-600",
              ],
              [
                t("Folios abiertos"),
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
                <h2 className="font-semibold">{t("Estado de habitaciones")}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  [
                    t("Disponibles"),
                    panel.habitaciones.disponibles,
                    "bg-emerald-500",
                  ],
                  [t("Ocupadas"), panel.habitaciones.ocupadas, "bg-rose-500"],
                  [t("Limpieza"), panel.habitaciones.limpieza, "bg-amber-500"],
                  [
                    t("Inspección"),
                    panel.habitaciones.inspeccion,
                    "bg-violet-500",
                  ],
                  [
                    t("Mantenimiento"),
                    panel.habitaciones.mantenimiento,
                    "bg-slate-400",
                  ],
                  [t("Bloqueadas"), panel.habitaciones.bloqueadas, "bg-slate-700"],
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
                
                {t("Saldo en folios abiertos")}
              </p>
              <p className="mt-1 text-4xl font-semibold tracking-tight">
                {dinero(panel.operacion.saldoFoliosAbiertos)}
              </p>
              <p className="mt-6 text-sm text-white/70">
                {plural(
                  panel.operacion.reservacionesActivas,
                  t("reservación activa"),
                  t("reservaciones activas"),
                )}{" "}
                y{" "}
                {plural(
                  panel.habitaciones.operativas,
                  t("habitación operativa"),
                  t("habitaciones operativas"),
                )}
                .
              </p>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
