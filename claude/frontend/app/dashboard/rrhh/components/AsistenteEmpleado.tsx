'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, BriefcaseBusiness, Building2, CreditCard, FileCheck2, HeartPulse, Landmark, Plus, UserRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Campo, Entrada, Seleccion } from '@/components/ui';
import { AsistentePasos, type PasoAsistente } from './AsistentePasos';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';

type Puesto = { id: string; clave: string; nombre: string; departamentoId?: string; salarioMinimo?: number; salarioMaximo?: number; plazasAutorizadas?: number };
type Departamento = { id: string; nombre: string; activo: boolean };
type Banco = { id: string; clave?: string; nombre: string; activo?: boolean };

type FormEmpleado = {
  nombres: string; apellidoPaterno: string; apellidoMaterno: string;
  curp: string; rfc: string; nss: string; fechaNacimiento: string;
  email: string; telefono: string;
  departamentoId: string; puestoId: string; jefeDirectoId: string;
  fechaIngreso: string; tipoContrato: string; regimenPago: string;
  tipoSalario: string; jornada: string; horasJornada: string;
  zonaSalarioMinimo: string; salarioDiario: string; salarioDiarioIntegrado: string;
  sbcValidado: boolean; fechaSbc: string; diasAguinaldo: string; primaVacacional: string;
  codigoPostalFiscal: string; regimenFiscal: string;
  banco: string; clabe: string; notas: string;
};

const VACIO: FormEmpleado = {
  nombres: '', apellidoPaterno: '', apellidoMaterno: '', curp: '', rfc: '', nss: '', fechaNacimiento: '',
  email: '', telefono: '', departamentoId: '', puestoId: '', jefeDirectoId: '', fechaIngreso: '',
  tipoContrato: 'INDETERMINADO', regimenPago: 'QUINCENAL', tipoSalario: 'FIJO', jornada: 'DIURNA',
  horasJornada: '8', zonaSalarioMinimo: 'GENERAL', salarioDiario: '', salarioDiarioIntegrado: '',
  sbcValidado: false, fechaSbc: '', diasAguinaldo: '15', primaVacacional: '25', codigoPostalFiscal: '',
  regimenFiscal: '605', banco: '', clabe: '', notas: '',
};

const CLAVE_BORRADOR = 'syncroerp.rrhh.alta-empleado.v2';
const soloDigitos = (v: string) => v.replace(/\D/g, '');
const RFC_VALIDO = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const CURP_VALIDA = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
const CATALOGO_VACIO = { clave: '', nombre: '', descripcion: '', salarioMinimo: '', salarioMaximo: '', plazasAutorizadas: '1', motivo: '' };

