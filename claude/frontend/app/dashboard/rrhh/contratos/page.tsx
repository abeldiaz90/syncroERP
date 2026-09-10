"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, FileSignature, History, RefreshCw } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { dinero, fecha } from "@/lib/format";

interface Empleado {
  id: string;
  numeroEmpleado: string;
  nombreCompleto: string;
  estado: string;
  fechaIngreso: string;
  salarioDiario: number;
  salarioDiarioIntegrado?: number;
  puestoId?: string;
  departamentoId?: string;
  tipoContrato?: string;
}

interface Puesto {
  id: string;
  nombre: string;
  clave: string;
  departamentoId: string;
  salarioMinimo: number;
  salarioMaximo: number;
  activo: boolean;
}

interface Departamento { id: string; nombre: string; activo: boolean }
interface Contrato {
  id: string;
  tipoContrato: string;
  fechaInicio: string;
  fechaFin?: string;
  salarioDiario: number;
  salarioDiarioIntegrado: number;
  puestoId?: string;
  departamentoId?: string;
  centroCostos?: string;
  observaciones?: string;
  vigente: boolean;
}
interface Movimiento {
  id: string;
  tipo: string;
  fechaEfectiva: string;
  motivo?: string;
  fechaCreacion: string;
}

type Formulario = {
  tipoContrato: string;
  fechaInicio: string;
  fechaFin: string;
  salarioDiario: string;
  salarioDiarioIntegrado: string;
  puestoId: string;
  departamentoId: string;
  centroCostos: string;
  observaciones: string;
};

const hoy = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
};
const inicial: Formulario = {
  tipoContrato: "INDETERMINADO",
  fechaInicio: hoy(),
  fechaFin: "",
  salarioDiario: "",
  salarioDiarioIntegrado: "",
  puestoId: "",
  departamentoId: "",
  centroCostos: "",
  observaciones: "",
};

