"use client";
/**
 * ============================================================================
 * SyncroERP · Recursos humanos — asistencia
 * ----------------------------------------------------------------------------
 * Se captura por día, no por empleado: así es como funciona en la realidad.
 * Alguien abre la pantalla en la mañana y va marcando entradas conforme llega
 * la gente, y en la tarde marca salidas. Por eso los botones "Marcar ahora"
 * están directamente en la fila, sin abrir nada.
 *
 * Las horas trabajadas y extra las calcula el servidor: la jornada legal
 * diurna son 8 horas, y lo que pase de ahí es tiempo extraordinario.
 * ============================================================================
 */

import { useMemo, useState } from 'react';
import { CalendarDays, Clock, LogIn, LogOut } from 'lucide-react';

import { api } from '@/lib/api';
import { isoCorto } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Cargando, Campo, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Panel, SinDatos,
} from '@/components/ui';

interface Empleado {
  id: string; numeroEmpleado: string; nombreCompleto: string; estado: string;
}

interface Asistencia {
  id: string;
  empleadoId: string;
  fecha: string;
  entrada?: string;
  salida?: string;
  horasTrabajadas: number;
  horasExtra: number;
  minutosRetardo: number;
  observaciones?: string;
}

/*
 * La jornada de referencia. El pie de la pantalla ya dice «las horas extra se
 * calculan sobre una jornada de 8 horas», asi que la etiqueta usa la misma
 * cifra en vez de inventarse otra.
 */
const JORNADA_BASE = 8;

