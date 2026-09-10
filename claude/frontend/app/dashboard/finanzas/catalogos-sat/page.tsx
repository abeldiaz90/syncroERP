"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileCheck2,
  Landmark,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";

type Resumen = {
  version: {
    clave: string;
    ejercicio: number;
    fechaPublicacion: string;
    vigenciaDesde: string;
    fuenteUrl: string;
    sha256: string;
    estado: string;
  };
  catalogos: Record<string, number>;
};

type CuentaPendiente = {
  cuentaId: string;
  numeroCuenta: string;
  nombre: string;
  codigoAnterior?: string | null;
};

type Sugerencia = {
  cuentaId: string;
  numeroCuenta: string;
  cuenta: string;
  codigo: string;
  nombre: string;
};

type Diagnostico = {
  completo: boolean;
  totalCuentasAfectables: number;
  totalMapeadas: number;
  pendientes: CuentaPendiente[];
  sinConfirmar: Sugerencia[];
  advertencias: string[];
};

type EntradaSat = {
  id: string;
  clave: string;
  nombre: string;
  nivel: number | null;
  clavePadre: string | null;
};

type ListaEntradas = {
  datos: EntradaSat[];
  total: number;
};

type DiagnosticoIva = {
  requiereRegularizacion: boolean;
  ventasCreditoConIvaCobrado: number;
  comprasConIvaMarcadoPagado: number;
  cobranzasSinReclasificacionIva: number;
  pagosProveedorSinReclasificacionIva: number;
  mensaje: string;
};

const nombreCatalogo: Record<string, string> = {
  AGRUPADOR: "Códigos agrupadores",
  MONEDA: "Monedas",
  BANCO: "Bancos",
  METODO_PAGO: "Métodos contables de pago",
};

