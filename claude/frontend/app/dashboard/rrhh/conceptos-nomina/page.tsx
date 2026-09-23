'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Calculator, Plus, Search, Sparkles, UsersRound } from 'lucide-react';
import { api, ApiError, conPermiso } from '@/lib/api';
import { usePermiso } from '@/hooks/use-permisos';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';
import { Boton, Campo, Cargando, Distintivo, EncabezadoPantalla, Entrada, Panel, Seleccion, SinDatos, useAvisos } from '@/components/ui';

type Concepto = { id: string; clave: string; nombre: string; naturaleza: 'PERCEPCION'|'DEDUCCION'|'OTRO_PAGO'; claveSat?: string; gravaIsr: boolean; integraSbc: boolean; esFijo: boolean; activo: boolean; cuentaContableId?: string };
type Cuenta = { id: string; numeroCuenta?: string; nombre?: string };
const claveDe = (c: Cuenta) => c.numeroCuenta ?? '';
type Empleado = { id: string; numeroEmpleado: string; nombreCompleto?: string; nombres?: string; apellidoPaterno?: string };
type Asignacion = { id: string; empleadoId: string; conceptoId: string; valor: number; tipoValor: string; vigenciaDesde: string; vigenciaHasta?: string; activo: boolean; observaciones?: string };
const hoy = () => new Date().toISOString().slice(0, 10);
const lista = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : v && typeof v === 'object' && Array.isArray((v as {data?:unknown}).data) ? (v as {data:T[]}).data : [];

