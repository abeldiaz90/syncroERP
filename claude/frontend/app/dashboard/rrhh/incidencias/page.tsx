"use client";
/**
 * ============================================================================
 * SyncroERP · Recursos humanos — incidencias
 * ----------------------------------------------------------------------------
 * Faltas, incapacidades, vacaciones y horas extra. Lo que distingue esta
 * pantalla de un simple registro es la columna de efecto en nómina: cada
 * incidencia se marca como pagada o no pagada, y eso es exactamente lo que el
 * cálculo del periodo va a leer. Verlo aquí evita sorpresas al dispersar.
 * ============================================================================
 */

import { useMemo, useState } from 'react';
import { CalendarX2, Check, Plus, Undo2, X } from 'lucide-react';

import { api } from '@/lib/api';
import { fecha, isoCorto, plural} from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

import { useT } from '@/components/I18nProvider';
interface Empleado { id: string; numeroEmpleado: string; nombreCompleto: string }

interface Incidencia {
  id: string;
  empleadoId: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  horas: number;
  pagada: boolean;
  motivo?: string;
  folioIncapacidad?: string;
  aprobada: boolean;
  /*
   * El estado REAL. `aprobada` es un booleano y los estados son cuatro, asi
   * que `!aprobada` mete en el mismo saco lo que falta por resolver y lo que
   * ya se resolvio en contra. Ver `ESTADOS_RESUELTA`.
   */
  estadoAprobacion?: string;
}

/*
 * ============================================================================
 * Rechazada no es pendiente
 * ----------------------------------------------------------------------------
 * La pantalla decidia todo con `!aprobada`. Medido el 30-sep-2026 con la
 * sesion de Gerencia: una incidencia CANCELADA aparecia como pendiente, se
 * contaba en «PENDIENTES DE APROBAR 1», sumaba sus dias en «DIAS NO PAGADOS»
 * y ofrecia un boton «Aprobar» que solo podia contestar 409 —«La incidencia
 * esta en estado CANCELADA y no puede aprobarse»—.
 *
 * El calculo de nomina, que es quien maneja el dinero, ya lo hacia bien: se
 * bloquea con `estadoAprobacion NOT IN (resueltas)` y solo aplica `aprobada =
 * true`. Asi que la pantalla y la nomina daban numeros distintos sobre lo
 * mismo, y quien lee la pantalla antes de correr la nomina persigue un
 * pendiente que no existe.
 *
 * Esta lista es la misma que `ESTADOS_INCIDENCIA_RESUELTA` del backend
 * (`rrhh.entity.ts`). Si alla se agrega un estado, aqui tambien.
 * ============================================================================
 */
const ESTADOS_RESUELTA = ['APROBADA', 'APLICADA', 'RECHAZADA', 'CANCELADA'];

/*
 * Cada estado resuelto se nombra por lo que es. «Aprobada» para todo lo que no
 * estaba pendiente era la otra mitad del mismo error: una incidencia aplicada
 * en un recibo y una rechazada no son la misma noticia.
 */
const ETIQUETA_ESTADO: Record<string, { texto: string; tono: 'exito' | 'alerta' | 'peligro' | 'info' | 'neutro' }> = {
  APROBADA:  { texto: 'Aprobada',  tono: 'exito'  },
  APLICADA:  { texto: 'En nomina', tono: 'info'   },
  RECHAZADA: { texto: 'Rechazada', tono: 'peligro'},
  CANCELADA: { texto: 'Cancelada', tono: 'neutro' },
};

/** Falta por resolver: ni aprobada, ni aplicada, ni rechazada, ni cancelada. */
const estaPendiente = (i: Incidencia): boolean =>
  i.estadoAprobacion
    ? !ESTADOS_RESUELTA.includes(i.estadoAprobacion)
    : !i.aprobada;