export default function CatalogosSatPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [diagnosticoIva, setDiagnosticoIva] = useState<DiagnosticoIva | null>(
    null,
  );
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState("");
  const [error, setError] = useState("");
  const [seleccionada, setSeleccionada] = useState<CuentaPendiente | null>(
    null,
  );
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<EntradaSat[]>([]);
  const [buscando, setBuscando] = useState(false);

  const cargar = useCallback(async () => {
    setError("");
    try {
      const [r, d, iva] = await Promise.all([
        api.get<Resumen>("/finanzas/catalogos-sat/resumen"),
        api.get<Diagnostico>("/finanzas/catalogos-sat/diagnostico-mapeo"),
        api.get<DiagnosticoIva>(
          "/finanzas/catalogos-sat/diagnostico-iva/historico",
        ),
      ]);
      setResumen(r);
      setDiagnostico(d);
      setDiagnosticoIva(iva);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!seleccionada) return;
    const temporizador = window.setTimeout(async () => {
      setBuscando(true);
      try {
        const lista = await api.get<ListaEntradas>(
          "/finanzas/catalogos-sat/AGRUPADOR",
          { query: { buscar: busqueda, limite: 40 } },
        );
        setResultados(lista.datos);
      } catch (e) {
        setError(mensaje(e));
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => window.clearTimeout(temporizador);
  }, [busqueda, seleccionada]);

  const confirmar = async (sugerencia: Sugerencia) => {
    setProcesando(sugerencia.cuentaId);
    setError("");
    try {
      await api.post(
        `/finanzas/catalogos-sat/cuentas/${sugerencia.cuentaId}/mapear`,
        { codigoAgrupador: sugerencia.codigo, confirmar: true },
      );
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setProcesando("");
    }
  };

  const mapear = async (entrada: EntradaSat) => {
    if (!seleccionada) return;
    setProcesando(seleccionada.cuentaId);
    setError("");
    try {
      await api.post(
        `/finanzas/catalogos-sat/cuentas/${seleccionada.cuentaId}/mapear`,
        { codigoAgrupador: entrada.clave, confirmar: true },
      );
      setSeleccionada(null);
      setBusqueda("");
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setProcesando("");
    }
  };

  if (cargando) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <div className="text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-violet-600" />
          Verificando la clasificación SAT…
        </div>
      </div>
    );
  }

  const totalRevisiones =
    (diagnostico?.pendientes?.length ?? 0) +
    (diagnostico?.sinConfirmar?.length ?? 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 text-slate-800 md:p-9">
      <header className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
          <BookOpenCheck className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">
            Contabilidad electrónica · México
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">
            Asistente de clasificación SAT
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Relaciona las cuentas de tu empresa con el Anexo 24. El catálogo
            oficial no se modifica; únicamente confirmas la equivalencia.
          </p>
        </div>
        {resumen && (
          <a
            href={resumen.version?.fuenteUrl}
            target="_blank"
            rel="noreferrer"
            className="md:ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:border-violet-300 hover:text-violet-700"
          >
            Documento oficial
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Indicador
          icono={<ShieldCheck />}
          etiqueta="Versión oficial"
          valor={`Anexo 24 · ${resumen?.version?.ejercicio ?? 2026}`}
          detalle={`Publicado ${fecha(resumen?.version?.fechaPublicacion)}`}
          color="violet"
        />
        <Indicador
          icono={<FileCheck2 />}
          etiqueta="Cuentas clasificadas"
          valor={`${diagnostico?.totalMapeadas ?? 0} de ${diagnostico?.totalCuentasAfectables ?? 0}`}
          detalle={
            diagnostico?.completo
              ? "Todas tienen código oficial"
              : "Hay cuentas sin equivalencia"
          }
          color={diagnostico?.completo ? "emerald" : "amber"}
        />
        <Indicador
          icono={<BadgeCheck />}
          etiqueta="Revisión humana"
          valor={
            totalRevisiones === 0 ? "Completa" : `${totalRevisiones} pendientes`
          }
          detalle="Las sugerencias quedan auditadas"
          color={totalRevisiones === 0 ? "emerald" : "amber"}
        />
      </div>

      {diagnostico?.advertencias?.map((advertencia) => (
        <div
          key={advertencia}
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <b>Revisión necesaria:</b> {advertencia}
        </div>
      ))}

      {diagnosticoIva?.requiereRegularizacion && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <h2 className="font-black">Operaciones históricas por revisar</h2>
              <p className="mt-1 text-sm text-rose-800">
                {diagnosticoIva.mensaje}
              </p>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                <DatoHistorico
                  etiqueta="Ventas a crédito"
                  total={diagnosticoIva.ventasCreditoConIvaCobrado}
                />
                <DatoHistorico
                  etiqueta="Compras a crédito"
                  total={diagnosticoIva.comprasConIvaMarcadoPagado}
                />
                <DatoHistorico
                  etiqueta="Cobros sin reclasificar"
                  total={diagnosticoIva.cobranzasSinReclasificacionIva}
                />
                <DatoHistorico
                  etiqueta="Pagos sin reclasificar"
                  total={diagnosticoIva.pagosProveedorSinReclasificacionIva}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {totalRevisiones === 0 ? (
        <section className="flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
            <Check className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-black text-emerald-950">
              Clasificación SAT revisada
            </h2>
            <p className="mt-1 text-sm text-emerald-800">
              Las cuentas operativas están relacionadas con la versión oficial
              vigente. Los cambios futuros conservarán el historial por
              ejercicio.
            </p>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <EncabezadoSeccion
              titulo="Sugerencias del sistema"
              texto="Confirma si la equivalencia describe realmente el uso de la cuenta."
              cantidad={diagnostico?.sinConfirmar?.length ?? 0}
            />
            <div className="divide-y divide-slate-100">
              {diagnostico?.sinConfirmar?.length === 0 && (
                <Vacio texto="No hay sugerencias pendientes de confirmar." />
              )}
              {diagnostico?.sinConfirmar?.map((sugerencia) => (
                <div
                  key={sugerencia.cuentaId}
                  className="flex items-center gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      <span className="mr-2 font-mono text-violet-700">
                        {sugerencia.numeroCuenta}
                      </span>
                      {sugerencia.cuenta}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      SAT{" "}
                      <b className="font-mono text-slate-700">
                        {sugerencia.codigo}
                      </b>{" "}
                      · {sugerencia.nombre}
                    </p>
                  </div>
                  <button
                    onClick={() => confirmar(sugerencia)}
                    disabled={procesando === sugerencia.cuentaId}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {procesando === sugerencia.cuentaId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Confirmar
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <EncabezadoSeccion
              titulo="Cuentas sin clasificación"
              texto="Busca el concepto SAT que mejor represente su naturaleza y uso principal."
              cantidad={diagnostico?.pendientes?.length ?? 0}
            />
            <div className="divide-y divide-slate-100">
              {diagnostico?.pendientes?.length === 0 && (
                <Vacio texto="No hay cuentas operativas sin clasificar." />
              )}
              {diagnostico?.pendientes?.map((cuenta) => (
                <button
                  key={cuenta.cuentaId}
                  onClick={() => {
                    setSeleccionada(cuenta);
                    setBusqueda(cuenta.codigoAnterior ?? cuenta.nombre);
                  }}
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      <span className="mr-2 font-mono text-violet-700">
                        {cuenta.numeroCuenta}
                      </span>
                      {cuenta.nombre}
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      Requiere seleccionar un código agrupador.
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-violet-600" />
          <h2 className="font-black text-slate-900">
            Catálogos precargados en el sistema
          </h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(resumen?.catalogos ?? {}).map(([clave, total]) => (
            <div key={clave} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase text-slate-400">
                {nombreCatalogo[clave] ?? clave}
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900">{total}</p>
              <p className="text-xs text-slate-500">registros oficiales</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Fuente verificada con huella SHA-256{" "}
          <span className="font-mono">
            {resumen?.version?.sha256?.slice(0, 16)}…
          </span>
          . Los métodos de pago de este catálogo son para contabilidad
          electrónica; no sustituyen las formas de pago del CFDI.
        </p>
      </section>

      {seleccionada && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-slate-200 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase text-violet-600">
                  Clasificar cuenta
                </p>
                <h2 className="mt-1 truncate font-black text-slate-950">
                  {seleccionada.numeroCuenta} · {seleccionada.nombre}
                </h2>
              </div>
              <button
                onClick={() => setSeleccionada(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              <label className="relative block">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  autoFocus
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Ej. caja, inventario, IVA no cobrado…"
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </label>
              <p className="mt-2 text-xs text-slate-500">
                Selecciona por naturaleza y por el uso predominante de la
                cuenta. Si tienes duda, deja la revisión a tu contador.
              </p>
            </div>
            <div className="max-h-[52vh] overflow-y-auto border-t border-slate-100">
              {buscando ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                  Buscando en el Anexo 24…
                </div>
              ) : (
                resultados.map((entrada) => (
                  <button
                    key={entrada.id}
                    onClick={() => mapear(entrada)}
                    disabled={procesando === seleccionada.cuentaId}
                    className="flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left hover:bg-violet-50 disabled:opacity-50"
                  >
                    <span className="rounded-md bg-violet-100 px-2 py-1 font-mono text-xs font-black text-violet-700">
                      {entrada.clave}
                    </span>
                    <span className="text-sm text-slate-700">
                      {entrada.nombre}
                    </span>
                  </button>
                ))
              )}
              {!buscando && resultados.length === 0 && (
                <Vacio texto="No encontramos coincidencias. Prueba con otra palabra." />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Indicador({
  icono,
  etiqueta,
  valor,
  detalle,
  color,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  valor: string;
  detalle: string;
  color: "violet" | "emerald" | "amber";
}) {
  const tonos = {
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`grid h-9 w-9 place-items-center rounded-xl ${tonos[color]}`}
      >
        {icono}
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">
        {etiqueta}
      </p>
      <p className="mt-1 text-xl font-black text-slate-950">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

function EncabezadoSeccion({
  titulo,
  texto,
  cantidad,
}: {
  titulo: string;
  texto: string;
  cantidad: number;
}) {
  return (
    <div className="border-b border-slate-200 p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-black text-slate-900">{titulo}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
          {cantidad}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{texto}</p>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <div className="p-8 text-center text-sm text-slate-400">{texto}</div>;
}

function DatoHistorico({
  etiqueta,
  total,
}: {
  etiqueta: string;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2">
      <span>{etiqueta}</span>
      <b>{total}</b>
    </div>
  );
}

function mensaje(error: unknown) {
  if (error instanceof ApiError) return error.mensajeParaPantalla();
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}

function fecha(valor?: string) {
  if (!valor) return "sin fecha";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(
    new Date(`${valor.substring(0, 10)}T12:00:00`),
  );
}
