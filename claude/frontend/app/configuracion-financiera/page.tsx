"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Building2,
  Calculator,
  Check,
  CircleAlert,
  Landmark,
  Loader2,
  PackageCheck,
  PlayCircle,
  ReceiptText,
  Save,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";

type EstadoActivacion = {
  estado: string;
  activa: boolean;
  modo: "GUIADO" | "CONTADOR" | null;
  pasoActual: number;
  fechaInicioContable: string | null;
  empresaEnOperacion: boolean | null;
  configuracion: Partial<Formulario>;
  diagnostico: Diagnostico;
};

type Diagnostico = {
  listoParaActivar: boolean;
  identidadFiscal: {
    completa: boolean;
    mensaje: string;
    nombreComercial?: string;
    razonSocial?: string;
    rfc?: string;
    regimenFiscal?: string;
    codigoPostal?: string;
    tipoPersona?: "FISICA" | "MORAL" | null;
  };
  cuentas: { completas: boolean; total: number; rolesFaltantes: string[] };
  clasificacionSat: {
    completo: boolean;
    totalCuentasAfectables: number;
    totalMapeadas: number;
    pendientes: unknown[];
    sinConfirmar: unknown[];
    advertencias: string[];
  };
  impuestos: { completos: boolean; configurados: string[] };
  operacion: { completa: boolean };
  apertura: {
    confirmada: boolean;
    polizasHistoricas: number;
    seCrearaPoliza: boolean;
    advertencia: string | null;
  };
  revision: { confirmada: boolean };
  asientosFallidos: number;
};

type Formulario = {
  modo: "GUIADO" | "CONTADOR";
  empresaEnOperacion: boolean;
  fechaInicioContable: string;
  manejaInventario: boolean;
  vendeCredito: boolean;
  compraCredito: boolean;
  preciosIncluyenIVA: boolean;
  metodoCosteo: "PROMEDIO" | "FIFO" | "ESTANDAR" | "ESPECIFICO";
  metodosCobro: string[];
  saldoCaja: number;
  saldoBancos: number;
  saldoClientes: number;
  saldoInventario: number;
  saldoProveedores: number;
  confirmaSaldosIniciales: boolean;
  confirmaRevision: boolean;
};

type Simulacion = {
  diagnostico: Diagnostico;
  simulacion: {
    apertura: {
      partidas: Array<{
        rol: string;
        numeroCuenta: string;
        cuenta: string;
        cargo: number;
        abono: number;
      }>;
      totalCargos: number;
      totalAbonos: number;
    };
    ejemplos: Array<{
      titulo: string;
      explicacion: string;
      partidas: Array<{ rol: string; cargo: number; abono: number }>;
    }>;
  };
};

const PASOS = [
  { titulo: "Cómo empezar", icono: Building2 },
  { titulo: "Cómo opera", icono: ReceiptText },
  { titulo: "Saldos iniciales", icono: WalletCards },
  { titulo: "Probar y activar", icono: ShieldCheck },
];

const inicial: Formulario = {
  modo: "GUIADO",
  empresaEnOperacion: false,
  fechaInicioContable: new Date().toISOString().substring(0, 10),
  manejaInventario: true,
  vendeCredito: false,
  compraCredito: false,
  preciosIncluyenIVA: true,
  metodoCosteo: "PROMEDIO",
  metodosCobro: ["EFECTIVO"],
  saldoCaja: 0,
  saldoBancos: 0,
  saldoClientes: 0,
  saldoInventario: 0,
  saldoProveedores: 0,
  confirmaSaldosIniciales: false,
  confirmaRevision: false,
};