/** Resuelta EN CONTRA: no se aprueba ni se descuenta nada por ella. */
const fueDesechada = (i: Incidencia): boolean =>
  i.estadoAprobacion === 'RECHAZADA' || i.estadoAprobacion === 'CANCELADA';

const TIPOS = [
  { valor: 'FALTA',             etiqueta: 'Falta',                 pagaPorOmision: false, unidad: 'dias'  },
  { valor: 'RETARDO',           etiqueta: 'Retardo',               pagaPorOmision: true,  unidad: 'dias'  },
  { valor: 'INCAPACIDAD',       etiqueta: 'Incapacidad',           pagaPorOmision: true,  unidad: 'dias'  },
  { valor: 'VACACIONES',        etiqueta: 'Vacaciones',            pagaPorOmision: true,  unidad: 'dias'  },
  { valor: 'PERMISO_CON_GOCE',  etiqueta: 'Permiso con goce',      pagaPorOmision: true,  unidad: 'dias'  },
  { valor: 'PERMISO_SIN_GOCE',  etiqueta: 'Permiso sin goce',      pagaPorOmision: false, unidad: 'dias'  },
  { valor: 'HORAS_EXTRA',       etiqueta: 'Horas extra',           pagaPorOmision: true,  unidad: 'horas' },
];

const TONO_TIPO: Record<string, 'exito' | 'alerta' | 'peligro' | 'info' | 'neutro'> = {
  FALTA: 'peligro',
  RETARDO: 'alerta',
  INCAPACIDAD: 'alerta',
  VACACIONES: 'info',
  PERMISO_CON_GOCE: 'info',
  PERMISO_SIN_GOCE: 'neutro',
  HORAS_EXTRA: 'exito',
};

const etiquetaTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.etiqueta ?? t;

