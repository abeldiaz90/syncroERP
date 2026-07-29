"use client";
/**
 * ============================================================================
 * SyncroERP · Recursos humanos — empleados
 * ============================================================================
 */

import { useState } from 'react';
import { Plus, Search, UserRound } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, fecha } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Empleado {
  id: string; numeroEmpleado: string; nombreCompleto: string;
  puesto?: { nombre: string };
  fechaIngreso: string; salarioDiario: number;
  regimenPago: string; estado: string;
  email?: string; telefono?: string;
}

interface Puesto { id: string; clave: string; nombre: string }

interface Resumen {
  totalEmpleados: number;
  bajasHistoricas: number;
  nominaMensualEstimada: number;
  salarioPromedioDiario: number;
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

  const empleados = useDatos<Empleado[]>(
    () => api.get('/rrhh/empleados', { query: { busqueda, estado } }),
    [busqueda, estado],
  );
  const resumen = useDatos<Resumen>(() => api.get('/rrhh/resumen'), []);
  const puestos = useDatos<Puesto[]>(() => api.get('/rrhh/puestos'), []);

  const guardar = useAccion(async (datos: Record<string, unknown>) => {
    const e = await api.post<Empleado>('/rrhh/empleados', datos);
    avisar(`Empleado ${e.numeroEmpleado} dado de alta.`, 'exito');
    setModalAbierto(false);
    void empleados.recargar();
    void resumen.recargar();
    return e;
  });

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
        <Indicador
          etiqueta="Nómina mensual estimada" color="#0f172a" cargando={resumen.cargando}
          valor={dinero(resumen.datos?.nominaMensualEstimada)}
          detalle="sólo sueldo base"
        />
        <Indicador
          etiqueta="Salario diario promedio" color="#4f46e5" cargando={resumen.cargando}
          valor={dinero(resumen.datos?.salarioPromedioDiario)}
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
                    <td className="text-right cifra">{dinero(e.salarioDiario)}</td>
                    <td className="text-slate-500 text-[12px]">{e.regimenPago}</td>
                    <td>
                      <Distintivo tono={TONO[e.estado] ?? 'neutro'}>
                        {ETIQUETA[e.estado] ?? e.estado}
                      </Distintivo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ModalAltaEmpleado
        abierto={modalAbierto}
        puestos={puestos.datos ?? []}
        guardando={guardar.ejecutando}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={(d) => void guardar.ejecutar(d).catch(() => {})}
      />
    </div>
  );
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