export default function ContratosLaboralesPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [empleadoId, setEmpleadoId] = useState("");
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [form, setForm] = useState<Formulario>(inicial);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; ok: boolean } | null>(null);

  const empleado = empleados.find((item) => item.id === empleadoId);
  const puestosDisponibles = useMemo(
    () => puestos.filter((puesto) => puesto.activo && (!form.departamentoId || puesto.departamentoId === form.departamentoId)),
    [puestos, form.departamentoId],
  );
  const puestoSeleccionado = puestos.find((puesto) => puesto.id === form.puestoId);

  async function cargarCatalogos() {
    setCargando(true);
    setMensaje(null);
    try {
      const [listaEmpleados, listaPuestos, listaDepartamentos] = await Promise.all([
        api.get<Empleado[]>("/rrhh/empleados"),
        api.get<Puesto[]>("/rrhh/puestos"),
        api.get<Departamento[]>("/departamentos"),
      ]);
      const activos = (Array.isArray(listaEmpleados) ? listaEmpleados : []).filter((item) => item.estado !== "BAJA");
      setEmpleados(activos);
      setPuestos(Array.isArray(listaPuestos) ? listaPuestos : []);
      setDepartamentos(Array.isArray(listaDepartamentos) ? listaDepartamentos : []);
      if (!empleadoId && activos[0]) setEmpleadoId(activos[0].id);
    } catch (error) {
      setMensaje({ texto: error instanceof ApiError ? error.mensajeParaPantalla() : "No se pudieron cargar empleados y catálogos.", ok: false });
    } finally {
      setCargando(false);
    }
  }

  async function cargarHistorial(id: string) {
    if (!id) {
      setContratos([]);
      setMovimientos([]);
      return;
    }
    try {
      const [listaContratos, listaMovimientos] = await Promise.all([
        api.get<Contrato[]>(`/rrhh/empleados/${id}/contratos`),
        api.get<Movimiento[]>(`/rrhh/empleados/${id}/movimientos`),
      ]);
      setContratos(Array.isArray(listaContratos) ? listaContratos : []);
      setMovimientos(Array.isArray(listaMovimientos) ? listaMovimientos : []);
    } catch (error) {
      setMensaje({ texto: error instanceof ApiError ? error.mensajeParaPantalla() : "No se pudo cargar el historial laboral.", ok: false });
    }
  }

  useEffect(() => { void cargarCatalogos(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!empleadoId) return;
    const seleccionado = empleados.find((item) => item.id === empleadoId);
    setForm({
      ...inicial,
      tipoContrato: seleccionado?.tipoContrato ?? "INDETERMINADO",
      fechaInicio: hoy(),
      salarioDiario: seleccionado?.salarioDiario ? String(seleccionado.salarioDiario) : "",
      salarioDiarioIntegrado: seleccionado?.salarioDiarioIntegrado ? String(seleccionado.salarioDiarioIntegrado) : "",
      puestoId: seleccionado?.puestoId ?? "",
      departamentoId: seleccionado?.departamentoId ?? "",
    });
    void cargarHistorial(empleadoId);
  }, [empleadoId, empleados]);

  async function guardar() {
    setMensaje(null);
    if (!empleadoId || !form.fechaInicio || !form.departamentoId || Number(form.salarioDiario) <= 0) {
      setMensaje({ texto: "Selecciona empleado, fecha, área y un salario diario válido.", ok: false });
      return;
    }
    if (form.tipoContrato === "DETERMINADO" && !form.fechaFin) {
      setMensaje({ texto: "El contrato determinado requiere fecha final.", ok: false });
      return;
    }
    if (Number(form.salarioDiarioIntegrado || form.salarioDiario) < Number(form.salarioDiario)) {
      setMensaje({ texto: "El salario diario integrado no puede ser menor al salario diario.", ok: false });
      return;
    }
    setGuardando(true);
    try {
      await api.post("/rrhh/contratos", {
        empleadoId,
        tipoContrato: form.tipoContrato,
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin || undefined,
        salarioDiario: Number(form.salarioDiario),
        salarioDiarioIntegrado: Number(form.salarioDiarioIntegrado || form.salarioDiario),
        puestoId: form.puestoId || undefined,
        departamentoId: form.departamentoId,
        centroCostos: form.centroCostos.trim() || undefined,
        observaciones: form.observaciones.trim() || undefined,
      });
      setMensaje({ texto: "Contrato creado y expediente laboral actualizado en una sola transacción.", ok: true });
      await Promise.all([cargarHistorial(empleadoId), cargarCatalogos()]);
    } catch (error) {
      setMensaje({ texto: error instanceof ApiError ? error.mensajeParaPantalla() : "No se pudo crear el contrato.", ok: false });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><FileSignature className="h-6 w-6 text-indigo-600" /> Contratos laborales</h1>
          <p className="mt-1 text-sm text-slate-500">Conserva vigencias, salarios, puesto, área e historial de cada cambio.</p>
        </div>
        <button type="button" onClick={() => void cargarCatalogos()} disabled={cargando} className="btn btn-secundario inline-flex items-center gap-2"><RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />Actualizar</button>
      </header>

      {mensaje ? <div className={`rounded-xl border p-4 text-sm ${mensaje.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{mensaje.texto}</div> : null}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <label className="text-sm font-semibold text-slate-700">Empleado
          <select className="entrada mt-1 w-full" value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {empleados.map((item) => <option key={item.id} value={item.id}>{item.numeroEmpleado} · {item.nombreCompleto}</option>)}
          </select>
        </label>
        {empleado ? <p className="mt-2 text-xs text-slate-500">Ingreso: {fecha(empleado.fechaIngreso)} · Salario actual: {dinero(empleado.salarioDiario)}</p> : null}
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><BriefcaseBusiness className="h-5 w-5 text-indigo-600" /> Nuevo contrato o cambio laboral</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">Tipo de contrato<select className="entrada mt-1 w-full" value={form.tipoContrato} onChange={(e) => setForm({ ...form, tipoContrato: e.target.value })}><option value="INDETERMINADO">Indeterminado</option><option value="DETERMINADO">Determinado</option><option value="POR_OBRA">Por obra</option><option value="CAPACITACION">Capacitación</option><option value="HONORARIOS">Honorarios</option></select></label>
          <label className="text-sm font-medium">Fecha inicial<input className="entrada mt-1 w-full" type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} /></label>
          <label className="text-sm font-medium">Fecha final<input className="entrada mt-1 w-full" type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} /></label>
          <label className="text-sm font-medium">Área<select className="entrada mt-1 w-full" value={form.departamentoId} onChange={(e) => setForm({ ...form, departamentoId: e.target.value, puestoId: "" })}><option value="">Seleccionar…</option>{departamentos.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label className="text-sm font-medium">Puesto<select className="entrada mt-1 w-full" value={form.puestoId} onChange={(e) => setForm({ ...form, puestoId: e.target.value })}><option value="">Sin puesto</option>{puestosDisponibles.map((item) => <option key={item.id} value={item.id}>{item.clave} · {item.nombre}</option>)}</select>{puestoSeleccionado ? <span className="mt-1 block text-xs text-slate-500">Tabulador: {dinero(puestoSeleccionado.salarioMinimo)} – {dinero(puestoSeleccionado.salarioMaximo)}</span> : null}</label>
          <label className="text-sm font-medium">Centro de costos<input className="entrada mt-1 w-full" value={form.centroCostos} maxLength={120} onChange={(e) => setForm({ ...form, centroCostos: e.target.value })} /></label>
          <label className="text-sm font-medium">Salario diario<input className="entrada mt-1 w-full" type="number" min="0.01" step="0.01" value={form.salarioDiario} onChange={(e) => setForm({ ...form, salarioDiario: e.target.value })} /></label>
          <label className="text-sm font-medium">Salario diario integrado<input className="entrada mt-1 w-full" type="number" min="0.01" step="0.01" value={form.salarioDiarioIntegrado} onChange={(e) => setForm({ ...form, salarioDiarioIntegrado: e.target.value })} /></label>
          <label className="text-sm font-medium md:col-span-2 lg:col-span-3">Observaciones<textarea className="entrada mt-1 min-h-20 w-full py-2" maxLength={500} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></label>
        </div>
        <div className="mt-4 flex justify-end"><button type="button" className="btn btn-primario" disabled={guardando || !empleadoId} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Crear contrato"}</button></div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5"><h2 className="font-bold">Historial de contratos</h2></div>
          <div className="overflow-x-auto"><table className="tabla"><thead><tr><th>Vigencia</th><th>Tipo</th><th>Salario</th><th>Estado</th></tr></thead><tbody>{contratos.map((contrato) => <tr key={contrato.id}><td>{fecha(contrato.fechaInicio)} – {contrato.fechaFin ? fecha(contrato.fechaFin) : "Abierto"}</td><td>{contrato.tipoContrato}</td><td>{dinero(contrato.salarioDiario)}<br/><span className="text-xs text-slate-400">SDI {dinero(contrato.salarioDiarioIntegrado)}</span></td><td><span className={`rounded-full px-2 py-1 text-xs font-bold ${contrato.vigente ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{contrato.vigente ? "Vigente" : "Cerrado"}</span></td></tr>)}</tbody></table></div>
          {!contratos.length ? <p className="p-8 text-center text-sm text-slate-500">No hay contratos registrados para el empleado.</p> : null}
        </section>
        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5"><h2 className="flex items-center gap-2 font-bold"><History className="h-4 w-4" /> Movimientos laborales</h2></div>
          <div className="divide-y">{movimientos.map((movimiento) => <div key={movimiento.id} className="p-4"><div className="flex justify-between gap-3"><b className="text-sm">{movimiento.tipo}</b><span className="text-xs text-slate-500">{fecha(movimiento.fechaEfectiva)}</span></div><p className="mt-1 text-xs text-slate-500">{movimiento.motivo || "Sin observaciones"}</p></div>)}</div>
          {!movimientos.length ? <p className="p-8 text-center text-sm text-slate-500">No hay movimientos laborales registrados.</p> : null}
        </section>
      </div>
    </main>
  );
}
