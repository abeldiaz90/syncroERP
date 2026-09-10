"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CreditCard,
  DollarSign,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Truck,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";

interface DatoVenta {
  total: number;
  cantidad: number;
}

interface DashboardEjecutivo {
  fecha: string;
  ventas: { hoy: DatoVenta; semana: DatoVenta; mes: DatoVenta };
  cobranzaHoy: { total: number; pagos: number };
  cxc: { saldo: number; creditos: number };
  cxp: { saldo: number; ordenes: number };
  inventario: { valor: number };
  iva: { traslado: number; acreditable: number; aPagar: number };
  alertas: {
    cuotasVencidas: { total: number; monto: number };
    stockBajo: { total: number };
    requisicionesPendientes: { total: number };
  };
  graficaVentas: { dia: string; total: number; cantidad: number }[];
  topProductos: { nombre: string; sku: string; unidades: number; importe: number }[];
  advertencias?: string[];
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const dinero = (valor: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number(valor ?? 0));

function fechaCorta(valor: string) {
  const fecha = new Date(`${valor}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return valor;
  return `${fecha.getDate()} ${MESES[fecha.getMonth()]}`;
}

function fechaLocalIso(fecha: Date) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function Kpi({
  label,
  valor,
  sub,
  color,
  icon: Icono,
  href,
}: {
  label: string;
  valor: string;
  sub?: string;
  color: string;
  icon: typeof ShoppingBag;
  href?: string;
}) {
  const contenido = (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ backgroundColor: `${color}18` }}>
          <Icono className="h-4 w-4" style={{ color }} />
        </span>
      </div>
      <p className="text-2xl font-extrabold tracking-tight text-slate-900">{valor}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full no-underline">
      {contenido}
    </Link>
  ) : (
    contenido
  );
}

function GraficaVentas({ datos }: { datos: DashboardEjecutivo["graficaVentas"] }) {
  const serie = useMemo(() => {
    const mapa = new Map((Array.isArray(datos) ? datos : []).map((fila) => [fila.dia, Number(fila.total ?? 0)]));
    const hoy = new Date();
    return Array.from({ length: 30 }, (_, indice) => {
      const fecha = new Date(hoy);
      fecha.setDate(fecha.getDate() - (29 - indice));
      const llave = fechaLocalIso(fecha);
      return { dia: llave, total: mapa.get(llave) ?? 0 };
    });
  }, [datos]);

  const maximo = Math.max(1, ...serie.map((fila) => fila.total));

  return (
    <div>
      <div className="flex h-48 items-end gap-1" role="img" aria-label="Ventas diarias de los últimos treinta días">
        {serie.map((fila, indice) => {
          const altura = fila.total > 0 ? Math.max(4, Math.round((fila.total / maximo) * 100)) : 2;
          return (
            <div key={fila.dia} className="group relative flex min-w-0 flex-1 items-end self-stretch">
              <div
                className={`w-full rounded-t-sm ${fila.total > 0 ? "bg-indigo-500" : "bg-slate-200"}`}
                style={{ height: `${altura}%` }}
                title={`${fechaCorta(fila.dia)} · ${dinero(fila.total)}`}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
                {fechaCorta(fila.dia)} · {dinero(fila.total)}
              </div>
              {indice % 7 === 0 ? (
                <span className="absolute top-full mt-2 text-[9px] text-slate-400">{fechaCorta(fila.dia)}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-slate-400">La gráfica se dibuja localmente; no carga scripts ni recursos externos.</p>
    </div>
  );
}

export default function DashboardEjecutivoPage() {
  const [datos, setDatos] = useState<DashboardEjecutivo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [actualizado, setActualizado] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const respuesta = await api.get<DashboardEjecutivo>("/dashboard/ejecutivo");
      setDatos(respuesta);
      setActualizado(new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : e instanceof Error
            ? e.message
            : "No fue posible cargar el panel ejecutivo.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const temporizador = window.setInterval(() => void cargar(), 5 * 60 * 1000);
    return () => window.clearInterval(temporizador);
  }, [cargar]);

  const hoy = new Date();
  const saludo = hoy.getHours() < 12 ? "Buenos días" : hoy.getHours() < 19 ? "Buenas tardes" : "Buenas noches";
  const fechaTexto = `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`;

  const cuotasVencidas = datos?.alertas?.cuotasVencidas ?? { total: 0, monto: 0 };
  const stockBajo = datos?.alertas?.stockBajo ?? { total: 0 };
  const requisiciones = datos?.alertas?.requisicionesPendientes ?? { total: 0 };
  const totalAlertas = Number(cuotasVencidas.total > 0) + Number(stockBajo.total > 0) + Number(requisiciones.total > 0);

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{saludo} 👋</h1>
          <p className="mt-1 text-sm text-slate-500">{fechaTexto} · Panel ejecutivo</p>
        </div>
        <div className="flex items-center gap-3">
          {actualizado ? <span className="text-xs text-slate-400">Actualizado: {actualizado}</span> : null}
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="font-bold">No se pudo actualizar el panel.</p>
          <p className="mt-1">{error}</p>
          {datos ? <p className="mt-1 text-xs">Se conservan los últimos datos válidos mostrados.</p> : null}
        </div>
      ) : null}

      {(datos?.advertencias?.length ?? 0) > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-bold">Algunos indicadores no están disponibles.</p>
          <p className="mt-1">El resto del panel continúa operativo. Revisa: {datos?.advertencias?.join(", ")}.</p>
        </div>
      ) : null}

      {cargando && !datos ? (
        <div className="grid min-h-72 place-items-center rounded-2xl border bg-white">
          <div className="text-center text-sm text-slate-500">
            <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-indigo-500" />
            Cargando indicadores…
          </div>
        </div>
      ) : datos ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Ventas hoy" valor={dinero(datos.ventas?.hoy?.total)} sub={`${datos.ventas?.hoy?.cantidad ?? 0} transacciones`} color="#4f46e5" icon={ShoppingBag} href="/dashboard/ventas/historial" />
            <Kpi label="Cobrado hoy" valor={dinero(datos.cobranzaHoy?.total)} sub={`${datos.cobranzaHoy?.pagos ?? 0} pagos recibidos`} color="#059669" icon={DollarSign} href="/dashboard/creditos/cobranza" />
            <Kpi label="Ventas semana" valor={dinero(datos.ventas?.semana?.total)} sub={`${datos.ventas?.semana?.cantidad ?? 0} ventas`} color="#0284c7" icon={TrendingUp} href="/dashboard/reportes/ventas" />
            <Kpi label="Ventas del mes" valor={dinero(datos.ventas?.mes?.total)} sub={`${datos.ventas?.mes?.cantidad ?? 0} transacciones`} color="#7c3aed" icon={TrendingUp} href="/dashboard/reportes/ventas" />
            <Kpi label="Por cobrar (CxC)" valor={dinero(datos.cxc?.saldo)} sub={`${datos.cxc?.creditos ?? 0} créditos activos`} color="#d97706" icon={CreditCard} href="/dashboard/creditos/creditos" />
            <Kpi label="Por pagar (CxP)" valor={dinero(datos.cxp?.saldo)} sub={`${datos.cxp?.ordenes ?? 0} órdenes pendientes`} color="#e11d48" icon={Truck} href="/dashboard/compras/pago-proveedores" />
            <Kpi label="Valor inventario" valor={dinero(datos.inventario?.valor)} sub="Valuado al costo" color="#059669" icon={Package} href="/dashboard/reportes/inventario" />
            <Kpi label="IVA a pagar" valor={dinero(datos.iva?.aPagar)} sub={`Mes ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`} color="#0891b2" icon={DollarSign} href="/dashboard/finanzas/declaracion-iva" />
          </section>

          {totalAlertas > 0 ? (
            <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-bold text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Alertas que requieren atención
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Link href="/dashboard/creditos/cartera-vencida" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">
                  <b>{cuotasVencidas.total}</b> cuotas vencidas · {dinero(cuotasVencidas.monto)}
                </Link>
                <Link href="/dashboard/reportes/inventario" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                  <b>{stockBajo.total}</b> productos con stock bajo
                </Link>
                <Link href="/dashboard/compras/requisiciones" className="rounded-xl bg-sky-50 p-4 text-sm text-sky-800">
                  <b>{requisiciones.total}</b> requisiciones pendientes
                </Link>
              </div>
            </section>
          ) : null}

          <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-5">
                <h2 className="font-bold text-slate-900">Ventas de los últimos 30 días</h2>
                <p className="text-sm text-slate-500">El panel sigue disponible aunque otro indicador falle.</p>
              </div>
              <GraficaVentas datos={datos.graficaVentas ?? []} />
            </article>

            <article className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">Productos destacados del mes</h2>
              <div className="mt-4 space-y-3">
                {(datos.topProductos ?? []).map((producto, indice) => (
                  <div key={`${producto.sku}-${indice}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{producto.nombre || "Producto"}</p>
                      <p className="text-xs text-slate-500">{producto.sku || "Sin SKU"} · {producto.unidades ?? 0} unidades</p>
                    </div>
                    <b className="whitespace-nowrap text-sm text-slate-900">{dinero(producto.importe)}</b>
                  </div>
                ))}
                {(datos.topProductos?.length ?? 0) === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Sin ventas para mostrar en el periodo.</p>
                ) : null}
              </div>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
