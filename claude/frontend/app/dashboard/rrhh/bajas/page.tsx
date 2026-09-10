"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Calculator, UserMinus } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { dinero, fecha } from "@/lib/format";

interface Empleado {
  id: string;
  numeroEmpleado: string;
  nombreCompleto: string;
  estado: string;
  fechaIngreso: string;
  salarioDiario: number;
  puesto?: { nombre: string };
}
interface Finiquito {
  diasTrabajadosEnElAnio: number;
  aguinaldoProporcional: number;
  vacacionesProporcionales: number;
  primaVacacional: number;
  total: number;
  nota: string;
}
interface Estimacion { empleado: Empleado; fechaBaja: string; finiquito: Finiquito }
interface ResultadoBaja { empleado: Empleado; finiquito: Finiquito }

const fechaHoy = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
};

export default function BajasFiniquitosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empleadoId, setEmpleadoId] = useState("");
  const [fechaBaja, setFechaBaja] = useState(fechaHoy());
  const [motivo, setMotivo] = useState("");
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoBaja | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; ok: boolean } | null>(null);

  const empleado = empleados.find((item) => item.id === empleadoId);

  async function cargarEmpleados() {
    try {
      const respuesta = await api.get<Empleado[]>("/rrhh/empleados", { query: { estado: "ACTIVO" } });
      const lista = Array.isArray(respuesta) ? respuesta.filter((item) => item.estado !== "BAJA") : [];
      setEmpleados(lista);
      if (!empleadoId && lista[0]) setEmpleadoId(lista[0].id);
    } catch (error) {
      setMensaje({ texto: error instanceof ApiError ? error.mensajeParaPantalla() : "No se pudieron cargar los empleados.", ok: false });
    }
  }

  useEffect(() => { void cargarEmpleados(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setEstimacion(null); setResultado(null); }, [empleadoId, fechaBaja]);

  async function estimar() {
    setMensaje(null);
    setResultado(null);
    if (!empleadoId || !fechaBaja) {
      setMensaje({ texto: "Selecciona empleado y fecha de baja.", ok: false });
      return;
    }
    setProcesando(true);
    try {
      const respuesta = await api.get<Estimacion>(`/rrhh/empleados/${empleadoId}/finiquito`, { query: { fecha: fechaBaja } });
      setEstimacion(respuesta);
    } catch (error) {
      setMensaje({ texto: error instanceof ApiError ? error.mensajeParaPantalla() : "No se pudo calcular el finiquito.", ok: false });
    } finally {
      setProcesando(false);
    }
  }

  async function confirmarBaja() {
    setMensaje(null);
    if (!estimacion) {
      setMensaje({ texto: "Calcula y revisa el finiquito antes de confirmar la baja.", ok: false });
      return;
    }
    if (motivo.trim().length < 5) {
      setMensaje({ texto: "Captura un motivo de baja de al menos 5 caracteres.", ok: false });
      return;
    }
    setProcesando(true);
    try {
      const respuesta = await api.patch<ResultadoBaja>(`/rrhh/empleados/${empleadoId}/baja`, { fecha: fechaBaja, motivo: motivo.trim() });
      setResultado(respuesta);
      setEstimacion(null);
      setMensaje({ texto: "Baja registrada. Empleado, contrato vigente e historial laboral se actualizaron juntos.", ok: true });
      setMotivo("");
      await cargarEmpleados();
      setEmpleadoId("");
    } catch (error) {
      setMensaje({ texto: error instanceof ApiError ? error.mensajeParaPantalla() : "No se pudo registrar la baja.", ok: false });
    } finally {
      setProcesando(false);
    }
  }

  const finiquito = estimacion?.finiquito ?? resultado?.finiquito;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><UserMinus className="h-6 w-6 text-rose-600" /> Bajas y finiquitos estimados</h1>
        <p className="mt-1 text-sm text-slate-500">Calcula primero; la baja definitiva exige una segunda acción explícita.</p>
      </header>

      {mensaje ? <div className={`rounded-xl border p-4 text-sm ${mensaje.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{mensaje.texto}</div> : null}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Empleado<select className="entrada mt-1 w-full" value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}><option value="">Seleccionar…</option>{empleados.map((item) => <option key={item.id} value={item.id}>{item.numeroEmpleado} · {item.nombreCompleto}</option>)}</select></label>
          <label className="text-sm font-semibold">Fecha efectiva<input className="entrada mt-1 w-full" type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)} /></label>
        </div>
        {empleado ? <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><b className="text-slate-900">{empleado.nombreCompleto}</b><br/>Ingreso: {fecha(empleado.fechaIngreso)} · Puesto: {empleado.puesto?.nombre ?? "Sin puesto"} · Salario diario: {dinero(empleado.salarioDiario)}</div> : null}
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void estimar()} disabled={procesando || !empleadoId} className="btn btn-primario inline-flex items-center gap-2"><Calculator className="h-4 w-4" />{procesando ? "Calculando…" : "Calcular finiquito"}</button></div>
      </section>

      {finiquito ? (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-bold text-slate-900">Desglose estimado</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador titulo="Aguinaldo proporcional" valor={dinero(finiquito.aguinaldoProporcional)} />
            <Indicador titulo="Vacaciones proporcionales" valor={dinero(finiquito.vacacionesProporcionales)} />
            <Indicador titulo="Prima vacacional" valor={dinero(finiquito.primaVacacional)} />
            <Indicador titulo="Total estimado" valor={dinero(finiquito.total)} destacado />
          </div>
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{finiquito.nota}</p>
        </section>
      ) : null}

      {estimacion ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="flex items-center gap-2 font-bold text-rose-800"><AlertTriangle className="h-5 w-5" /> Confirmación de baja definitiva</h2>
          <p className="mt-2 text-sm text-rose-700">Esta acción cambia al empleado a BAJA, cierra sus contratos vigentes y registra el movimiento laboral dentro de la misma transacción.</p>
          <label className="mt-4 block text-sm font-semibold text-rose-900">Motivo de baja<textarea className="entrada mt-1 min-h-24 w-full bg-white py-2" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Describe la causa administrativa o laboral…" /></label>
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => void confirmarBaja()} disabled={procesando || motivo.trim().length < 5} className="rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{procesando ? "Registrando…" : "Confirmar baja definitiva"}</button></div>
        </section>
      ) : null}
    </main>
  );
}

function Indicador({ titulo, valor, destacado = false }: { titulo: string; valor: string; destacado?: boolean }) {
  return <div className={`rounded-xl border p-4 ${destacado ? "border-indigo-200 bg-indigo-50" : "bg-slate-50"}`}><p className="text-xs text-slate-500">{titulo}</p><p className={`mt-1 text-xl font-bold ${destacado ? "text-indigo-700" : "text-slate-900"}`}>{valor}</p></div>;
}
