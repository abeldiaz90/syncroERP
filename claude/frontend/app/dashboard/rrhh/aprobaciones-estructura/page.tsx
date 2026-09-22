"use client";

import { useMemo, useState } from "react";
import { solicitarTexto } from '@/components/ui/dialogos';
import { BadgeCheck, Building2, CircleX, RefreshCw, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useDatos } from "@/hooks/use-datos";
import { Boton, Cargando, Distintivo, EncabezadoPantalla, ErrorPantalla, Panel, SinDatos, useAvisos } from "@/components/ui";
import { usePermiso } from '@/hooks/use-permisos';

type Estado = "PENDIENTE_GERENCIA" | "PENDIENTE_FINANZAS" | "APROBADA" | "RECHAZADA" | "CANCELADA";
type Solicitud = {
  id: string;
  tipo: "AREA" | "PUESTO";
  nombreSolicitado: string;
  motivo: string;
  datosJson: string;
  estado: Estado;
  comentarioResolucion?: string;
  fechaCreacion: string;
};

const textoEstado: Record<Estado, string> = {
  PENDIENTE_GERENCIA: "Pendiente de Gerencia",
  PENDIENTE_FINANZAS: "Pendiente de Finanzas",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

export default function AprobacionesEstructuraPage() {
  /*
   * Cada etapa tiene su propia acción, y no son de quien mira la pantalla.
   * RRHH levanta la solicitud y la sigue aquí, pero firmarla es de Gerencia
   * —control de mando— y de Finanzas —control presupuestal—. Sin esta guarda
   * la tabla le pinta «Aprobar» a quien el servidor va a rechazar con «Esta
   * etapa requiere el rol Gerencia», que es el patrón que se cerró en crédito.
   */
  const { tienePermiso } = usePermiso();
  const puedeFirmar = (estado: string) =>
    tienePermiso(
      'POST',
      estado === 'PENDIENTE_GERENCIA'
        ? '/rrhh/estructura/solicitudes/:id/gerencia'
        : '/rrhh/estructura/solicitudes/:id/finanzas',
    );

  const { avisar } = useAvisos();
  const solicitudes = useDatos<Solicitud[]>(() => api.get("/rrhh/estructura/solicitudes"), []);
  const [procesando, setProcesando] = useState<string | null>(null);
  const pendientes = useMemo(() => (solicitudes.datos ?? []).filter((s) => s.estado.startsWith("PENDIENTE")), [solicitudes.datos]);

  async function resolver(s: Solicitud, decision: "APROBAR" | "RECHAZAR") {
    let comentario = "";
    if (decision === "RECHAZAR") {
      comentario = (await solicitarTexto("Motivo obligatorio del rechazo:", { titulo: "Rechazar solicitud", obligatorio: true }))?.trim() ?? "";
      if (!comentario) return;
    } else {
      comentario = (await solicitarTexto("Comentario de aprobación (opcional):", { titulo: "Aprobar solicitud" }))?.trim() ?? "";
    }
    const etapa = s.estado === "PENDIENTE_GERENCIA" ? "gerencia" : "finanzas";
    setProcesando(s.id);
    try {
      await api.post(`/rrhh/estructura/solicitudes/${s.id}/${etapa}`, { decision, comentario: comentario || undefined });
      avisar(decision === "APROBAR" ? `Aprobación de ${etapa} registrada.` : "Solicitud rechazada.", "exito");
      await solicitudes.recargar();
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : "No fue posible resolver la solicitud.", "error");
    } finally {
      setProcesando(null);
    }
  }

  return <div className="mx-auto max-w-[1350px] p-6">
    <EncabezadoPantalla
      titulo="Aprobaciones de estructura"
      descripcion="Control de nuevas áreas, puestos, plazas y rangos salariales"
      acciones={<Boton variante="neutro" icono={<RefreshCw className="h-4 w-4" />} onClick={() => void solicitudes.recargar()}>Actualizar</Boton>}
    />
    <div className="mb-5 grid gap-3 md:grid-cols-3">
      <Resumen titulo="Pendientes" valor={pendientes.length} icono={<ShieldCheck />} color="amber" />
      <Resumen titulo="Áreas solicitadas" valor={(solicitudes.datos ?? []).filter((s) => s.tipo === "AREA").length} icono={<Building2 />} color="indigo" />
      <Resumen titulo="Aprobadas" valor={(solicitudes.datos ?? []).filter((s) => s.estado === "APROBADA").length} icono={<BadgeCheck />} color="emerald" />
    </div>
    <Panel sinRelleno>
      {solicitudes.cargando ? <Cargando /> : solicitudes.error ? <ErrorPantalla mensaje={solicitudes.error} onReintentar={solicitudes.recargar} /> : (solicitudes.datos?.length ?? 0) === 0 ?
        <SinDatos titulo="No hay solicitudes" descripcion="Las nuevas áreas y puestos aparecerán aquí para la doble aprobación." icono={<ShieldCheck className="h-5 w-5" />} /> :
        <div className="overflow-x-auto"><table className="tabla"><thead><tr><th>Solicitud</th><th>Justificación</th><th>Detalle</th><th>Etapa</th><th>Fecha</th><th className="text-right">Decisión</th></tr></thead><tbody>
          {solicitudes.datos!.map((s) => {
            let datos: Record<string, unknown> = {}; try { datos = JSON.parse(s.datosJson); } catch {}
            const pendiente = s.estado === "PENDIENTE_GERENCIA" || s.estado === "PENDIENTE_FINANZAS";
            return <tr key={s.id}>
              <td><p className="font-bold text-slate-900">{s.nombreSolicitado}</p><p className="text-[11px] text-slate-500">{s.tipo === "AREA" ? "Área organizacional" : `Puesto · ${String(datos.clave ?? "")}`}</p></td>
              <td className="max-w-xs whitespace-normal text-xs text-slate-600">{s.motivo}</td>
              <td className="text-xs text-slate-500">{s.tipo === "PUESTO" ? `${Number(datos.plazasAutorizadas ?? 0)} plaza(s) · $${Number(datos.salarioMinimo ?? 0).toFixed(2)}–$${Number(datos.salarioMaximo ?? 0).toFixed(2)}` : "Nueva unidad organizacional"}</td>
              <td><Distintivo tono={s.estado === "APROBADA" ? "exito" : s.estado === "RECHAZADA" ? "peligro" : "alerta"}>{textoEstado[s.estado]}</Distintivo>{s.comentarioResolucion && <p className="mt-1 max-w-xs whitespace-normal text-[10px] text-slate-500">{s.comentarioResolucion}</p>}</td>
              <td className="text-xs text-slate-500">{new Date(s.fechaCreacion).toLocaleDateString("es-MX")}</td>
              <td className="text-right">{pendiente && puedeFirmar(s.estado) ? <div className="flex justify-end gap-2"><Boton variante="neutro" icono={<CircleX className="h-3.5 w-3.5" />} onClick={() => void resolver(s, "RECHAZAR")} disabled={procesando === s.id}>Rechazar</Boton><Boton variante="primario" icono={<BadgeCheck className="h-3.5 w-3.5" />} onClick={() => void resolver(s, "APROBAR")} cargando={procesando === s.id}>Aprobar</Boton></div> : pendiente ? <span className="text-xs text-slate-500">Espera a {s.estado === "PENDIENTE_GERENCIA" ? "Gerencia" : "Finanzas"}</span> : "—"}</td>
            </tr>;
          })}
        </tbody></table></div>}
    </Panel>
    <p className="mt-4 text-xs text-slate-500">Control interno: Gerencia valida necesidad y estructura; Finanzas valida presupuesto, plazas y tabulador. Una persona no puede cubrir ambas etapas salvo el administrador durante la puesta en marcha.</p>
  </div>;
}

function Resumen({ titulo, valor, icono, color }: { titulo: string; valor: number; icono: React.ReactNode; color: "amber" | "indigo" | "emerald" }) {
  const clases = { amber: "bg-amber-50 text-amber-700 border-amber-200", indigo: "bg-indigo-50 text-indigo-700 border-indigo-200", emerald: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return <div className={`flex items-center gap-3 rounded-2xl border p-4 ${clases[color]}`}><div className="h-5 w-5">{icono}</div><div><p className="text-xs font-semibold">{titulo}</p><p className="text-2xl font-black">{valor}</p></div></div>;
}
