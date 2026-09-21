"use client";

/**
 * ============================================================================
 * Permisos → Correspondencia de roles y usuarios con el registro externo
 * ----------------------------------------------------------------------------
 * Quién es quién, y qué puede hacer, cuando una empresa opera con el ERP y con
 * el core al mismo tiempo.
 *
 * El principio que gobierna esto —y que conviene no romper— es **una
 * identidad, dos autorizaciones**:
 *
 *  · La IDENTIDAD es una sola. Keycloak dice quién es la persona; el ERP la
 *    reconoce por su `keycloakSubject` o por su correo, y el correo es único
 *    en todo el ERP, que es justamente lo que impide que alguien pertenezca a
 *    dos empresas y vea las dos carteras.
 *
 *  · La AUTORIZACIÓN es de cada sistema, porque protegen cosas distintas. El
 *    ERP protege sus endpoints con su tabla de permisos; el core protege
 *    permisos bancarios con los suyos. Una sola tabla gobernando ambos es
 *    como se acaba con un cajero que puede cerrar el periodo contable.
 *
 * Lo que esta pantalla hace es la bisagra entre las dos: un mapa declarativo,
 * por empresa, de rol del ERP → rol(es) del externo. No aprovisiona sola: dar
 * de alta operadores en un core bancario es una decisión de una persona con
 * responsabilidad, no un efecto secundario de que alguien entre al ERP.
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users, Loader2, AlertCircle, CheckCircle2, ArrowRight, ShieldCheck,
  UserPlus, Link2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { api, ApiError, intentar } from '@/lib/api';

interface IRolErp { rol: string; etiqueta: string; descripcion: string }
interface IRolExterno { id: string; nombre: string; descripcion?: string; creadoDesdeErp?: boolean }
interface IMapeo { rolErp: string; rolesExternos: string[]; descripcionExterna?: string | null; activo?: boolean }

type Accion = 'NINGUNA' | 'MAPEAR_ROL' | 'DAR_DE_ALTA' | 'CORREGIR_ROLES'
  | 'SIN_OFICINA' | 'OTRA_OFICINA' | 'NO_EXISTE_EN_DIRECTORIO' | 'CORE_NO_DISPONIBLE';

interface IDiagnostico {
  usuarioId: string; email: string; rolErp: string;
  mapeado: boolean; existeEnExterno: boolean | null; idExterno: string | null;
  rolesExternos: string[]; accion: Accion;
  oficinaExterna?: string | null; oficinaEsperada?: string | null;
  enDirectorio?: boolean | null; habilitadoEnDirectorio?: boolean | null;
}

const ACCIONES: Record<Accion, { nombre: string; que: string; clase: string }> = {
  NINGUNA: {
    nombre: 'Listo',
    que: 'Existe en los dos lados y sus roles corresponden.',
    clase: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  MAPEAR_ROL: {
    nombre: 'Falta mapear su rol',
    que: 'Su rol del ERP no tiene correspondencia declarada, así que no se sabe qué debería poder hacer del otro lado.',
    clase: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  DAR_DE_ALTA: {
    nombre: 'No existe en el externo',
    que: 'El core no crea usuarios solo. Hasta que exista, esta persona no puede operar allá.',
    clase: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  CORREGIR_ROLES: {
    nombre: 'Sus roles no corresponden',
    que: 'Existe, pero con roles distintos a los que dice el mapa. Alguien los cambió a mano, o el mapa cambió después.',
    clase: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  SIN_OFICINA: {
    nombre: 'Falta la oficina de la empresa',
    que: 'Esta empresa no tiene declarada su oficina del core. Sin ella no se puede dar de alta a nadie allá sin arriesgarse a meterlo en la oficina de otra empresa.',
    clase: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  CORE_NO_DISPONIBLE: {
    nombre: 'El core no contestó',
    que: 'No se pudo preguntar si existe allá — el core no respondió, o no reconoce autoridad para mirar. Mientras no se sepa, no se da de alta a nadie: se duplicaría.',
    clase: 'bg-slate-50 text-slate-700 border-slate-200',
  },
  NO_EXISTE_EN_DIRECTORIO: {
    nombre: 'No existe en SUMA',
    que: 'Está dado de alta en el ERP pero no en el directorio. No puede entrar a ninguno de los dos sistemas hasta que alguien le cree la identidad en SUMA.',
    clase: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  OTRA_OFICINA: {
    nombre: 'Está en otra oficina',
    que: 'Ese nombre de usuario ya existe en el core, pero en una oficina distinta a la de esta empresa. En el core la oficina es lo que separa una cartera de otra: no es esta persona.',
    clase: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

export default function CorrespondenciaRolesPage() {
  const [rolesErp, setRolesErp] = useState<IRolErp[]>([]);
  const [rolesExternos, setRolesExternos] = useState<IRolExterno[]>([]);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [mapeo, setMapeo] = useState<IMapeo[]>([]);
  const [diagnostico, setDiagnostico] = useState<IDiagnostico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'err' } | null>(null);
  /*
   * Si la empresa no contrató el registro externo, esta pantalla no aplica.
   * No se llega por el menú —la pestaña no se pinta— pero sí por un enlace
   * guardado, y entonces hay que explicarlo, no enseñar un mapa vacío que
   * parece un pendiente de configuración.
   */
  const [contratado, setContratado] = useState<boolean | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [cat, m, d] = await Promise.all([
      intentar<{ contratado?: boolean; erp: IRolErp[]; externos: IRolExterno[]; error: string | null } | null>(
        api.get('/integracion/roles/catalogos'), null),
      intentar<IMapeo[]>(api.get('/integracion/roles/mapeo'), []),
      intentar<IDiagnostico[]>(api.get('/integracion/roles/diagnostico'), []),
    ]);
    setContratado(cat ? cat.contratado !== false : null);
    setRolesErp(cat?.erp ?? []);
    setRolesExternos(Array.isArray(cat?.externos) ? cat!.externos : []);
    setErrorCatalogo(cat?.error ?? null);
    setMapeo(Array.isArray(m) ? m : []);
    setDiagnostico(Array.isArray(d) ? d : []);
    setCargando(false);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const mapeoDe = (rol: string) =>
    mapeo.find((m) => m.rolErp?.toUpperCase() === rol.toUpperCase());

  const alternar = async (rolErp: string, idExterno: string) => {
    const actual = mapeoDe(rolErp)?.rolesExternos ?? [];
    const nuevos = actual.includes(idExterno)
      ? actual.filter((x) => x !== idExterno)
      : [...actual, idExterno];

    /* Un mapeo sin roles es un usuario que entra y no puede hacer nada. El
       backend lo rechaza a propósito, así que aquí se avisa en vez de mandarlo. */
    if (nuevos.length === 0) {
      setAviso({ tipo: 'err', texto: 'Un rol no puede quedar mapeado a nada. Para quitarlo del mapa, hay que borrar la correspondencia entera.' });
      return;
    }

    setGuardando(rolErp);
    setAviso(null);
    try {
      await api.post('/integracion/roles/mapeo', { rolErp, rolesExternos: nuevos });
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'err', texto: e instanceof ApiError ? e.message : 'No se pudo guardar la correspondencia.' });
    } finally {
      setGuardando(null);
    }
  };

  const aprovisionar = async (u: IDiagnostico) => {
    setGuardando(u.usuarioId);
    setAviso(null);
    try {
      await api.post(`/integracion/roles/aprovisionar/${u.usuarioId}`, {});
      setAviso({ tipo: 'ok', texto: `${u.email} quedó al corriente en el registro externo.` });
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'err', texto: e instanceof ApiError ? e.message : 'No se pudo aprovisionar.' });
    } finally {
      setGuardando(null);
    }
  };

  const sinMapear = rolesErp.filter((r) => !mapeoDe(r.rol)).length;
  const pendientes = diagnostico.filter((u) => u.accion !== 'NINGUNA').length;

  if (contratado === false) {
    return (
      <div className="py-10 max-w-xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 grid place-items-center mx-auto">
            <Link2 className="w-6 h-6 text-slate-400" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mt-4">
            Esta empresa no opera con el registro financiero externo
          </h1>
          <p className="text-[13px] text-slate-600 mt-2 leading-relaxed">
            La correspondencia de roles y usuarios solo tiene sentido cuando hay dos
            sistemas que corresponder. Con solo el ERP, los roles de aquí son los
            únicos que existen y no hay nada que mapear.
          </p>
          <p className="text-[12px] text-slate-400 mt-3">
            Si debería tenerlo contratado, se activa desde la consola de SUMA.
          </p>
          <Link href="/dashboard/permisos"
            className="inline-block mt-5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold">
            Ir a Roles y accesos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="py-5">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Link2 className="w-6 h-6 text-indigo-600" />
          Correspondencia con el registro externo
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Qué rol del ERP equivale a qué rol del core, y qué usuarios pueden operar de verdad en los
          dos sistemas.
        </p>
      </div>

      {aviso && (
        <div className={`mb-4 p-3 rounded-lg border text-sm flex items-start gap-2 ${
          aviso.tipo === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {aviso.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          {aviso.texto}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando catálogos…
        </div>
      ) : (
        <>
          {errorCatalogo && (
            <div className="mb-5 p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-rose-900">No se pudo leer el catálogo del externo</p>
                <p className="text-sm text-rose-800">{errorCatalogo}</p>
              </div>
            </div>
          )}

          {/* ── Aviso que importa: el externo sin roles operativos ──────── */}
          {!errorCatalogo && rolesExternos.length > 0 && rolesExternos.length <= 3 && (
            <div className="mb-5 p-4 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900">
                  El registro externo sólo tiene {rolesExternos.length} rol(es), y ninguno operativo
                </p>
                <p className="text-sm text-amber-800 mt-0.5">
                  Hoy sólo existen los roles que trae de fábrica y la cuenta técnica de la
                  integración. Mientras sea así, mapear cualquier rol del ERP significa mapearlo a
                  <strong> «Super user»</strong>, que es tanto como no mapear: un cajero acabaría con
                  permisos para cerrar el periodo. <strong>Hay que crear allá los roles que
                  correspondan</strong>, con sus permisos mínimos, antes de que este mapa signifique
                  algo.
                </p>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            {[
              { etiqueta: 'Roles del ERP', valor: rolesErp.length, pie: 'con plantilla de permisos', color: 'text-slate-900' },
              { etiqueta: 'Sin correspondencia', valor: sinMapear, pie: 'no se sabe qué pueden hacer allá', color: sinMapear ? 'text-amber-700' : 'text-emerald-700' },
              { etiqueta: 'Usuarios con pendiente', valor: pendientes, pie: `de ${diagnostico.length} en total`, color: pendientes ? 'text-amber-700' : 'text-emerald-700' },
            ].map((k) => (
              <div key={k.etiqueta} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k.etiqueta}</p>
                <p className={`text-2xl font-bold tabular-nums mt-0.5 ${k.color}`}>{k.valor}</p>
                <p className="text-[11px] text-slate-400">{k.pie}</p>
              </div>
            ))}
          </div>

          {/* ── El mapa ─────────────────────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-indigo-600" /> Rol del ERP → rol del externo
            </h2>
            <p className="text-xs text-slate-500 mb-3">
              Un rol puede corresponder a varios del otro lado. Lo que no puede es corresponder a
              ninguno: un usuario que entra y no puede hacer nada es peor que uno que no entra.
            </p>

            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
              {rolesErp.map((r) => {
                const m = mapeoDe(r.rol);
                const elegidos = m?.rolesExternos ?? [];
                return (
                  <div key={r.rol} className="p-4 grid lg:grid-cols-[260px_1fr] gap-4 items-start">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-800">{r.etiqueta}</p>
                        {elegidos.length === 0 && (
                          <span className="text-[10px] font-semibold uppercase text-amber-600">sin mapear</span>
                        )}
                        {guardando === r.rol && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                      </div>
                      <p className="text-[11px] font-mono text-slate-400">{r.rol}</p>
                      <p className="text-xs text-slate-500 mt-1">{r.descripcion}</p>
                    </div>

                    <div className="flex items-start gap-3">
                      <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 mt-2 hidden lg:block" />
                      <div className="flex flex-wrap gap-1.5">
                        {elegidos.length > 0 &&
                          elegidos.every((id) =>
                            rolesExternos.find((e) => String(e.id) === String(id))?.creadoDesdeErp,
                          ) && (
                          <p className="w-full text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 mb-1">
                            Todo lo que tiene mapeado este rol son roles espejo, que nacieron sin
                            permisos. Quien lo reciba no podrá hacer nada en el core hasta que
                            alguien les asigne permisos allá.
                          </p>
                        )}
                        {rolesExternos.length === 0 ? (
                          <span className="text-xs text-slate-400">Sin catálogo del externo.</span>
                        ) : rolesExternos.map((e) => {
                          const activo = elegidos.includes(String(e.id));
                          return (
                            <button key={e.id}
                              onClick={() => void alternar(r.rol, String(e.id))}
                              disabled={guardando !== null}
                              title={e.creadoDesdeErp
                                ? 'Rol espejo: se creó desde aquí y nació sin permisos. Mapear contra él no habilita nada hasta que alguien le dé permisos en el core.'
                                : (e.descripcion ?? undefined)}
                              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors disabled:opacity-50 inline-flex items-center gap-1 ${
                                activo
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                              {e.nombre}
                              {/*
                                El aviso que faltaba. Un rol espejo se ve igual
                                que cualquier otro y no habilita nada: asignarlo
                                dejó a un administrador sin autoridad en el core.
                              */}
                              {e.creadoDesdeErp && (
                                <span className={`text-[9px] font-bold rounded px-1 ${
                                  activo ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'}`}>
                                  sin permisos
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Los usuarios ────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" /> Quién puede operar en los dos sistemas
              </h2>
              <button onClick={() => void cargar()}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Revisar de nuevo
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              El core no crea usuarios solo, a propósito. Aquí se ve a quién le falta qué, en vez de
              descubrirlo el día que alguien no puede trabajar.
            </p>

            {diagnostico.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No hay usuarios que revisar.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
                {diagnostico.map((u) => {
                  const a = ACCIONES[u.accion] ?? ACCIONES.MAPEAR_ROL;
                  return (
                    <div key={u.usuarioId} className="p-4 flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{u.email}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          rol {u.rolErp}
                          {u.existeEnExterno && u.rolesExternos.length > 0 && (
                            <> · allá: {u.rolesExternos.map((id) =>
                              rolesExternos.find((r) => String(r.id) === String(id))?.nombre ?? id).join(', ')}</>
                          )}
                          {(u.oficinaEsperada || u.oficinaExterna) && (
                            <> · oficina {u.oficinaExterna ?? '—'}
                              {u.oficinaEsperada && u.oficinaExterna !== u.oficinaEsperada
                                ? ` (esta empresa: ${u.oficinaEsperada})`
                                : ''}</>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{a.que}</p>
                        {/*
                          Los tres sistemas de un vistazo. «?» no es un adorno:
                          significa que no se pudo preguntar al directorio, y eso
                          no es lo mismo que decir que la persona no está.
                        */}
                        <div className="flex items-center gap-1.5 mt-2 text-[10px] font-semibold">
                          {[
                            { etiqueta: 'ERP', estado: true as boolean | null },
                            { etiqueta: 'SUMA', estado: u.enDirectorio ?? null },
                            { etiqueta: 'Core', estado: u.existeEnExterno ?? null },
                          ].map(({ etiqueta, estado }) => (
                            <span key={etiqueta}
                              title={estado === null ? 'No se pudo consultar' : estado ? 'Existe' : 'No existe'}
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
                                estado === null
                                  ? 'bg-slate-50 text-slate-400 border-slate-200'
                                  : estado
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                              {etiqueta} {estado === null ? '?' : estado ? '✓' : '✕'}
                            </span>
                          ))}
                          {u.habilitadoEnDirectorio === false && (
                            <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-800">
                              deshabilitado en SUMA
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${a.clase}`}>
                          {a.nombre}
                        </span>
                        {(u.accion === 'DAR_DE_ALTA' || u.accion === 'CORREGIR_ROLES') &&
                          u.existeEnExterno !== null && (
                          <button onClick={() => void aprovisionar(u)}
                            disabled={guardando !== null}
                            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                            {guardando === u.usuarioId
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <UserPlus className="w-3.5 h-3.5" />}
                            {u.accion === 'DAR_DE_ALTA' ? 'Dar de alta allá' : 'Corregir roles'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
