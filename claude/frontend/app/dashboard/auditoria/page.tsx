"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, Search, X, ChevronLeft, ChevronRight,
  Filter, RefreshCw, User, Clock, FileText, AlertTriangle,
  PlusCircle, PencilLine, Trash2, Ban, Loader2,
} from "lucide-react";

interface IRegistro {
  id: string;
  usuarioEmail: string | null;
  usuarioRol: string | null;
  accion: string;
  entidad: string;
  registroId: string | null;
  endpoint: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  ip: string | null;
  resultado: string;
  fechaHora: string;
}
interface IRespuesta {
  datos: IRegistro[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

const ACCION_CFG: Record<string, { cls: string; label: string; Icon: any }> = {
  CREAR:      { cls: "bg-emerald-100 text-emerald-700", label: "Creó",       Icon: PlusCircle },
  ACTUALIZAR: { cls: "bg-blue-100 text-blue-700",       label: "Actualizó",  Icon: PencilLine },
  ELIMINAR:   { cls: "bg-rose-100 text-rose-700",       label: "Eliminó",    Icon: Trash2 },
  CANCELAR:   { cls: "bg-amber-100 text-amber-700",     label: "Canceló",    Icon: Ban },
  ACCION:     { cls: "bg-slate-100 text-slate-600",     label: "Acción",     Icon: FileText },
};

const fmtFechaHora = (s: string) =>
  new Date(s).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

/**
 * Bitácora de auditoría — SOLO LECTURA.
 * Ruta: app/dashboard/auditoria/page.tsx
 */
export default function AuditoriaPage() {
  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => (typeof window !== "undefined" ? localStorage.getItem("syncro_token") ?? "" : "");
  const H = () => ({ Authorization: `Bearer ${tok()}` });

  const [resp, setResp] = useState<IRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [detalle, setDetalle] = useState<IRegistro | null>(null);

  // filtros
  const [entidad, setEntidad] = useState("");
  const [accion, setAccion] = useState("");
  const [usuarioEmail, setUsuarioEmail] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [opciones, setOpciones] = useState<{ entidades: string[]; usuarios: string[]; acciones: string[] }>(
    { entidades: [], usuarios: [], acciones: [] },
  );

  useEffect(() => {
    fetch(`${api}/auditoria/opciones`, { headers: H() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOpciones(d))
      .catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = useCallback(async () => {
    setCargando(true);
    const qs = new URLSearchParams();
    if (entidad) qs.set("entidad", entidad);
    if (accion) qs.set("accion", accion);
    if (usuarioEmail) qs.set("usuarioEmail", usuarioEmail);
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    qs.set("pagina", String(pagina));
    qs.set("porPagina", "50");
    const r = await fetch(`${api}/auditoria?${qs.toString()}`, { headers: H() });
    if (r.ok) setResp(await r.json());
    setCargando(false);
  }, [api, entidad, accion, usuarioEmail, desde, hasta, pagina]);

  useEffect(() => { cargar(); }, [cargar]);

  const limpiar = () => {
    setEntidad(""); setAccion(""); setUsuarioEmail(""); setDesde(""); setHasta(""); setPagina(1);
  };

  const jsonBonito = (s: string | null) => {
    if (!s) return "—";
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto text-slate-800">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-600" /> Bitácora de auditoría
          </h1>
          <p className="text-slate-500 mt-1">
            Registro inmutable de quién hizo qué y cuándo. Solo lectura — no se puede editar ni borrar.
          </p>
        </div>
        <button onClick={cargar}
          className="inline-flex items-center gap-2 border border-slate-300 text-slate-600 px-4 py-2 rounded-lg font-medium hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
          <Filter className="w-4 h-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select value={entidad} onChange={(e) => { setEntidad(e.target.value); setPagina(1); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Todas las entidades</option>
            {opciones.entidades.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={accion} onChange={(e) => { setAccion(e.target.value); setPagina(1); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Todas las acciones</option>
            {opciones.acciones.map((a) => <option key={a} value={a}>{ACCION_CFG[a]?.label ?? a}</option>)}
          </select>
          <select value={usuarioEmail} onChange={(e) => { setUsuarioEmail(e.target.value); setPagina(1); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Todos los usuarios</option>
            {opciones.usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(1); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm" title="Desde" />
          <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(1); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm" title="Hasta" />
        </div>
        {(entidad || accion || usuarioEmail || desde || hasta) && (
          <button onClick={limpiar} className="mt-3 text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
            <X className="w-3 h-3" /> Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {cargando ? (
          <div className="text-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
        ) : !resp || resp.datos.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-slate-200" />
            No hay movimientos registrados con estos filtros.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="px-5 py-3 text-left">Fecha y hora</th>
                    <th className="px-5 py-3 text-left">Usuario</th>
                    <th className="px-5 py-3 text-left">Acción</th>
                    <th className="px-5 py-3 text-left">Entidad</th>
                    <th className="px-5 py-3 text-left">Registro</th>
                    <th className="px-5 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resp.datos.map((r) => {
                    const cfg = ACCION_CFG[r.accion] ?? ACCION_CFG.ACCION;
                    return (
                      <tr key={r.id} onClick={() => setDetalle(r)}
                        className="hover:bg-indigo-50/40 cursor-pointer transition-colors">
                        <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                          <Clock className="w-3 h-3 inline mr-1 text-slate-400" />{fmtFechaHora(r.fechaHora)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-medium text-slate-700">{r.usuarioEmail ?? "—"}</span>
                          {r.usuarioRol && <span className="ml-1 text-[10px] text-slate-400">({r.usuarioRol})</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                            <cfg.Icon className="w-3 h-3" />{cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{r.entidad}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-400">{r.registroId ?? "—"}</td>
                        <td className="px-5 py-3 text-center">
                          {r.resultado === "ERROR" ? (
                            <span className="text-rose-500" title="La operación falló">
                              <AlertTriangle className="w-4 h-4 inline" />
                            </span>
                          ) : (
                            <span className="text-emerald-500 text-xs">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {resp.totalPaginas > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
                <p className="text-xs text-slate-400">
                  Página {resp.pagina} de {resp.totalPaginas} · {resp.total} registros
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={resp.pagina === 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPagina((p) => p + 1)} disabled={resp.pagina >= resp.totalPaginas}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center px-6 py-4 bg-slate-900 text-white">
              <div>
                <p className="font-bold text-lg">{(ACCION_CFG[detalle.accion]?.label ?? detalle.accion)} · {detalle.entidad}</p>
                <p className="text-slate-300 text-sm mt-0.5">
                  <User className="w-3 h-3 inline mr-1" />{detalle.usuarioEmail ?? "—"} ·{" "}
                  <Clock className="w-3 h-3 inline mx-1" />{fmtFechaHora(detalle.fechaHora)}
                </p>
              </div>
              <button onClick={() => setDetalle(null)} className="p-1.5 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Campo label="Endpoint" valor={detalle.endpoint} mono />
                <Campo label="Registro" valor={detalle.registroId} mono />
                <Campo label="IP" valor={detalle.ip} mono />
                <Campo label="Resultado" valor={detalle.resultado} />
              </div>
              {detalle.valorAnterior && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-1">Valor anterior</p>
                  <pre className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-xs overflow-x-auto text-slate-700">
                    {jsonBonito(detalle.valorAnterior)}
                  </pre>
                </div>
              )}
              {detalle.valorNuevo && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-1">Valor nuevo / enviado</p>
                  <pre className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs overflow-x-auto text-slate-700">
                    {jsonBonito(detalle.valorNuevo)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, valor, mono }: { label: string; valor: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
      <p className={`text-slate-700 ${mono ? "font-mono text-xs" : ""}`}>{valor || "—"}</p>
    </div>
  );
}
