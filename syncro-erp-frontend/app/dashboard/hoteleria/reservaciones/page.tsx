// app/dashboard/hoteleria/reservaciones/page.tsx
"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  CalendarCheck, Plus, LogIn, LogOut, Receipt, X, Loader2, CheckCircle2,
  User, BedDouble, Search, DollarSign,
} from 'lucide-react';

interface IHotel { id: string; nombre: string; }
interface ITipo { id: string; nombre: string; tarifaBase: number; capacidad: number; }
interface IHabitacion { id: string; numero: string; estado: string; tipoHabitacionId: string; }
interface IReserva {
  id: string; codigo: string; clienteNombre: string; tipoHabitacionId: string;
  hotelId: string; fechaEntrada: string; fechaSalida: string; estado: string; tarifaNoche: number;
  habitacionId: string | null;
}
interface ICliente { id: string; nombre: string; }

const ESTADO_BADGE: Record<string, string> = {
  CONFIRMADA: 'bg-blue-50 text-blue-700 border-blue-200',
  CHECK_IN:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  CHECK_OUT:  'bg-slate-100 text-slate-600 border-slate-200',
  CANCELADA:  'bg-rose-50 text-rose-700 border-rose-200',
  NO_SHOW:    'bg-amber-50 text-amber-700 border-amber-200',
};