function ModalAltaEmpleado({
  abierto, puestos, guardando, onCerrar, onGuardar,
}: {
  abierto: boolean;
  puestos: Puesto[];
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    nombres: '', apellidoPaterno: '', apellidoMaterno: '',
    curp: '', rfc: '', nss: '',
    email: '', telefono: '',
    puestoId: '', fechaIngreso: '', salarioDiario: '',
    regimenPago: 'QUINCENAL', tipoContrato: 'INDETERMINADO',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});

  const cambiar = (c: string, v: string) => {
    setForm((f) => ({ ...f, [c]: v }));
    setErrores((e) => ({ ...e, [c]: '' }));
  };

  const enviar = () => {
    const e: Record<string, string> = {};
    if (!form.nombres.trim()) e.nombres = 'Escribe el nombre.';
    if (!form.apellidoPaterno.trim()) e.apellidoPaterno = 'Escribe el apellido paterno.';
    if (!form.fechaIngreso) e.fechaIngreso = 'Indica la fecha de ingreso.';

    const salario = parseFloat(form.salarioDiario);
    if (!salario || salario <= 0) e.salarioDiario = 'El salario diario debe ser mayor que cero.';

    if (form.curp && form.curp.length !== 18) {
      e.curp = 'La CURP tiene 18 caracteres.';
    }
    if (form.rfc && ![12, 13].includes(form.rfc.length)) {
      e.rfc = 'El RFC tiene 12 o 13 caracteres.';
    }

    setErrores(e);
    if (Object.keys(e).length) return;

    onGuardar({ ...form, salarioDiario: salario });
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Dar de alta un empleado"
      descripcion="El número de empleado se asigna solo si lo dejas vacío."
      ancho={640}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>Dar de alta</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="eyebrow mb-2.5">Identidad</p>
          <div className="grid grid-cols-3 gap-3">
            <Campo etiqueta="Nombres" requerido error={errores.nombres}>
              <Entrada value={form.nombres} onChange={(e) => cambiar('nombres', e.target.value)} error={!!errores.nombres} />
            </Campo>
            <Campo etiqueta="Apellido paterno" requerido error={errores.apellidoPaterno}>
              <Entrada value={form.apellidoPaterno} onChange={(e) => cambiar('apellidoPaterno', e.target.value)} error={!!errores.apellidoPaterno} />
            </Campo>
            <Campo etiqueta="Apellido materno">
              <Entrada value={form.apellidoMaterno} onChange={(e) => cambiar('apellidoMaterno', e.target.value)} />
            </Campo>

            <Campo etiqueta="CURP" error={errores.curp}>
              <Entrada
                value={form.curp}
                onChange={(e) => cambiar('curp', e.target.value.toUpperCase())}
                error={!!errores.curp}
                maxLength={18}
              />
            </Campo>
            <Campo etiqueta="RFC" error={errores.rfc}>
              <Entrada
                value={form.rfc}
                onChange={(e) => cambiar('rfc', e.target.value.toUpperCase())}
                error={!!errores.rfc}
                maxLength={13}
              />
            </Campo>
            <Campo etiqueta="NSS" ayuda="Número de seguridad social">
              <Entrada value={form.nss} onChange={(e) => cambiar('nss', e.target.value)} maxLength={11} />
            </Campo>
          </div>
        </div>

        <div>
          <p className="eyebrow mb-2.5">Contacto</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Correo">
              <Entrada type="email" value={form.email} onChange={(e) => cambiar('email', e.target.value)} />
            </Campo>
            <Campo etiqueta="Teléfono">
              <Entrada value={form.telefono} onChange={(e) => cambiar('telefono', e.target.value)} />
            </Campo>
          </div>
        </div>

        <div>
          <p className="eyebrow mb-2.5">Relación laboral</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Puesto">
              <Seleccion value={form.puestoId} onChange={(e) => cambiar('puestoId', e.target.value)}>
                <option value="">Sin asignar</option>
                {puestos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Seleccion>
            </Campo>

            <Campo etiqueta="Fecha de ingreso" requerido error={errores.fechaIngreso}>
              <Entrada
                type="date"
                value={form.fechaIngreso}
                onChange={(e) => cambiar('fechaIngreso', e.target.value)}
                error={!!errores.fechaIngreso}
              />
            </Campo>

            <Campo
              etiqueta="Salario diario" requerido error={errores.salarioDiario}
              ayuda="El salario base de cotización se estima solo"
            >
              <Entrada
                type="number" step="0.01" min="0"
                value={form.salarioDiario}
                onChange={(e) => cambiar('salarioDiario', e.target.value)}
                error={!!errores.salarioDiario}
                placeholder="0.00"
              />
            </Campo>

            <Campo etiqueta="Periodicidad de pago">
              <Seleccion value={form.regimenPago} onChange={(e) => cambiar('regimenPago', e.target.value)}>
                <option value="SEMANAL">Semanal</option>
                <option value="CATORCENAL">Catorcenal</option>
                <option value="QUINCENAL">Quincenal</option>
                <option value="MENSUAL">Mensual</option>
              </Seleccion>
            </Campo>

            <div className="col-span-2">
              <Campo etiqueta="Tipo de contrato">
                <Seleccion value={form.tipoContrato} onChange={(e) => cambiar('tipoContrato', e.target.value)}>
                  <option value="INDETERMINADO">Por tiempo indeterminado</option>
                  <option value="DETERMINADO">Por tiempo determinado</option>
                  <option value="POR_OBRA">Por obra determinada</option>
                  <option value="CAPACITACION">Capacitación inicial</option>
                  <option value="HONORARIOS">Honorarios</option>
                </Seleccion>
              </Campo>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