export default function IncidenciasPage() {
  const t = useT();
  const { avisar } = useAvisos();
  const hoy = new Date();
  const primerDia = isoCorto(new Date(hoy.getFullYear(), hoy.getMonth(), 1));

  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(isoCorto());
  const [modalAbierto, setModalAbierto] = useState(false);

  const empleados = useDatos<Empleado[]>(() => api.get('/rrhh/empleados'), []);
  const incidencias = useDatos<Incidencia[]>(
    () => api.get('/rrhh/incidencias', { query: { desde, hasta } }),
    [desde, hasta],
  );

  // `errorVisible`: el fallo se pinta dentro del modal, junto al formulario
  // que lo provocó. No hace falta además el aviso flotante.
  const crear = useAccion(async (datos: Record<string, unknown>) => {
    await api.post('/rrhh/incidencias', datos);
    avisar('Incidencia registrada.', 'exito');
    setModalAbierto(false);
    void incidencias.recargar();
  }, { errorVisible: true });

  const aprobar = useAccion(async (id: string) => {
    await api.patch(`/rrhh/incidencias/${id}/aprobar`);
    avisar('Incidencia aprobada.', 'exito');
    void incidencias.recargar();
  });

  /*
   * ═════════════════════════════════════════════════════════════════════════
   * UNA BANDEJA DONDE SÓLO SE PUEDE DECIR QUE SÍ
   * --------------------------------------------------------------------------
   * El servidor sabe hacer tres cosas con una incidencia —aprobarla,
   * RECHAZARLA y REVERTIR una ya aprobada— y esta pantalla sólo llamaba a la
   * primera. Las otras dos eran de las setenta y seis rutas que no pedía
   * ninguna pantalla, medidas el 22-oct-2026.
   *
   * No es un botón de menos: una bandeja de aprobación cuyo único botón dice
   * «Aprobar» empuja a aprobar. Lo que no se puede negar en la pantalla se
   * acaba negando por teléfono, y entonces la incidencia se queda PENDIENTE
   * para siempre: ni aprobada ni rechazada, contando en el resumen de lo que
   * falta por revisar.
   *
   * Las dos exigen motivo, y el servidor también lo exige —retirar lo que
   * alguien aprobó no puede ser anónimo—. El botón se apaga sin él en vez de
   * dejar pulsar para que conteste que no.
   * ═════════════════════════════════════════════════════════════════════════
   */
  const [aResolver, setAResolver] = useState<{ incidencia: Incidencia; accion: 'rechazar' | 'revertir' } | null>(null);
  const [motivo, setMotivo] = useState('');

  const resolver = useAccion(async (id: string, accion: 'rechazar' | 'revertir', razon: string) => {
    await api.patch(`/rrhh/incidencias/${id}/${accion}`, { motivo: razon });
    avisar(accion === 'rechazar' ? 'Incidencia rechazada.' : t("Aprobación retirada."), 'exito');
    setAResolver(null);
    setMotivo('');
    void incidencias.recargar();
  });

  const nombrePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of empleados.datos ?? []) m.set(e.id, e.nombreCompleto);
    return m;
  }, [empleados.datos]);

  const resumen = useMemo(() => {
    const lista = incidencias.datos ?? [];
    return {
      total: lista.length,
      porAprobar: lista.filter(estaPendiente).length,
      // Una falta cancelada no le quita un dia de sueldo a nadie.
      diasNoPagados: lista
        .filter((i) => !i.pagada && !fueDesechada(i))
        .reduce((s, i) => s + Number(i.dias), 0),
      horasExtra: lista
        .filter((i) => i.tipo === 'HORAS_EXTRA' && !fueDesechada(i))
        .reduce((s, i) => s + Number(i.horas), 0),
    };
  }, [incidencias.datos]);

  return (
    <div className="p-6 max-w-[1300px] mx-auto">
      <EncabezadoPantalla
        titulo={t("Incidencias")}
        descripcion={t("Faltas, incapacidades, vacaciones y tiempo extraordinario")}
        acciones={
          <Boton variante="primario" icono={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalAbierto(true)}>
            
            {t("Registrar incidencia")}
          </Boton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta={t("Incidencias del periodo")} color="#db2777" cargando={incidencias.cargando}
          valor={resumen.total}
        />
        <Indicador
          etiqueta={t("Pendientes de aprobar")}
          color={resumen.porAprobar > 0 ? '#d97706' : '#64748b'}
          cargando={incidencias.cargando}
          valor={resumen.porAprobar}
        />
        <Indicador
          etiqueta={t("Días no pagados")} color="#e11d48" cargando={incidencias.cargando}
          valor={resumen.diasNoPagados}
          detalle={t("se descuentan de la nómina")}
        />
        <Indicador
          etiqueta={t("Horas extra")} color="#059669" cargando={incidencias.cargando}
          valor={resumen.horasExtra}
          detalle={t("dobles hasta 9, luego triples")}
        />
      </div>

      <Panel sinRelleno>
        <div className="panel-cabecera">
          <div className="flex items-center gap-2">
            <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-36" />
            <span className="text-slate-300 text-[12px]">a</span>
            <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-36" />
          </div>
          <p className="text-[12px] text-slate-500 cifra">{plural(resumen.total, 'registro')}</p>
        </div>

        {incidencias.cargando ? (
          <Cargando />
        ) : incidencias.error ? (
          <ErrorPantalla mensaje={t(incidencias.error)} onReintentar={incidencias.recargar} />
        ) : resumen.total === 0 ? (
          <SinDatos
            titulo={t("Sin incidencias en este periodo")}
            descripcion={t("Registra faltas, incapacidades o vacaciones para que el cálculo de nómina las considere.")}
            icono={<CalendarX2 className="w-5 h-5" />}
            accion={
              <Boton variante="primario" onClick={() => setModalAbierto(true)}>
                
                {t("Registrar la primera")}
              </Boton>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>{t("Empleado")}</th>
                  <th>{t("Tipo")}</th>
                  <th>{t("Del — al")}</th>
                  <th className="text-right">{t("Días")}</th>
                  <th className="text-right">{t("Horas")}</th>
                  <th>{t("Efecto en nómina")}</th>
                  <th>{t("Motivo")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {incidencias.datos!.map((i) => (
                  <tr key={i.id}>
                    <td className="text-slate-900">
                      {nombrePorId.get(i.empleadoId) ?? '—'}
                    </td>
                    <td>
                      <Distintivo tono={TONO_TIPO[i.tipo] ?? 'neutro'}>
                        {etiquetaTipo(i.tipo)}
                      </Distintivo>
                    </td>
                    <td className="cifra text-slate-600 whitespace-nowrap">
                      {fecha(i.fechaInicio)}
                      {i.fechaFin !== i.fechaInicio && ` — ${fecha(i.fechaFin)}`}
                    </td>
                    <td className="text-right cifra text-slate-700">
                      {Number(i.dias) > 0 ? Number(i.dias) : '—'}
                    </td>
                    <td className="text-right cifra text-slate-700">
                      {Number(i.horas) > 0 ? Number(i.horas) : '—'}
                    </td>
                    <td>
                      {i.tipo === 'HORAS_EXTRA' ? (
                        <span className="text-[12px] text-emerald-700">{t("Se paga adicional")}</span>
                      ) : i.pagada ? (
                        <span className="text-[12px] text-slate-500">{t("Se paga normal")}</span>
                      ) : (
                        <span className="text-[12px] text-rose-600 font-medium">{t("Se descuenta")}</span>
                      )}
                    </td>
                    <td className="text-slate-500 text-[12px]">
                      {i.motivo || (i.folioIncapacidad ? `Folio ${i.folioIncapacidad}` : '—')}
                    </td>
                    <td className="text-right">
                      {estaPendiente(i) ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => void aprobar.ejecutar(i.id)}
                            disabled={aprobar.ejecutando}
                            className="btn btn-fantasma btn-sm"
                          >
                            <Check className="w-3.5 h-3.5" />  {t("Aprobar")}
                          </button>
                          <button
                            onClick={() => { setAResolver({ incidencia: i, accion: 'rechazar' }); setMotivo(''); }}
                            className="btn btn-fantasma btn-sm text-rose-600"
                          >
                            <X className="w-3.5 h-3.5" />  {t("Rechazar")}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Distintivo tono={ETIQUETA_ESTADO[i.estadoAprobacion ?? (i.aprobada ? 'APROBADA' : 'PENDIENTE')]?.tono ?? 'neutro'}>
                            {ETIQUETA_ESTADO[i.estadoAprobacion ?? (i.aprobada ? 'APROBADA' : 'PENDIENTE')]?.texto ?? i.estadoAprobacion}
                          </Distintivo>
                          {/*
                            * Retirar sólo se ofrece sobre lo APROBADO: una
                            * rechazada no tiene aprobación que retirar, y el
                            * servidor lo negaría.
                            */}
                          {(i.estadoAprobacion === 'APROBADA' || (!i.estadoAprobacion && i.aprobada)) && (
                            <button
                              onClick={() => { setAResolver({ incidencia: i, accion: 'revertir' }); setMotivo(''); }}
                              className="btn btn-fantasma btn-sm"
                            >
                              <Undo2 className="w-3.5 h-3.5" />  {t("Retirar")}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        abierto={!!aResolver}
        onCerrar={() => { setAResolver(null); setMotivo(''); }}
        titulo={aResolver?.accion === 'revertir' ? t("Retirar la aprobación") : t("Rechazar la incidencia")}
        descripcion={
          aResolver
            ? `${nombrePorId.get(aResolver.incidencia.empleadoId) ?? t("Empleado")} · ${fecha(aResolver.incidencia.fechaInicio)}`
            : undefined
        }
        ancho={440}
        pie={
          <>
            <Boton variante="neutro" onClick={() => { setAResolver(null); setMotivo(''); }}>
              
              {t("Volver")}
            </Boton>
            <Boton
              variante={aResolver?.accion === 'revertir' ? 'primario' : 'peligro'}
              disabled={!motivo.trim()}
              cargando={resolver.ejecutando}
              onClick={() => void resolver.ejecutar(aResolver!.incidencia.id, aResolver!.accion, motivo)}
            >
              {aResolver?.accion === 'revertir' ? t("Retirar aprobación") : t("Rechazar")}
            </Boton>
          </>
        }
      >
        <p className="text-[13px] text-slate-600 mb-3.5 leading-relaxed">
          {aResolver?.accion === 'revertir'
            ? t("La incidencia vuelve a quedar sin aprobar y deja de contar donde ya contaba. Queda escrito quién la retiró y por qué.")
            : t("La incidencia queda rechazada y no vuelve a la lista de pendientes. Queda escrito quién la rechazó y por qué.")}
        </p>
        <Campo etiqueta={t("Motivo")} requerido>
          <Entrada
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={aResolver?.accion === 'revertir' ? t("Se aprobó por error") : t("No corresponde a este periodo")}
          />
        </Campo>
      </Modal>

      <ModalNuevaIncidencia
        abierto={modalAbierto}
        empleados={empleados.datos ?? []}
        guardando={crear.ejecutando}
        error={crear.error}
        onCerrar={() => { setModalAbierto(false); crear.limpiarError(); }}
        onGuardar={(d) => void crear.ejecutar(d)}
      />
    </div>
  );
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

function ModalNuevaIncidencia({
  abierto, empleados, guardando, error, onCerrar, onGuardar,
}: {
  abierto: boolean;
  empleados: Empleado[];
  guardando: boolean;
  error: string | null;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({
    empleadoId: '', tipo: 'FALTA',
    fechaInicio: isoCorto(), fechaFin: isoCorto(),
    horas: '', motivo: '', folioIncapacidad: '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});

  const tipoActual = TIPOS.find((t) => t.valor === form.tipo)!;
  const esPorHoras = tipoActual.unidad === 'horas';

  const cambiar = (c: string, v: string) => {
    setForm((f) => {
      const s = { ...f, [c]: v };
      // Al mover el inicio, el fin lo sigue si quedaría antes.
      if (c === 'fechaInicio' && s.fechaFin < v) s.fechaFin = v;
      return s;
    });
    setErrores((e) => ({ ...e, [c]: '' }));
  };

  const dias = useMemo(() => {
    if (esPorHoras) return 0;
    const i = new Date(form.fechaInicio);
    const f = new Date(form.fechaFin);
    if (Number.isNaN(i.getTime()) || Number.isNaN(f.getTime()) || f < i) return 0;
    return Math.floor((f.getTime() - i.getTime()) / 86_400_000) + 1;
  }, [form.fechaInicio, form.fechaFin, esPorHoras]);

  const enviar = () => {
    const e: Record<string, string> = {};
    if (!form.empleadoId) e.empleadoId = t("Elige al empleado.");
    if (!form.fechaInicio) e.fechaInicio = t("Indica la fecha.");
    if (form.fechaFin < form.fechaInicio) e.fechaFin = t("No puede ser anterior al inicio.");
    if (esPorHoras && (!form.horas || parseFloat(form.horas) <= 0)) {
      e.horas = t("Indica cuántas horas extra fueron.");
    }
    if (form.tipo === 'INCAPACIDAD' && !form.folioIncapacidad.trim()) {
      e.folioIncapacidad = t("El folio del IMSS es necesario para justificarla.");
    }

    setErrores(e);
    if (Object.keys(e).length) return;

    onGuardar({
      empleadoId: form.empleadoId,
      tipo: form.tipo,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      dias: esPorHoras ? 0 : dias,
      horas: esPorHoras ? parseFloat(form.horas) : 0,
      pagada: tipoActual.pagaPorOmision,
      motivo: form.motivo || undefined,
      folioIncapacidad: form.folioIncapacidad || undefined,
    });
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={t("Registrar incidencia")}
      ancho={560}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>{t("Cancelar")}</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>{t("Registrar")}</Boton>
        </>
      }
    >
      <div className="space-y-3.5">
        <Campo etiqueta={t("Empleado")} requerido error={errores.empleadoId}>
          <Seleccion
            value={form.empleadoId}
            onChange={(e) => cambiar('empleadoId', e.target.value)}
            error={!!errores.empleadoId}
          >
            <option value="">{t("Elige uno…")}</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.numeroEmpleado} · {e.nombreCompleto}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta={t("Tipo de incidencia")} requerido>
          <Seleccion value={form.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
            {TIPOS.map((tipo) => <option key={tipo.valor} value={tipo.valor}>{t(tipo.etiqueta)}</option>)}
          </Seleccion>
        </Campo>

        <div className="grid grid-cols-2 gap-3.5">
          <Campo etiqueta={esPorHoras ? t("Fecha") : t("Desde")} requerido error={errores.fechaInicio}>
            <Entrada
              type="date"
              value={form.fechaInicio}
              onChange={(e) => cambiar('fechaInicio', e.target.value)}
              error={!!errores.fechaInicio}
            />
          </Campo>

          {esPorHoras ? (
            <Campo etiqueta={t("Horas extra")} requerido error={errores.horas}>
              <Entrada
                type="number" step="0.5" min="0"
                value={form.horas}
                onChange={(e) => cambiar('horas', e.target.value)}
                error={!!errores.horas}
                placeholder="0"
              />
            </Campo>
          ) : (
            <Campo
              etiqueta={t("Hasta")} requerido error={errores.fechaFin}
              ayuda={dias > 0 ? `${dias} ${dias === 1 ? t("día") : t("días")}` : undefined}
            >
              <Entrada
                type="date"
                value={form.fechaFin}
                onChange={(e) => cambiar('fechaFin', e.target.value)}
                error={!!errores.fechaFin}
              />
            </Campo>
          )}
        </div>

        {form.tipo === 'INCAPACIDAD' && (
          <Campo etiqueta={t("Folio de incapacidad")} requerido error={errores.folioIncapacidad}>
            <Entrada
              value={form.folioIncapacidad}
              onChange={(e) => cambiar('folioIncapacidad', e.target.value)}
              error={!!errores.folioIncapacidad}
              placeholder={t("Folio del certificado del IMSS")}
            />
          </Campo>
        )}

        <Campo etiqueta={t("Motivo o comentario")}>
          <Entrada
            value={form.motivo}
            onChange={(e) => cambiar('motivo', e.target.value)}
            placeholder={t("Contexto de la incidencia")}
          />
        </Campo>

        {/* Efecto en nómina, antes de guardar */}
        <div
          className="rounded-lg px-3.5 py-2.5 text-[12.5px]"
          style={{
            background: tipoActual.pagaPorOmision ? '#ecfdf5' : '#fff1f2',
            border: `1px solid ${tipoActual.pagaPorOmision ? '#a7f3d0' : '#fecdd3'}`,
          }}
        >
          <span className="font-semibold">{t("Efecto en nómina:")} </span>
          {form.tipo === 'HORAS_EXTRA'
            ? t("se pagan como tiempo extraordinario — dobles las primeras 9 de la semana, triples el excedente.")
            : tipoActual.pagaPorOmision
              ? ((dias || 0) === 1
                  ? t("el día se paga de forma normal.")
                  : `los ${dias || 0} días se pagan de forma normal.`)
              : ((dias || 0) === 1
                  ? t("el día se descuenta del periodo.")
                  : `los ${dias || 0} días se descuentan del periodo.`)}
        </div>

        {error && <p className="text-[12.5px] text-rose-600 font-medium">{t(error)}</p>}
      </div>
    </Modal>
  );
}