export default function ReservacionesPage() {
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('syncro_token') ?? '' : '');
  const h = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });

  const [hoteles, setHoteles] = useState<IHotel[]>([]);
  const [hotelId, setHotelId] = useState('');
  const [tipos, setTipos] = useState<ITipo[]>([]);
  const [reservas, setReservas] = useState<IReserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Modales
  const [modalNueva, setModalNueva] = useState(false);
  const [modalCheckIn, setModalCheckIn] = useState<IReserva | null>(null);
  const [modalFolio, setModalFolio] = useState<IReserva | null>(null);

  const mostrarToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  const cargarHoteles = useCallback(async () => {
    const r = await fetch(`${api}/hoteleria/config/hoteles`, { headers: h() });
    if (r.ok) { const d = await r.json(); setHoteles(d); if (d.length && !hotelId) setHotelId(d[0].id); }
    setCargando(false);
  }, [api, hotelId]);

  const cargarTipos = useCallback(async () => {
    if (!hotelId) return;
    const r = await fetch(`${api}/hoteleria/config/tipos?hotelId=${hotelId}`, { headers: h() });
    if (r.ok) setTipos(await r.json());
  }, [api, hotelId]);

  const cargarReservas = useCallback(async () => {
    if (!hotelId) return;
    const r = await fetch(`${api}/hoteleria/operacion/reservaciones?hotelId=${hotelId}`, { headers: h() });
    if (r.ok) setReservas(await r.json());
  }, [api, hotelId]);

  useEffect(() => { cargarHoteles(); }, [cargarHoteles]);
  useEffect(() => { if (hotelId) { cargarTipos(); cargarReservas(); } }, [hotelId, cargarTipos, cargarReservas]);

  const nombreTipo = (id: string) => tipos.find(t => t.id === id)?.nombre ?? '—';

  if (cargando) return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  if (hoteles.length === 0) return (
    <div className="p-8 text-center text-slate-500">
      <p>Primero crea un hotel en el Rack (botón "Crear hotel de demostración").</p>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5" /> : <X className="w-5 h-5" />} {toast.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <CalendarCheck className="w-8 h-8 text-indigo-500" /> Reservaciones
          </h1>
          <p className="text-slate-500 mt-1">Crea reservas, haz check-in y check-out.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={hotelId} onChange={e => setHotelId(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            {hoteles.map(ho => <option key={ho.id} value={ho.id}>{ho.nombre}</option>)}
          </select>
          <button onClick={() => setModalNueva(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Nueva reserva
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {reservas.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="font-semibold text-slate-600">Sin reservaciones</p>
            <p className="text-sm">Crea la primera con "Nueva reserva".</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 font-semibold">
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Huésped</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Entrada</th>
                <th className="px-4 py-3 text-left">Salida</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reservas.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{r.codigo}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.clienteNombre || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{nombreTipo(r.tipoHabitacionId)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.fechaEntrada}</td>
                  <td className="px-4 py-3 text-slate-600">{r.fechaSalida}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${ESTADO_BADGE[r.estado] || ''}`}>
                      {r.estado.replace('_', '-')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1.5">
                      {r.estado === 'CONFIRMADA' && (
                        <button onClick={() => setModalCheckIn(r)} title="Check-in"
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700">
                          <LogIn className="w-3.5 h-3.5" /> Check-in
                        </button>
                      )}
                      {r.estado === 'CHECK_IN' && (
                        <button onClick={() => setModalFolio(r)} title="Ver folio / Check-out"
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700">
                          <Receipt className="w-3.5 h-3.5" /> Folio
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalNueva && (
        <ModalNuevaReserva api={api} h={h} hotelId={hotelId} tipos={tipos}
          onClose={() => setModalNueva(false)}
          onOk={() => { setModalNueva(false); cargarReservas(); mostrarToast('Reservación creada'); }} />
      )}
      {modalCheckIn && (
        <ModalCheckIn api={api} h={h} reserva={modalCheckIn}
          onClose={() => setModalCheckIn(null)}
          onOk={() => { setModalCheckIn(null); cargarReservas(); mostrarToast('Check-in realizado'); }} />
      )}
      {modalFolio && (
        <ModalFolio api={api} h={h} reserva={modalFolio}
          onClose={() => setModalFolio(null)}
          onCheckOut={() => { setModalFolio(null); cargarReservas(); mostrarToast('Check-out realizado'); }} />
      )}
    </div>
  );
}

// ═══════════════════ MODAL: NUEVA RESERVA ═══════════════════
function ModalNuevaReserva({ api, h, hotelId, tipos, onClose, onOk }: any) {
  const [clientes, setClientes] = useState<ICliente[]>([]);
  const [busca, setBusca] = useState('');
  const [nuevoHuesped, setNuevoHuesped] = useState(false);
  const [hForm, setHForm] = useState({ nombre: '', telefono: '', rfc: '', email: '' });
  const [guardandoH, setGuardandoH] = useState(false);
  const [errH, setErrH] = useState('');
  const [form, setForm] = useState({
    clienteId: '', clienteNombre: '', tipoHabitacionId: '',
    fechaEntrada: '', fechaSalida: '', numHuespedes: 1, tarifaNoche: 0,
  });
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!busca.trim()) { setClientes([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`${api}/clientes?filtro=${encodeURIComponent(busca)}`, { headers: h() });
      if (r.ok) setClientes(await r.json());
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const crearHuesped = async () => {
    setErrH('');
    if (!hForm.nombre.trim()) { setErrH('El nombre es obligatorio'); return; }
    setGuardandoH(true);
    try {
      const r = await fetch(`${api}/clientes`, {
        method: 'POST', headers: h(),
        body: JSON.stringify({
          nombre: hForm.nombre.trim(),
          telefono: hForm.telefono.trim() || null,
          rfc: hForm.rfc.trim().toUpperCase() || null,
          email: hForm.email.trim() || null,
        }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d) {
        setForm(f => ({ ...f, clienteId: d.id, clienteNombre: d.nombre }));
        setNuevoHuesped(false);
        setBusca('');
        setHForm({ nombre: '', telefono: '', rfc: '', email: '' });
      } else {
        const m = Array.isArray(d?.message) ? d.message.join(', ') : d?.message;
        setErrH(m || 'No se pudo crear el huésped');
      }
    } catch { setErrH('Error de conexión'); }
    setGuardandoH(false);
  };

  const elegirTipo = (id: string) => {
    const t = tipos.find((x: ITipo) => x.id === id);
    setForm(f => ({ ...f, tipoHabitacionId: id, tarifaNoche: t?.tarifaBase ?? 0 }));
  };

  const guardar = async () => {
    setErr('');
    if (!form.clienteId) { setErr('Selecciona un huésped'); return; }
    if (!form.tipoHabitacionId) { setErr('Selecciona tipo de habitación'); return; }
    if (!form.fechaEntrada || !form.fechaSalida) { setErr('Indica las fechas'); return; }
    setGuardando(true);
    const r = await fetch(`${api}/hoteleria/operacion/reservaciones`, {
      method: 'POST', headers: h(), body: JSON.stringify({ hotelId, ...form }),
    });
    if (r.ok) onOk();
    else { const d = await r.json().catch(() => null); setErr(d?.message || 'Error al crear'); }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Plus className="w-5 h-5 text-indigo-500" /> Nueva reservación</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {err && <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">{err}</div>}

          {/* Huésped */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Huésped (cliente)</label>
            {form.clienteId ? (
              <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-indigo-800 flex items-center gap-2"><User className="w-4 h-4" /> {form.clienteNombre}</span>
                <button onClick={() => setForm(f => ({ ...f, clienteId: '', clienteNombre: '' }))} className="text-indigo-400 hover:text-indigo-600"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm" />
                {(clientes.length > 0 || busca.trim()) && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-auto">
                    {clientes.map(c => (
                      <button key={c.id} onClick={() => { setForm(f => ({ ...f, clienteId: c.id, clienteNombre: c.nombre })); setBusca(''); setClientes([]); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">{c.nombre}</button>
                    ))}
                    {busca.trim() && clientes.length === 0 && (
                      <p className="px-3 py-2 text-xs text-slate-400">Sin resultados para "{busca}"</p>
                    )}
                    <button
                      onClick={() => { setHForm({ nombre: busca, telefono: '', rfc: '', email: '' }); setErrH(''); setNuevoHuesped(true); setClientes([]); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 border-t border-slate-100">
                      <Plus className="w-4 h-4" /> Nuevo huésped
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de habitación</label>
            <select value={form.tipoHabitacionId} onChange={e => elegirTipo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">— Seleccionar —</option>
              {tipos.map((t: ITipo) => <option key={t.id} value={t.id}>{t.nombre} · ${t.tarifaBase}/noche</option>)}
            </select>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Entrada</label>
              <input type="date" value={form.fechaEntrada} onChange={e => setForm(f => ({ ...f, fechaEntrada: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Salida</label>
              <input type="date" value={form.fechaSalida} onChange={e => setForm(f => ({ ...f, fechaSalida: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Huéspedes</label>
              <input type="number" min={1} value={form.numHuespedes} onChange={e => setForm(f => ({ ...f, numHuespedes: Number(e.target.value) }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Tarifa/noche</label>
              <input type="number" value={form.tarifaNoche} onChange={e => setForm(f => ({ ...f, tarifaNoche: Number(e.target.value) }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-60">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Crear reserva
          </button>
        </div>
      </div>

      {/* Mini-modal: nuevo huésped al vuelo */}
      {nuevoHuesped && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={() => !guardandoH && setNuevoHuesped(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><User className="w-5 h-5 text-indigo-500" /> Nuevo huésped</h3>
              <button onClick={() => setNuevoHuesped(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              {errH && <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">{errH}</div>}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                <input autoFocus value={hForm.nombre} onChange={e => setHForm(v => ({ ...v, nombre: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') crearHuesped(); }}
                  placeholder="Nombre del huésped" className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                  <input value={hForm.telefono} onChange={e => setHForm(v => ({ ...v, telefono: e.target.value }))}
                    placeholder="Opcional" className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">RFC</label>
                  <input value={hForm.rfc} onChange={e => setHForm(v => ({ ...v, rfc: e.target.value.toUpperCase() }))}
                    placeholder="Opcional" maxLength={13} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Correo</label>
                <input value={hForm.email} type="email" onChange={e => setHForm(v => ({ ...v, email: e.target.value }))}
                  placeholder="Opcional" className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setNuevoHuesped(false)} disabled={guardandoH} className="px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-lg disabled:opacity-50">Cancelar</button>
              <button onClick={crearHuesped} disabled={guardandoH} className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
                {guardandoH ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {guardandoH ? 'Creando…' : 'Crear y usar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════ MODAL: CHECK-IN ═══════════════════
function ModalCheckIn({ api, h, reserva, onClose, onOk }: any) {
  const [habitaciones, setHabitaciones] = useState<IHabitacion[]>([]);
  const [habitacionId, setHabitacionId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const r = await fetch(`${api}/hoteleria/config/habitaciones?hotelId=${reserva.hotelId || ''}`, { headers: h() });
      // El endpoint pide hotelId; si la reserva no lo trae, cargamos por rack alterno
      let habs: IHabitacion[] = r.ok ? await r.json() : [];
      // Filtrar: del tipo de la reserva y disponibles
      habs = habs.filter(x => x.tipoHabitacionId === reserva.tipoHabitacionId && x.estado === 'DISPONIBLE');
      setHabitaciones(habs);
    })();
  }, []);

  const confirmar = async () => {
    if (!habitacionId) { setErr('Selecciona una habitación'); return; }
    setGuardando(true);
    const r = await fetch(`${api}/hoteleria/operacion/reservaciones/${reserva.id}/check-in`, {
      method: 'POST', headers: h(), body: JSON.stringify({ habitacionId }),
    });
    if (r.ok) onOk();
    else { const d = await r.json().catch(() => null); setErr(d?.message || 'Error en check-in'); }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2"><LogIn className="w-5 h-5 text-emerald-500" /> Check-in</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">Reserva <b>{reserva.codigo}</b> · {reserva.clienteNombre}</p>
          {err && <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">{err}</div>}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Asignar habitación disponible</label>
            {habitaciones.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No hay habitaciones disponibles de este tipo.</p>
            ) : (
              <select value={habitacionId} onChange={e => setHabitacionId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="">— Seleccionar —</option>
                {habitaciones.map(hb => <option key={hb.id} value={hb.id}>Habitación {hb.numero}</option>)}
              </select>
            )}
          </div>
          <p className="text-xs text-slate-400">Al confirmar se abre el folio y se cargan las noches automáticamente.</p>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={confirmar} disabled={guardando || habitaciones.length === 0} className="px-4 py-2 text-sm bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-60">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} Confirmar check-in
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ MODAL: FOLIO + CHECK-OUT ═══════════════════
function ModalFolio({ api, h, reserva, onClose, onCheckOut }: any) {
  const [folio, setFolio] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [addConsumo, setAddConsumo] = useState(false);
  const [consumo, setConsumo] = useState({ concepto: '', cantidad: 1, precioUnitario: 0 });

  const cargar = async () => {
    setCargando(true);
    const r = await fetch(`${api}/hoteleria/operacion/reservaciones/${reserva.id}/folio`, { headers: h() });
    if (r.ok) setFolio(await r.json());
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const agregar = async () => {
    if (!consumo.concepto || consumo.precioUnitario <= 0) return;
    const r = await fetch(`${api}/hoteleria/operacion/reservaciones/${reserva.id}/consumo`, {
      method: 'POST', headers: h(),
      body: JSON.stringify({ productoId: '00000000-0000-0000-0000-000000000000', ...consumo }),
    });
    if (r.ok) { setAddConsumo(false); setConsumo({ concepto: '', cantidad: 1, precioUnitario: 0 }); cargar(); }
  };

  const checkOut = async () => {
    setCheckingOut(true);
    const r = await fetch(`${api}/hoteleria/operacion/reservaciones/${reserva.id}/check-out`, { method: 'POST', headers: h() });
    if (r.ok) onCheckOut();
    setCheckingOut(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Receipt className="w-5 h-5 text-indigo-500" /> Folio {reserva.codigo}</h3>
            <p className="text-sm text-slate-500">{reserva.clienteNombre}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {cargando ? (
            <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" /></div>
          ) : folio ? (
            <>
              <div className="space-y-2 mb-4">
                {folio.cargos?.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                    <div>
                      <p className="font-medium text-slate-800">{c.concepto}</p>
                      <p className="text-xs text-slate-400">{c.cantidad} × ${Number(c.precioUnitario).toFixed(2)}</p>
                    </div>
                    <span className="font-bold text-slate-900">${Number(c.importe).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {addConsumo ? (
                <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-2">
                  <input placeholder="Concepto (ej. Agua minibar)" value={consumo.concepto} onChange={e => setConsumo(c => ({ ...c, concepto: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Cantidad" value={consumo.cantidad} onChange={e => setConsumo(c => ({ ...c, cantidad: Number(e.target.value) }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    <input type="number" placeholder="Precio" value={consumo.precioUnitario} onChange={e => setConsumo(c => ({ ...c, precioUnitario: Number(e.target.value) }))} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setAddConsumo(false)} className="flex-1 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancelar</button>
                    <button onClick={agregar} className="flex-1 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Agregar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddConsumo(true)} className="w-full mb-4 flex items-center justify-center gap-1 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600">
                  <Plus className="w-4 h-4" /> Agregar consumo
                </button>
              )}

              <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-3 mb-4">
                <span className="font-bold text-indigo-900">Total</span>
                <span className="text-2xl font-black text-indigo-700">${Number(folio.total).toFixed(2)}</span>
              </div>
            </>
          ) : <p className="text-sm text-slate-500">No se pudo cargar el folio.</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-700 font-medium hover:bg-slate-200 rounded-lg">Cerrar</button>
          <button onClick={checkOut} disabled={checkingOut || folio?.estado === 'CERRADO'} className="px-4 py-2 text-sm bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-700 flex items-center gap-2 disabled:opacity-60">
            {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Check-out y cerrar folio
          </button>
        </div>
      </div>
    </div>
  );
}