export function AsistenteEmpleado({
  abierto, empleadoId, puestosIniciales, onCerrar, onGuardado,
}: {
  abierto: boolean;
  empleadoId?: string;
  puestosIniciales: Puesto[];
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState<FormEmpleado>(VACIO);
  const [puestos, setPuestos] = useState<Puesto[]>(puestosIniciales);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [empleados, setEmpleados] = useState<Array<{ id: string; nombreCompleto: string }>>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [creandoCatalogo, setCreandoCatalogo] = useState<'puesto' | 'departamento' | null>(null);
  const [editandoPuestoId, setEditandoPuestoId] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState(CATALOGO_VACIO);
  const [erroresCatalogo, setErroresCatalogo] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!abierto) return;
    const temporizador = window.setTimeout(() => {
      setPaso(0); setMensaje(''); setErrores({}); setPuestos(puestosIniciales);
      Promise.all([
        api.get<Departamento[]>('/departamentos'),
        api.get<Array<{ id: string; nombreCompleto: string }>>('/rrhh/empleados', { query: { estado: 'ACTIVO' } }),
        api.get<Banco[]>('/catalogos/bancos'),
      ]).then(([deps, lista, catalogoBancos]) => {
        setDepartamentos((Array.isArray(deps) ? deps : []).filter((d) => d.activo !== false));
        setEmpleados(Array.isArray(lista) ? lista : []);
        setBancos((Array.isArray(catalogoBancos) ? catalogoBancos : []).filter((b) => b.activo !== false));
      }).catch(() => setMensaje('No fue posible cargar todos los catálogos. Puedes continuar y volver a intentarlo.'));

      if (empleadoId) {
        api.get<Record<string, unknown>>(`/rrhh/empleados/${empleadoId}`).then((e) => {
          const siguiente = { ...VACIO } as Record<string, string | boolean>;
          Object.keys(VACIO).forEach((key) => {
            const valor = e[key];
            if (typeof VACIO[key as keyof FormEmpleado] === 'boolean') siguiente[key] = Boolean(valor);
            else if (key.startsWith('fecha') && valor) siguiente[key] = String(valor).slice(0, 10);
            else siguiente[key] = valor == null ? '' : String(valor);
          });
          setForm(siguiente as FormEmpleado);
        }).catch((e) => setMensaje(e instanceof Error ? e.message : 'No se pudo cargar el expediente.'));
      } else {
        const guardado = window.localStorage.getItem(CLAVE_BORRADOR);
        setForm(guardado ? { ...VACIO, ...JSON.parse(guardado) } : VACIO);
      }
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, [abierto, empleadoId, puestosIniciales]);

  useEffect(() => {
    if (!abierto) return;
    const refrescarEstructura = () => {
      Promise.all([
        api.get<Departamento[]>('/departamentos'),
        api.get<Puesto[]>('/rrhh/puestos'),
      ]).then(([deps, catalogoPuestos]) => {
        setDepartamentos((deps ?? []).filter((d) => d.activo !== false));
        setPuestos(catalogoPuestos ?? []);
      }).catch(() => undefined);
    };
    window.addEventListener('focus', refrescarEstructura);
    return () => window.removeEventListener('focus', refrescarEstructura);
  }, [abierto]);

  useEffect(() => {
    if (abierto && !empleadoId) window.localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(form));
  }, [abierto, empleadoId, form]);

  const cambiar = <K extends keyof FormEmpleado>(key: K, value: FormEmpleado[K]) => {
    setForm((actual) => ({ ...actual, [key]: value }));
    setErrores((actual) => ({ ...actual, [key]: '' }));
  };

  const identidadCompleta = Boolean(form.nombres.trim() && form.apellidoPaterno.trim() && (!form.curp || CURP_VALIDA.test(form.curp)) && (!form.rfc || RFC_VALIDO.test(form.rfc)) && (!form.nss || form.nss.length === 11));
  const laboralCompleto = Boolean(form.fechaIngreso && form.departamentoId && form.puestoId);
  const puesto = useMemo(() => puestos.find((p) => p.id === form.puestoId), [puestos, form.puestoId]);
  const puestoConTabulador = Boolean(puesto && Number(puesto.salarioMinimo) > 0 && Number(puesto.salarioMaximo) >= Number(puesto.salarioMinimo) && Number(puesto.plazasAutorizadas) > 0);
  const salarioEnRango = Boolean(
    puestoConTabulador &&
    Number(form.salarioDiario) >= Number(puesto?.salarioMinimo) &&
    Number(form.salarioDiario) <= Number(puesto?.salarioMaximo),
  );
  const salarioCompleto = Boolean(Number(form.salarioDiario) > 0 && salarioEnRango && (form.tipoSalario === 'FIJO' || (Number(form.salarioDiarioIntegrado) > 0 && form.sbcValidado && form.fechaSbc)));
  const fiscalCompleto = Boolean(form.rfc && form.codigoPostalFiscal.length === 5 && form.regimenFiscal.length === 3);
  const pagoCompleto = !form.clabe || form.clabe.length === 18;

  const pasos: PasoAsistente[] = [
    { id: 'identidad', titulo: 'Identidad y contacto', descripcion: 'Datos personales para expediente', icono: <UserRound />, completo: identidadCompleta },
    { id: 'organizacion', titulo: 'Organización', descripcion: 'Área, puesto, jefe y contrato', icono: <BriefcaseBusiness />, completo: laboralCompleto },
    { id: 'salario', titulo: 'Salario y prestaciones', descripcion: 'Jornada, SBC y prestaciones base', icono: <HeartPulse />, completo: salarioCompleto },
    { id: 'fiscal', titulo: 'Datos fiscales', descripcion: 'Información necesaria para CFDI', icono: <FileCheck2 />, completo: fiscalCompleto },
    { id: 'pago', titulo: 'Pago y revisión', descripcion: 'Cuenta bancaria y alta definitiva', icono: <CreditCard />, completo: pagoCompleto },
  ];

  const puedeContinuar = [identidadCompleta, laboralCompleto, salarioCompleto, fiscalCompleto, pagoCompleto][paso];
  function validarTodo() {
    const e: Record<string, string> = {};
    if (!form.nombres.trim()) e.nombres = 'Escribe los nombres.';
    if (!form.apellidoPaterno.trim()) e.apellidoPaterno = 'Escribe el apellido paterno.';
    if (form.curp && !CURP_VALIDA.test(form.curp)) e.curp = 'La CURP no tiene una estructura válida.';
    if (!form.rfc || !RFC_VALIDO.test(form.rfc)) e.rfc = 'Captura un RFC válido para timbrar.';
    if (form.nss && form.nss.length !== 11) e.nss = 'El NSS debe contener 11 dígitos.';
    if (!form.departamentoId) e.departamentoId = 'Selecciona o crea un departamento.';
    if (!form.puestoId) e.puestoId = 'Selecciona o crea un puesto.';
    if (!form.fechaIngreso) e.fechaIngreso = 'Indica la fecha de ingreso.';
    if (Number(form.salarioDiario) <= 0) e.salarioDiario = 'El salario debe ser mayor que cero.';
    else if (!puestoConTabulador) e.salarioDiario = 'Completa primero el rango salarial y las plazas del puesto.';
    else if (!salarioEnRango) e.salarioDiario = `El salario debe estar entre $${Number(puesto?.salarioMinimo).toFixed(2)} y $${Number(puesto?.salarioMaximo).toFixed(2)} diarios.`;
    if (form.codigoPostalFiscal.length !== 5) e.codigoPostalFiscal = 'Captura cinco dígitos.';
    if (form.regimenFiscal.length !== 3) e.regimenFiscal = 'Captura la clave SAT de tres dígitos.';
    if (form.clabe && form.clabe.length !== 18) e.clabe = 'La CLABE debe tener 18 dígitos.';
    setErrores(e);
    return !Object.keys(e).length;
  }

  async function guardar() {
    if (!validarTodo()) { setMensaje('Hay información obligatoria pendiente. Revisa los campos marcados.'); return; }
    setGuardando(true); setMensaje('');
    const datos = {
      ...form,
      curp: form.curp || undefined,
      nss: form.nss || undefined,
      email: form.email || undefined,
      telefono: form.telefono || undefined,
      salarioDiario: Number(form.salarioDiario),
      salarioDiarioIntegrado: form.salarioDiarioIntegrado ? Number(form.salarioDiarioIntegrado) : undefined,
      horasJornada: Number(form.horasJornada), diasAguinaldo: Number(form.diasAguinaldo),
      primaVacacional: Number(form.primaVacacional),
      jefeDirectoId: form.jefeDirectoId || undefined, fechaNacimiento: form.fechaNacimiento || undefined,
      fechaSbc: form.fechaSbc || undefined, clabe: form.clabe || undefined,
    };
    try {
      const creado = empleadoId
        ? await api.patch<{ numeroEmpleado: string }>(`/rrhh/empleados/${empleadoId}`, datos)
        : await api.post<{ numeroEmpleado: string }>('/rrhh/empleados', datos);
      window.localStorage.removeItem(CLAVE_BORRADOR);
      onGuardado(`Empleado ${creado.numeroEmpleado} ${empleadoId ? 'actualizado' : 'dado de alta'} correctamente.`);
    } catch (e) {
      setMensaje(e instanceof ApiError ? e.mensajeParaPantalla() : e instanceof Error ? e.message : 'No se pudo guardar el empleado.');
    } finally { setGuardando(false); }
  }

  async function crearCatalogo() {
    const errores: Record<string, string> = {};
    if (!catalogo.nombre.trim()) errores.nombre = 'Escribe el nombre.';
    if (catalogo.motivo.trim().length < 10) errores.motivo = 'Explica en al menos 10 caracteres por qué se necesita.';
    if (creandoCatalogo === 'puesto') {
      const minimo = Number(catalogo.salarioMinimo);
      const maximo = Number(catalogo.salarioMaximo);
      const plazas = Number(catalogo.plazasAutorizadas);
      if (!catalogo.clave.trim()) errores.clave = 'Escribe una clave.';
      if (!form.departamentoId) errores.departamentoId = 'Selecciona o crea primero el departamento.';
      if (!(minimo > 0)) errores.salarioMinimo = 'Captura un salario mínimo mayor que cero.';
      if (!(maximo >= minimo)) errores.salarioMaximo = 'El máximo debe ser igual o mayor al mínimo.';
      if (!Number.isInteger(plazas) || plazas < 1) errores.plazasAutorizadas = 'Autoriza al menos una plaza.';
    }
    setErroresCatalogo(errores);
    if (Object.keys(errores).length) return;
    setGuardando(true); setMensaje('');
    try {
      if (creandoCatalogo === 'departamento') {
        await api.post('/rrhh/estructura/solicitudes', {
          tipo: 'AREA', nombre: catalogo.nombre, motivo: catalogo.motivo,
        });
        setMensaje('Solicitud de área enviada. Debe aprobarla Gerencia y después Finanzas. Tu alta de empleado quedó guardada como borrador.');
      } else {
        const datos = { clave: catalogo.clave, nombre: catalogo.nombre, descripcion: catalogo.descripcion || undefined, departamentoId: form.departamentoId, salarioMinimo: Number(catalogo.salarioMinimo), salarioMaximo: Number(catalogo.salarioMaximo), plazasAutorizadas: Number(catalogo.plazasAutorizadas) };
        if (editandoPuestoId) {
          const p = await api.patch<Puesto>(`/rrhh/puestos/${editandoPuestoId}`, datos);
          setPuestos((actual) => actual.map((item) => item.id === p.id ? p : item));
          cambiar('puestoId', p.id);
        } else {
          await api.post('/rrhh/estructura/solicitudes', { tipo: 'PUESTO', ...datos, motivo: catalogo.motivo });
          setMensaje('Solicitud de puesto enviada. Debe aprobarla Gerencia y después Finanzas. Tu alta de empleado quedó guardada como borrador.');
        }
      }
      setCreandoCatalogo(null); setEditandoPuestoId(null); setCatalogo(CATALOGO_VACIO); setErroresCatalogo({});
    } catch (e) { setMensaje(e instanceof ApiError ? e.mensajeParaPantalla() : e instanceof Error ? e.message : 'No se pudo crear el catálogo.'); }
    finally { setGuardando(false); }
  }

  function abrirCatalogo(tipo: 'puesto' | 'departamento', puestoActual?: Puesto) {
    setCreandoCatalogo(tipo);
    setErroresCatalogo({});
    if (tipo === 'puesto' && puestoActual) {
      setEditandoPuestoId(puestoActual.id);
      setCatalogo({
        clave: puestoActual.clave,
        nombre: puestoActual.nombre,
        descripcion: '',
        salarioMinimo: String(puestoActual.salarioMinimo ?? ''),
        salarioMaximo: String(puestoActual.salarioMaximo ?? ''),
        plazasAutorizadas: String(puestoActual.plazasAutorizadas ?? 1),
        motivo: '',
      });
    } else {
      setEditandoPuestoId(null);
      setCatalogo(CATALOGO_VACIO);
    }
  }

  return (
    <AsistentePasos abierto={abierto} titulo={empleadoId ? 'Actualizar expediente' : 'Alta integral de empleado'} descripcion="El asistente valida que la persona quede preparada para nómina, CFDI y pago." pasos={pasos} pasoActual={paso} procesando={guardando} puedeContinuar={puedeContinuar} textoFinal={empleadoId ? 'Guardar cambios' : 'Dar de alta'} onCambiarPaso={setPaso} onCerrar={onCerrar} onFinalizar={() => void guardar()}>
      {mensaje && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{mensaje}</div>}
      {paso === 0 && <Seccion titulo="Identidad oficial" descripcion="Estos datos identifican al trabajador ante el SAT y el IMSS.">
        <div className="grid gap-4 md:grid-cols-3">
          <Campo etiqueta="Nombres" requerido error={errores.nombres}><Entrada value={form.nombres} onChange={(e) => cambiar('nombres', e.target.value)} error={!!errores.nombres} /></Campo>
          <Campo etiqueta="Apellido paterno" requerido error={errores.apellidoPaterno}><Entrada value={form.apellidoPaterno} onChange={(e) => cambiar('apellidoPaterno', e.target.value)} error={!!errores.apellidoPaterno} /></Campo>
          <Campo etiqueta="Apellido materno"><Entrada value={form.apellidoMaterno} onChange={(e) => cambiar('apellidoMaterno', e.target.value)} /></Campo>
          <Campo etiqueta="CURP" error={errores.curp}><Entrada maxLength={18} value={form.curp} onChange={(e) => cambiar('curp', e.target.value.replace(/\s/g, '').toUpperCase())} error={!!errores.curp} /></Campo>
          <Campo etiqueta="RFC" requerido error={errores.rfc}><Entrada maxLength={13} value={form.rfc} onChange={(e) => cambiar('rfc', e.target.value.replace(/\s/g, '').toUpperCase())} error={!!errores.rfc} /></Campo>
          <Campo etiqueta="NSS" error={errores.nss}><Entrada maxLength={11} value={form.nss} onChange={(e) => cambiar('nss', soloDigitos(e.target.value))} error={!!errores.nss} /></Campo>
          <Campo etiqueta="Fecha de nacimiento"><Entrada type="date" value={form.fechaNacimiento} onChange={(e) => cambiar('fechaNacimiento', e.target.value)} /></Campo>
          <Campo etiqueta="Correo"><Entrada type="email" value={form.email} onChange={(e) => cambiar('email', e.target.value)} /></Campo>
          <Campo etiqueta="Teléfono"><Entrada value={form.telefono} onChange={(e) => cambiar('telefono', e.target.value)} /></Campo>
        </div>
      </Seccion>}

      {paso === 1 && <div className="space-y-5">
        {departamentos.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>No hay áreas aprobadas todavía.</b><p className="mt-1 text-xs">Solicita aquí la primera. El borrador del empleado se conservará mientras Gerencia y Finanzas la aprueban.</p><button type="button" className="btn btn-primario mt-3" onClick={() => abrirCatalogo('departamento')}><Plus className="h-4 w-4" />Solicitar área</button></div>}
        {departamentos.length > 0 && puestos.length === 0 && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><b>Falta definir puestos y salarios.</b><p className="mt-1 text-xs">Selecciona el departamento y crea el puesto con su tabulador y plazas autorizadas.</p></div>}
        <Seccion titulo="Ubicación organizacional" descripcion="La nómina y la póliza pueden distribuirse por departamento y puesto.">
          <div className="grid gap-4 md:grid-cols-2">
            <Campo etiqueta="Departamento" requerido error={errores.departamentoId}><div className="flex gap-2"><Seleccion value={form.departamentoId} onChange={(e) => { cambiar('departamentoId', e.target.value); cambiar('puestoId', ''); }} error={!!errores.departamentoId}><option value="">Seleccionar…</option>{departamentos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</Seleccion><button type="button" className="btn btn-neutro btn-icono" onClick={() => abrirCatalogo('departamento')} title="Crear departamento"><Plus className="h-4 w-4" /></button></div></Campo>
            <Campo etiqueta="Puesto y tabulador" requerido error={errores.puestoId}><div className="flex gap-2"><Seleccion value={form.puestoId} onChange={(e) => cambiar('puestoId', e.target.value)} error={!!errores.puestoId}><option value="">Seleccionar…</option>{puestos.filter((p) => !form.departamentoId || !p.departamentoId || p.departamentoId === form.departamentoId).map((p) => <option key={p.id} value={p.id}>{p.clave} · {p.nombre}</option>)}</Seleccion><button type="button" className="btn btn-neutro btn-icono" disabled={!form.departamentoId} onClick={() => abrirCatalogo('puesto')} title="Crear puesto y salario"><Plus className="h-4 w-4" /></button></div></Campo>
            <Campo etiqueta="Jefe directo"><Seleccion value={form.jefeDirectoId} onChange={(e) => cambiar('jefeDirectoId', e.target.value)}><option value="">Sin asignar</option>{empleados.filter((e) => e.id !== empleadoId).map((e) => <option key={e.id} value={e.id}>{e.nombreCompleto}</option>)}</Seleccion></Campo>
            <Campo etiqueta="Fecha de ingreso" requerido error={errores.fechaIngreso}><Entrada type="date" value={form.fechaIngreso} onChange={(e) => cambiar('fechaIngreso', e.target.value)} error={!!errores.fechaIngreso} /></Campo>
          </div>
        </Seccion>
        <Seccion titulo="Relación laboral"><div className="grid gap-4 md:grid-cols-2">
          <Campo etiqueta="Tipo de contrato"><Seleccion value={form.tipoContrato} onChange={(e) => cambiar('tipoContrato', e.target.value)}><option value="INDETERMINADO">Tiempo indeterminado</option><option value="DETERMINADO">Tiempo determinado</option><option value="POR_OBRA">Obra determinada</option><option value="CAPACITACION">Capacitación inicial</option><option value="HONORARIOS">Honorarios</option></Seleccion></Campo>
          <Campo etiqueta="Periodicidad"><Seleccion value={form.regimenPago} onChange={(e) => cambiar('regimenPago', e.target.value)}><option value="SEMANAL">Semanal</option><option value="CATORCENAL">Catorcenal</option><option value="QUINCENAL">Quincenal</option><option value="MENSUAL">Mensual</option></Seleccion></Campo>
        </div></Seccion>
        {puesto && !puestoConTabulador && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><b>El puesto seleccionado no tiene un tabulador completo.</b><p className="mt-1 text-xs">Define salario mínimo, máximo y plazas autorizadas antes de capturar el sueldo.</p><button type="button" className="btn btn-primario mt-3" onClick={() => abrirCatalogo('puesto', puesto)}>Completar puesto y salarios</button></div>}
      </div>}

      {paso === 2 && <div className="space-y-5">
        <Seccion titulo="Esquema de salario"><div className="grid gap-4 md:grid-cols-3">
          <Campo etiqueta="Tipo de salario"><Seleccion value={form.tipoSalario} onChange={(e) => cambiar('tipoSalario', e.target.value)}><option value="FIJO">Fijo</option><option value="VARIABLE">Variable</option><option value="MIXTO">Mixto</option></Seleccion></Campo>
          <Campo etiqueta="Salario diario" requerido error={errores.salarioDiario}><Entrada type="number" min="0.01" step="0.01" value={form.salarioDiario} onChange={(e) => cambiar('salarioDiario', e.target.value)} error={!!errores.salarioDiario} /></Campo>
          <Campo etiqueta="Zona de salario mínimo"><Seleccion value={form.zonaSalarioMinimo} onChange={(e) => cambiar('zonaSalarioMinimo', e.target.value)}><option value="GENERAL">General</option><option value="FRONTERA_NORTE">Frontera norte</option></Seleccion></Campo>
          <Campo etiqueta="Jornada"><Seleccion value={form.jornada} onChange={(e) => cambiar('jornada', e.target.value)}><option value="DIURNA">Diurna</option><option value="NOCTURNA">Nocturna</option><option value="MIXTA">Mixta</option></Seleccion></Campo>
          <Campo etiqueta="Horas por jornada"><Entrada type="number" min="1" max="24" value={form.horasJornada} onChange={(e) => cambiar('horasJornada', e.target.value)} /></Campo>
          <Campo etiqueta="SBC / SDI" ayuda={form.tipoSalario === 'FIJO' ? 'Si lo dejas vacío se calcula con las prestaciones.' : 'Obligatorio para salario variable o mixto.'}><Entrada type="number" step="0.01" value={form.salarioDiarioIntegrado} onChange={(e) => cambiar('salarioDiarioIntegrado', e.target.value)} /></Campo>
        </div></Seccion>
        <Seccion titulo="Prestaciones base"><div className="grid gap-4 md:grid-cols-3">
          <Campo etiqueta="Días de aguinaldo"><Entrada type="number" min="15" value={form.diasAguinaldo} onChange={(e) => cambiar('diasAguinaldo', e.target.value)} /></Campo>
          <Campo etiqueta="Prima vacacional (%)"><Entrada type="number" min="25" step="0.01" value={form.primaVacacional} onChange={(e) => cambiar('primaVacacional', e.target.value)} /></Campo>
          <Campo etiqueta="Fecha vigente del SBC"><Entrada type="date" value={form.fechaSbc} onChange={(e) => cambiar('fechaSbc', e.target.value)} /></Campo>
          <label className="md:col-span-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600"><input type="checkbox" checked={form.sbcValidado} onChange={(e) => cambiar('sbcValidado', e.target.checked)} /><span><b className="block text-slate-900">SBC revisado por Recursos Humanos</b>Marca esta opción sólo después de validar el salario base de cotización.</span></label>
        </div></Seccion>
        {puesto && puestoConTabulador && <div className={`rounded-xl border p-3 text-xs ${form.salarioDiario && !salarioEnRango ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>Rango autorizado del puesto: ${Number(puesto.salarioMinimo).toFixed(2)} a ${Number(puesto.salarioMaximo).toFixed(2)} diarios.{form.salarioDiario && !salarioEnRango ? ' El salario capturado está fuera del tabulador.' : ''}</div>}
        {puesto && !puestoConTabulador && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No puedes completar este paso hasta configurar el tabulador. <button type="button" className="font-bold underline" onClick={() => abrirCatalogo('puesto', puesto)}>Configurar ahora</button></div>}
      </div>}

      {paso === 3 && <Seccion titulo="Datos del receptor para CFDI de nómina" descripcion="Sin RFC, régimen y código postal no debe enviarse el recibo a timbrado."><div className="grid gap-4 md:grid-cols-3">
        <Campo etiqueta="RFC" requerido error={errores.rfc}><Entrada maxLength={13} value={form.rfc} onChange={(e) => cambiar('rfc', e.target.value.replace(/\s/g, '').toUpperCase())} error={!!errores.rfc} /></Campo>
        <Campo etiqueta="Régimen fiscal SAT" requerido error={errores.regimenFiscal}><Entrada maxLength={3} value={form.regimenFiscal} onChange={(e) => cambiar('regimenFiscal', soloDigitos(e.target.value))} error={!!errores.regimenFiscal} /></Campo>
        <Campo etiqueta="Código postal fiscal" requerido error={errores.codigoPostalFiscal}><Entrada maxLength={5} value={form.codigoPostalFiscal} onChange={(e) => cambiar('codigoPostalFiscal', soloDigitos(e.target.value))} error={!!errores.codigoPostalFiscal} /></Campo>
      </div></Seccion>}

      {paso === 4 && <div className="space-y-5">
        <Seccion titulo="Cuenta de pago" descripcion="La cuenta podrá pasar después por el flujo formal de validación bancaria."><div className="grid gap-4 md:grid-cols-2">
          <Campo etiqueta="Banco"><BuscadorSeleccion valor={bancos.find((b) => b.nombre === form.banco)?.id ?? ''} opciones={bancos.map((b) => ({ valor: b.id, etiqueta: `${b.clave ?? '—'} · ${b.nombre}`, busqueda: b.clave }))} onChange={(id) => cambiar('banco', bancos.find((b) => b.id === id)?.nombre ?? '')} placeholder="Buscar banco oficial…" /></Campo>
          <Campo etiqueta="CLABE" error={errores.clabe}><Entrada maxLength={18} value={form.clabe} onChange={(e) => cambiar('clabe', soloDigitos(e.target.value))} error={!!errores.clabe} /></Campo>
          <div className="md:col-span-2"><Campo etiqueta="Notas internas"><textarea className="campo min-h-24 py-2" value={form.notas} onChange={(e) => cambiar('notas', e.target.value)} /></Campo></div>
        </div></Seccion>
        <Seccion titulo="Revisión de preparación"><div className="grid gap-3 md:grid-cols-2">
          <ResumenItem ok={identidadCompleta} icono={<UserRound />} titulo="Identidad" detalle={`${form.nombres} ${form.apellidoPaterno}`.trim() || 'Pendiente'} />
          <ResumenItem ok={laboralCompleto} icono={<Building2 />} titulo="Organización" detalle={puesto?.nombre ?? 'Puesto pendiente'} />
          <ResumenItem ok={salarioCompleto} icono={<Landmark />} titulo="Nómina" detalle={form.salarioDiario ? `$${Number(form.salarioDiario).toFixed(2)} diarios` : 'Salario pendiente'} />
          <ResumenItem ok={fiscalCompleto} icono={<BadgeCheck />} titulo="CFDI" detalle={fiscalCompleto ? 'Datos fiscales completos' : 'Información fiscal pendiente'} />
        </div></Seccion>
      </div>}

      {creandoCatalogo && <div className="fixed inset-0 z-[380] flex items-center justify-center bg-slate-950/45 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><h3 className="font-bold text-slate-950">{editandoPuestoId ? 'Completar puesto y salarios' : `Solicitar ${creandoCatalogo}`}</h3><p className="mb-4 text-xs text-slate-500">Las altas nuevas requieren aprobación de Gerencia y Finanzas. El borrador del empleado no se perderá.</p><div className="grid gap-3 md:grid-cols-2">{erroresCatalogo.departamentoId && <p className="md:col-span-2 text-xs text-red-600">{erroresCatalogo.departamentoId}</p>}{creandoCatalogo === 'puesto' && <><Campo etiqueta="Clave" requerido error={erroresCatalogo.clave}><Entrada maxLength={20} value={catalogo.clave} onChange={(e) => setCatalogo({ ...catalogo, clave: e.target.value.toUpperCase() })} error={!!erroresCatalogo.clave} /></Campo><Campo etiqueta="Plazas autorizadas" requerido error={erroresCatalogo.plazasAutorizadas}><Entrada type="number" min="1" step="1" value={catalogo.plazasAutorizadas} onChange={(e) => setCatalogo({ ...catalogo, plazasAutorizadas: e.target.value })} error={!!erroresCatalogo.plazasAutorizadas} /></Campo></>}<div className="md:col-span-2"><Campo etiqueta="Nombre" requerido error={erroresCatalogo.nombre}><Entrada maxLength={120} value={catalogo.nombre} onChange={(e) => setCatalogo({ ...catalogo, nombre: e.target.value })} error={!!erroresCatalogo.nombre} /></Campo></div>{creandoCatalogo === 'puesto' && <><Campo etiqueta="Salario diario mínimo" requerido error={erroresCatalogo.salarioMinimo}><Entrada type="number" min="0.01" step="0.01" value={catalogo.salarioMinimo} onChange={(e) => setCatalogo({ ...catalogo, salarioMinimo: e.target.value })} error={!!erroresCatalogo.salarioMinimo} /></Campo><Campo etiqueta="Salario diario máximo" requerido error={erroresCatalogo.salarioMaximo}><Entrada type="number" min="0.01" step="0.01" value={catalogo.salarioMaximo} onChange={(e) => setCatalogo({ ...catalogo, salarioMaximo: e.target.value })} error={!!erroresCatalogo.salarioMaximo} /></Campo><div className="md:col-span-2"><Campo etiqueta="Descripción"><textarea className="campo min-h-20 py-2" maxLength={400} value={catalogo.descripcion} onChange={(e) => setCatalogo({ ...catalogo, descripcion:e.target.value })} /></Campo></div></>} {!editandoPuestoId && <div className="md:col-span-2"><Campo etiqueta="Justificación para aprobación" requerido error={erroresCatalogo.motivo}><textarea className="campo min-h-20 py-2" maxLength={500} value={catalogo.motivo} onChange={(e) => setCatalogo({ ...catalogo, motivo:e.target.value })} /></Campo></div>}</div><div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Flujo: solicitud → Gerencia → Finanzas → catálogo disponible. <a className="font-bold text-indigo-700 underline" href="/dashboard/rrhh/aprobaciones-estructura" target="_blank">Abrir bandeja de aprobaciones</a></div><div className="mt-5 flex justify-end gap-2"><button className="btn btn-neutro" onClick={() => { setCreandoCatalogo(null); setEditandoPuestoId(null); }}>Cancelar</button><button className="btn btn-primario" onClick={() => void crearCatalogo()} disabled={guardando}>{guardando ? 'Guardando…' : editandoPuestoId ? 'Guardar tabulador' : 'Enviar a aprobación'}</button></div></div></div>}
    </AsistentePasos>
  );
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4"><h4 className="text-sm font-bold text-slate-950">{titulo}</h4>{descripcion && <p className="mt-1 text-xs text-slate-500">{descripcion}</p>}</div>{children}</section>;
}

function ResumenItem({ ok, icono, titulo, detalle }: { ok: boolean; icono: React.ReactNode; titulo: string; detalle: string }) {
  return <div className={`flex items-center gap-3 rounded-xl border p-3 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><span className={ok ? 'text-emerald-600' : 'text-amber-600'}>{icono}</span><span><b className="block text-xs text-slate-900">{titulo}</b><span className="text-[11px] text-slate-500">{detalle}</span></span><span className={`ml-auto text-[10px] font-bold uppercase ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{ok ? 'Listo' : 'Pendiente'}</span></div>;
}
