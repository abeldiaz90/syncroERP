"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Swal from 'sweetalert2';
import {
  ChevronLeft, CheckCircle2, Building2, PackageCheck,
  Loader2, Calendar, Warehouse, Truck,
  AlertTriangle, ShieldAlert, Hash, Layers
} from 'lucide-react';
import { ProtectedElement } from "@/app/components/ProtectedElement"; // ← NUEVO

interface ICaptura {
  cantidadRecibidaOk: number;
  cantidadRechazada: number;
  motivoRechazo: string;
  lote: string;
  fechaCaducidad: string;
  equivalenciaId: string;
}

export default function RecepcionDetallePage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [oc, setOC] = useState<any>(null);
  const [almacenes, setAlmacenes] = useState<any[]>([]);
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState('');
  const [capturas, setCapturas] = useState<Record<string, ICaptura>>({});
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem('syncro_token');
    Promise.all([
      fetch(`${apiUrl}/compras/ordenes/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${apiUrl}/catalogo/almacenes`, { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async ([resOC, resAlm]) => {
      if (resOC.ok) {
        const dataOC = await resOC.json();
        setOC(dataOC);
        const estadoInicial: Record<string, ICaptura> = {};
        dataOC.detalles.forEach((det: any) => {
          estadoInicial[det.id] = { cantidadRecibidaOk: Number(det.cantidad), cantidadRechazada: 0, motivoRechazo: '', lote: '', fechaCaducidad: '', equivalenciaId: '' };
        });
        setCapturas(estadoInicial);
      }
      if (resAlm.ok) setAlmacenes(await resAlm.json());
      setCargando(false);
    }).catch(() => { setToast({ mensaje: 'Error de conexión con el servidor', tipo: 'error' }); setCargando(false); });
  }, [id, apiUrl]);

  const handleCapturaChange = (detalleId: string, campo: keyof ICaptura, valor: string | number) => {
    setCapturas(prev => ({
      ...prev,
      [detalleId]: {
        ...prev[detalleId],
        [campo]: (campo === 'motivoRechazo' || campo === 'lote' || campo === 'fechaCaducidad' || campo === 'equivalenciaId') ? valor : Number(valor)
      }
    }));
  };

  const handleRecibir = async () => {
    if (!almacenSeleccionado) return setToast({ mensaje: 'Selecciona la rampa o almacén de ingreso', tipo: 'error' });

    const detallesProcesados = Object.keys(capturas).map(key => ({ id: key, ...capturas[key] }));

    if (detallesProcesados.some(d => d.cantidadRechazada > 0 && !d.motivoRechazo))
      return setToast({ mensaje: 'Debes seleccionar un motivo para la mercancía rechazada', tipo: 'error' });

    const faltanDatosTrazabilidad = detallesProcesados.some(d => {
      if (d.cantidadRecibidaOk <= 0) return false;
      const producto = oc.detalles.find((x: any) => x.id === d.id)?.producto;
      if (producto?.requiereLote && !d.lote.trim()) return true;
      if (producto?.requiereCaducidad && !d.fechaCaducidad) return true;
      return false;
    });
    if (faltanDatosTrazabilidad) return setToast({ mensaje: 'Faltan capturar Lotes o Fechas de Caducidad obligatorios', tipo: 'error' });

    const almacenNombre = almacenes.find(a => a.id === almacenSeleccionado)?.nombre;
    const hayIncidencias = detallesProcesados.some(d => {
      if (d.cantidadRechazada > 0) return true;
      const detOriginal = oc.detalles.find((x: any) => x.id === d.id);
      const factor = detOriginal?.producto?.equivalencias?.find((e: any) => e.id === d.equivalenciaId)?.factorConversion || 1;
      return (d.cantidadRecibidaOk * factor) < Number(detOriginal?.cantidad || 0);
    });

    const result = await Swal.fire({
      title: hayIncidencias ? '¿Registrar Ingreso con Incidencias?' : '¿Confirmar Ingreso Perfecto?',
      html: `Se dará entrada física en <b>${almacenNombre}</b>.<br/><br/>${hayIncidencias ? '<span style="color: #ef4444; font-weight: bold;">⚠️ Has reportado mermas o faltantes.</span>' : 'Todo coincide con el manifiesto original.'}`,
      icon: hayIncidencias ? 'warning' : 'question', showCancelButton: true,
      confirmButtonColor: hayIncidencias ? '#ef4444' : '#059669',
      confirmButtonText: hayIncidencias ? 'Registrar Incidencias' : 'Sí, recibir inventario',
      cancelButtonText: 'Revisar de nuevo', reverseButtons: true,
      customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2.5 rounded-xl font-bold', cancelButton: 'px-6 py-2.5 rounded-xl font-bold' }
    });
    if (!result.isConfirmed) return;

    setProcesando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/compras/ordenes/${id}/recibir`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          almacenId: almacenSeleccionado,
          detalles: detallesProcesados.map(d => ({ id: d.id, cantidadRecibidaOk: d.cantidadRecibidaOk, cantidadRechazada: d.cantidadRechazada, motivoRechazo: d.motivoRechazo, lote: d.lote || undefined, fechaCaducidad: d.fechaCaducidad || undefined, equivalenciaId: d.equivalenciaId || undefined }))
        }),
      });
      if (res.ok) {
        Swal.fire({ title: '¡Operación Exitosa!', text: 'El manifiesto y el inventario han sido actualizados.', icon: 'success', confirmButtonColor: '#059669', customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2.5 rounded-xl font-bold' } })
          .then(() => router.push('/dashboard/inventario/recepciones'));
      } else {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Error al procesar la recepción');
      }
    } catch (error: any) { setToast({ mensaje: error.message, tipo: 'error' }); setProcesando(false); }
  };

  if (cargando) return <div className="flex flex-col items-center justify-center p-20 text-slate-400"><Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-4" /><p className="font-bold">Cargando manifiesto...</p></div>;
  if (!oc) return <div className="text-center p-20 text-rose-500 font-bold">Documento no encontrado.</div>;

  const motivosRechazo = ['Caja Abierta / Rota', 'Producto Dañado', 'Faltante de Origen', 'Producto Equivocado', 'Caducado'];

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500 text-slate-800">
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl font-bold text-white ${toast.tipo === 'exito' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.mensaje}
        </div>
      )}

      <Link href="/dashboard/inventario/recepciones" className="flex items-center gap-2 text-slate-500 hover:text-emerald-600 font-bold w-fit transition-colors">
        <ChevronLeft className="w-4 h-4" /> Volver al Control de Entradas
      </Link>

      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-200">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 border-b border-slate-100 pb-6 mb-6">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
              <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600"><Truck className="w-6 h-6" /></div>
              Manifiesto de Recepción
            </h1>
            <p className="text-slate-500 mt-2 font-bold font-mono text-lg">OC-{oc.id.substring(0, 8).toUpperCase()}</p>
          </div>
          <span className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest ${oc.estado === 'RECIBIDA' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : oc.estado === 'CON_INCIDENCIAS' ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
            Estado: {oc.estado.replace('_', ' ')}
          </span>
        </div>

        {/* Datos origen */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="flex gap-4 items-center bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <Building2 className="w-8 h-8 text-slate-400" />
            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Proveedor</p><p className="font-bold text-lg mt-0.5">{oc.proveedor?.nombre}</p></div>
          </div>
          <div className="flex gap-4 items-center bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <Calendar className="w-8 h-8 text-slate-400" />
            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha de Emisión</p><p className="font-bold text-lg mt-0.5">{new Date(oc.fechaCreacion).toLocaleDateString('es-MX')}</p></div>
          </div>
        </div>

        {/* Tabla */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Verificación y Trazabilidad</h3>
          {oc.estado === 'ENVIADA' && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">Cantidades OK pre-llenadas</span>}
        </div>

        <div className="border border-slate-200 rounded-2xl overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-900 text-white text-[11px] uppercase tracking-widest font-black">
                <tr>
                  <th className="px-4 py-4">Producto / SKU</th>
                  <th className="px-4 py-4 text-center">Esperado</th>
                  <th className="px-4 py-4 text-center">Trazabilidad / Empaque</th>
                  <th className="px-4 py-4 text-center text-emerald-400">Cant. OK</th>
                  <th className="px-4 py-4 text-center text-rose-400">Rechazo</th>
                  <th className="px-4 py-4">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {oc.detalles?.map((det: any) => {
                  const estadoCaptura = capturas[det.id];
                  const producto = det.producto;
                  const factor = producto?.equivalencias?.find((e: any) => e.id === estadoCaptura?.equivalenciaId)?.factorConversion || 1;
                  const totalIngresado = (estadoCaptura?.cantidadRecibidaOk || 0) * factor;
                  const diferencia = Number(det.cantidad) - (totalIngresado + (estadoCaptura?.cantidadRechazada || 0));

                  return (
                    <tr key={det.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-4">
                        <p className="font-bold text-slate-800 truncate max-w-[200px]" title={producto?.nombre}>{producto?.nombre}</p>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5">{producto?.sku}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-lg font-black text-slate-400">{det.cantidad}</span>
                        <span className="block text-[9px] text-slate-400 uppercase">{producto?.unidadMedida}</span>
                      </td>
                      <td className="px-4 py-4 bg-slate-50/50">
                        {oc.estado === 'ENVIADA' ? (
                          <div className="space-y-2 min-w-[200px]">
                            {producto?.equivalencias?.length > 0 && (
                              <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-blue-500 shrink-0" />
                                <select value={estadoCaptura?.equivalenciaId} onChange={(e) => handleCapturaChange(det.id, 'equivalenciaId', e.target.value)} className="w-full text-xs font-bold p-1.5 border border-blue-200 rounded text-blue-700 bg-white outline-none">
                                  <option value="">{producto.unidadMedida} (Base)</option>
                                  {producto.equivalencias.map((eq: any) => <option key={eq.id} value={eq.id}>{eq.nombreEmpaque} (x{eq.factorConversion})</option>)}
                                </select>
                              </div>
                            )}
                            {producto?.requiereLote && (
                              <div className="flex items-center gap-2">
                                <Hash className="w-4 h-4 text-amber-500 shrink-0" />
                                <input type="text" placeholder="LOTE OBLIGATORIO" value={estadoCaptura?.lote} onChange={(e) => handleCapturaChange(det.id, 'lote', e.target.value.toUpperCase())} className={`w-full text-xs p-1.5 border rounded outline-none uppercase font-mono ${!estadoCaptura?.lote ? 'border-amber-300 bg-amber-50 placeholder:text-amber-400/70' : 'border-slate-300 bg-white'}`} />
                              </div>
                            )}
                            {producto?.requiereCaducidad && (
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
                                <input type="date" value={estadoCaptura?.fechaCaducidad} onChange={(e) => handleCapturaChange(det.id, 'fechaCaducidad', e.target.value)} className={`w-full text-xs p-1.5 border rounded outline-none ${!estadoCaptura?.fechaCaducidad ? 'border-amber-300 bg-amber-50 text-amber-600' : 'border-slate-300 bg-white'}`} />
                              </div>
                            )}
                            {!producto?.requiereLote && !producto?.requiereCaducidad && !producto?.equivalencias?.length && (
                              <span className="text-xs text-slate-400 font-bold block text-center">N/A</span>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] space-y-1">
                            <p><span className="font-bold text-slate-400">Ingresó como:</span> {estadoCaptura?.equivalenciaId ? 'Empaque Múltiple' : 'Unidad Base'}</p>
                            {producto?.requiereLote && <p><span className="font-bold text-slate-400">Lote:</span> {estadoCaptura?.lote || 'N/A'}</p>}
                            {producto?.requiereCaducidad && <p><span className="font-bold text-slate-400">Caducidad:</span> {estadoCaptura?.fechaCaducidad || 'N/A'}</p>}
                          </div>
                        )}
                      </td>

                      {oc.estado === 'ENVIADA' ? (
                        <>
                          <td className="px-4 py-4 text-center">
                            <input type="number" min="0" step="any" value={estadoCaptura?.cantidadRecibidaOk === 0 && estadoCaptura?.cantidadRechazada === 0 ? '' : estadoCaptura?.cantidadRecibidaOk} onChange={(e) => handleCapturaChange(det.id, 'cantidadRecibidaOk', e.target.value)}
                              className={`w-20 text-center font-bold text-lg p-2 rounded-xl border outline-none focus:ring-2 ${diferencia === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700 focus:ring-emerald-500' : 'bg-white border-slate-300 text-slate-700 focus:ring-emerald-500'}`} />
                            {estadoCaptura?.equivalenciaId && <span className="block text-[9px] text-blue-500 font-bold mt-1">= {totalIngresado} {producto.unidadMedida}s</span>}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <input type="number" min="0" step="any" value={estadoCaptura?.cantidadRechazada === 0 ? '' : estadoCaptura?.cantidadRechazada} onChange={(e) => handleCapturaChange(det.id, 'cantidadRechazada', e.target.value)} placeholder="0"
                              className={`w-20 text-center font-bold text-lg p-2 rounded-xl border outline-none focus:ring-2 transition-colors ${estadoCaptura?.cantidadRechazada > 0 ? 'bg-rose-50 border-rose-300 text-rose-700 focus:ring-rose-500' : 'bg-slate-50 border-slate-200 text-slate-400 focus:ring-rose-500'}`} />
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <select disabled={estadoCaptura?.cantidadRechazada === 0} value={estadoCaptura?.motivoRechazo} onChange={(e) => handleCapturaChange(det.id, 'motivoRechazo', e.target.value)}
                                className={`w-full p-2.5 rounded-xl border outline-none text-xs font-bold transition-all ${estadoCaptura?.cantidadRechazada > 0 ? estadoCaptura?.motivoRechazo ? 'bg-white border-rose-300 text-rose-700' : 'bg-rose-100 border-rose-500 text-rose-700 ring-2 ring-rose-500/20' : 'bg-slate-100 border-transparent text-slate-400 cursor-not-allowed'}`}>
                                <option value="">Seleccione motivo...</option>
                                {motivosRechazo.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                              {diferencia !== 0 && <div className="text-amber-500" title={`Discrepancia: ${Math.abs(diferencia)} unidades sin justificar`}><AlertTriangle className="w-5 h-5" /></div>}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-4 text-center font-black text-emerald-600 text-lg">{det.cantidadRecibidaOk}</td>
                          <td className="px-4 py-4 text-center font-black text-rose-600 text-lg">{det.cantidadRechazada}</td>
                          <td className="px-4 py-4 text-sm font-bold text-slate-500">{det.motivoRechazo || '---'}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Zona de confirmación */}
        {oc.estado === 'ENVIADA' ? (
          <div className="bg-slate-900 p-8 rounded-[2rem] flex flex-col md:flex-row items-center gap-6 justify-between shadow-xl">
            <div className="flex-1 w-full">
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Rampa o almacén de ingreso</label>
              <div className="relative">
                <Warehouse className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <select value={almacenSeleccionado} onChange={(e) => setAlmacenSeleccionado(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-slate-800 border-none rounded-xl text-white font-bold outline-none focus:ring-2 focus:ring-emerald-500 appearance-none">
                  <option value="">Seleccione el destino...</option>
                  {almacenes.map(alm => <option key={alm.id} value={alm.id}>{alm.nombre}</option>)}
                </select>
              </div>
            </div>
            {/* ✅ Solo aparece si tiene PATCH /api/compras/ordenes/:id/recibir */}
            <ProtectedElement metodo="PATCH" ruta="/api/compras/ordenes/:id/recibir">
              <button onClick={handleRecibir} disabled={procesando || !almacenSeleccionado} className="w-full md:w-auto px-8 py-4 bg-emerald-500 text-white rounded-xl font-black hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-95 mt-6 md:mt-0">
                {procesando ? <Loader2 className="animate-spin w-6 h-6" /> : <PackageCheck className="w-6 h-6" />}
                {procesando ? 'Procesando Manifiesto...' : 'Firmar y Cerrar Documento'}
              </button>
            </ProtectedElement>
          </div>
        ) : oc.estado === 'CON_INCIDENCIAS' ? (
          <div className="bg-rose-50 p-8 rounded-2xl border border-rose-200 flex items-center gap-4 text-rose-700">
            <div className="p-3 bg-rose-100 rounded-full"><ShieldAlert className="w-8 h-8" /></div>
            <div><p className="font-black text-xl">Documento con Discrepancias Logísticas</p><p className="text-sm font-medium mt-1">Este manifiesto fue cerrado. Compras ha sido notificado para gestionar devoluciones.</p></div>
          </div>
        ) : (
          <div className="bg-emerald-50 p-8 rounded-2xl border border-emerald-200 flex items-center gap-4 text-emerald-700">
            <div className="p-3 bg-emerald-100 rounded-full"><CheckCircle2 className="w-8 h-8" /></div>
            <div><p className="font-black text-xl">Recepción Perfecta</p><p className="text-sm font-medium mt-1">Todo el manifiesto fue ingresado al inventario físico sin novedades.</p></div>
          </div>
        )}
      </div>
    </div>
  );
}
