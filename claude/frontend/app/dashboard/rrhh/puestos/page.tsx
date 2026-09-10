"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BriefcaseBusiness, Pencil, Plus, Search, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { dinero } from "@/lib/format";
import { useDatos } from "@/hooks/use-datos";
import { Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla, ErrorPantalla, Modal, Panel, Seleccion, SinDatos, useAvisos } from "@/components/ui";

interface Departamento { id: string; nombre: string; activo: boolean }
interface Puesto { id: string; clave: string; nombre: string; descripcion?: string; departamentoId: string; departamento?: Departamento; salarioMinimo: number; salarioMaximo: number; plazasAutorizadas: number; activo: boolean }
interface Empleado { id: string; puestoId?: string; estado: string }
type Form = { clave: string; nombre: string; descripcion: string; departamentoId: string; salarioMinimo: string; salarioMaximo: string; plazasAutorizadas: string; motivo: string; activo: boolean };
const vacio: Form = { clave: "", nombre: "", descripcion: "", departamentoId: "", salarioMinimo: "", salarioMaximo: "", plazasAutorizadas: "1", motivo: "", activo: true };

export default function PuestosPage() {
  const { avisar } = useAvisos();
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Puesto | null>(null);
  const [form, setForm] = useState<Form>(vacio);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const puestos = useDatos<Puesto[]>(() => api.get("/rrhh/puestos"), []);
  const empleados = useDatos<Empleado[]>(() => api.get("/rrhh/empleados"), []);
  const departamentos = useDatos<Departamento[]>(() => api.get("/departamentos"), []);
  const ocupacion = useMemo(() => { const m = new Map<string, number>(); for (const e of empleados.datos ?? []) if (e.estado !== "BAJA" && e.puestoId) m.set(e.puestoId, (m.get(e.puestoId) ?? 0) + 1); return m; }, [empleados.datos]);
  const filtrados = (puestos.datos ?? []).filter((p) => `${p.clave} ${p.nombre} ${p.departamento?.nombre ?? ""}`.toLowerCase().includes(busqueda.toLowerCase()));

  function abrir(p?: Puesto) {
    setEditando(p ?? null); setErrores({});
    setForm(p ? { clave: p.clave, nombre: p.nombre, descripcion: p.descripcion ?? "", departamentoId: p.departamentoId, salarioMinimo: String(p.salarioMinimo), salarioMaximo: String(p.salarioMaximo), plazasAutorizadas: String(p.plazasAutorizadas), motivo: "", activo: p.activo } : vacio);
    setModal(true);
  }
  async function guardar() {
    const e: Record<string, string> = {};
    const min = Number(form.salarioMinimo), max = Number(form.salarioMaximo), plazas = Number(form.plazasAutorizadas);
    if (!form.clave.trim()) e.clave = "La clave es obligatoria.";
    if (!form.nombre.trim()) e.nombre = "El nombre es obligatorio.";
    if (!form.departamentoId) e.departamentoId = "Selecciona el área responsable.";
    if (!(min > 0)) e.salarioMinimo = "Debe ser mayor que cero.";
    if (!(max >= min)) e.salarioMaximo = "Debe ser igual o mayor al mínimo.";
    if (!Number.isInteger(plazas) || plazas < 1) e.plazasAutorizadas = "Autoriza al menos una plaza.";
    if (!editando && form.motivo.trim().length < 10) e.motivo = "Explica por qué se necesita el puesto.";
    setErrores(e); if (Object.keys(e).length) return;
    const datos = { clave: form.clave.trim().toUpperCase(), nombre: form.nombre.trim(), descripcion: form.descripcion || undefined, departamentoId: form.departamentoId, salarioMinimo: min, salarioMaximo: max, plazasAutorizadas: plazas };
    setGuardando(true);
    try {
      if (editando) {
        await api.patch(`/rrhh/puestos/${editando.id}`, { ...datos, activo: form.activo });
        avisar("Puesto actualizado.", "exito");
        await puestos.recargar();
      } else {
        await api.post("/rrhh/estructura/solicitudes", { tipo: "PUESTO", ...datos, motivo: form.motivo.trim() });
        avisar("Solicitud enviada a Gerencia y Finanzas.", "exito");
      }
      setModal(false);
    } catch (err) { avisar(err instanceof ApiError ? err.mensajeParaPantalla() : "No se pudo guardar.", "error"); }
    finally { setGuardando(false); }
  }

  return <div className="mx-auto max-w-[1350px] p-6">
    <EncabezadoPantalla titulo="Puestos, áreas y salarios" descripcion="Cada puesto pertenece a un área; las altas requieren control presupuestal" acciones={<div className="flex gap-2"><Link href="/dashboard/rrhh/aprobaciones-estructura"><Boton variante="neutro" icono={<ShieldCheck className="h-4 w-4" />}>Aprobaciones</Boton></Link><Boton variante="primario" icono={<Plus className="h-4 w-4" />} onClick={() => abrir()}>Solicitar puesto</Boton></div>} />
    <Panel sinRelleno><div className="panel-cabecera"><div className="relative w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Entrada value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar puesto, clave o área" className="pl-9"/></div></div>
      {puestos.cargando ? <Cargando/> : puestos.error ? <ErrorPantalla mensaje={puestos.error} onReintentar={puestos.recargar}/> : filtrados.length === 0 ? <SinDatos titulo="No hay puestos aprobados" descripcion="Solicita el primero; Gerencia valida la estructura y Finanzas el presupuesto." icono={<BriefcaseBusiness className="h-5 w-5"/>}/> : <div className="overflow-x-auto"><table className="tabla"><thead><tr><th>Clave</th><th>Puesto</th><th>Área responsable</th><th className="text-right">Rango diario</th><th className="text-center">Ocupación</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead><tbody>{filtrados.map((p) => <tr key={p.id}><td className="font-bold">{p.clave}</td><td><p className="font-semibold">{p.nombre}</p><p className="text-[11px] text-slate-400">{p.descripcion || "Sin descripción"}</p></td><td><Distintivo tono="info">{p.departamento?.nombre ?? "Área no disponible"}</Distintivo></td><td className="text-right">{dinero(p.salarioMinimo)} – {dinero(p.salarioMaximo)}</td><td className="text-center">{ocupacion.get(p.id) ?? 0} / {p.plazasAutorizadas}</td><td><Distintivo tono={p.activo ? "exito" : "neutro"}>{p.activo ? "Activo" : "Inactivo"}</Distintivo></td><td className="text-right"><Boton variante="neutro" icono={<Pencil className="h-3.5 w-3.5"/>} onClick={() => abrir(p)}>Editar</Boton></td></tr>)}</tbody></table></div>}
    </Panel>
    <Modal abierto={modal} onCerrar={() => setModal(false)} titulo={editando ? "Editar puesto" : "Solicitar nuevo puesto"} ancho={620} pie={<><Boton variante="neutro" onClick={() => setModal(false)}>Cancelar</Boton><Boton variante="primario" onClick={() => void guardar()} cargando={guardando}>{editando ? "Guardar cambios" : "Enviar a aprobación"}</Boton></>}>
      <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800">El área es obligatoria. Para un alta nueva: Gerencia valida necesidad y dependencia; Finanzas valida rango salarial y plazas.</div>
      <div className="grid gap-4 md:grid-cols-2"><Campo etiqueta="Clave" requerido error={errores.clave}><Entrada value={form.clave} maxLength={20} onChange={(e) => setForm({...form, clave:e.target.value.toUpperCase()})}/></Campo><Campo etiqueta="Área responsable" requerido error={errores.departamentoId}><Seleccion value={form.departamentoId} onChange={(e) => setForm({...form, departamentoId:e.target.value})}><option value="">Seleccionar…</option>{(departamentos.datos ?? []).filter((d) => d.activo).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</Seleccion></Campo><div className="md:col-span-2"><Campo etiqueta="Nombre" requerido error={errores.nombre}><Entrada value={form.nombre} onChange={(e) => setForm({...form, nombre:e.target.value})}/></Campo></div><Campo etiqueta="Salario diario mínimo" requerido error={errores.salarioMinimo}><Entrada type="number" min="0.01" step="0.01" value={form.salarioMinimo} onChange={(e) => setForm({...form, salarioMinimo:e.target.value})}/></Campo><Campo etiqueta="Salario diario máximo" requerido error={errores.salarioMaximo}><Entrada type="number" min="0.01" step="0.01" value={form.salarioMaximo} onChange={(e) => setForm({...form, salarioMaximo:e.target.value})}/></Campo><Campo etiqueta="Plazas autorizadas" requerido error={errores.plazasAutorizadas}><Entrada type="number" min="1" step="1" value={form.plazasAutorizadas} onChange={(e) => setForm({...form, plazasAutorizadas:e.target.value})}/></Campo><div className="md:col-span-2"><Campo etiqueta="Descripción"><textarea className="campo min-h-20" value={form.descripcion} onChange={(e) => setForm({...form, descripcion:e.target.value})}/></Campo></div>{!editando && <div className="md:col-span-2"><Campo etiqueta="Justificación" requerido error={errores.motivo}><textarea className="campo min-h-20" maxLength={500} value={form.motivo} onChange={(e) => setForm({...form, motivo:e.target.value})}/></Campo></div>}</div>
    </Modal>
  </div>;
}
