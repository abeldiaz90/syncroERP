"use client";
/**
 * ============================================================================
 * SyncroERP · Nómina — periodos
 * ----------------------------------------------------------------------------
 * Pantalla de proceso, no de captura. El estado del periodo manda: ABIERTO
 * permite calcular, CALCULADO permite recalcular o cerrar, CERRADO no permite
 * nada. Los botones reflejan eso en lugar de mostrarse siempre y fallar.
 *
 * Las advertencias del cálculo se muestran en su propio bloque: un neto
 * negativo o un empleado sin días pagados es algo que alguien debe revisar
 * antes de dispersar el pago, no una línea perdida en la tabla.
 * ============================================================================
 */

import { useState } from 'react';
import { ArrowRight, CalendarRange, Calculator, Plus, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { api } from '@/lib/api';
import { dinero, fecha, isoCorto } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Confirmacion, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

import { useT } from '@/components/I18nProvider';
type EstadoPeriodo = 'ABIERTO' | 'CALCULANDO' | 'CALCULADO' | 'CON_ALERTAS' | 'EN_REVISION' | 'APROBADO' | 'CFDI_PREPARADO' | 'TIMBRADO' | 'DISPERSION_GENERADA' | 'EN_DISPERSION' | 'PAGADO' | 'CONTABILIZADO' | 'CERRADO' | 'CANCELADO' | 'REVERTIDO';

interface Periodo {
  id: string;
  ejercicio: number;
  numero: number;
  regimen: string;
  fechaInicio: string;
  fechaFin: string;
  fechaPago: string;
  diasPeriodo: number;
  estado: EstadoPeriodo;
  totalPercepciones: number;
  totalDeducciones: number;
  totalNeto: number;
  empleadosCalculados: number;
}

interface ResultadoCalculo {
  empleadosCalculados: number;
  totalPercepciones: number;
  totalDeducciones: number;
  totalNeto: number;
  advertencias: string[];
}

const TONO_ESTADO: Record<EstadoPeriodo, 'exito' | 'alerta' | 'info' | 'peligro' | 'neutro'> = {
  ABIERTO: 'info',
  CALCULANDO: 'info',
  CALCULADO: 'alerta',
  CON_ALERTAS: 'alerta',
  EN_REVISION: 'info',
  APROBADO: 'exito',
  CFDI_PREPARADO: 'info',
  TIMBRADO: 'exito',
  DISPERSION_GENERADA: 'info',
  EN_DISPERSION: 'info',
  PAGADO: 'exito',
  CONTABILIZADO: 'exito',
  CERRADO: 'exito',
  CANCELADO: 'peligro',
  REVERTIDO: 'peligro',
};

const ETIQUETA_ESTADO: Record<EstadoPeriodo, string> = {
  ABIERTO: 'Abierto',
  CALCULANDO: 'Calculando',
  CALCULADO: 'Calculado',
  CON_ALERTAS: 'Con alertas',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  CFDI_PREPARADO: 'CFDI preparado',
  TIMBRADO: 'Timbrado',
  DISPERSION_GENERADA: 'Dispersión generada',
  EN_DISPERSION: 'En dispersión',
  PAGADO: 'Pagado',
  CONTABILIZADO: 'Contabilizado',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
  REVERTIDO: 'Revertido',
};

export default function PeriodosNominaPage() {
  const t = useT();
  const { avisar } = useAvisos();
  const anioActual = new Date().getFullYear();

  const [ejercicio, setEjercicio] = useState(anioActual);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [aCalcular, setACalcular] = useState<Periodo | null>(null);

  /*
   * Un periodo ya calculado tiene recibos, y volver a calcularlo los reemplaza
   * por completo. El aviso de eso existia, pero colgaba de
   * `estado === 'CALCULADO'` y se saltaba CON_ALERTAS —que es el estado en el
   * que acaba cualquier nomina con un SBC sin validar, o sea el caso normal—.
   * Ahi el dialogo decia «Se calcularan las percepciones…», como si fuera la
   * primera vez, y el boton decia «Calcular». Se recalculaba sin saberlo.
   *
   * Lo que decide no es un estado concreto sino si ya hay recibos, y eso es
   * cierto en cuanto el periodo deja de estar ABIERTO.
   */
  const yaTieneRecibos = (periodo: Periodo | null) =>
    Boolean(periodo) && periodo!.estado !== 'ABIERTO';
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);

  const periodos = useDatos<Periodo[]>(
    () => api.get('/rrhh/nomina/periodos', { query: { ejercicio } }),
    [ejercicio],
  );

  const crear = useAccion(async (datos: Record<string, unknown>) => {
    const p = await api.post<Periodo>('/rrhh/nomina/periodos', datos);
    avisar(`Periodo ${p.numero} de ${p.ejercicio} creado.`, 'exito');
    setModalAbierto(false);
    void periodos.recargar();
    return p;
  });

  const calcular = useAccion(async (id: string) => {
    const r = await api.post<ResultadoCalculo>(`/rrhh/nomina/periodos/${id}/calcular`);
    setResultado(r);
    setACalcular(null);
    avisar(
      `Nómina calculada: ${r.empleadosCalculados} empleados, neto ${dinero(r.totalNeto)}.`,
      r.advertencias.length ? 'alerta' : 'exito',
    );
    void periodos.recargar();
    return r;
  });

  const anios = Array.from({ length: 5 }, (_, i) => anioActual - 3 + i);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <EncabezadoPantalla
        titulo={t("Periodos de nómina")}
        descripcion={t("Cálculo, revisión y cierre de cada periodo de pago")}
        acciones={
          <Boton variante="primario" icono={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalAbierto(true)}>
            
            {t("Nuevo periodo")}
          </Boton>
        }
      />

      {/* Advertencias del último cálculo */}
      {resultado && resultado.advertencias.length > 0 && (
        <div className="panel p-4 mb-4 border-l-[3px] border-l-amber-400">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-900">
                
                {t("Revisa esto antes de dispersar el pago")}
              </p>
              <ul className="mt-2 space-y-1">
                {resultado.advertencias.map((a, i) => (
                  <li key={i} className="text-[12.5px] text-slate-600 flex gap-2">
                    <span className="text-amber-500">·</span>{a}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setResultado(null)}
              className="btn btn-fantasma btn-sm ml-auto shrink-0"
            >
              
              {t("Entendido")}
            </button>
          </div>
        </div>
      )}

      <Panel sinRelleno>
        <div className="panel-cabecera">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">{t("Ejercicio")}</span>
            <Seleccion value={ejercicio} onChange={(e) => setEjercicio(Number(e.target.value))} className="w-28">
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </Seleccion>
          </div>
          <p className="text-[12px] text-slate-500 cifra">
            {t("{n0} periodos", { n0: periodos.datos?.length ?? 0 })}</p>
        </div>

        {periodos.cargando ? (
          <Cargando />
        ) : periodos.error ? (
          <ErrorPantalla mensaje={t(periodos.error)} onReintentar={periodos.recargar} />
        ) : (periodos.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo={`Sin periodos en ${ejercicio}`}
            descripcion={t("Crea el primer periodo del ejercicio para empezar a calcular nómina.")}
            icono={<CalendarRange className="w-5 h-5" />}
            accion={
              <Boton variante="primario" onClick={() => setModalAbierto(true)}>
                
                {t("Crear el primero")}
              </Boton>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>{t("Periodo")}</th>
                  <th>{t("Del — al")}</th>
                  <th>{t("Pago")}</th>
                  <th className="text-right">{t("Empleados")}</th>
                  <th className="text-right">{t("Percepciones")}</th>
                  <th className="text-right">{t("Deducciones")}</th>
                  <th className="text-right">{t("Neto a pagar")}</th>
                  <th>{t("Estado")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {periodos.datos!.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-semibold text-slate-900 cifra">#{p.numero}</span>
                      <span className="text-[11px] text-slate-400 ml-1.5">{p.regimen}</span>
                    </td>
                    <td className="cifra text-slate-600 whitespace-nowrap">
                      {fecha(p.fechaInicio)} — {fecha(p.fechaFin)}
                    </td>
                    <td className="cifra text-slate-500">{fecha(p.fechaPago)}</td>
                    <td className="text-right cifra text-slate-600">
                      {p.empleadosCalculados || '—'}
                    </td>
                    <td className="text-right cifra text-emerald-700">
                      {p.totalPercepciones ? dinero(p.totalPercepciones) : '—'}
                    </td>
                    <td className="text-right cifra text-rose-600">
                      {p.totalDeducciones ? dinero(p.totalDeducciones) : '—'}
                    </td>
                    <td className="text-right cifra font-semibold text-slate-900">
                      {p.totalNeto ? dinero(p.totalNeto) : '—'}
                    </td>
                    <td>
                      <Distintivo tono={TONO_ESTADO[p.estado]}>
                        {ETIQUETA_ESTADO[p.estado]}
                      </Distintivo>
                    </td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        {['ABIERTO', 'CALCULADO', 'CON_ALERTAS'].includes(p.estado) && (
                          <button
                            onClick={() => setACalcular(p)}
                            className="btn btn-fantasma btn-sm"
                            title={yaTieneRecibos(p) ? t("Recalcular") : t("Calcular nómina")}
                          >
                            <Calculator className="w-3.5 h-3.5" />
                            {yaTieneRecibos(p) ? t("Recalcular") : t("Calcular")}
                          </button>
                        )}
                        {p.empleadosCalculados > 0 && (
                          <Link
                            href={`/dashboard/rrhh/recibos?periodoId=${p.id}`}
                            className="btn btn-fantasma btn-sm"
                          >
                            
                            {t("Recibos")}
                          </Link>
                        )}
                        {p.empleadosCalculados > 0 && !['CERRADO', 'CANCELADO'].includes(p.estado) && (
                          <Link href={`/dashboard/rrhh/centro-nomina?periodoId=${p.id}`} className="btn btn-fantasma btn-sm">
                            
                            {t("Continuar flujo")} <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ModalNuevoPeriodo
        abierto={modalAbierto}
        ejercicio={ejercicio}
        siguienteNumero={(periodos.datos?.reduce((m, p) => Math.max(m, p.numero), 0) ?? 0) + 1}
        guardando={crear.ejecutando}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={(d) => void crear.ejecutar(d)}
      />

      <Confirmacion
        abierto={!!aCalcular}
        titulo={yaTieneRecibos(aCalcular) ? t("Recalcular la nómina") : t("Calcular la nómina")}
        mensaje={
          yaTieneRecibos(aCalcular)
            ? `${(aCalcular?.empleadosCalculados ?? 0) === 1 ? t("El recibo") : `Los ${aCalcular?.empleadosCalculados ?? 0} recibos`} del periodo ${aCalcular?.numero} se ${(aCalcular?.empleadosCalculados ?? 0) === 1 ? 'reemplaza' : 'reemplazan'} por completo, incluido cualquier ajuste hecho a mano. Es seguro: se hace dentro de una transacción, así que no quedan recibos a medias.`
            : `Se calcularán las percepciones, el ISR y el IMSS de todos los empleados activos del periodo ${aCalcular?.numero}.`
        }
        textoConfirmar={yaTieneRecibos(aCalcular) ? t("Recalcular") : t("Calcular")}
        procesando={calcular.ejecutando}
        onConfirmar={() => void calcular.ejecutar(aCalcular!.id)}
        onCancelar={() => setACalcular(null)}
      />

    </div>
  );
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

const DIAS_REGIMEN: Record<string, number> = {
  SEMANAL: 7, CATORCENAL: 14, QUINCENAL: 15, MENSUAL: 30,
};

function ModalNuevoPeriodo({
  abierto, ejercicio, siguienteNumero, guardando, onCerrar, onGuardar,
}: {
  abierto: boolean;
  ejercicio: number;
  siguienteNumero: number;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [form, setForm] = useState({
    numero: String(siguienteNumero),
    regimen: 'QUINCENAL',
    fechaInicio: '',
    fechaFin: '',
    fechaPago: isoCorto(),
  });
  const [errores, setErrores] = useState<Record<string, string>>({});

  const cambiar = (c: string, v: string) => {
    setForm((f) => {
      const siguiente = { ...f, [c]: v };
      // Al elegir el inicio, propone el fin según la periodicidad.
      if (c === 'fechaInicio' && v) {
        const dias = DIAS_REGIMEN[siguiente.regimen] ?? 15;
        const fin = new Date(v);
        fin.setDate(fin.getDate() + dias - 1);
        siguiente.fechaFin = isoCorto(fin);
      }
      return siguiente;
    });
    setErrores((e) => ({ ...e, [c]: '' }));
  };

  const enviar = () => {
    const e: Record<string, string> = {};
    if (!form.numero || Number(form.numero) < 1) e.numero = t("Indica el número de periodo.");
    if (!form.fechaInicio) e.fechaInicio = t("Indica cuándo empieza.");
    if (!form.fechaFin) e.fechaFin = t("Indica cuándo termina.");
    if (form.fechaInicio && form.fechaFin && form.fechaFin < form.fechaInicio) {
      e.fechaFin = t("La fecha final no puede ser anterior a la inicial.");
    }
    if (!form.fechaPago) e.fechaPago = t("Indica la fecha de pago.");

    setErrores(e);
    if (Object.keys(e).length) return;

    onGuardar({ ...form, ejercicio, numero: Number(form.numero) });
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Nuevo periodo de ${ejercicio}`}
      descripcion={t("El periodo nace abierto; el cálculo es un paso aparte.")}
      ancho={520}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>{t("Cancelar")}</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>{t("Crear periodo")}</Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <Campo etiqueta={t("Número de periodo")} requerido error={errores.numero}>
          <Entrada
            type="number" min="1"
            value={form.numero}
            onChange={(e) => cambiar('numero', e.target.value)}
            error={!!errores.numero}
          />
        </Campo>

        <Campo etiqueta={t("Periodicidad")} requerido>
          <Seleccion value={form.regimen} onChange={(e) => cambiar('regimen', e.target.value)}>
            <option value="SEMANAL">{t("Semanal · 7 días")}</option>
            <option value="CATORCENAL">{t("Catorcenal · 14 días")}</option>
            <option value="QUINCENAL">{t("Quincenal · 15 días")}</option>
            <option value="MENSUAL">{t("Mensual · 30 días")}</option>
          </Seleccion>
        </Campo>

        <Campo etiqueta={t("Inicio del periodo")} requerido error={errores.fechaInicio}>
          <Entrada
            type="date"
            value={form.fechaInicio}
            onChange={(e) => cambiar('fechaInicio', e.target.value)}
            error={!!errores.fechaInicio}
          />
        </Campo>

        <Campo etiqueta={t("Fin del periodo")} requerido error={errores.fechaFin}>
          <Entrada
            type="date"
            value={form.fechaFin}
            onChange={(e) => cambiar('fechaFin', e.target.value)}
            error={!!errores.fechaFin}
          />
        </Campo>

        <div className="col-span-2">
          <Campo
            etiqueta={t("Fecha de pago")} requerido error={errores.fechaPago}
            ayuda={t("Cuándo se deposita, que puede ser distinto al fin del periodo")}
          >
            <Entrada
              type="date"
              value={form.fechaPago}
              onChange={(e) => cambiar('fechaPago', e.target.value)}
              error={!!errores.fechaPago}
            />
          </Campo>
        </div>
      </div>
    </Modal>
  );
}
