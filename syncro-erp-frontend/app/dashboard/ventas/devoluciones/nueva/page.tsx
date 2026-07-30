"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RotateCcw, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type Condicion = "REINTEGRABLE" | "DANADO" | "NO_REINTEGRABLE";
interface Detalle {
  id: string; cantidad: number; cantidadDevuelta: number; cantidadDisponible: number;
  subtotal: number; impuestoMonto: number;
  producto: { nombre: string; sku: string; tipo: string };
}
interface Disponible {
  venta: { id: string; folio: number; total: number; estado: string; clienteId?: string; cliente?: { nombre: string }; detalles: Detalle[] };
  credito?: { folio: string; saldoPendiente: number } | null;
  detalles: Detalle[];
}
interface Cuenta { id: string; nombre: string; banco?: { nombre: string }; activa?: boolean; activo?: boolean; }
interface Seleccion { cantidad: number; condicion: Condicion; }

const dinero = (v: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(v));

export default function NuevaDevolucionPage() {
  const router = useRouter();
  const [ventaId, setVentaId] = useState("");
  const [datos, setDatos] = useState<Disponible | null>(null);
  const [seleccion, setSeleccion] = useState<Record<string, Seleccion>>({});
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [motivo, setMotivo] = useState("");
  const [destino, setDestino] = useState<"REEMBOLSO" | "SALDO_FAVOR">("REEMBOLSO");
  const [cuentaId, setCuentaId] = useState("");
  const [metodo, setMetodo] = useState("EFECTIVO");
  const [referencia, setReferencia] = useState("");
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<{ folio: number; total: number; estadoFiscal: string; advertencias?: string[] } | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("ventaId") ?? "";
    setVentaId(id);
    api.get<Cuenta[]>("/credito/cuentas-bancarias").then((r) => {
      const activas = r.filter((c) => c.activo !== false && c.activa !== false);
      setCuentas(activas);
      if (activas[0]) setCuentaId(activas[0].id);
    }).catch(() => undefined);
    if (id) void cargar(id);
  }, []);

  async function cargar(id = ventaId) {
    if (!id.trim()) return setError("Captura el ID de la venta.");
    setCargando(true); setError(""); setResultado(null);
    try {
      const r = await api.get<Disponible>(`/ventas/${id.trim()}/devoluciones/disponible`);
      setDatos(r);
      setSeleccion(Object.fromEntries(r.detalles.map((d) => [d.id, { cantidad: 0, condicion: "REINTEGRABLE" }])));
    } catch (e) {
      setDatos(null);
      setError(e instanceof ApiError ? e.mensajeParaPantalla() : "No se pudo consultar la venta.");
    } finally { setCargando(false); }
  }

  const elegidos = useMemo(() => datos?.detalles.filter((d) => Number(seleccion[d.id]?.cantidad ?? 0) > 0) ?? [], [datos, seleccion]);
  const estimado = elegidos.reduce((s, d) => {
    const proporcion = Number(seleccion[d.id].cantidad) / Number(d.cantidad);
    return s + (Number(d.subtotal) + Number(d.impuestoMonto ?? 0)) * proporcion;
  }, 0);
  const requiereReembolso = destino === "REEMBOLSO" && (!datos?.credito || estimado > Number(datos.credito.saldoPendiente));

  async function guardar() {
    setError("");
    if (!datos || elegidos.length === 0) return setError("Selecciona al menos una cantidad para devolver.");
    if (motivo.trim().length < 3) return setError("Describe el motivo de la devolución.");
    if (destino === "SALDO_FAVOR" && !datos.venta.clienteId) return setError("La venta debe tener un cliente identificado para generar saldo a favor.");
    if (requiereReembolso && !cuentaId) return setError("Selecciona la caja o cuenta del reembolso.");
    setGuardando(true);
    try {
      const r = await api.post<typeof resultado>(`/ventas/${datos.venta.id}/devoluciones`, {
        motivo: motivo.trim(),
        destinoImporte: destino,
        metodoReembolso: destino === "REEMBOLSO" ? metodo : undefined,
        cuentaBancariaId: destino === "REEMBOLSO" ? cuentaId : undefined,
        referenciaReembolso: referencia.trim() || undefined,
        claveIdempotencia: crypto.randomUUID(),
        detalles: elegidos.map((d) => ({
          detalleVentaId: d.id,
          cantidad: Number(seleccion[d.id].cantidad),
          condicion: seleccion[d.id].condicion,
        })),
      });
      setResultado(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.mensajeParaPantalla() : "No se pudo procesar la devolución.");
    } finally { setGuardando(false); }
  }

  if (resultado) return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white border border-emerald-200 rounded-3xl p-10 text-center shadow-sm">
        <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
        <h1 className="text-3xl font-black">Devolución procesada</h1>
        <p className="text-slate-500 mt-2">DEV-{resultado.folio} · {dinero(resultado.total)}</p>
        {resultado.estadoFiscal === "PENDIENTE_NOTA_CREDITO" && <p className="mt-5 p-3 rounded-xl bg-amber-50 text-amber-800"><AlertTriangle className="w-4 h-4 inline mr-2" />La venta está timbrada: falta generar su CFDI de egreso.</p>}
        {resultado.advertencias?.map((a) => <p key={a} className="text-sm text-amber-700 mt-2">{a}</p>)}
        <button onClick={() => router.push("/dashboard/ventas/devoluciones")} className="mt-7 bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl">Ver devoluciones</button>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-slate-800">
      <button onClick={() => router.back()} className="text-sm font-bold text-slate-500 flex items-center gap-1 mb-4"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <h1 className="text-3xl font-black flex items-center gap-3"><span className="p-2.5 bg-amber-100 rounded-xl"><RotateCcw className="w-7 h-7 text-amber-700" /></span>Nueva devolución</h1>
      <p className="text-slate-500 mt-2 mb-7">El asistente calcula importes, recupera el costo original y evita devolver dos veces la misma unidad.</p>
      {error && <div className="mb-5 p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">{error}</div>}

      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <label className="text-xs uppercase tracking-wider font-bold text-slate-500">1. Localiza la venta</label>
        <div className="flex gap-2 mt-2">
          <input value={ventaId} onChange={(e) => setVentaId(e.target.value)} placeholder="UUID de la venta" className="flex-1 border border-slate-300 rounded-xl px-4 py-3" />
          <button onClick={() => void cargar()} disabled={cargando} className="bg-slate-900 text-white px-5 rounded-xl font-bold flex items-center gap-2">{cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Consultar</button>
        </div>
      </section>

      {datos && <>
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-5">
          <div className="p-5 border-b border-slate-100"><p className="text-xs uppercase tracking-wider font-bold text-slate-500">2. Selecciona artículos</p><p className="font-bold mt-1">Venta #{datos.venta.folio} · {datos.venta.cliente?.nombre ?? "Público general"}</p></div>
          <div className="overflow-x-auto"><table className="w-full text-left">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-4">Producto</th><th className="p-4">Disponible</th><th className="p-4">Cantidad</th><th className="p-4">Condición</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{datos.detalles.map((d) => <tr key={d.id}>
              <td className="p-4"><b>{d.producto.nombre}</b><span className="block text-xs text-slate-500">{d.producto.sku}</span></td>
              <td className="p-4 font-bold">{d.cantidadDisponible}</td>
              <td className="p-4"><input type="number" min="0" max={d.cantidadDisponible} step="0.0001" value={seleccion[d.id]?.cantidad ?? 0} onChange={(e) => setSeleccion((s) => ({ ...s, [d.id]: { ...s[d.id], cantidad: Math.min(d.cantidadDisponible, Math.max(0, Number(e.target.value))) } }))} className="w-28 border rounded-lg px-3 py-2" /></td>
              <td className="p-4"><select value={seleccion[d.id]?.condicion ?? "REINTEGRABLE"} onChange={(e) => setSeleccion((s) => ({ ...s, [d.id]: { ...s[d.id], condicion: e.target.value as Condicion } }))} className="border rounded-lg px-3 py-2">
                <option value="REINTEGRABLE">Regresa a existencia</option><option value="DANADO">Dañado: registrar merma</option><option value="NO_REINTEGRABLE">No reintegrable</option>
              </select></td>
            </tr>)}</tbody>
          </table></div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-5 space-y-4">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-500">3. Define cómo resolver el importe</p>
          {datos.credito && <div className="p-3 bg-blue-50 text-blue-800 rounded-xl text-sm">Crédito {datos.credito.folio}: primero se descontará automáticamente hasta {dinero(datos.credito.saldoPendiente)} del saldo pendiente.</div>}
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la devolución (obligatorio)" className="w-full border rounded-xl px-4 py-3 min-h-24" />
          <div className="grid md:grid-cols-2 gap-3">
            <label className={`border rounded-xl p-4 cursor-pointer ${destino === "REEMBOLSO" ? "border-indigo-500 bg-indigo-50" : "border-slate-200"}`}><input type="radio" className="mr-2" checked={destino === "REEMBOLSO"} onChange={() => setDestino("REEMBOLSO")} /> <b>Reembolsar lo ya pagado</b></label>
            <label className={`border rounded-xl p-4 cursor-pointer ${destino === "SALDO_FAVOR" ? "border-indigo-500 bg-indigo-50" : "border-slate-200"}`}><input type="radio" className="mr-2" checked={destino === "SALDO_FAVOR"} onChange={() => setDestino("SALDO_FAVOR")} /> <b>Dejar saldo a favor</b></label>
          </div>
          {destino === "REEMBOLSO" && <div className="grid md:grid-cols-3 gap-3">
            <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="border rounded-xl px-4 py-3"><option>EFECTIVO</option><option>TRANSFERENCIA</option><option>TARJETA</option><option>CHEQUE</option><option>OTRO</option></select>
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="border rounded-xl px-4 py-3"><option value="">Caja o cuenta…</option>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.banco?.nombre ? ` · ${c.banco.nombre}` : ""}</option>)}</select>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Referencia (opcional)" className="border rounded-xl px-4 py-3" />
          </div>}
        </section>

        <div className="sticky bottom-4 bg-slate-900 text-white rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div><p className="text-xs text-slate-400 uppercase font-bold">Importe estimado</p><p className="text-2xl font-black">{dinero(estimado)}</p><p className="text-xs text-slate-400">El servidor ajusta el último renglón para evitar centavos residuales.</p></div>
          <button onClick={() => void guardar()} disabled={guardando || elegidos.length === 0} className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-7 py-3 rounded-xl font-black flex items-center gap-2">{guardando && <Loader2 className="w-4 h-4 animate-spin" />} Procesar devolución</button>
        </div>
      </>}
    </div>
  );
}