/** "2026-07-28T08:15:00" → "08:15" */
function hora(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Combina la fecha del día con una hora "HH:MM" en un ISO local. */
function combinar(fecha: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(fecha + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 19);
}

function ahoraHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AsistenciaPage() {
  const [dia, setDia] = useState(isoCorto());

  const empleados = useDatos<Empleado[]>(
    () => api.get('/rrhh/empleados', { query: { estado: 'ACTIVO' } }),
    [],
  );

  const asistencias = useDatos<Asistencia[]>(
    () => api.get('/rrhh/asistencia', { query: { desde: dia, hasta: dia } }),
    [dia],
  );

  const registrar = useAccion(async (
    empleadoId: string,
    campo: 'entrada' | 'salida',
    hhmm: string,
  ) => {
    await api.post('/rrhh/asistencia', {
      empleadoId,
      fecha: dia,
      [campo]: combinar(dia, hhmm),
    });
    void asistencias.recargar();
  });

  /*
   * El `.catch(() => {})` que habia aqui se comia el error.
   *
   * `useAccion` guarda el mensaje en `registrar.error` y lo relanza, pero esta
   * pantalla no pintaba ese estado en ningun sitio y `avisar` estaba importado
   * sin usarse: se marcaba la salida, el servidor contestaba 400 —«La hora de
   * salida debe ser posterior a la de entrada», que pasa si entrada y salida
   * caen en el mismo minuto— y en pantalla no ocurria absolutamente nada. La
   * fila seguia diciendo «Dentro» y quien marcaba no tenia forma de saber que
   * su clic no habia servido.
   */
  const marcar = async (
    empleadoId: string,
    campo: 'entrada' | 'salida',
    hhmm: string,
  ) => {
    // El aviso de fallo lo pone `useAccion`: al no pintarse `registrar.error`
    // en ningun sitio de esta pantalla, el hook lo anuncia por su cuenta.
    await registrar.ejecutar(empleadoId, campo, hhmm);
  };

  /** Índice por empleado para no recorrer el arreglo en cada fila. */
  const porEmpleado = useMemo(() => {
    const m = new Map<string, Asistencia>();
    for (const a of asistencias.datos ?? []) m.set(a.empleadoId, a);
    return m;
  }, [asistencias.datos]);

  const resumen = useMemo(() => {
    const lista = empleados.datos ?? [];
    let presentes = 0, completos = 0, extra = 0;

    for (const e of lista) {
      const a = porEmpleado.get(e.id);
      if (a?.entrada) presentes++;
      // Completo es haber cubierto la jornada, no haber marcado salida.
      if (a?.entrada && a?.salida && Number(a.horasTrabajadas) + 0.001 >= JORNADA_BASE) completos++;
      extra += Number(a?.horasExtra ?? 0);
    }
    return {
      plantilla: lista.length,
      presentes,
      completos,
      ausentes: lista.length - presentes,
      horasExtra: Math.round(extra * 100) / 100,
    };
  }, [empleados.datos, porEmpleado]);

  const esHoy = dia === isoCorto();
  const esFuturo = dia > isoCorto();

  return (
    <div className="p-6 max-w-[1300px] mx-auto">
      <EncabezadoPantalla
        titulo="Asistencia"
        descripcion="Registro diario de entradas y salidas"
        acciones={
          <div className="flex items-center gap-2">
            {!esHoy && (
              <Boton variante="neutro" onClick={() => setDia(isoCorto())}>Ir a hoy</Boton>
            )}
            <Entrada
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="w-40"
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Plantilla activa" color="#db2777" cargando={empleados.cargando}
          valor={resumen.plantilla}
        />
        <Indicador
          etiqueta="Con entrada registrada" color="#059669" cargando={asistencias.cargando}
          icono={<LogIn className="w-4 h-4" />}
          valor={resumen.presentes}
          detalle={`${resumen.completos} con jornada completa`}
        />
        <Indicador
          etiqueta="Sin registro" color={resumen.ausentes > 0 ? '#d97706' : '#64748b'}
          cargando={asistencias.cargando}
          valor={resumen.ausentes}
        />
        <Indicador
          etiqueta="Horas extra del día" color="#4f46e5" cargando={asistencias.cargando}
          icono={<Clock className="w-4 h-4" />}
          valor={resumen.horasExtra}
        />
      </div>

      {esFuturo && (
        <div className="panel p-3.5 mb-4 border-l-[3px] border-l-amber-400">
          <p className="text-[12.5px] text-slate-700">
            Estás viendo una fecha futura. Puedes capturar, pero revisa que sea intencional.
          </p>
        </div>
      )}

      <Panel sinRelleno>
        <div className="panel-cabecera">
          <div className="flex items-center gap-2 text-[12.5px] text-slate-600">
            <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
            {new Date(dia + 'T00:00:00').toLocaleDateString('es-MX', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </div>
          <p className="text-[12px] text-slate-500 cifra">
            {resumen.presentes} de {resumen.plantilla} registrados
          </p>
        </div>

        {empleados.cargando || asistencias.cargando ? (
          <Cargando />
        ) : empleados.error ? (
          <ErrorPantalla mensaje={empleados.error} onReintentar={empleados.recargar} />
        ) : (empleados.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo="No hay empleados activos"
            descripcion="Da de alta personal en la pantalla de Empleados para poder registrar su asistencia."
            icono={<LogIn className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Núm.</th>
                  <th>Empleado</th>
                  <th className="text-center">Entrada</th>
                  <th className="text-center">Salida</th>
                  <th className="text-right">Horas</th>
                  <th className="text-right">Extra</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {empleados.datos!.map((e) => {
                  const a = porEmpleado.get(e.id);
                  const conEntrada = !!a?.entrada;
                  const conSalida = !!a?.salida;

                  return (
                    <tr key={e.id}>
                      <td className="cifra text-slate-500">{e.numeroEmpleado}</td>
                      <td className="text-slate-900">{e.nombreCompleto}</td>

                      <td className="text-center">
                        <CeldaHora
                          valor={hora(a?.entrada)}
                          deshabilitado={registrar.ejecutando}
                          onFijar={(hhmm) => void marcar(e.id, 'entrada', hhmm)}
                        />
                      </td>

                      <td className="text-center">
                        <CeldaHora
                          valor={hora(a?.salida)}
                          deshabilitado={registrar.ejecutando || !conEntrada}
                          titulo={!conEntrada ? 'Registra primero la entrada' : undefined}
                          onFijar={(hhmm) => void marcar(e.id, 'salida', hhmm)}
                        />
                      </td>

                      <td className="text-right cifra text-slate-700">
                        {conSalida ? Number(a!.horasTrabajadas).toFixed(2) : '—'}
                      </td>
                      <td className="text-right cifra">
                        {Number(a?.horasExtra ?? 0) > 0 ? (
                          <span className="text-indigo-600 font-semibold">
                            {Number(a!.horasExtra).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td>
                        {/*
                          * «Jornada completa» era simplemente `conSalida`: no
                          * miraba las horas. Con una salida marcada un minuto
                          * despues de la entrada la fila decia «Jornada
                          * completa» con 0.02 horas trabajadas. La etiqueta
                          * afirma algo sobre el tiempo, asi que tiene que
                          * mirarlo.
                          */}
                        {conSalida ? (
                          Number(a!.horasTrabajadas) + 0.001 >= JORNADA_BASE ? (
                            <Distintivo tono="exito">Jornada completa</Distintivo>
                          ) : (
                            <Distintivo tono="alerta">
                              Jornada incompleta
                            </Distintivo>
                          )
                        ) : conEntrada ? (
                          <Distintivo tono="info">Dentro</Distintivo>
                        ) : (
                          <Distintivo tono="neutro">Sin registro</Distintivo>
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

      <p className="text-[11.5px] text-slate-400 mt-3">
        Las horas extra se calculan sobre una jornada de 8 horas. Para justificar faltas
        o registrar incapacidades, usa la pantalla de Incidencias.
      </p>
    </div>
  );
}

/* ── Celda de hora ────────────────────────────────────────────────────────── */

/**
 * Si ya hay hora, la muestra y permite editarla.
 * Si no, ofrece "Marcar" con la hora actual — que es el caso del 95 % de las
 * capturas.
 */
function CeldaHora({
  valor, deshabilitado, titulo, onFijar,
}: {
  valor: string;
  deshabilitado?: boolean;
  titulo?: string;
  onFijar: (hhmm: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);

  if (editando) {
    return (
      <input
        type="time"
        autoFocus
        value={texto}
        onChange={(ev) => setTexto(ev.target.value)}
        onBlur={() => {
          setEditando(false);
          if (texto && texto !== valor) onFijar(texto);
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') ev.currentTarget.blur();
          if (ev.key === 'Escape') { setTexto(valor); setEditando(false); }
        }}
        className="campo h-7 w-24 text-center text-[12px] px-1"
      />
    );
  }

  if (valor) {
    return (
      <button
        onClick={() => { setTexto(valor); setEditando(true); }}
        disabled={deshabilitado}
        className="cifra text-[12.5px] font-semibold text-slate-900 hover:text-indigo-600 transition-colors px-2 py-0.5 rounded hover:bg-slate-100"
        title="Corregir la hora"
      >
        {valor}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={() => onFijar(ahoraHHMM())}
        disabled={deshabilitado}
        title={titulo ?? 'Registrar con la hora actual'}
        className="btn btn-fantasma btn-sm text-[11.5px] disabled:opacity-30"
      >
        <LogOut className="w-3 h-3" /> Marcar
      </button>
      <button
        onClick={() => { setTexto(''); setEditando(true); }}
        disabled={deshabilitado}
        title="Capturar otra hora"
        className="text-slate-300 hover:text-slate-600 text-[15px] leading-none px-1 disabled:opacity-30"
      >
        ·
      </button>
    </div>
  );
}
