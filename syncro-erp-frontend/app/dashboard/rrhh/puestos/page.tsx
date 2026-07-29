"use client";
/**
 * ============================================================================
 * SyncroERP · Recursos humanos — puestos y salarios
 * ----------------------------------------------------------------------------
 * El puesto define el rango salarial y las plazas autorizadas. Mostrar la
 * ocupación contra lo autorizado es lo que convierte esta pantalla en algo
 * útil: sin eso es un catálogo más.
 * ============================================================================
 */

import { useMemo, useState } from 'react';
import { BriefcaseBusiness, Plus, Search } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Modal, Panel, SinDatos, useAvisos,
} from '@/components/ui';

interface Puesto {
  id: string;
  clave: string;
  nombre: string;
  descripcion?: string;
  salarioMinimo: number;
  salarioMaximo: number;
  plazasAutorizadas: number;
  activo: boolean;
}

interface Empleado {
  id: string; puestoId?: string; estado: string; salarioDiario: number;
}

export default function PuestosPage() {
  const { avisar } = useAvisos();
  const [busqueda, setBusqueda] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);

  const puestos = useDatos<Puesto[]>(() => api.get('/rrhh/puestos'), []);
  const empleados = useDatos<Empleado[]>(() => api.get('/rrhh/empleados'), []);

  const crear = useAccion(async (datos: Record<string, unknown>) => {
    const p = await api.post<Puesto>('/rrhh/puestos', datos);
    avisar(`Puesto ${p.clave} creado.`, 'exito');
    setModalAbierto(false);
    void puestos.recargar();
    return p;
  });

  /** Ocupación real por puesto, contra las plazas autorizadas. */
  const ocupacion = useMemo(() => {
    const mapa = new Map<string, { ocupadas: number; salarioPromedio: number }>();
    const activos = (empleados.datos ?? []).filter((e) => e.estado !== 'BAJA');

    for (const e of activos) {
      if (!e.puestoId) continue;
      const acc = mapa.get(e.puestoId) ?? { ocupadas: 0, salarioPromedio: 0 };
      acc.salarioPromedio =
        (acc.salarioPromedio * acc.ocupadas + Number(e.salarioDiario)) / (acc.ocupadas + 1);
      acc.ocupadas += 1;
      mapa.set(e.puestoId, acc);
    }
    return mapa;
  }, [empleados.datos]);

  const filtrados = (puestos.datos ?? []).filter(
    (p) =>
      !busqueda ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.clave.toLowerCase().includes(busqueda.toLowerCase()),
  );

  const sinAsignar = (empleados.datos ?? []).filter(
    (e) => e.estado !== 'BAJA' && !e.puestoId,
  ).length;

  return (
    <div className="p-6 max-w-[1300px] mx-auto">
      <EncabezadoPantalla
        titulo="Puestos y salarios"
        descripcion="Tabulador, plazas autorizadas y ocupación real"
        acciones={
          <Boton variante="primario" icono={<Plus className="w-3.5 h-3.5" />} onClick={() => setModalAbierto(true)}>
            Nuevo puesto
          </Boton>
        }
      />

      {sinAsignar > 0 && (
        <div className="panel p-3.5 mb-4 border-l-[3px] border-l-amber-400">
          <p className="text-[12.5px] text-slate-700">
            <span className="font-semibold">{sinAsignar}</span>{' '}
            {sinAsignar === 1 ? 'empleado activo no tiene puesto asignado' : 'empleados activos no tienen puesto asignado'}.
            Sin puesto no hay tabulador contra el cual comparar su salario.
          </p>
        </div>
      )}

      <Panel sinRelleno>
        <div className="panel-cabecera">
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Entrada
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por clave o nombre"
              className="pl-8"
            />
          </div>
          <p className="text-[12px] text-slate-500 cifra">{filtrados.length} puestos</p>
        </div>

        {puestos.cargando ? (
          <Cargando />
        ) : puestos.error ? (
          <ErrorPantalla mensaje={puestos.error} onReintentar={puestos.recargar} />
        ) : filtrados.length === 0 ? (
          <SinDatos
            titulo={busqueda ? 'Ningún puesto coincide' : 'Todavía no hay puestos definidos'}
            descripcion={
              busqueda
                ? 'Prueba con otro término.'
                : 'Define los puestos para poder asignarlos a los empleados y comparar salarios contra el tabulador.'
            }
            icono={<BriefcaseBusiness className="w-5 h-5" />}
            accion={
              !busqueda
                ? <Boton variante="primario" onClick={() => setModalAbierto(true)}>Crear el primero</Boton>
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Clave</th>
                  <th>Puesto</th>
                  <th className="text-right">Mínimo</th>
                  <th className="text-right">Máximo</th>
                  <th className="text-right">Promedio actual</th>
                  <th className="text-center">Ocupación</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const o = ocupacion.get(p.id);
                  const ocupadas = o?.ocupadas ?? 0;
                  const autorizadas = p.plazasAutorizadas;
                  const excedido = autorizadas > 0 && ocupadas > autorizadas;
                  const promedio = o?.salarioPromedio ?? 0;

                  // ¿El promedio real se sale del tabulador?
                  const fueraDeRango =
                    promedio > 0 &&
                    ((Number(p.salarioMinimo) > 0 && promedio < Number(p.salarioMinimo)) ||
                     (Number(p.salarioMaximo) > 0 && promedio > Number(p.salarioMaximo)));

                  return (
                    <tr key={p.id}>
                      <td className="cifra font-semibold text-slate-900">{p.clave}</td>
                      <td>
                        <p className="text-slate-900">{p.nombre}</p>
                        {p.descripcion && (
                          <p className="text-[11px] text-slate-400 line-clamp-1">{p.descripcion}</p>
                        )}
                      </td>
                      <td className="text-right cifra text-slate-600">
                        {Number(p.salarioMinimo) > 0 ? dinero(p.salarioMinimo) : '—'}
                      </td>
                      <td className="text-right cifra text-slate-600">
                        {Number(p.salarioMaximo) > 0 ? dinero(p.salarioMaximo) : '—'}
                      </td>
                      <td className="text-right cifra">
                        {promedio > 0 ? (
                          <span
                            className={fueraDeRango ? 'text-amber-700 font-semibold' : 'text-slate-900'}
                            title={fueraDeRango ? 'El promedio real queda fuera del tabulador' : undefined}
                          >
                            {dinero(promedio)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="text-center">
                        <span className={`cifra text-[12px] ${excedido ? 'text-rose-600 font-semibold' : 'text-slate-600'}`}>
                          {ocupadas}
                          {autorizadas > 0 && <span className="text-slate-400"> / {autorizadas}</span>}
                        </span>
                      </td>
                      <td>
                        {excedido ? (
                          <Distintivo tono="peligro">Sobre plaza</Distintivo>
                        ) : p.activo ? (
                          <Distintivo tono="exito">Activo</Distintivo>
                        ) : (
                          <Distintivo tono="neutro">Inactivo</Distintivo>
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

      <ModalNuevoPuesto
        abierto={modalAbierto}
        guardando={crear.ejecutando}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={(d) => void crear.ejecutar(d).catch(() => {})}
      />
    </div>
  );
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

function ModalNuevoPuesto({
  abierto, guardando, onCerrar, onGuardar,
}: {
  abierto: boolean;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    clave: '', nombre: '', descripcion: '',
    salarioMinimo: '', salarioMaximo: '', plazasAutorizadas: '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});

  const cambiar = (c: string, v: string) => {
    setForm((f) => ({ ...f, [c]: v }));
    setErrores((e) => ({ ...e, [c]: '' }));
  };

  const enviar = () => {
    const e: Record<string, string> = {};
    if (!form.clave.trim()) e.clave = 'La clave identifica al puesto.';
    if (!form.nombre.trim()) e.nombre = 'Escribe el nombre del puesto.';

    const min = parseFloat(form.salarioMinimo || '0');
    const max = parseFloat(form.salarioMaximo || '0');
    if (min > 0 && max > 0 && max < min) {
      e.salarioMaximo = 'El máximo no puede ser menor que el mínimo.';
    }

    setErrores(e);
    if (Object.keys(e).length) return;

    onGuardar({
      clave: form.clave.trim().toUpperCase(),
      nombre: form.nombre.trim(),
      descripcion: form.descripcion || undefined,
      salarioMinimo: min,
      salarioMaximo: max,
      plazasAutorizadas: parseInt(form.plazasAutorizadas || '0', 10),
    });
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nuevo puesto"
      ancho={560}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>Crear puesto</Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <Campo etiqueta="Clave" requerido error={errores.clave} ayuda="Corta y única: GTE, AUX, CAJ">
          <Entrada
            value={form.clave}
            onChange={(e) => cambiar('clave', e.target.value.toUpperCase())}
            error={!!errores.clave}
            maxLength={20}
            placeholder="GTE"
          />
        </Campo>

        <Campo etiqueta="Plazas autorizadas" ayuda="0 = sin límite">
          <Entrada
            type="number" min="0"
            value={form.plazasAutorizadas}
            onChange={(e) => cambiar('plazasAutorizadas', e.target.value)}
            placeholder="0"
          />
        </Campo>

        <div className="col-span-2">
          <Campo etiqueta="Nombre del puesto" requerido error={errores.nombre}>
            <Entrada
              value={form.nombre}
              onChange={(e) => cambiar('nombre', e.target.value)}
              error={!!errores.nombre}
              placeholder="Gerente de sucursal"
            />
          </Campo>
        </div>

        <Campo etiqueta="Salario diario mínimo">
          <Entrada
            type="number" step="0.01" min="0"
            value={form.salarioMinimo}
            onChange={(e) => cambiar('salarioMinimo', e.target.value)}
            placeholder="0.00"
          />
        </Campo>

        <Campo etiqueta="Salario diario máximo" error={errores.salarioMaximo}>
          <Entrada
            type="number" step="0.01" min="0"
            value={form.salarioMaximo}
            onChange={(e) => cambiar('salarioMaximo', e.target.value)}
            error={!!errores.salarioMaximo}
            placeholder="0.00"
          />
        </Campo>

        <div className="col-span-2">
          <Campo etiqueta="Descripción">
            <textarea
              className="campo"
              value={form.descripcion}
              onChange={(e) => cambiar('descripcion', e.target.value)}
              placeholder="Responsabilidades principales del puesto"
            />
          </Campo>
        </div>
      </div>
    </Modal>
  );
}
