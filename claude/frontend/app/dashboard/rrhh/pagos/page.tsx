'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError, conPermiso } from '@/lib/api';
import { dinero } from '@/lib/format';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';

type Periodo = { id:string; numero:number; ejercicio:number; totalNeto:number; estado:string };
/* El catalogo devuelve `numeroCuenta`; `codigo` no existe en la respuesta. */
type Cuenta = { id:string; numeroCuenta?:string; codigo?:string; nombre?:string };
const claveDe = (c: Cuenta) => c.numeroCuenta ?? c.codigo ?? '';
type Aplicacion = { metodo:string; monto:number; referencia:string; cuentaFinancieraId:string; moneda:string; tipoCambio:number };
type Pago = { estado:string; totalPeriodo:number; totalAplicado:number; saldo:number; polizaPagoId?:string; aplicaciones?:Aplicacion[] };
type Banco = { id:string; clave?:string; nombre:string; activo?:boolean };
type Dispersion = { id:string; estado:string; total:number; registros:number; banco:string; hashArchivo?:string; referenciaBanco?:string };
type DetalleDispersion = { id:string; beneficiario:string; monto:number; estado:string; referencia?:string };
type RespuestaDispersion = { dispersion?:Dispersion|null; detalles?:DetalleDispersion[]|null };

const nueva = (): Aplicacion => ({ metodo:'TRANSFERENCIA', monto:0, referencia:'', cuentaFinancieraId:'', moneda:'MXN', tipoCambio:1 });
function lista<T>(x: unknown): T[] { if (Array.isArray(x)) return x as T[]; if (x && typeof x === 'object' && Array.isArray((x as {data?:unknown}).data)) return (x as {data:T[]}).data; return []; }

