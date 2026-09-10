"use client";
/**
 * ============================================================================
 * SyncroERP · CRM — oportunidades
 * ----------------------------------------------------------------------------
 * El pipeline sirve para trabajar el día a día; esta pantalla sirve para
 * analizar. Por eso es una tabla ordenable con métricas de conversión arriba
 * y los motivos de pérdida abajo: lo más accionable de todo el módulo es saber
 * por qué se pierden los negocios.
 * ============================================================================
 */

import { useMemo, useState } from 'react';
import { Briefcase, Clock, Search, TrendingDown, Trophy } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, fecha, isoCorto, porcentaje } from '@/lib/format';
import { useDatos } from '@/hooks/use-datos';
import {
  Cargando, Distintivo, Entrada, EncabezadoPantalla, ErrorPantalla,
  Indicador, Panel, Seleccion, SinDatos,
} from '@/components/ui';

interface Etapa { id: string; nombre: string; color: string; tipo: string; probabilidad: number }

interface Oportunidad {
  id: string;
  folio: string;
  titulo: string;
  importe: number;
  probabilidad: number;
  valorPonderado: number;
  diasEnEtapa: number;
  estancada: boolean;
  fechaCierreEstimada?: string;
  fechaCierreReal?: string;
  motivoPerdida?: string;
  nombreResponsable?: string;
  etapa?: Etapa;
  prospecto?: { nombre: string; empresa?: string };
}

interface Metricas {
  ganadas: number;
  perdidas: number;
  tasaConversion: number;
  importeGanado: number;
  importePerdido: number;
  ticketPromedio: number;
  cicloPromedioDias: number;
  motivosPerdida: Array<{ motivo: string; cantidad: number }>;
  diasPromedioPorEtapa: Array<{ etapa: string; dias: number }>;
}

type Orden = 'importe' | 'reciente' | 'estancada' | 'cierre';