const dinero = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function ConfiguracionFinancieraPage() {
  const router = useRouter();
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState<Formulario>(inicial);
  const [estado, setEstado] = useState<EstadoActivacion | null>(null);
  const [simulacion, setSimulacion] = useState<Simulacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<EstadoActivacion>("/finanzas/activacion")
      .then((respuesta) => {
        setEstado(respuesta);
        if (respuesta.activa) {
          setPaso(5);
          return;
        }
        const configuracion = respuesta.configuracion ?? {};
        setForm((actual) => ({
          ...actual,
          ...configuracion,
          modo: respuesta.modo ?? configuracion.modo ?? actual.modo,
          empresaEnOperacion:
            respuesta.empresaEnOperacion ??
            configuracion.empresaEnOperacion ??
            actual.empresaEnOperacion,
          fechaInicioContable:
            respuesta.fechaInicioContable?.substring(0, 10) ??
            configuracion.fechaInicioContable ??
            actual.fechaInicioContable,
        }));
        setPaso(Math.min(Math.max(respuesta.pasoActual || 1, 1), 4));
      })
      .catch((e) => setError(mensaje(e)))
      .finally(() => setCargando(false));
  }, []);

  const hayHistorico =
    (estado?.diagnostico?.apertura?.polizasHistoricas ?? 0) > 0;
  const totalActivos =
    Number(form.saldoCaja) +
    Number(form.saldoBancos) +
    Number(form.saldoClientes) +
    Number(form.saldoInventario);
  const patrimonio = totalActivos - Number(form.saldoProveedores);

  const seleccionarCobro = (valor: string) => {
    setForm((actual) => ({
      ...actual,
      metodosCobro: actual.metodosCobro.includes(valor)
        ? actual.metodosCobro.filter((item) => item !== valor)
        : [...actual.metodosCobro, valor],
    }));
  };

  const guardarPaso = async (numero: number, avanzar = true) => {
    setError("");
    if (numero === 1 && !form.fechaInicioContable)
      return setError(
        "Selecciona la fecha desde la que controlarás la contabilidad.",
      );
    if (numero === 2 && form.metodosCobro.length === 0)
      return setError("Selecciona al menos una forma habitual de cobro.");
    if (numero === 3 && !form.confirmaSaldosIniciales)
      return setError(
        "Confirma los saldos iniciales, incluso cuando todos sean cero.",
      );

    setGuardando(true);
    try {
      const datosPorPaso: Record<number, Partial<Formulario>> = {
        1: {
          modo: form.modo,
          empresaEnOperacion: form.empresaEnOperacion,
          fechaInicioContable: form.fechaInicioContable,
        },
        2: {
          manejaInventario: form.manejaInventario,
          vendeCredito: form.vendeCredito,
          compraCredito: form.compraCredito,
          preciosIncluyenIVA: form.preciosIncluyenIVA,
          metodoCosteo: form.metodoCosteo,
          metodosCobro: form.metodosCobro,
        },
        3: {
          saldoCaja: hayHistorico ? 0 : Number(form.saldoCaja),
          saldoBancos: hayHistorico ? 0 : Number(form.saldoBancos),
          saldoClientes: hayHistorico ? 0 : Number(form.saldoClientes),
          saldoInventario: hayHistorico ? 0 : Number(form.saldoInventario),
          saldoProveedores: hayHistorico ? 0 : Number(form.saldoProveedores),
          confirmaSaldosIniciales: form.confirmaSaldosIniciales,
        },
        4: { confirmaRevision: form.confirmaRevision },
      };
      const respuesta = await api.put<EstadoActivacion>(
        `/finanzas/activacion/pasos/${numero}`,
        datosPorPaso[numero],
      );
      setEstado(respuesta);
      if (avanzar) setPaso(Math.min(numero + 1, 4));
      if (numero === 3) await obtenerSimulacion();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const obtenerSimulacion = async () => {
    try {
      const respuesta = await api.post<Simulacion>(
        "/finanzas/activacion/simular",
      );
      setSimulacion(respuesta);
      return respuesta;
    } catch (e) {
      setError(mensaje(e));
      return null;
    }
  };

  useEffect(() => {
    if (paso === 4 && !simulacion) obtenerSimulacion();
  }, [paso]);

  const activar = async () => {
    if (!form.confirmaRevision)
      return setError("Confirma la revisión final antes de activar Finanzas.");
    setGuardando(true);
    setError("");
    try {
      const revisado = await api.put<EstadoActivacion>(
        "/finanzas/activacion/pasos/4",
        { confirmaRevision: form.confirmaRevision },
      );
      setEstado(revisado);
      const activado = await api.post<EstadoActivacion>(
        "/finanzas/activacion/activar",
      );
      setEstado(activado);
      setPaso(5);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const requisitos = useMemo(() => {
    const d = simulacion?.diagnostico ?? estado?.diagnostico;
    if (!d) return [];
    return [
      ["Identidad fiscal", d.identidadFiscal.completa],
      ["Catálogo contable", d.cuentas.completas],
      ["Clasificación SAT", d.clasificacionSat?.completo ?? false],
      ["Impuestos", d.impuestos.completos],
      ["Forma de operar", d.operacion.completa],
      ["Saldos iniciales", d.apertura.confirmada],
      ["Revisión final", form.confirmaRevision || d.revision.confirmada],
    ] as Array<[string, boolean]>;
  }, [estado, simulacion, form.confirmaRevision]);

  if (cargando)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <div className="text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-violet-600" />
          Preparando el Asistente Maestro…
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <p className="font-black text-slate-900">
              Asistente Maestro de Finanzas
            </p>
            <p className="text-xs text-slate-500">
              Configuración segura antes de modificar los libros contables
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="ml-auto rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
          >
            Guardar y salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 py-8">
        {paso <= 4 && (
          <div className="mb-7 grid grid-cols-4 gap-2">
            {PASOS.map(({ titulo, icono: Icono }, indice) => {
              const numero = indice + 1;
              return (
                <div key={titulo}>
                  <div
                    className={`h-1.5 rounded-full ${
                      numero <= paso ? "bg-violet-600" : "bg-slate-200"
                    }`}
                  />
                  <div
                    className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${
                      numero === paso ? "text-violet-700" : "text-slate-400"
                    }`}
                  >
                    <Icono className="h-3.5 w-3.5" />
                    {numero}. {titulo}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          {paso === 1 && (
            <>
              <Titulo
                icono={<Building2 />}
                titulo="Primero entendamos de dónde partes"
                texto="No necesitas saber cargos ni abonos. El sistema adaptará los siguientes pasos."
              />
              <div className={`mb-6 rounded-2xl border p-4 ${
                estado?.diagnostico?.identidadFiscal?.completa
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50"
              }`}>
                <div className="flex flex-wrap items-start gap-3">
                  <BadgeCheck className={`mt-0.5 h-5 w-5 ${
                    estado?.diagnostico?.identidadFiscal?.completa ? "text-emerald-600" : "text-amber-600"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">Identidad fiscal precargada</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {estado?.diagnostico?.identidadFiscal?.razonSocial || estado?.diagnostico?.identidadFiscal?.nombreComercial || "Empresa sin razón social"}
                      {estado?.diagnostico?.identidadFiscal?.rfc ? ` · RFC ${estado?.diagnostico?.identidadFiscal?.rfc}` : " · RFC pendiente"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{estado?.diagnostico?.identidadFiscal?.mensaje}</p>
                  </div>
                  {!estado?.diagnostico?.identidadFiscal?.completa && (
                    <button
                      type="button"
                      onClick={() => router.push("/configuracion-inicial")}
                      className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
                    >
                      Completar datos fiscales
                    </button>
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Opcion
                  activo={form.modo === "GUIADO"}
                  titulo="No sé contabilidad"
                  texto="Usaré explicaciones sencillas y el ERP construirá la configuración."
                  recomendado
                  onClick={() => setForm({ ...form, modo: "GUIADO" })}
                />
                <Opcion
                  activo={form.modo === "CONTADOR"}
                  titulo="Soy contador o tengo apoyo"
                  texto="Conservaré los términos técnicos y podré revisar las cuentas generadas."
                  onClick={() => setForm({ ...form, modo: "CONTADOR" })}
                />
                <Opcion
                  activo={!form.empresaEnOperacion}
                  titulo="Empresa nueva"
                  texto="Empiezo sin operaciones o saldos anteriores."
                  onClick={() =>
                    setForm({ ...form, empresaEnOperacion: false })
                  }
                />
                <Opcion
                  activo={form.empresaEnOperacion}
                  titulo="Ya venía operando"
                  texto="Necesito reconocer dinero, inventario, cobros y deudas existentes."
                  onClick={() => setForm({ ...form, empresaEnOperacion: true })}
                />
              </div>
              <label className="mt-5 block text-sm font-semibold text-slate-700">
                ¿Desde qué fecha llevará SyncroERP tu contabilidad?
                <input
                  type="date"
                  value={form.fechaInicioContable}
                  onChange={(e) =>
                    setForm({ ...form, fechaInicioContable: e.target.value })
                  }
                  className="mt-2 block w-full max-w-sm rounded-xl border border-slate-300 px-3 py-3 font-normal"
                />
              </label>
            </>
          )}

          {paso === 2 && (
            <>
              <Titulo
                icono={<PackageCheck />}
                titulo="¿Cómo funciona normalmente tu negocio?"
                texto="Estas respuestas determinan qué cuentas y controles necesita el ERP."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Interruptor
                  titulo="Manejo mercancía o inventario"
                  texto="Controlará existencias, costo de ventas y mermas."
                  valor={form.manejaInventario}
                  onChange={(valor) =>
                    setForm({ ...form, manejaInventario: valor })
                  }
                />
                <Interruptor
                  titulo="Vendo a crédito"
                  texto="Usará clientes por cobrar además de caja y bancos."
                  valor={form.vendeCredito}
                  onChange={(valor) =>
                    setForm({ ...form, vendeCredito: valor })
                  }
                />
                <Interruptor
                  titulo="Compro a crédito"
                  texto="Registrará lo que todavía debes a proveedores."
                  valor={form.compraCredito}
                  onChange={(valor) =>
                    setForm({ ...form, compraCredito: valor })
                  }
                />
                <Interruptor
                  titulo="Mis precios mostrados incluyen IVA"
                  texto="Ayudará a explicar el desglose; no cambia el tratamiento fiscal del producto."
                  valor={form.preciosIncluyenIVA}
                  onChange={(valor) =>
                    setForm({ ...form, preciosIncluyenIVA: valor })
                  }
                />
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Método de costeo del inventario
                  <select
                    value={form.metodoCosteo}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        metodoCosteo: e.target
                          .value as Formulario["metodoCosteo"],
                      })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"
                  >
                    <option value="PROMEDIO">
                      Promedio ponderado — recomendado
                    </option>
                    <option value="FIFO">
                      Primeras entradas, primeras salidas
                    </option>
                    <option value="ESTANDAR">Costo estándar</option>
                    <option value="ESPECIFICO">
                      Identificación específica
                    </option>
                  </select>
                </label>
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Formas habituales de cobro
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["EFECTIVO", "TRANSFERENCIA", "TARJETA", "CREDITO"].map(
                      (metodo) => (
                        <button
                          key={metodo}
                          type="button"
                          onClick={() => seleccionarCobro(metodo)}
                          className={`rounded-full border px-3 py-2 text-xs font-bold ${
                            form.metodosCobro.includes(metodo)
                              ? "border-violet-500 bg-violet-50 text-violet-700"
                              : "border-slate-200 text-slate-500"
                          }`}
                        >
                          {metodo}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {paso === 3 && (
            <>
              <Titulo
                icono={<WalletCards />}
                titulo="¿Qué tenía la empresa al comenzar?"
                texto="Captura totales de control. Posteriormente podrás detallar clientes, proveedores y bancos."
              />
              {hayHistorico && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <b>
                    Detectamos {estado?.diagnostico?.apertura?.polizasHistoricas}{" "}
                    pólizas existentes.
                  </b>{" "}
                  No generaremos otra póliza de apertura para evitar duplicar
                  saldos. Confirma únicamente que revisaste esta situación.
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <Monto
                  etiqueta="Dinero en caja"
                  valor={form.saldoCaja}
                  deshabilitado={hayHistorico}
                  onChange={(saldoCaja) => setForm({ ...form, saldoCaja })}
                />
                <Monto
                  etiqueta="Dinero en cuentas bancarias"
                  valor={form.saldoBancos}
                  deshabilitado={hayHistorico}
                  onChange={(saldoBancos) => setForm({ ...form, saldoBancos })}
                />
                <Monto
                  etiqueta="Lo que deben los clientes"
                  valor={form.saldoClientes}
                  deshabilitado={hayHistorico}
                  onChange={(saldoClientes) =>
                    setForm({ ...form, saldoClientes })
                  }
                />
                <Monto
                  etiqueta="Valor del inventario existente"
                  valor={form.saldoInventario}
                  deshabilitado={hayHistorico}
                  onChange={(saldoInventario) =>
                    setForm({ ...form, saldoInventario })
                  }
                />
                <Monto
                  etiqueta="Lo que debes a proveedores"
                  valor={form.saldoProveedores}
                  deshabilitado={hayHistorico}
                  onChange={(saldoProveedores) =>
                    setForm({ ...form, saldoProveedores })
                  }
                />
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase text-slate-400">
                    Patrimonio inicial calculado
                  </p>
                  <p
                    className={`mt-2 text-2xl font-black ${
                      patrimonio < 0 ? "text-rose-600" : "text-slate-900"
                    }`}
                  >
                    {dinero.format(patrimonio)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Activos menos deudas capturadas.
                  </p>
                </div>
              </div>
              <Confirmacion
                marcado={form.confirmaSaldosIniciales}
                onChange={(confirmaSaldosIniciales) =>
                  setForm({ ...form, confirmaSaldosIniciales })
                }
              >
                Confirmo que estos totales fueron revisados. Si no tengo saldos
                anteriores, confirmo que comienzan en cero.
              </Confirmacion>
            </>
          )}

          {paso === 4 && (
            <>
              <Titulo
                icono={<PlayCircle />}
                titulo="Comprueba cómo registrará el ERP"
                texto="Nada se contabiliza hasta que pulses Activar Finanzas."
              />
              {!estado?.diagnostico?.identidadFiscal?.completa && (
                <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <div>
                    <b>Falta completar la identidad fiscal.</b>
                    <p className="mt-1">
                      {estado?.diagnostico?.identidadFiscal?.mensaje}
                    </p>
                  </div>
                  <button
                    onClick={() => router.push("/configuracion-inicial")}
                    className="shrink-0 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white"
                  >
                    Completar datos
                  </button>
                </div>
              )}
              {!(
                simulacion?.diagnostico?.clasificacionSat?.completo ??
                estado?.diagnostico?.clasificacionSat?.completo
              ) && (
                <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div>
                    <b>Hay cuentas sin clasificación oficial SAT.</b>
                    <p className="mt-1">
                      Revisa las equivalencias sugeridas antes de activar la
                      configuración.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      router.push("/dashboard/finanzas/catalogos-sat")
                    }
                    className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white"
                  >
                    Revisar SAT
                  </button>
                </div>
              )}
              <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
                <div>
                  <h3 className="mb-3 font-bold text-slate-900">
                    Simulación de apertura
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    {simulacion?.simulacion?.apertura?.partidas?.length ? (
                      <>
                        {simulacion?.simulacion?.apertura?.partidas?.map(
                          (partida) => (
                            <div
                              key={partida.rol}
                              className="grid grid-cols-[1fr_95px_95px] border-b border-slate-100 px-4 py-3 text-sm"
                            >
                              <div>
                                <p className="font-semibold text-slate-800">
                                  {partida.cuenta}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {partida.numeroCuenta}
                                </p>
                              </div>
                              <p className="text-right text-slate-700">
                                {partida.cargo
                                  ? dinero.format(partida.cargo)
                                  : "—"}
                              </p>
                              <p className="text-right text-slate-700">
                                {partida.abono
                                  ? dinero.format(partida.abono)
                                  : "—"}
                              </p>
                            </div>
                          ),
                        )}
                        <div className="grid grid-cols-[1fr_95px_95px] bg-slate-50 px-4 py-3 text-sm font-black">
                          <span>Totales</span>
                          <span className="text-right">
                            {dinero.format(
                              simulacion?.simulacion?.apertura?.totalCargos ?? 0,
                            )}
                          </span>
                          <span className="text-right">
                            {dinero.format(
                              simulacion?.simulacion?.apertura?.totalAbonos ?? 0,
                            )}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="p-5 text-sm text-slate-500">
                        No se generará póliza de apertura: los saldos son cero o
                        ya existen pólizas históricas.
                      </p>
                    )}
                  </div>
                  <div className="mt-5 space-y-3">
                    {simulacion?.simulacion?.ejemplos?.map((ejemplo) => (
                      <div
                        key={ejemplo.titulo}
                        className="rounded-xl border border-indigo-100 bg-indigo-50 p-4"
                      >
                        <p className="font-bold text-indigo-950">
                          {ejemplo.titulo}
                        </p>
                        <p className="mt-1 text-sm text-indigo-800">
                          {ejemplo.explicacion}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 font-bold text-slate-900">
                    Verificación
                  </h3>
                  <div className="rounded-xl border border-slate-200 p-4">
                    {requisitos.map(([nombre, completo]) => (
                      <div
                        key={nombre}
                        className="flex items-center gap-2 border-b border-slate-100 py-2.5 text-sm last:border-0"
                      >
                        <span
                          className={`grid h-5 w-5 place-items-center rounded-full ${
                            completo
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {completo ? <Check className="h-3.5 w-3.5" /> : "!"}
                        </span>
                        {nombre}
                      </div>
                    ))}
                  </div>
                  <Confirmacion
                    marcado={form.confirmaRevision}
                    onChange={(confirmaRevision) =>
                      setForm({ ...form, confirmaRevision })
                    }
                  >
                    Confirmo que revisé la simulación y entiendo que la
                    configuración servirá como base de los registros futuros.
                  </Confirmacion>
                  <p className="mt-3 text-xs text-slate-400">
                    Esto no sustituye la revisión profesional del tratamiento
                    fiscal de cada operación.
                  </p>
                </div>
              </div>
            </>
          )}

          {paso === 5 && (
            <div className="py-7 text-center">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-emerald-100">
                <BadgeCheck className="h-11 w-11 text-emerald-600" />
              </div>
              <h1 className="text-3xl font-black text-slate-900">
                Finanzas está activo
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                La empresa ya tiene una base fiscal, cuentas funcionales,
                impuestos y reglas operativas verificadas. Las acciones
                contables están habilitadas.
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  onClick={() => router.push("/dashboard/finanzas/polizas")}
                  className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700"
                >
                  Entrar a Finanzas
                </button>
                <button
                  onClick={() =>
                    router.push("/dashboard/finanzas/catalogos-sat")
                  }
                  className="rounded-xl border border-violet-300 px-5 py-3 text-sm font-semibold text-violet-700"
                >
                  Revisar clasificación SAT
                </button>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  Volver al panel
                </button>
              </div>
            </div>
          )}

          {paso <= 4 && (
            <div className="mt-8 flex justify-between border-t border-slate-100 pt-5">
              <button
                onClick={() =>
                  paso === 1
                    ? router.push("/dashboard")
                    : setPaso((actual) => actual - 1)
                }
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeft className="h-4 w-4" /> Atrás
              </button>
              {paso < 4 ? (
                <button
                  onClick={() => guardarPaso(paso)}
                  disabled={guardando}
                  className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {guardando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar y continuar <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={activar}
                  disabled={guardando}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {guardando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BookOpenCheck className="h-4 w-4" />
                  )}
                  Activar Finanzas
                </button>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function mensaje(error: unknown) {
  return error instanceof ApiError
    ? error.mensajeParaPantalla()
    : error instanceof Error
      ? error.message
      : "No se pudo completar la operación.";
}

function Titulo({
  icono,
  titulo,
  texto,
}: {
  icono: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <span className="text-violet-600 [&>svg]:h-7 [&>svg]:w-7">{icono}</span>
      <div>
        <h1 className="text-2xl font-black text-slate-900">{titulo}</h1>
        <p className="mt-1 text-sm text-slate-500">{texto}</p>
      </div>
    </div>
  );
}

function Opcion({
  activo,
  titulo,
  texto,
  recomendado,
  onClick,
}: {
  activo: boolean;
  titulo: string;
  texto: string;
  recomendado?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-xl border p-4 text-left ${
        activo
          ? "border-violet-500 bg-violet-50"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {recomendado && (
        <span className="absolute right-3 top-3 rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700">
          RECOMENDADO
        </span>
      )}
      <p className="font-bold text-slate-900">{titulo}</p>
      <p className="mt-1 pr-12 text-sm text-slate-500">{texto}</p>
    </button>
  );
}

function Interruptor({
  titulo,
  texto,
  valor,
  onChange,
}: {
  titulo: string;
  texto: string;
  valor: boolean;
  onChange: (valor: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!valor)}
      className={`flex items-start gap-3 rounded-xl border p-4 text-left ${
        valor ? "border-violet-400 bg-violet-50" : "border-slate-200"
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-10 rounded-full p-0.5 ${
          valor ? "justify-end bg-violet-600" : "justify-start bg-slate-300"
        }`}
      >
        <span className="h-5 w-5 rounded-full bg-white shadow" />
      </span>
      <span>
        <span className="block font-bold text-slate-900">{titulo}</span>
        <span className="mt-1 block text-sm text-slate-500">{texto}</span>
      </span>
    </button>
  );
}

function Monto({
  etiqueta,
  valor,
  deshabilitado,
  onChange,
}: {
  etiqueta: string;
  valor: number;
  deshabilitado: boolean;
  onChange: (valor: number) => void;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {etiqueta}
      <div className="relative mt-2">
        <span className="absolute left-3 top-3 text-slate-400">$</span>
        <input
          type="number"
          min={0}
          step="0.01"
          disabled={deshabilitado}
          value={deshabilitado ? 0 : valor}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          className="w-full rounded-xl border border-slate-300 py-3 pl-8 pr-3 font-normal disabled:bg-slate-100"
        />
      </div>
    </label>
  );
}

function Confirmacion({
  marcado,
  onChange,
  children,
}: {
  marcado: boolean;
  onChange: (valor: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-5 flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
      <input
        type="checkbox"
        className="mt-1"
        checked={marcado}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}
