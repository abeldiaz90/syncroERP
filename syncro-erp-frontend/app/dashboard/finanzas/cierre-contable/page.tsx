"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  Info,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
  XCircle,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";

interface Periodo {
  mes: number;
  anio: number;
  nombreMes: string;
  cerrado: boolean;
  fechaCierre: string | null;
  totalPolizas: number;
  cerrable: boolean;
}

interface Control {
  clave: string;
  titulo: string;
  descripcion: string;
  estado: "CORRECTO" | "BLOQUEO" | "ADVERTENCIA";
  bloquea: boolean;
}

interface Diagnostico {
  periodo: {
    mes: number;
    anio: number;
    nombre: string;
    fechaDesde: string;
    fechaHasta: string;
  };
  generadoEn: string;
  contabilidad: {
    totalPolizas: number;
    totalPartidas: number;
    totalDebe: number;
    totalHaber: number;
    diferencia: number;
    polizasDescuadradas: number;
    polizasSinPartidas: number;
  };
  asientosPendientes: {
    total: number;
    detalle: Array<{
      id: string;
      tipo: string;
      folio: string | null;
      estado: string;
      error: string | null;
    }>;
  };
  iva: {
    trasladado: number;
    acreditable: number;
    ivaAPagar: number;
    saldoAFavor: number;
    movimientos: number;
  };
  bancos: {
    cuentasActivas: number;
    estadosCerrados: number;
    coberturaCompleta: boolean;
  };
  conciliacionInicial: {
    existe: boolean;
    fechaCorte: string | null;
    fechaConfirmacion: string | null;
  };
  controles: Control[];
  bloqueos: number;
}

interface Revision {
  id: string;
  mes: number;
  anio: number;
  estado: "BORRADOR" | "LISTO" | "CERRADO" | "INVALIDADO";
  snapshot: Diagnostico;
  confirmaciones: Partial<Confirmaciones>;
  notas: string | null;
  version: number;
  fechaCreacion: string;
  fechaRevision: string | null;
  cierreId: string | null;
}

interface Confirmaciones {
  bancosRevisados: boolean;
  ivaRevisado: boolean;
  documentosCompletos: boolean;
  respaldoConfirmado: boolean;
}

const confirmacionesIniciales: Confirmaciones = {
  bancosRevisados: false,
  ivaRevisado: false,
  documentosCompletos: false,
  respaldoConfirmado: false,
};

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function errorLegible(error: unknown) {
  return error instanceof ApiError
    ? error.mensajeParaPantalla()
    : "No se pudo completar la operación.";
}