export default function OportunidadesPage() {
  const hoy = new Date();
  const inicioAnio = isoCorto(new Date(hoy.getFullYear(), 0, 1));

  const [busqueda, setBusqueda] = useState('');
  const [etapaId, setEtapaId] = useState('');
  const [orden, setOrden] = useState<Orden>('importe');
  const [desde, setDesde] = useState(inicioAnio);
  const [hasta, setHasta] = useState(isoCorto());

  const etapas = useDatos<Etapa[]>(() => api.get('/crm/etapas'), []);
  const oportunidades = useDatos<Oportunidad[]>(
    () => api.get('/crm/oportunidades', { query: { busqueda, etapaId } }),
    [busqueda, etapaId],
  );
  const metricas = useDatos<Metricas>(
    () => api.get('/crm/metricas', { query: { desde, hasta } }),
    [desde, hasta],
  );

  const ordenadas = useMemo(() => {
    const lista = [...(oportunidades.datos ?? [])];
    switch (orden) {
      case 'importe':    return lista.sort((a, b) => Number(b.importe) - Number(a.importe));
      case 'estancada':  return lista.sort((a, b) => b.diasEnEtapa - a.diasEnEtapa);
      case 'cierre':     return lista.sort((a, b) =>
        (a.fechaCierreEstimada ?? '9999').localeCompare(b.fechaCierreEstimada ?? '9999'));
      default:           return lista;
    }
  }, [oportunidades.datos, orden]);

  const totales = useMemo(() => {
    const abiertas = ordenadas.filter((o) => o.etapa?.tipo === 'ABIERTA');
    return {
      cantidad: ordenadas.length,
      importe: abiertas.reduce((s, o) => s + Number(o.importe), 0),
      pronostico: abiertas.reduce((s, o) => s + Number(o.valorPonderado), 0),
    };
  }, [ordenadas]);

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <EncabezadoPantalla
        titulo="Oportunidades"
        descripcion="Análisis del embudo: conversión, ciclo de venta y motivos de pérdida"
      />

      {/* Métricas del periodo */}
      <div className="flex items-center gap-2 mb-3">
        <span className="eyebrow">Resultados del periodo</span>
        <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-36 h-7 text-[12px]" />
        <span className="text-slate-300 text-[12px]">a</span>
        <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-36 h-7 text-[12px]" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Tasa de conversión" color="#059669" cargando={metricas.cargando}
          icono={<Trophy className="w-4 h-4" />}
          valor={porcentaje(metricas.datos?.tasaConversion ?? 0)}
          detalle={`${metricas.datos?.ganadas ?? 0} ganadas · ${metricas.datos?.perdidas ?? 0} perdidas`}
        />
        <Indicador
          etiqueta="Importe ganado" color="#0f172a" cargando={metricas.cargando}
          valor={dinero(metricas.datos?.importeGanado)}
          detalle={`ticket promedio ${dinero(metricas.datos?.ticketPromedio)}`}
        />
        <Indicador
          etiqueta="Importe perdido" color="#e11d48" cargando={metricas.cargando}
          icono={<TrendingDown className="w-4 h-4" />}
          valor={dinero(metricas.datos?.importePerdido)}
        />
        <Indicador
          etiqueta="Ciclo de venta" color="#ea580c" cargando={metricas.cargando}
          icono={<Clock className="w-4 h-4" />}
          valor={`${metricas.datos?.cicloPromedioDias ?? 0} días`}
          detalle="de creación a cierre ganado"
        />
      </div>

      {/* Listado */}
      <Panel sinRelleno className="mb-4">
        <div className="panel-cabecera flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Entrada
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Título, folio o prospecto"
                className="pl-8"
              />
            </div>
            <Seleccion value={etapaId} onChange={(e) => setEtapaId(e.target.value)} className="w-44">
              <option value="">Todas las etapas</option>
              {(etapas.datos ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </Seleccion>
            <Seleccion value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className="w-48">
              <option value="importe">Mayor importe primero</option>
              <option value="estancada">Más tiempo sin moverse</option>
              <option value="cierre">Cierre más próximo</option>
              <option value="reciente">Actividad reciente</option>
            </Seleccion>
          </div>
          <p className="text-[12px] text-slate-500 cifra">
            {totales.cantidad} oportunidades · abiertas {dinero(totales.importe)} ·
            pronóstico <span className="font-semibold text-slate-900">{dinero(totales.pronostico)}</span>
          </p>
        </div>

        {oportunidades.cargando ? (
          <Cargando />
        ) : oportunidades.error ? (
          <ErrorPantalla mensaje={oportunidades.error} onReintentar={oportunidades.recargar} />
        ) : ordenadas.length === 0 ? (
          <SinDatos
            titulo={busqueda || etapaId ? 'Nada coincide con el filtro' : 'Todavía no hay oportunidades'}
            descripcion={
              busqueda || etapaId
                ? 'Prueba con otro término o quita el filtro de etapa.'
                : 'Créalas desde el Pipeline para empezar a medir tu embudo.'
            }
            icono={<Briefcase className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Oportunidad</th>
                  <th>Prospecto</th>
                  <th>Etapa</th>
                  <th className="text-right">Importe</th>
                  <th className="text-right">Prob.</th>
                  <th className="text-right">Ponderado</th>
                  <th className="text-right">Días</th>
                  <th>Cierre</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((o) => {
                  const cerrada = o.etapa?.tipo !== 'ABIERTA';
                  const ganada = o.etapa?.tipo === 'GANADA';

                  return (
                    <tr key={o.id} className={cerrada ? 'opacity-70' : ''}>
                      <td className="cifra font-semibold text-slate-900">{o.folio}</td>
                      <td>
                        <p className="text-slate-900">{o.titulo}</p>
                        {o.motivoPerdida && (
                          <p className="text-[11px] text-rose-500">Perdida: {o.motivoPerdida}</p>
                        )}
                      </td>
                      <td className="text-slate-500">
                        {o.prospecto?.empresa || o.prospecto?.nombre || '—'}
                      </td>
                      <td>
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px]"
                          style={{ color: o.etapa?.color }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: o.etapa?.color }}
                          />
                          {o.etapa?.nombre ?? '—'}
                        </span>
                      </td>
                      <td className="text-right cifra font-semibold text-slate-900">
                        {dinero(o.importe)}
                      </td>
                      <td className="text-right cifra text-slate-500">{o.probabilidad}%</td>
                      <td className="text-right cifra text-slate-600">
                        {cerrada ? '—' : dinero(o.valorPonderado)}
                      </td>
                      <td className="text-right cifra">
                        {cerrada ? (
                          <span className="text-slate-300">—</span>
                        ) : o.estancada ? (
                          <span className="text-rose-600 font-semibold" title="Lleva más días de los esperados en esta etapa">
                            {o.diasEnEtapa}
                          </span>
                        ) : (
                          <span className="text-slate-500">{o.diasEnEtapa}</span>
                        )}
                      </td>
                      <td>
                        {cerrada ? (
                          <Distintivo tono={ganada ? 'exito' : 'peligro'}>
                            {ganada ? 'Ganada' : 'Perdida'} {fecha(o.fechaCierreReal)}
                          </Distintivo>
                        ) : (
                          <span className="cifra text-[12px] text-slate-500">
                            {o.fechaCierreEstimada ? fecha(o.fechaCierreEstimada) : 'sin fecha'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Diagnóstico del embudo */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Panel sinRelleno titulo="Por qué se pierden los negocios">
          {metricas.cargando ? (
            <Cargando filas={3} />
          ) : (metricas.datos?.motivosPerdida?.length ?? 0) === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-slate-400">
              Sin pérdidas registradas en el periodo.
            </p>
          ) : (
            <table className="tabla">
              <thead>
                <tr><th>Motivo</th><th className="text-right">Casos</th></tr>
              </thead>
              <tbody>
                {metricas.datos!.motivosPerdida.map((m) => (
                  <tr key={m.motivo}>
                    <td className="text-slate-800">{m.motivo}</td>
                    <td className="text-right cifra font-semibold text-slate-900">{m.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel sinRelleno titulo="Dónde se atoran">
          {metricas.cargando ? (
            <Cargando filas={3} />
          ) : (metricas.datos?.diasPromedioPorEtapa?.length ?? 0) === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-slate-400">
              Aún no hay suficiente historial para medir tiempos por etapa.
            </p>
          ) : (
            <table className="tabla">
              <thead>
                <tr><th>Etapa</th><th className="text-right">Días en promedio</th></tr>
              </thead>
              <tbody>
                {metricas.datos!.diasPromedioPorEtapa.map((d) => (
                  <tr key={d.etapa}>
                    <td className="text-slate-800">{d.etapa}</td>
                    <td className="text-right cifra font-semibold text-slate-900">{d.dias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
