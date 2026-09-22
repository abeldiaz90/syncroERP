"use client";
/**
 * ============================================================================
 * SyncroERP · Recursos humanos — empleados
 * ============================================================================
 */

import { useState } from 'react';
import { Plus, Search, UserRound, Pencil } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, fecha } from '@/lib/format';
import { useDatos } from '@/hooks/use-datos';
import {
  Boton, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';
import { AsistenteEmpleado } from '../components/AsistenteEmpleado';

interface Empleado {
  id: string; numeroEmpleado: string; nombreCompleto: string;
  puesto?: { nombre: string };
  fechaIngreso: string;
  /*
   * Puede NO venir. El servidor lo recorta para los roles que no ven nomina
   * —gerencia y direccion tienen RRHH en consulta— y hay que distinguir «no
   * tengo acceso» de «gana cero», que es una cifra y seria falsa.
   */
  salarioDiario?: number | null;
  regimenPago: string; estado: string;
  email?: string; telefono?: string;
}

interface Puesto { id: string; clave: string; nombre: string }

interface Resumen {
  totalEmpleados: number;
  bajasHistoricas: number;
  nominaMensualEstimada: number | null;
  salarioPromedioDiario: number | null;
  incidenciasRecientes: number;
}

const TONO: Record<string, 'exito' | 'alerta' | 'info' | 'peligro' | 'neutro'> = {
  ACTIVO: 'exito',
  VACACIONES: 'info',
  INCAPACIDAD: 'alerta',
  PERMISO: 'neutro',
  BAJA: 'peligro',
};

const ETIQUETA: Record<string, string> = {
  ACTIVO: 'Activo',
  VACACIONES: 'De vacaciones',
  INCAPACIDAD: 'Incapacidad',
  PERMISO: 'Con permiso',
  BAJA: 'Baja',
};

export default function EmpleadosPage() {
  const { avisar } = useAvisos();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | undefined>();

  const empleados = useDatos<Empleado[]>(
    () => api.get('/rrhh/empleados', { query: { busqueda, estado } }),
    [busqueda, estado],
  );
  const resumen = useDatos<Resumen>(() => api.get('/rrhh/resumen'), []);
  const puestos = useDatos<Puesto[]>(() => api.get('/rrhh/puestos'), []);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <EncabezadoPantalla
        titulo="Empleados"
        descripcion="Plantilla, salarios y situación laboral"
        acciones={
          <Boton variante="primario" icono={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalAbierto(true)}>
            Dar de alta
          </Boton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Plantilla actual" color="#db2777" cargando={resumen.cargando}
          icono={<UserRound className="w-4 h-4" />}
          valor={resumen.datos?.totalEmpleados ?? 0}
          detalle={`${resumen.datos?.bajasHistoricas ?? 0} bajas históricas`}
        />
        {/*
          * `null` significa «tu rol no ve nómina»; 0 significa «no hay nadie».
          * Pintar $0.00 en el primer caso es afirmar algo falso, y con la
          * plantilla pequeña el promedio ES el sueldo de una persona: por eso
          * el servidor no lo manda y aquí no se inventa.
          */}
        <Indicador
          etiqueta="Nómina mensual estimada" color="#0f172a" cargando={resumen.cargando}
          valor={resumen.datos?.nominaMensualEstimada == null ? "—" : dinero(resumen.datos.nominaMensualEstimada)}
          detalle={resumen.datos?.nominaMensualEstimada == null ? "no visible para tu rol" : "sólo sueldo base"}
        />
        <Indicador
          etiqueta="Salario diario promedio" color="#4f46e5" cargando={resumen.cargando}
          valor={resumen.datos?.salarioPromedioDiario == null ? "—" : dinero(resumen.datos.salarioPromedioDiario)}
          detalle={resumen.datos?.salarioPromedioDiario == null ? "no visible para tu rol" : undefined}
        />
        <Indicador
          etiqueta="Incidencias del mes" color="#d97706" cargando={resumen.cargando}
          valor={resumen.datos?.incidenciasRecientes ?? 0}
          detalle="últimos 30 días"
        />
      </div>

      <Panel sinRelleno>
        <div className="panel-cabecera">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Entrada
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, número o RFC"
                className="pl-8"
              />
            </div>
            <Seleccion value={estado} onChange={(e) => setEstado(e.target.value)} className="w-44">
              <option value="">Todos</option>
              {Object.entries(ETIQUETA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Seleccion>
          </div>
          <p className="text-[12px] text-slate-500 cifra">
            {empleados.datos?.length ?? 0} empleados
          </p>
        </div>

        {empleados.cargando ? (
          <Cargando />
        ) : empleados.error ? (
          <ErrorPantalla mensaje={empleados.error} onReintentar={empleados.recargar} />
        ) : (empleados.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo={busqueda || estado ? 'Nadie coincide con el filtro' : 'La plantilla está vacía'}
            descripcion={
              busqueda || estado
                ? 'Prueba con otro término o quita el filtro.'
                : 'Da de alta a tu personal para poder registrar asistencia y calcular nómina.'
            }
            icono={<UserRound className="w-5 h-5" />}
            accion={
              !busqueda && !estado
                ? <Boton variante="primario" onClick={() => setModalAbierto(true)}>Dar de alta al primero</Boton>
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Empleado</th>
                  <th>Puesto</th>
                  <th>Ingreso</th>
                  <th className="text-right">Salario diario</th>
                  <th>Pago</th>
                  <th>Situación</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {empleados.datos!.map((e) => (
                  <tr key={e.id}>
                    <td className="cifra font-semibold text-slate-900">{e.numeroEmpleado}</td>
                    <td>
                      <p className="text-slate-900">{e.nombreCompleto}</p>
                      {(e.email || e.telefono) && (
                        <p className="text-[11px] text-slate-400">{e.email || e.telefono}</p>
                      )}
                    </td>
                    <td className="text-slate-500">{e.puesto?.nombre ?? '—'}</td>
                    <td className="cifra text-slate-500">{fecha(e.fechaIngreso)}</td>
                    <td className="text-right cifra">{e.salarioDiario == null ? <span className="text-slate-400" title="Tu rol no tiene acceso a la compensación">—</span> : dinero(e.salarioDiario)}</td>
                    <td className="text-slate-500 text-[12px]">{e.regimenPago}</td>
                    <td>
                      <Distintivo tono={TONO[e.estado] ?? 'neutro'}>
                        {ETIQUETA[e.estado] ?? e.estado}
                      </Distintivo>
                    </td>
                    <td className="text-right">
                      <Boton variante="neutro" icono={<Pencil className="w-3.5 h-3.5" />} onClick={() => { setEditandoId(e.id); setModalAbierto(true); }}>
                        Editar
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <AsistenteEmpleado
        abierto={modalAbierto}
        empleadoId={editandoId}
        puestosIniciales={puestos.datos ?? []}
        onCerrar={() => { setModalAbierto(false); setEditandoId(undefined); }}
        onGuardado={(mensaje) => {
          avisar(mensaje, 'exito');
          setModalAbierto(false);
          setEditandoId(undefined);
          void empleados.recargar();
          void resumen.recargar();
          void puestos.recargar();
        }}
      />
    </div>
  );
}
