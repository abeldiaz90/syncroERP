import { useState, useEffect } from 'react';
import { PackagePlus, PackageMinus, X, CheckCircle2, AlertCircle, Layers, Calendar, Hash, Info } from 'lucide-react';
import { IProducto, ICatalogoBasico } from '../types/producto.types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tipo: 'compra' | 'salida';
  producto: IProducto | null;
  almacenes: ICatalogoBasico[];
  onSubmit: (data: any) => void;
}

export default function ModalInventarioRapido({ isOpen, onClose, tipo, producto, almacenes, onSubmit }: Props) {
  const [cantidad, setCantidad] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [motivo, setMotivo] = useState('');
  
  const [lote, setLote] = useState('');
  const [fechaCaducidad, setFechaCaducidad] = useState('');
  const [equivalenciaId, setEquivalenciaId] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCantidad('');
      setAlmacenId('');
      setMotivo('');
      setLote('');
      setFechaCaducidad('');
      setEquivalenciaId('');
    }
  }, [isOpen]);

  if (!isOpen || !producto) return null;

  const esEntrada = tipo === 'compra';
  const Icono = esEntrada ? PackagePlus : PackageMinus;

  // ✅ SOLUCIÓN 1: Mapa estático de colores para Tailwind
  const theme = esEntrada ? {
    bgLight: 'bg-emerald-50/50',
    bgIcon: 'bg-emerald-100',
    textIcon: 'text-emerald-600',
    textTitle: 'text-emerald-900',
    ring: 'focus:ring-emerald-500',
    borderFocus: 'focus:border-emerald-500',
    btn: 'bg-emerald-600 hover:bg-emerald-700'
  } : {
    bgLight: 'bg-amber-50/50',
    bgIcon: 'bg-amber-100',
    textIcon: 'text-amber-600',
    textTitle: 'text-amber-900',
    ring: 'focus:ring-amber-500',
    borderFocus: 'focus:border-amber-500',
    btn: 'bg-amber-600 hover:bg-amber-700'
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: producto.id,
      cantidad: Number(cantidad),
      almacenId,
      motivo: motivo || (esEntrada ? 'Ingreso rápido de almacén' : 'Salida rápida de almacén'),
      // ✅ SOLUCIÓN 2: Renombrado a 'numeroLote' para coincidir con la función del padre
      numeroLote: producto.requiereLote ? lote : undefined,
      fechaCaducidad: producto.requiereCaducidad ? fechaCaducidad : undefined,
      equivalenciaId: equivalenciaId || undefined
    });
  };

  const inputClass = "w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 transition-colors text-slate-800 font-medium";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        
        <div className={`px-6 py-4 flex items-center justify-between border-b border-slate-100 ${theme.bgLight}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${theme.bgIcon} flex items-center justify-center ${theme.textIcon}`}>
              <Icono className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-lg font-black ${theme.textTitle} leading-none`}>
                {esEntrada ? 'Recepción de Mercancía' : 'Salida de Mercancía'}
              </h2>
              <p className="text-xs font-bold text-slate-500 mt-1">{producto.sku} - {producto.nombre}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-md transition-colors">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <form id="inventario-form" onSubmit={handleSubmit} className="p-6 space-y-4 bg-slate-50">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Almacén *</label>
              <select required value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} className={`${inputClass} ${theme.ring} ${theme.borderFocus}`}>
                <option value="">Seleccione...</option>
                {almacenes.map(alm => <option key={alm.id} value={alm.id}>{alm.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Cantidad *</label>
              <div className="flex items-center gap-2">
                <input required type="number" min="0.01" step="0.01" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${inputClass} ${theme.ring} ${theme.borderFocus}`} placeholder="0" />
              </div>
            </div>
          </div>

          {producto.equivalencias && producto.equivalencias.length > 0 && (
            <div className="p-3 bg-white border border-blue-100 rounded-md shadow-sm">
              <label className="flex items-center gap-2 text-[11px] font-black text-blue-600 uppercase tracking-wider mb-1.5">
                <Layers className="w-3.5 h-3.5" /> Presentación de Empaque
              </label>
              <select value={equivalenciaId} onChange={(e) => setEquivalenciaId(e.target.value)} className={`${inputClass} border-blue-200 focus:ring-blue-500`}>
                <option value="">{producto.unidadMedida} (Unidad Base Individual)</option>
                {producto.equivalencias.map(eq => (
                  <option key={eq.id} value={eq.id}>
                    {eq.nombreEmpaque} (Contiene {eq.factorConversion} {producto.unidadMedida}s)
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1.5 font-medium italic">
                {equivalenciaId 
                  ? `Se ingresarán ${Number(cantidad || 0) * Number(producto.equivalencias.find(e => e.id === equivalenciaId)?.factorConversion || 1)} unidades base al Kardex.` 
                  : `El Kardex registrará exactamente ${cantidad || 0} unidades.`}
              </p>
            </div>
          )}

          {(producto.requiereLote || producto.requiereCaducidad) && esEntrada && (
            <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-md space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-800">Control Sanitario / Trazabilidad</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {producto.requiereLote && (
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-black text-amber-700 uppercase tracking-wider mb-1.5">
                      <Hash className="w-3 h-3" /> Lote de Fab. *
                    </label>
                    <input required type="text" value={lote} onChange={(e) => setLote(e.target.value.toUpperCase())} className={`${inputClass} border-amber-300 focus:ring-amber-500`} placeholder="Ej. LOTE-123" />
                  </div>
                )}
                {producto.requiereCaducidad && (
                  <div>
                    <label className="flex items-center gap-1.5 text-[11px] font-black text-amber-700 uppercase tracking-wider mb-1.5">
                      <Calendar className="w-3 h-3" /> Caducidad *
                    </label>
                    <input required type="date" value={fechaCaducidad} onChange={(e) => setFechaCaducidad(e.target.value)} className={`${inputClass} border-amber-300 focus:ring-amber-500`} />
                  </div>
                )}
              </div>
            </div>
          )}

          {(producto.requiereLote || producto.requiereCaducidad) && !esEntrada && (
             <div className="p-3 bg-blue-50 border border-blue-200 rounded-md flex items-start gap-3">
               <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
               <p className="text-xs font-medium text-blue-800 leading-relaxed">
                 Este producto requiere trazabilidad. El sistema aplicará automáticamente el método <strong>FEFO (Primero en Caducar, Primero en Salir)</strong> para descontar del lote más antiguo disponible.
               </p>
             </div>
          )}

          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Comentarios / Ref. Documento</label>
            <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={`${inputClass} focus:ring-blue-500`} placeholder="Ej. Factura #4590, Ajuste por merma..." />
          </div>
        </form>

        <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 mr-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-md transition-colors">
            Cancelar
          </button>
          <button type="submit" form="inventario-form" className={`px-5 py-2 text-white text-sm font-bold rounded-md shadow-sm transition-colors flex items-center gap-2 ${theme.btn}`}>
            <CheckCircle2 className="w-4 h-4" />
            {esEntrada ? 'Confirmar Ingreso' : 'Confirmar Salida'}
          </button>
        </div>
      </div>
    </div>
  );
}