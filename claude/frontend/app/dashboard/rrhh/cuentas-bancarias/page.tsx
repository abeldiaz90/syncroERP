'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Clock3, KeyRound, Search, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmarElegante, solicitarTexto } from '@/components/ui/dialogos';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';

type Empleado = {
  id: string;
  numeroEmpleado: string;
  nombreCompleto?: string;
  nombres?: string;
  apellidoPaterno?: string;
};
type Cuenta = {
  id: string;
  empleadoId: string;
  bancoClave?: string;
  bancoNombre: string;
  clabe: string;
  numeroCuenta?: string;
  titular: string;
  moneda: string;
  principal: boolean;
  estado: string;
  estadoValidacion: 'PENDIENTE' | 'VALIDADA' | 'RECHAZADA';
  motivoValidacion?: string;
};
type Banco = { id: string; clave?: string; nombre: string; activo?: boolean };

const vacio = {
  empleadoId: '', bancoClave: '', bancoNombre: '', clabe: '', numeroCuenta: '',
  titular: '', moneda: 'MXN', principal: true, observaciones: '',
};

export default function CuentasBancariasPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [form, setForm] = useState({ ...vacio });
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    const [e, c, b] = await Promise.all([
      api.get<Empleado[]>('/rrhh/empleados'),
      api.get<Cuenta[]>('/rrhh/nomina-avanzada/cuentas-bancarias'),
      api.get<Banco[]>('/catalogos/bancos'),
    ]);
    setEmpleados(Array.isArray(e) ? e : []);
    setCuentas(Array.isArray(c) ? c : []);
    setBancos((Array.isArray(b) ? b : []).filter((x) => x.activo !== false));
  };

  useEffect(() => {
    cargar().catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos.'));
  }, []);

  const empleadosMap = useMemo(() => new Map(empleados.map((e) => [e.id, e])), [empleados]);
  const filtradas = cuentas.filter((c) => {
    const e = empleadosMap.get(c.empleadoId);
    return `${e?.numeroEmpleado ?? ''} ${e?.nombreCompleto ?? ''} ${c.bancoNombre} ${c.clabe}`
      .toLowerCase().includes(busqueda.toLowerCase());
  });

  async function guardar() {
    setError(''); setMensaje('');
    if (!form.empleadoId) return setError('Selecciona un empleado.');
    if (!/^\d{18}$/.test(form.clabe)) return setError('La CLABE debe tener 18 dígitos.');
    setOcupado(true);
    try {
      await api.post('/rrhh/nomina-avanzada/cuentas-bancarias', form);
      setMensaje('Cuenta registrada. Quedó pendiente de validación por Finanzas/Tesorería.');
      setForm({ ...vacio });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible guardar la cuenta.');
    } finally { setOcupado(false); }
  }

  async function migrarCuentasLegadas() {
    const confirmar = await confirmarElegante(
      'Esta acción cifra las CLABE legadas que todavía estén guardadas en texto claro, elimina el valor original y deja las cuentas pendientes de revalidación. Verifica antes que NOMINA_DATA_ENCRYPTION_KEY esté configurada en el backend. ¿Continuar?',
    );
    if (!confirmar) return;

    setOcupado(true); setError(''); setMensaje('');
    try {
      const resultado = await api.post<{ migradas?: number; omitidas?: number }>(
        '/rrhh/nomina-avanzada/cuentas-bancarias/migrar-cifrado',
        {},
      );
      setMensaje(
        `Migración concluida: ${resultado?.migradas ?? 0} cuenta(s) cifrada(s)` +
        `${resultado?.omitidas ? ` y ${resultado.omitidas} omitida(s)` : ''}. Deben validarse nuevamente antes de dispersar.`,
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible migrar las cuentas legadas.');
    } finally { setOcupado(false); }
  }

  async function validar(cuenta: Cuenta, estado: 'VALIDADA' | 'RECHAZADA') {
    const motivo = estado === 'RECHAZADA'
      ? await solicitarTexto('Motivo de rechazo de la cuenta bancaria:', { titulo: 'Rechazar cuenta bancaria', obligatorio: true })
      : undefined;
    if (estado === 'RECHAZADA' && !motivo?.trim()) return;
    setOcupado(true); setError(''); setMensaje('');
    try {
      await api.patch(`/rrhh/nomina-avanzada/cuentas-bancarias/${cuenta.id}/validar`, { estado, motivo });
      setMensaje(estado === 'VALIDADA' ? 'Cuenta validada para dispersión.' : 'Cuenta rechazada.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible validar la cuenta.');
    } finally { setOcupado(false); }
  }

  const nombreEmpleado = (id: string) => {
    const e = empleadosMap.get(id);
    return e?.nombreCompleto || [e?.nombres, e?.apellidoPaterno].filter(Boolean).join(' ') || id;
  };

  return <div className="mx-auto max-w-[1450px] space-y-5 p-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div><h1 className="text-2xl font-bold text-slate-950">Cuentas bancarias de empleados</h1>
        <p className="text-sm text-slate-500">Captura, cifrado, validación independiente y selección de la cuenta principal para dispersión.</p></div>
      <button className="btn btn-secundario" disabled={ocupado} onClick={() => void migrarCuentasLegadas()}>
        <KeyRound className="h-4 w-4"/> Migrar CLABE legadas a cifrado
      </button>
    </div>
    {mensaje && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{mensaje}</div>}
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

    <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Registrar cuenta</h2>
        <div className="space-y-3">
          <label className="text-sm">Empleado<select className="entrada mt-1 w-full" value={form.empleadoId} onChange={(e) => setForm({ ...form, empleadoId: e.target.value })}><option value="">Selecciona...</option>{empleados.map((e) => <option key={e.id} value={e.id}>{e.numeroEmpleado} · {nombreEmpleado(e.id)}</option>)}</select></label>
          <label className="text-sm">Banco oficial<BuscadorSeleccion className="mt-1" valor={bancos.find((b) => b.clave === form.bancoClave && b.nombre === form.bancoNombre)?.id ?? ''} opciones={bancos.map((b) => ({ valor: b.id, etiqueta: `${b.clave ?? '—'} · ${b.nombre}`, busqueda: b.clave }))} onChange={(id) => { const banco = bancos.find((b) => b.id === id); setForm({ ...form, bancoClave: banco?.clave ?? '', bancoNombre: banco?.nombre ?? '' }); }} placeholder="Buscar banco por clave o nombre…"/></label>
          <label className="text-sm">CLABE<input className="entrada mt-1 w-full font-mono" inputMode="numeric" maxLength={18} value={form.clabe} onChange={(e) => setForm({ ...form, clabe: e.target.value.replace(/\D/g, '') })}/></label>
          <label className="text-sm">Número de cuenta<input className="entrada mt-1 w-full" value={form.numeroCuenta} onChange={(e) => setForm({ ...form, numeroCuenta: e.target.value.replace(/\D/g, '') })}/></label>
          <label className="text-sm">Titular<input className="entrada mt-1 w-full" value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })}/></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.checked })}/>Cuenta principal</label>
          <button className="btn btn-primario w-full" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? 'Procesando…' : 'Registrar cuenta'}</button>
          <p className="text-xs text-slate-500">La captura no valida la cuenta. Otra persona con rol de Finanzas o Tesorería debe aprobarla.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b p-4"><Search className="h-4 w-4 text-slate-400"/><input className="entrada flex-1" placeholder="Buscar empleado o banco" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}/></div>
        <div className="overflow-x-auto"><table className="tabla"><thead><tr><th>Empleado</th><th>Banco</th><th>CLABE</th><th>Uso</th><th>Validación</th><th>Acciones</th></tr></thead><tbody>
          {filtradas.map((c) => <tr key={c.id}><td><b>{empleadosMap.get(c.empleadoId)?.numeroEmpleado ?? '—'}</b><div className="text-xs text-slate-500">{nombreEmpleado(c.empleadoId)}</div></td><td><span className="flex items-center gap-2"><Building2 className="h-4 w-4"/>{c.bancoNombre}</span></td><td className="font-mono">{c.clabe}</td><td>{c.principal ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4"/>Principal</span> : 'Alterna'}</td><td><EstadoValidacion estado={c.estadoValidacion}/>{c.motivoValidacion && <div className="mt-1 text-xs text-slate-500">{c.motivoValidacion}</div>}</td><td>{c.estadoValidacion === 'PENDIENTE' && <div className="flex gap-2"><button disabled={ocupado} className="btn btn-primario btn-sm" onClick={() => void validar(c, 'VALIDADA')}><ShieldCheck className="h-4 w-4"/>Validar</button><button disabled={ocupado} className="btn btn-secundario btn-sm" onClick={() => void validar(c, 'RECHAZADA')}><XCircle className="h-4 w-4"/>Rechazar</button></div>}</td></tr>)}
          {!filtradas.length && <tr><td colSpan={6} className="py-10 text-center text-slate-500">No hay cuentas registradas.</td></tr>}
        </tbody></table></div>
      </div>
    </div>
  </div>;
}

function EstadoValidacion({ estado }: { estado: Cuenta['estadoValidacion'] }) {
  if (estado === 'VALIDADA') return <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-4 w-4"/>Validada</span>;
  if (estado === 'RECHAZADA') return <span className="inline-flex items-center gap-1 text-red-700"><XCircle className="h-4 w-4"/>Rechazada</span>;
  return <span className="inline-flex items-center gap-1 text-amber-700"><Clock3 className="h-4 w-4"/>Pendiente</span>;
}