export default function PagosNominaPage() {
  const search = useSearchParams();
  const [periodos,setPeriodos] = useState<Periodo[]>([]);
  const [cuentas,setCuentas] = useState<Cuenta[]>([]);
  const [periodoId,setPeriodoId] = useState(search.get('periodoId') ?? '');
  const [aplicaciones,setAplicaciones] = useState<Aplicacion[]>([nueva()]);
  const [pago,setPago] = useState<Pago|null>(null);
  const [bancos,setBancos] = useState<Banco[]>([]);
  const [dispersion,setDispersion] = useState<RespuestaDispersion|null>(null);
  const [banco,setBanco] = useState('');
  const [referencia,setReferencia] = useState('');
  const [hashRespuesta,setHashRespuesta] = useState('');
  const [procesando,setProcesando] = useState(false);
  const [mensaje,setMensaje] = useState<{texto:string;ok:boolean}|null>(null);
  const [guardando,setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Periodo[]>('/rrhh/nomina/periodos'),
      // Tesoreria opera esta pantalla y el catalogo de cuentas es de Finanzas:
      // su 403 no puede llevarse por delante la lista de periodos.
      conPermiso(api.get<unknown>('/finanzas/cuentas-contables', { query:{ soloAfectables:true } })),
      conPermiso(api.get<Banco[]>('/catalogos/bancos')),
    ]).then(([ps,cs,bs]) => {
      setPeriodos(lista<Periodo>(ps)); setCuentas(lista<Cuenta>(cs.valor));
      setBancos((bs.valor ?? []).filter((b)=>b.activo!==false));
      if (!periodoId && lista<Periodo>(ps)[0]) setPeriodoId(lista<Periodo>(ps)[0].id);
    }).catch((e) => setMensaje({texto:e instanceof Error?e.message:'No se pudieron cargar los catálogos.',ok:false}));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void cargarPeriodo(); }, [periodoId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cargarPeriodo() {
    if (!periodoId) { setPago(null); setDispersion(null); return; }
    const [p,d] = await Promise.all([
      /*
       * El GET devuelve `{ pago, aplicaciones }` y el POST devuelve el pago
       * plano. La pantalla leia siempre lo plano, asi que al recargar —o justo
       * despues de pagar, que recarga— el recuadro de estado salia en blanco:
       * ni estado, ni total, ni saldo. El pago estaba bien; lo que no se podia
       * era comprobarlo.
       */
      conPermiso(
        api.get<Pago | { pago: Pago }>(`/rrhh/nomina-avanzada/periodos/${periodoId}/pago`)
          .then((r) => (r && typeof r === 'object' && 'pago' in r ? r.pago : r)),
      ).catch(()=>({valor:null,vedado:false})),
      conPermiso(api.get<RespuestaDispersion>(`/rrhh/nomina-avanzada/periodos/${periodoId}/dispersion`)).catch(()=>({valor:null,vedado:false})),
    ]);
    setPago(p.valor); setDispersion(d.valor);
  }

  /*
   * Dispersar y pagar son la misma jornada de Tesoreria, en este orden:
   * prelayout, confirmar envio al banco, conciliar la respuesta y registrar el
   * pago. Estaba partido en dos pantallas y la de dispersion —«Cumplimiento y
   * cierre»— ni siquiera estaba en el menu de Tesoreria: podia generar el
   * archivo del banco y no tenia por donde. Mientras tanto esta pantalla se
   * llamaba «Dispersion y pagos» y solo pagaba.
   */
  async function ejecutar(fn:()=>Promise<unknown>, ok:string) {
    setProcesando(true); setMensaje(null);
    try { await fn(); setMensaje({texto:ok,ok:true}); await cargarPeriodo(); }
    catch (e) { setMensaje({texto:e instanceof ApiError?e.mensajeParaPantalla():e instanceof Error?e.message:'La operación falló.',ok:false}); }
    finally { setProcesando(false); }
  }

  const periodo = useMemo(() => periodos.find((p)=>p.id===periodoId),[periodos,periodoId]);
  const dispersionActual = dispersion?.dispersion ?? null;
  const detallesDispersion = Array.isArray(dispersion?.detalles) ? dispersion.detalles : [];
  const estadoDispersion = dispersionActual?.estado ?? 'NO_GENERADA';
  const todosPendientes = detallesDispersion.length>0 && detallesDispersion.every((d)=>d.estado==='PENDIENTE');
  const total = aplicaciones.reduce((s,a)=>s+Number(a.monto||0)*Number(a.tipoCambio||1),0);
  const diferencia = Number(periodo?.totalNeto ?? 0) - total;
  const errores = aplicaciones.flatMap((a,i) => {
    const r:string[]=[];
    if (a.monto<=0) r.push(`Aplicación ${i+1}: monto inválido`);
    if (['TRANSFERENCIA','CHEQUE'].includes(a.metodo) && !a.referencia.trim()) r.push(`Aplicación ${i+1}: falta referencia`);
    if (!a.cuentaFinancieraId) r.push(`Aplicación ${i+1}: selecciona cuenta financiera`);
    return r;
  });

  function actualizar(i:number, cambios:Partial<Aplicacion>) { setAplicaciones((actual)=>actual.map((a,j)=>j===i?{...a,...cambios}:a)); }

  async function registrar() {
    if (!periodo || Math.abs(diferencia)>.01 || errores.length) return;
    setGuardando(true); setMensaje(null);
    try {
      const resultado = await api.post<Pago>(`/rrhh/nomina-avanzada/periodos/${periodo.id}/pago`, {
        idempotencyKey: crypto.randomUUID(),
        aplicaciones: aplicaciones.map((a)=>({...a, referencia:a.referencia||undefined})),
      });
      setPago(resultado);
      setMensaje({texto:'Pago registrado, saldos de préstamos/obligaciones aplicados y póliza de pago generada.',ok:true});
    } catch (e) {
      setMensaje({texto:e instanceof ApiError?e.mensajeParaPantalla():e instanceof Error?e.message:'No se pudo registrar el pago.',ok:false});
    } finally { setGuardando(false); }
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div><h1 className="text-2xl font-bold">Dispersión y pago de nómina</h1><p className="text-sm text-slate-500">En este orden: se genera el archivo del banco, se confirma el envío, se concilia la respuesta y se registra el pago. Una transferencia no se puede dar por pagada sin la respuesta bancaria conciliada.</p></div>
    {mensaje&&<div className={`rounded-lg border p-3 text-sm ${mensaje.ok?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-red-200 bg-red-50 text-red-800'}`}>{mensaje.texto}</div>}
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <label className="text-sm font-medium">Periodo<select className="entrada mt-1 w-full" value={periodoId} onChange={(e)=>setPeriodoId(e.target.value)}><option value="">Selecciona…</option>{periodos.map((p)=><option key={p.id} value={p.id}>#{p.numero}/{p.ejercicio} · {p.estado} · {dinero(p.totalNeto)}</option>)}</select></label>
      {pago&&<div className="mt-4 grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-4"><div>Estado<br/><b>{pago.estado}</b></div><div>Total<br/><b>{dinero(pago.totalPeriodo)}</b></div><div>Aplicado<br/><b>{dinero(pago.totalAplicado)}</b></div><div>Saldo<br/><b>{dinero(pago.saldo)}</b></div></div>}
    </section>

    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div><h2 className="font-semibold">1. Dispersión bancaria</h2><p className="text-sm text-slate-500">CSV_PRELAYOUT es una previsualización; un layout propietario exige adaptador bancario habilitado.</p></div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-medium">Banco
          <BuscadorSeleccion className="mt-1" valor={bancos.find((b)=>b.nombre===banco)?.id??''} opciones={bancos.map((b)=>({valor:b.id,etiqueta:`${b.clave??'—'} · ${b.nombre}`,busqueda:b.clave}))} onChange={(id)=>setBanco(bancos.find((b)=>b.id===id)?.nombre??'')} placeholder="Buscar banco oficial…"/>
        </label>
        <div className="flex items-end">
          <button className="btn btn-primario w-full" disabled={procesando||!periodoId||!banco||!['NO_GENERADA','BORRADOR','GENERADA'].includes(estadoDispersion)} onClick={()=>void ejecutar(()=>api.post(`/rrhh/nomina-avanzada/periodos/${periodoId}/dispersion`,{banco,formato:'CSV_PRELAYOUT'}),'Prelayout de dispersión generado.')}>Generar prelayout</button>
        </div>
        <div className="flex items-end">
          <button className="btn btn-secundario w-full" disabled={procesando||!periodoId} onClick={()=>void cargarPeriodo()}>Actualizar</button>
        </div>
      </div>
      {dispersionActual ? <>
        <div className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-4"><div>Estado<br/><b>{dispersionActual.estado}</b></div><div>Registros<br/><b>{dispersionActual.registros}</b></div><div>Total<br/><b>{dinero(dispersionActual.total)}</b></div><div>Hash<br/><code className="text-xs">{dispersionActual.hashArchivo?.slice(0,16)??'—'}…</code></div></div>
        {dispersionActual.estado==='GENERADA'&&<div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium">Referencia de envío<input className="entrada mt-1 w-full" value={referencia} onChange={(e)=>setReferencia(e.target.value)}/></label>
          <div className="flex items-end"><button className="btn btn-primario w-full" disabled={procesando||!referencia.trim()||!dispersionActual.hashArchivo} onClick={()=>void ejecutar(()=>api.patch(`/rrhh/nomina-avanzada/periodos/${periodoId}/dispersion/enviada`,{referenciaEnvio:referencia,hashArchivo:dispersionActual.hashArchivo}),'Dispersión marcada como enviada con evidencia de hash.')}>Confirmar envío al banco</button></div>
        </div>}
        {dispersionActual.estado==='ENVIADA'&&<div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm">Captura el hash de la respuesta bancaria. Esta acción conciliará todos los registros como aceptados; úsala solo cuando el archivo de respuesta confirme el total.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <input className="entrada" placeholder="Hash respuesta (mínimo 16 caracteres)" value={hashRespuesta} onChange={(e)=>setHashRespuesta(e.target.value)}/>
            <input className="entrada" placeholder="Referencia banco" value={referencia} onChange={(e)=>setReferencia(e.target.value)}/>
            <button className="btn btn-primario" disabled={procesando||hashRespuesta.length<16||referencia.length<5||!todosPendientes} onClick={()=>void ejecutar(()=>api.patch(`/rrhh/nomina-avanzada/periodos/${periodoId}/dispersion/conciliar`,{hashRespuestaBanco:hashRespuesta,referenciaBanco:referencia,resultados:detallesDispersion.map((d)=>({detalleId:d.id,estado:'ACEPTADO',montoAceptado:d.monto,referenciaBanco:referencia}))}),'Respuesta bancaria conciliada.')}>Conciliar respuesta</button>
          </div>
        </div>}
      </> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Todavía no hay dispersión para este periodo. Elige el banco y genera el prelayout.</p>}
    </section>

    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-semibold">2. Aplicaciones de pago</h2>
      {aplicaciones.map((a,i)=><div key={i} className="grid gap-3 rounded-lg border p-3 md:grid-cols-5">
        <label className="text-xs font-medium">Método<select className="entrada mt-1 w-full" value={a.metodo} onChange={(e)=>actualizar(i,{metodo:e.target.value})}><option>TRANSFERENCIA</option><option>EFECTIVO</option><option>CHEQUE</option><option>COMPENSACION</option></select></label>
        <label className="text-xs font-medium">Monto<input className="entrada mt-1 w-full" type="number" min="0.01" step="0.01" value={a.monto} onChange={(e)=>actualizar(i,{monto:Number(e.target.value)})}/></label>
        <label className="text-xs font-medium">Referencia<input className="entrada mt-1 w-full" value={a.referencia} onChange={(e)=>actualizar(i,{referencia:e.target.value})}/></label>
        <label className="text-xs font-medium">Cuenta financiera
          {/*
            * 930 cuentas del catalogo SAT en un `<select>` nativo, sin el
            * numero de cuenta porque se pintaba `c.codigo` y el catalogo
            * devuelve `numeroCuenta`. Los nombres se repiten —«Bancos
            * nacionales» aparece una vez por agrupador— asi que se elegia a
            * ciegas la cuenta por la que sale el dinero. Mismo arreglo que en
            * la configuracion patronal.
            */}
          <BuscadorSeleccion
            className="mt-1"
            valor={a.cuentaFinancieraId}
            opciones={cuentas.map((c)=>({ valor:c.id, etiqueta:`${claveDe(c)} · ${c.nombre??c.id}`, busqueda:claveDe(c) }))}
            onChange={(id)=>actualizar(i,{cuentaFinancieraId:id})}
            placeholder="Buscar cuenta por número o nombre…"
          />
        </label>
        <div className="flex items-end"><button className="btn btn-secundario w-full" disabled={aplicaciones.length===1} onClick={()=>setAplicaciones((x)=>x.filter((_,j)=>j!==i))}>Quitar</button></div>
      </div>)}
      <button className="btn btn-secundario" onClick={()=>setAplicaciones((x)=>[...x,nueva()])}>Agregar forma de pago</button>
      {errores.length>0&&<ul className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errores.map((e)=><li key={e}>• {e}</li>)}</ul>}
      <div className="grid gap-3 border-t pt-4 md:grid-cols-3"><div>Neto autorizado<br/><b>{dinero(periodo?.totalNeto??0)}</b></div><div>Total aplicaciones<br/><b>{dinero(total)}</b></div><div>Diferencia<br/><b className={Math.abs(diferencia)<.01?'text-emerald-700':'text-red-700'}>{dinero(diferencia)}</b></div></div>
      <button className="btn btn-primario" disabled={guardando||!periodo||Math.abs(diferencia)>.01||errores.length>0||pago?.estado==='PAGADO'} onClick={()=>void registrar()}>{guardando?'Registrando…':'Registrar pago y póliza'}</button>
    </section>
  </div>;
}