export default function CierreContablePage() {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear());
  const [seleccionado, setSeleccionado] = useState<Periodo | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [confirmaciones, setConfirmaciones] = useState<Confirmaciones>(
    confirmacionesIniciales,
  );
  const [notas, setNotas] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargarPeriodos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setPeriodos(await api.get<Periodo[]>("/finanzas/cierres"));
    } catch (e) {
      setError(errorLegible(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    api
      .get<Periodo[]>("/finanzas/cierres")
      .then((datos) => {
        if (activo) setPeriodos(datos);
      })
      .catch((e: unknown) => {
        if (activo) setError(errorLegible(e));
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const anios = useMemo(
    () => [...new Set(periodos.map((periodo) => periodo.anio))].sort((a, b) => b - a),
    [periodos],
  );
  const filtrados = periodos.filter((periodo) => periodo.anio === anioFiltro);

  async function tomarFotografia(periodo: Periodo) {
    setProcesando(true);
    setError(null);
    try {
      const nueva = await api.post<Revision>("/finanzas/cierres/guiado/iniciar", {
        mes: periodo.mes,
        anio: periodo.anio,
      });
      setRevision(nueva);
      setConfirmaciones(confirmacionesIniciales);
      setNotas("");
    } catch (e) {
      setError(errorLegible(e));
    } finally {
      setProcesando(false);
    }
  }

  async function abrirRevision(periodo: Periodo) {
    setSeleccionado(periodo);
    setRevision(null);
    setConfirmaciones(confirmacionesIniciales);
    setNotas("");
    setError(null);
    setProcesando(true);
    try {
      const actual = await api.get<Revision | null>(
        `/finanzas/cierres/guiado/${periodo.anio}/${periodo.mes}`,
      );
      if (
        actual &&
        (actual.estado === "BORRADOR" || actual.estado === "LISTO")
      ) {
        setRevision(actual);
        setConfirmaciones({
          ...confirmacionesIniciales,
          ...actual.confirmaciones,
        });
        setNotas(actual.notas ?? "");
      } else {
        const nueva = await api.post<Revision>(
          "/finanzas/cierres/guiado/iniciar",
          { mes: periodo.mes, anio: periodo.anio },
        );
        setRevision(nueva);
      }
    } catch (e) {
      setError(errorLegible(e));
    } finally {
      setProcesando(false);
    }
  }

  async function preparar() {
    if (!revision) return;
    setProcesando(true);
    setError(null);
    try {
      const resultado = await api.put<Revision>(
        `/finanzas/cierres/guiado/${revision.id}/confirmar`,
        { confirmaciones, notas },
      );
      setRevision(resultado);
    } catch (e) {
      setError(errorLegible(e));
      if (seleccionado) {
        const actual = await api
          .get<Revision | null>(
            `/finanzas/cierres/guiado/${seleccionado.anio}/${seleccionado.mes}`,
          )
          .catch(() => null);
        if (actual) setRevision(actual);
      }
    } finally {
      setProcesando(false);
    }
  }

  async function cerrar() {
    if (!revision || !seleccionado) return;
    if (
      !window.confirm(
        `Se bloquearán las pólizas de ${seleccionado.nombreMes} ${seleccionado.anio}. ¿Confirmas el cierre?`,
      )
    ) {
      return;
    }
    setProcesando(true);
    setError(null);
    try {
      const resultado = await api.post<{ mensaje: string }>(
        "/finanzas/cierres/cerrar",
        { revisionId: revision.id, notas },
      );
      setMensaje(resultado.mensaje);
      setSeleccionado(null);
      setRevision(null);
      await cargarPeriodos();
    } catch (e) {
      setError(errorLegible(e));
    } finally {
      setProcesando(false);
    }
  }

  async function reabrir() {
    if (!seleccionado) return;
    if (justificacion.trim().length < 10) {
      setError("La justificación debe tener al menos 10 caracteres.");
      return;
    }
    setProcesando(true);
    setError(null);
    try {
      const resultado = await api.post<{ mensaje: string }>(
        "/finanzas/cierres/reabrir",
        {
          mes: seleccionado.mes,
          anio: seleccionado.anio,
          justificacion,
        },
      );
      setMensaje(resultado.mensaje);
      setSeleccionado(null);
      setJustificacion("");
      await cargarPeriodos();
    } catch (e) {
      setError(errorLegible(e));
    } finally {
      setProcesando(false);
    }
  }

  const todasConfirmadas = Object.values(confirmaciones).every(Boolean);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-600 mb-1">
            Finanzas · asistente guiado
          </p>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
            <Lock className="w-7 h-7 text-violet-600" />
            Cierre mensual
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Revisa la contabilidad, operaciones pendientes, bancos e IVA antes
            de proteger definitivamente el mes.
          </p>
        </div>
        <div className="flex gap-2">
          {anios.map((anio) => (
            <button
              key={anio}
              onClick={() => setAnioFiltro(anio)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border ${
                anioFiltro === anio
                  ? "bg-violet-600 border-violet-600 text-white"
                  : "bg-white border-slate-200 text-slate-600"
              }`}
            >
              {anio}
            </button>
          ))}
          <button
            onClick={() => void cargarPeriodos()}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500"
            aria-label="Actualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 text-sm text-blue-900">
        <Info className="w-5 h-5 shrink-0 text-blue-600" />
        <div>
          <p className="font-bold">Cerrar no significa borrar.</p>
          <p className="text-blue-700 mt-0.5">
            El sistema bloquea nuevas pólizas para ese mes y guarda la evidencia
            de la revisión. Sólo pueden cerrarse meses completamente terminados.
          </p>
        </div>
      </div>

      {mensaje && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 mb-5 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          {mensaje}
        </div>
      )}
      {error && !seleccionado && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 mb-5 text-sm">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <RefreshCw className="w-7 h-7 animate-spin text-violet-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Cargando períodos…</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtrados.map((periodo) => (
            <article
              key={`${periodo.mes}-${periodo.anio}`}
              className={`rounded-2xl border p-5 shadow-sm ${
                periodo.cerrado
                  ? "bg-slate-50 border-slate-300"
                  : "bg-white border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-black text-slate-900">
                    {periodo.nombreMes}
                  </h2>
                  <p className="text-xs text-slate-400">{periodo.anio}</p>
                </div>
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    periodo.cerrado
                      ? "bg-slate-200 text-slate-600"
                      : periodo.cerrable
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-blue-50 text-blue-500"
                  }`}
                >
                  {periodo.cerrado ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <Unlock className="w-4 h-4" />
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-4 mb-4 text-xs text-slate-500">
                <FileText className="w-3.5 h-3.5" />
                {periodo.totalPolizas} póliza(s)
              </div>
              <button
                disabled={!periodo.cerrado && !periodo.cerrable}
                onClick={() => {
                  setError(null);
                  setJustificacion("");
                  if (periodo.cerrado) {
                    setSeleccionado(periodo);
                    setRevision(null);
                  } else {
                    void abrirRevision(periodo);
                  }
                }}
                className={`w-full py-2.5 rounded-xl text-xs font-bold ${
                  periodo.cerrado
                    ? "bg-slate-200 text-slate-700 hover:bg-amber-100 hover:text-amber-800"
                    : periodo.cerrable
                      ? "bg-violet-600 text-white hover:bg-violet-700"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                {periodo.cerrado
                  ? "Ver / reabrir"
                  : periodo.cerrable
                    ? "Revisar para cerrar"
                    : "Mes todavía abierto"}
              </button>
            </article>
          ))}
        </div>
      )}

      {seleccionado && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-auto my-6 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-600">
                  {seleccionado.cerrado ? "Período protegido" : "Revisión de cierre"}
                </p>
                <h2 className="text-xl font-black text-slate-900 mt-1">
                  {seleccionado.nombreMes} {seleccionado.anio}
                </h2>
              </div>
              <button
                onClick={() => {
                  setSeleccionado(null);
                  setRevision(null);
                  setError(null);
                }}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 text-xl"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="p-5 md:p-6">
              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 mb-4 text-sm">
                  {error}
                </div>
              )}

              {seleccionado.cerrado ? (
                <Reapertura
                  periodo={seleccionado}
                  justificacion={justificacion}
                  setJustificacion={setJustificacion}
                  procesando={procesando}
                  onReabrir={() => void reabrir()}
                />
              ) : procesando && !revision ? (
                <div className="py-16 text-center">
                  <RefreshCw className="w-7 h-7 animate-spin text-violet-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">
                    Analizando el período…
                  </p>
                </div>
              ) : revision ? (
                <Wizard
                  revision={revision}
                  confirmaciones={confirmaciones}
                  setConfirmaciones={setConfirmaciones}
                  notas={notas}
                  setNotas={setNotas}
                  todasConfirmadas={todasConfirmadas}
                  procesando={procesando}
                  onActualizar={() => void tomarFotografia(seleccionado)}
                  onPreparar={() => void preparar()}
                  onCerrar={() => void cerrar()}
                />
              ) : (
                <div className="py-12 text-center">
                  <XCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-600">
                    No fue posible preparar el diagnóstico.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Wizard({
  revision,
  confirmaciones,
  setConfirmaciones,
  notas,
  setNotas,
  todasConfirmadas,
  procesando,
  onActualizar,
  onPreparar,
  onCerrar,
}: {
  revision: Revision;
  confirmaciones: Confirmaciones;
  setConfirmaciones: (valor: Confirmaciones) => void;
  notas: string;
  setNotas: (valor: string) => void;
  todasConfirmadas: boolean;
  procesando: boolean;
  onActualizar: () => void;
  onPreparar: () => void;
  onCerrar: () => void;
}) {
  const diagnostico = revision.snapshot;
  const listo = revision.estado === "LISTO";

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        <div>
          <p className="font-bold text-slate-900">1. Controles automáticos</p>
          <p className="text-xs text-slate-500">
            Fotografía tomada el{" "}
            {new Date(diagnostico.generadoEn).toLocaleString("es-MX")}
          </p>
        </div>
        {!listo && (
          <button
            disabled={procesando}
            onClick={onActualizar}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Volver a calcular
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-5">
        {diagnostico.controles.map((control) => (
          <ControlCard key={control.clave} control={control} />
        ))}
      </div>

      {diagnostico.asientosPendientes.total > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-5">
          <p className="font-bold text-rose-900">Operaciones sin póliza</p>
          <div className="mt-2 space-y-2">
            {diagnostico.asientosPendientes.detalle.slice(0, 5).map((item) => (
              <div key={item.id} className="text-xs text-rose-700">
                {item.tipo} {item.folio ?? ""}: {item.error ?? item.estado}
              </div>
            ))}
          </div>
          <Link
            href="/dashboard/finanzas/asientos-pendientes"
            className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-rose-800 underline"
          >
            Abrir Asientos pendientes <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Dato
          titulo="Pólizas"
          valor={String(diagnostico.contabilidad.totalPolizas)}
        />
        <Dato
          titulo="Debe"
          valor={moneda.format(diagnostico.contabilidad.totalDebe)}
        />
        <Dato
          titulo="Haber"
          valor={moneda.format(diagnostico.contabilidad.totalHaber)}
        />
        <Dato
          titulo="Diferencia"
          valor={moneda.format(diagnostico.contabilidad.diferencia)}
          alerta={Math.abs(diagnostico.contabilidad.diferencia) >= 0.01}
        />
      </div>

      <div className="border border-slate-200 rounded-2xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-5 h-5 text-violet-600" />
          <div>
            <p className="font-bold text-slate-900">IVA del período</p>
            <p className="text-xs text-slate-500">
              Estimación contable; revísala contra CFDI y declaraciones.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Dato titulo="Trasladado" valor={moneda.format(diagnostico.iva.trasladado)} />
          <Dato titulo="Acreditable" valor={moneda.format(diagnostico.iva.acreditable)} />
          <Dato titulo="A pagar" valor={moneda.format(diagnostico.iva.ivaAPagar)} />
          <Dato titulo="A favor" valor={moneda.format(diagnostico.iva.saldoAFavor)} />
        </div>
        <Link
          href={`/dashboard/finanzas/declaracion-iva`}
          className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-violet-700 underline"
        >
          Revisar detalle de IVA <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="border border-slate-200 rounded-2xl p-5 mb-5">
        <p className="font-bold text-slate-900">2. Confirmaciones humanas</p>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          El sistema puede sumar y detectar faltantes, pero estas cuatro
          comprobaciones requieren una persona.
        </p>
        <div className="space-y-3">
          <Confirmacion
            icono={<Building2 className="w-4 h-4" />}
            texto="Revisé bancos, cajas y partidas en tránsito."
            checked={confirmaciones.bancosRevisados}
            disabled={listo}
            onChange={(valor) =>
              setConfirmaciones({ ...confirmaciones, bancosRevisados: valor })
            }
          />
          <Confirmacion
            icono={<Calculator className="w-4 h-4" />}
            texto="Revisé el IVA contra los comprobantes disponibles."
            checked={confirmaciones.ivaRevisado}
            disabled={listo}
            onChange={(valor) =>
              setConfirmaciones({ ...confirmaciones, ivaRevisado: valor })
            }
          />
          <Confirmacion
            icono={<ClipboardCheck className="w-4 h-4" />}
            texto="No faltan ventas, compras, nómina ni documentos del mes."
            checked={confirmaciones.documentosCompletos}
            disabled={listo}
            onChange={(valor) =>
              setConfirmaciones({ ...confirmaciones, documentosCompletos: valor })
            }
          />
          <Confirmacion
            icono={<ShieldCheck className="w-4 h-4" />}
            texto="Confirmo que existe un respaldo reciente de la base de datos."
            checked={confirmaciones.respaldoConfirmado}
            disabled={listo}
            onChange={(valor) =>
              setConfirmaciones({ ...confirmaciones, respaldoConfirmado: valor })
            }
          />
        </div>
        <label className="block text-xs font-bold uppercase text-slate-500 mt-5 mb-1.5">
          Notas de la revisión
        </label>
        <textarea
          rows={3}
          maxLength={500}
          disabled={listo}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ejemplo: revisado con estados de cuenta y CFDI del mes…"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
        />
      </div>

      {diagnostico.bloqueos > 0 ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800">
          <p className="font-bold">
            No puede cerrarse: hay {diagnostico.bloqueos} bloqueo(s).
          </p>
          <p className="mt-1">
            Corrige los puntos rojos y usa “Volver a calcular”. No se generará
            ningún ajuste automático.
          </p>
        </div>
      ) : listo ? (
        <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="font-bold">3. Revisión lista para cerrar</p>
            <p className="text-sm text-slate-300 mt-0.5">
              Antes de cerrar se volverán a ejecutar todos los controles dentro
              de la misma transacción.
            </p>
          </div>
          <button
            disabled={procesando}
            onClick={onCerrar}
            className="px-5 py-3 rounded-xl bg-emerald-400 text-slate-950 font-black text-sm disabled:opacity-50"
          >
            {procesando ? "Cerrando…" : "Cerrar período"}
          </button>
        </div>
      ) : (
        <button
          disabled={!todasConfirmadas || procesando}
          onClick={onPreparar}
          className="w-full py-3 rounded-xl bg-violet-600 text-white font-bold text-sm disabled:bg-slate-200 disabled:text-slate-400"
        >
          {procesando ? "Verificando nuevamente…" : "Confirmar revisión"}
        </button>
      )}
    </>
  );
}

function ControlCard({ control }: { control: Control }) {
  const estilo =
    control.estado === "CORRECTO"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : control.estado === "BLOQUEO"
        ? "bg-rose-50 border-rose-200 text-rose-800"
        : "bg-amber-50 border-amber-200 text-amber-800";
  const Icono =
    control.estado === "CORRECTO"
      ? CheckCircle2
      : control.estado === "BLOQUEO"
        ? XCircle
        : AlertTriangle;
  return (
    <div className={`border rounded-xl p-4 flex gap-3 ${estilo}`}>
      <Icono className="w-5 h-5 shrink-0" />
      <div>
        <p className="text-sm font-bold">{control.titulo}</p>
        <p className="text-xs opacity-80 mt-1">{control.descripcion}</p>
      </div>
    </div>
  );
}

function Dato({
  titulo,
  valor,
  alerta = false,
}: {
  titulo: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-[10px] font-bold uppercase text-slate-400">{titulo}</p>
      <p
        className={`text-sm md:text-base font-black mt-1 tabular-nums ${
          alerta ? "text-rose-600" : "text-slate-800"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

function Confirmacion({
  icono,
  texto,
  checked,
  disabled,
  onChange,
}: {
  icono: ReactNode;
  texto: string;
  checked: boolean;
  disabled: boolean;
  onChange: (valor: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-violet-600"
      />
      <span className="text-violet-600 mt-0.5">{icono}</span>
      <span className="text-sm text-slate-700">{texto}</span>
    </label>
  );
}

function Reapertura({
  periodo,
  justificacion,
  setJustificacion,
  procesando,
  onReabrir,
}: {
  periodo: Periodo;
  justificacion: string;
  setJustificacion: (valor: string) => void;
  procesando: boolean;
  onReabrir: () => void;
}) {
  return (
    <div>
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 mb-5">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
        <div>
          <p className="font-bold text-emerald-900">Período cerrado</p>
          <p className="text-sm text-emerald-700 mt-1">
            Sus pólizas están protegidas contra altas o modificaciones
            posteriores.
          </p>
          {periodo.fechaCierre && (
            <p className="text-xs text-emerald-600 mt-2">
              Cerrado el {new Date(periodo.fechaCierre).toLocaleString("es-MX")}
            </p>
          )}
        </div>
      </div>

      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
        <div className="flex items-center gap-2 text-amber-900">
          <History className="w-5 h-5" />
          <p className="font-bold">Reapertura excepcional</p>
        </div>
        <p className="text-sm text-amber-800 mt-2">
          Reabrir permite nuevas pólizas en un mes ya cerrado. La acción no
          elimina el cierre anterior: queda registrada en la bitácora.
        </p>
        <label className="block text-xs font-bold uppercase text-amber-800 mt-4 mb-1.5">
          Motivo obligatorio
        </label>
        <textarea
          rows={3}
          maxLength={500}
          value={justificacion}
          onChange={(e) => setJustificacion(e.target.value)}
          placeholder="Explica por qué debe modificarse este período…"
          className="w-full px-3 py-2.5 bg-white border border-amber-200 rounded-xl text-sm"
        />
        <button
          disabled={procesando || justificacion.trim().length < 10}
          onClick={onReabrir}
          className="mt-3 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm disabled:opacity-50"
        >
          {procesando ? "Reabriendo…" : "Reabrir con bitácora"}
        </button>
      </div>
    </div>
  );
}