export default function ConceptosNominaPage() {
  const { avisar } = useAvisos();
  const [conceptos, setConceptos] = useState<Concepto[]>([]); const [empleados, setEmpleados] = useState<Empleado[]>([]); const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const { tienePermiso } = usePermiso();
  const puedeAsignarCuenta = tienePermiso('PATCH','/rrhh/conceptos/:id/cuenta-contable');
  const [cargando, setCargando] = useState(true); const [guardando, setGuardando] = useState(false); const [busqueda, setBusqueda] = useState('');
  const [concepto, setConcepto] = useState({ clave:'', nombre:'', naturaleza:'PERCEPCION', claveSat:'', gravaIsr:true, integraSbc:true, esFijo:false, activo:true });
  const [asignacion, setAsignacion] = useState({ empleadoId:'', conceptoId:'', valor:'', tipoValor:'IMPORTE', vigenciaDesde:hoy(), vigenciaHasta:'', observaciones:'', activo:true });
  const nombreEmpleado = (id:string) => { const e=empleados.find((x)=>x.id===id); return e?.nombreCompleto || `${e?.numeroEmpleado??''} · ${e?.nombres??''} ${e?.apellidoPaterno??''}`.trim() || id; };
  /*
   * Cuatro cargas independientes, porque cada una es de un area distinta.
   *
   * Contabilidad entra aqui solo a poner la cuenta contable de cada concepto,
   * y no tiene el padron ni las asignaciones por trabajador; Recursos humanos
   * tiene todo eso y NO el catalogo de cuentas. En un `Promise.all` normal,
   * cualquiera de los dos se quedaba con la pantalla en blanco.
   */
  async function cargar(){
    setCargando(true);
    try {
      const [c,e,a,ct]=await Promise.all([
        api.get<unknown>('/rrhh/conceptos'),
        conPermiso(api.get<unknown>('/rrhh/padron',{query:{estado:'ACTIVO'}})),
        conPermiso(api.get<unknown>('/rrhh/nomina-avanzada/conceptos-empleado')),
        conPermiso(api.get<unknown>('/finanzas/cuentas-contables',{query:{soloAfectables:true}})),
      ]);
      setConceptos(lista<Concepto>(c));
      setEmpleados(lista<Empleado>(e.valor));
      setAsignaciones(lista<Asignacion>(a.valor));
      setCuentas(lista<Cuenta>(ct.valor));
    } catch(e){ avisar(e instanceof Error?e.message:'No se pudo cargar el catálogo.','error'); }
    finally{setCargando(false);}
  }

  /*
   * La cuenta contable del concepto: decision de Contabilidad, no de RRHH.
   *
   * Hasta hoy no habia forma de ponerla —el campo existia en la base y ninguna
   * pantalla lo pedia—, y sin ella la poliza de devengo es imposible para
   * cualquier empresa y cualquier mes.
   */
  async function asignarCuenta(conceptoId: string, cuentaContableId: string){
    try {
      await api.patch(`/rrhh/conceptos/${conceptoId}/cuenta-contable`, { cuentaContableId: cuentaContableId || undefined });
      setConceptos((actual)=>actual.map((c)=>c.id===conceptoId?{...c,cuentaContableId:cuentaContableId||undefined}:c));
      avisar('Cuenta contable asignada.','exito');
    } catch(e){ avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo asignar la cuenta.','error'); }
  }
  useEffect(()=>{void cargar();},[]);
  const visibles=useMemo(()=>{const q=busqueda.toLowerCase();return conceptos.filter((c)=>`${c.clave} ${c.nombre} ${c.claveSat??''}`.toLowerCase().includes(q));},[conceptos,busqueda]);
  async function sembrar(){setGuardando(true);try{await api.post('/rrhh/conceptos/sembrar',{});await cargar();avisar('Conceptos mínimos verificados sin duplicar registros.','exito');}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo sembrar.','error');}finally{setGuardando(false);}}
  async function crear(){if(!concepto.clave.trim()||!concepto.nombre.trim())return avisar('Clave y nombre son obligatorios.','alerta');setGuardando(true);try{await api.post('/rrhh/conceptos',{...concepto,clave:concepto.clave.trim().toUpperCase(),nombre:concepto.nombre.trim(),claveSat:concepto.claveSat.trim()||undefined});setConcepto({clave:'',nombre:'',naturaleza:'PERCEPCION',claveSat:'',gravaIsr:true,integraSbc:true,esFijo:false,activo:true});await cargar();avisar('Concepto creado.','exito');}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo crear.','error');}finally{setGuardando(false);}}
  async function asignar(){const valor=Number(asignacion.valor);if(!asignacion.empleadoId||!asignacion.conceptoId||!Number.isFinite(valor)||valor<0)return avisar('Completa empleado, concepto y un valor válido.','alerta');if(asignacion.vigenciaHasta&&asignacion.vigenciaHasta<asignacion.vigenciaDesde)return avisar('La vigencia final no puede ser anterior a la inicial.','alerta');setGuardando(true);try{await api.post('/rrhh/nomina-avanzada/conceptos-empleado',{...asignacion,valor,vigenciaHasta:asignacion.vigenciaHasta||undefined,observaciones:asignacion.observaciones.trim()||undefined});setAsignacion((a)=>({...a,conceptoId:'',valor:'',vigenciaHasta:'',observaciones:''}));await cargar();avisar('Concepto recurrente asignado con vigencia.','exito');}catch(e){avisar(e instanceof ApiError?e.mensajeParaPantalla():'No se pudo asignar.','error');}finally{setGuardando(false);}}
  if(cargando)return <Cargando/>;
  return <div className="mx-auto max-w-[1450px] space-y-5 p-6">
    <EncabezadoPantalla titulo="Conceptos de nómina" descripcion="Catálogo fiscal, integración al SBC y asignaciones recurrentes por trabajador." acciones={<Boton onClick={()=>void sembrar()} cargando={guardando} icono={<Sparkles className="h-4 w-4"/>}>Verificar conceptos mínimos</Boton>}/>
    {(() => {
      /*
       * Lo que impide contabilizar la nómina, dicho aquí y no al final del mes.
       * La cuenta se congela en el recibo al calcular: si falta, el periodo se
       * puede llegar a pagar y ya no habrá forma de generar la póliza.
       */
      const sinCuenta = conceptos.filter((c)=>c.activo && !c.cuentaContableId);
      if (!sinCuenta.length) return null;
      return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <b>{sinCuenta.length} conceptos sin cuenta contable.</b>
        <p className="mt-1">La nómina se puede calcular y pagar, pero <b>no se podrá generar la póliza</b>: la cuenta se copia al recibo en el momento del cálculo, y un periodo ya pagado no se puede recalcular. {puedeAsignarCuenta ? 'Asígnalas en la columna «Cuenta contable» del catálogo.' : 'Las asigna Finanzas o Contabilidad.'}</p>
      </div>;
    })()}

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel titulo="Crear concepto"><div className="grid gap-4 md:grid-cols-2"><Campo etiqueta="Clave" requerido><Entrada maxLength={20} value={concepto.clave} onChange={(e)=>setConcepto({...concepto,clave:e.target.value.toUpperCase()})}/></Campo><Campo etiqueta="Nombre" requerido><Entrada maxLength={120} value={concepto.nombre} onChange={(e)=>setConcepto({...concepto,nombre:e.target.value})}/></Campo><Campo etiqueta="Naturaleza"><Seleccion value={concepto.naturaleza} onChange={(e)=>setConcepto({...concepto,naturaleza:e.target.value})}><option value="PERCEPCION">Percepción</option><option value="DEDUCCION">Deducción</option><option value="OTRO_PAGO">Otro pago</option></Seleccion></Campo><Campo etiqueta="Clave SAT" ayuda="Debe corresponder al catálogo de nómina del SAT."><Entrada maxLength={10} value={concepto.claveSat} onChange={(e)=>setConcepto({...concepto,claveSat:e.target.value})}/></Campo><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm"><input type="checkbox" checked={concepto.gravaIsr} onChange={(e)=>setConcepto({...concepto,gravaIsr:e.target.checked})}/>Grava ISR</label><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm"><input type="checkbox" checked={concepto.integraSbc} onChange={(e)=>setConcepto({...concepto,integraSbc:e.target.checked})}/>Integra SBC</label><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm"><input type="checkbox" checked={concepto.esFijo} onChange={(e)=>setConcepto({...concepto,esFijo:e.target.checked})}/>Concepto fijo</label><Boton variante="primario" onClick={()=>void crear()} cargando={guardando} icono={<Plus className="h-4 w-4"/>}>Crear concepto</Boton></div></Panel>
      <Panel titulo="Asignar a empleado"><div className="grid gap-4 md:grid-cols-2"><div className="md:col-span-2"><Campo etiqueta="Empleado" requerido><BuscadorSeleccion valor={asignacion.empleadoId} onChange={(empleadoId)=>setAsignacion({...asignacion,empleadoId})} opciones={empleados.map((e)=>({valor:e.id,etiqueta:nombreEmpleado(e.id),busqueda:e.numeroEmpleado}))} placeholder="Buscar empleado…"/></Campo></div><Campo etiqueta="Concepto" requerido><BuscadorSeleccion valor={asignacion.conceptoId} onChange={(conceptoId)=>setAsignacion({...asignacion,conceptoId})} opciones={conceptos.filter((c)=>c.activo).map((c)=>({valor:c.id,etiqueta:`${c.clave} · ${c.nombre}`,detalle:c.naturaleza}))} placeholder="Buscar concepto…"/></Campo><Campo etiqueta="Tipo de valor"><Seleccion value={asignacion.tipoValor} onChange={(e)=>setAsignacion({...asignacion,tipoValor:e.target.value})}><option value="IMPORTE">Importe</option><option value="PORCENTAJE">Porcentaje</option><option value="DIAS">Días</option><option value="HORAS">Horas</option></Seleccion></Campo><Campo etiqueta="Valor" requerido><Entrada type="number" min="0" step="0.01" value={asignacion.valor} onChange={(e)=>setAsignacion({...asignacion,valor:e.target.value})}/></Campo><Campo etiqueta="Vigencia desde" requerido><Entrada type="date" value={asignacion.vigenciaDesde} onChange={(e)=>setAsignacion({...asignacion,vigenciaDesde:e.target.value})}/></Campo><Campo etiqueta="Vigencia hasta" ayuda="Vacío significa sin fecha final."><Entrada type="date" min={asignacion.vigenciaDesde} value={asignacion.vigenciaHasta} onChange={(e)=>setAsignacion({...asignacion,vigenciaHasta:e.target.value})}/></Campo><Campo etiqueta="Observaciones"><Entrada maxLength={300} value={asignacion.observaciones} onChange={(e)=>setAsignacion({...asignacion,observaciones:e.target.value})}/></Campo><div className="md:col-span-2"><Boton variante="primario" className="w-full" cargando={guardando} onClick={()=>void asignar()} icono={<UsersRound className="h-4 w-4"/>}>Asignar concepto recurrente</Boton></div></div></Panel>
    </div>
    <div className="grid gap-5 xl:grid-cols-2"><Panel sinRelleno titulo="Catálogo" accion={<div className="flex items-center gap-2 px-2"><Search className="h-4 w-4 text-slate-400"/><input className="campo w-56" placeholder="Buscar concepto…" value={busqueda} onChange={(e)=>setBusqueda(e.target.value)}/></div>}>{!visibles.length?<SinDatos titulo="No hay conceptos"/>:<div className="overflow-x-auto"><table className="tabla"><thead><tr><th>Clave</th><th>Concepto</th><th>Naturaleza</th><th>Tratamiento</th><th>Cuenta contable</th></tr></thead><tbody>{visibles.map((c)=><tr key={c.id}><td className="font-mono font-semibold">{c.clave}</td><td>{c.nombre}<div className="text-xs text-slate-400">SAT {c.claveSat||'sin asignar'}</div></td><td><Distintivo tono={c.naturaleza==='PERCEPCION'?'exito':c.naturaleza==='DEDUCCION'?'peligro':'info'}>{c.naturaleza.replaceAll('_',' ')}</Distintivo></td><td className="text-xs">{[c.gravaIsr&&'ISR',c.integraSbc&&'SBC',c.esFijo&&'Fijo'].filter(Boolean).join(' · ')||'Informativo'}</td>
      <td className="min-w-[260px]">{puedeAsignarCuenta
        ? <BuscadorSeleccion valor={c.cuentaContableId??''} opciones={cuentas.map((x)=>({valor:x.id,etiqueta:`${claveDe(x)} · ${x.nombre??x.id}`,busqueda:claveDe(x)}))} onChange={(id)=>void asignarCuenta(c.id,id)} placeholder="Sin cuenta — asignar…"/>
        : c.cuentaContableId
          ? <span className="text-xs text-slate-600">{(()=>{const x=cuentas.find((y)=>y.id===c.cuentaContableId);return x?`${claveDe(x)} · ${x.nombre??''}`:'Asignada';})()}</span>
          : <span className="text-xs text-amber-700">Sin cuenta · la asigna Contabilidad</span>}</td></tr>)}</tbody></table></div>}</Panel><Panel sinRelleno titulo="Asignaciones vigentes">{!asignaciones.length?<SinDatos titulo="No hay asignaciones"/>:<div className="overflow-x-auto"><table className="tabla"><thead><tr><th>Empleado</th><th>Concepto</th><th>Valor</th><th>Vigencia</th></tr></thead><tbody>{asignaciones.map((a)=><tr key={a.id}><td>{nombreEmpleado(a.empleadoId)}</td><td>{conceptos.find((c)=>c.id===a.conceptoId)?.nombre??a.conceptoId}</td><td className="font-semibold">{Number(a.valor)} {a.tipoValor}</td><td>{String(a.vigenciaDesde).slice(0,10)}{a.vigenciaHasta?` → ${String(a.vigenciaHasta).slice(0,10)}`:' → abierta'}</td></tr>)}</tbody></table></div>}</Panel></div>
  </div>;
}
