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
import { CalendarX2, Check, Plus } from 'lucide-react';

import { api } from '@/lib/api';
import { fecha, isoCorto } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

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
}

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

  const crear = useAccion(async (datos: Record<string, unknown>) => {
    await api.post('/rrhh/incidencias', datos);
    avisar('Incidencia registrada.', 'exito');
    setModalAbierto(false);
    void incidencias.recargar();
  });

  const aprobar = useAccion(async (id: string) => {
    await api.patch(`/rrhh/incidencias/${id}/aprobar`);
    avisar('Incidencia aprobada.', 'exito');
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
      porAprobar: lista.filter((i) => !i.aprobada).length,
      diasNoPagados: lista.filter((i) => !i.pagada).reduce((s, i) => s + Number(i.dias), 0),
      horasExtra: lista
        .filter((i) => i.tipo === 'HORAS_EXTRA')
        .reduce((s, i) => s + Number(i.horas), 0),
    };
  }, [incidencias.datos]);

  return (
    <div className="p-6 max-w-[1300px] mx-auto">
      <EncabezadoPantalla
        titulo="Incidencias"
        descripcion="Faltas, incapacidades, vacaciones y tiempo extraordinario"
        acciones={
          <Boton variante="primario" icono={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalAbierto(true)}>
            Registrar incidencia
          </Boton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Incidencias del periodo" color="#db2777" cargando={incidencias.cargando}
          valor={resumen.total}
        />
        <Indicador
          etiqueta="Pendientes de aprobar"
          color={resumen.porAprobar > 0 ? '#d97706' : '#64748b'}
          cargando={incidencias.cargando}
          valor={resumen.porAprobar}
        />
        <Indicador
          etiqueta="Días no pagados" color="#e11d48" cargando={incidencias.cargando}
          valor={resumen.diasNoPagados}
          detalle="se descuentan de la nómina"
        />
        <Indicador
          etiqueta="Horas extra" color="#059669" cargando={incidencias.cargando}
          valor={resumen.horasExtra}
          detalle="dobles hasta 9, luego triples"
        />
      </div>

      <Panel sinRelleno>
        <div className="panel-cabecera">
          <div className="flex items-center gap-2">
            <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-36" />
            <span className="text-slate-300 text-[12px]">a</span>
            <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-36" />
          </div>
          <p className="text-[12px] text-slate-500 cifra">{resumen.total} registros</p>
        </div>

        {incidencias.cargando ? (
          <Cargando />
        ) : incidencias.error ? (
          <ErrorPantalla mensaje={incidencias.error} onReintentar={incidencias.recargar} />
        ) : resumen.total === 0 ? (
          <SinDatos
            titulo="Sin incidencias en este periodo"
            descripcion="Registra faltas, incapacidades o vacaciones para que el cálculo de nómina las considere."
            icono={<CalendarX2 className="w-5 h-5" />}
            accion={
              <Boton variante="primario" onClick={() => setModalAbierto(true)}>
                Registrar la primera
              </Boton>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Tipo</th>
                  <th>Del — al</th>
                  <th className="text-right">Días</th>
                  <th className="text-right">Horas</th>
                  <th>Efecto en nómina</th>
                  <th>Motivo</th>
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
                        <span className="text-[12px] text-emerald-700">Se paga adicional</span>
                      ) : i.pagada ? (
                        <span className="text-[12px] text-slate-500">Se paga normal</span>
                      ) : (
                        <span className="text-[12px] text-rose-600 font-medium">Se descuenta</span>
                      )}
                    </td>
                    <td className="text-slate-500 text-[12px]">
                      {i.motivo || (i.folioIncapacidad ? `Folio ${i.folioIncapacidad}` : '—')}
                    </td>
                    <td className="text-right">
                      {i.aprobada ? (
                        <Distintivo tono="exito">Aprobada</Distintivo>
                      ) : (
                        <button
                          onClick={() => void aprobar.ejecutar(i.id).catch(() => {})}
                          disabled={aprobar.ejecutando}
                          className="btn btn-fantasma btn-sm"
                        >
                          <Check className="w-3.5 h-3.5" /> Aprobar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ModalNuevaIncidencia
        abierto={modalAbierto}
        empleados={empleados.datos ?? []}
        guardando={crear.ejecutando}
        error={crear.error}
        onCerrar={() => { setModalAbierto(false); crear.limpiarError(); }}
        onGuardar={(d) => void crear.ejecutar(d).catch(() => {})}
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
    if (!form.empleadoId) e.empleadoId = 'Elige al empleado.';
    if (!form.fechaInicio) e.fechaInicio = 'Indica la fecha.';
    if (form.fechaFin < form.fechaInicio) e.fechaFin = 'No puede ser anterior al inicio.';
    if (esPorHoras && (!form.horas || parseFloat(form.horas) <= 0)) {
      e.horas = 'Indica cuántas horas extra fueron.';
    }
    if (form.tipo === 'INCAPACIDAD' && !form.folioIncapacidad.trim()) {
      e.folioIncapacidad = 'El folio del IMSS es necesario para justificarla.';
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
      titulo="Registrar incidencia"
      ancho={560}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>Registrar</Boton>
        </>
      }
    >
      <div className="space-y-3.5">
        <Campo etiqueta="Empleado" requerido error={errores.empleadoId}>
          <Seleccion
            value={form.empleadoId}
            onChange={(e) => cambiar('empleadoId', e.target.value)}
            error={!!errores.empleadoId}
          >
            <option value="">Elige uno…</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.numeroEmpleado} · {e.nombreCompleto}
              </option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Tipo de incidencia" requerido>
          <Seleccion value={form.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </Seleccion>
        </Campo>

        <div className="grid grid-cols-2 gap-3.5">
          <Campo etiqueta={esPorHoras ? 'Fecha' : 'Desde'} requerido error={errores.fechaInicio}>
            <Entrada
              type="date"
              value={form.fechaInicio}
              onChange={(e) => cambiar('fechaInicio', e.target.value)}
              error={!!errores.fechaInicio}
            />
          </Campo>

          {esPorHoras ? (
            <Campo etiqueta="Horas extra" requerido error={errores.horas}>
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
              etiqueta="Hasta" requerido error={errores.fechaFin}
              ayuda={dias > 0 ? `${dias} ${dias === 1 ? 'día' : 'días'}` : undefined}
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
          <Campo etiqueta="Folio de incapacidad" requerido error={errores.folioIncapacidad}>
            <Entrada
              value={form.folioIncapacidad}
              onChange={(e) => cambiar('folioIncapacidad', e.target.value)}
              error={!!errores.folioIncapacidad}
              placeholder="Folio del certificado del IMSS"
            />
          </Campo>
        )}

        <Campo etiqueta="Motivo o comentario">
          <Entrada
            value={form.motivo}
            onChange={(e) => cambiar('motivo', e.target.value)}
            placeholder="Contexto de la incidencia"
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
          <span className="font-semibold">Efecto en nómina: </span>
          {form.tipo === 'HORAS_EXTRA'
            ? 'se pagan como tiempo extraordinario — dobles las primeras 9 de la semana, triples el excedente.'
            : tipoActual.pagaPorOmision
              ? `los ${dias || 0} días se pagan de forma normal.`
              : `los ${dias || 0} días se descuentan del periodo.`}
        </div>

        {error && <p className="text-[12.5px] text-rose-600 font-medium">{error}</p>}
      </div>
    </Modal>
  );
}
