"use client";
/**
 * ============================================================================
 * SyncroERP · Activos fijos — registro
 * ============================================================================
 */

import { useMemo, useState } from 'react';
import { Building, Plus, Search } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, fecha, porcentaje } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Activo {
  id: string;
  codigo: string;
  nombre: string;
  categoria?: { nombre: string };
  fechaAdquisicion: string;
  costoAdquisicion: number;
  depreciacionAcumulada: number;
  valorEnLibros: number;
  tasaAnual: number;
  estado: string;
  ubicacion?: string;
}

interface Categoria { id: string; clave: string; nombre: string; tasaAnual: number }

interface Resumen {
  totalActivos: number;
  costoTotal: number;
  depreciacionAcumulada: number;
  valorEnLibros: number;
  totalmenteDepreciados: number;
}

const TONO_ESTADO: Record<string, 'exito' | 'alerta' | 'neutro' | 'peligro'> = {
  ACTIVO: 'exito',
  EN_MANTENIMIENTO: 'alerta',
  TOTALMENTE_DEPRECIADO: 'neutro',
  BAJA: 'peligro',
  VENDIDO: 'peligro',
};

const ETIQUETA_ESTADO: Record<string, string> = {
  ACTIVO: 'En uso',
  EN_MANTENIMIENTO: 'Mantenimiento',
  TOTALMENTE_DEPRECIADO: 'Depreciado',
  BAJA: 'Baja',
  VENDIDO: 'Vendido',
};

export default function RegistroActivosPage() {
  const { avisar } = useAvisos();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);

  const activos = useDatos<Activo[]>(
    () => api.get('/activos', { query: { busqueda, estado } }),
    [busqueda, estado],
  );
  const resumen = useDatos<Resumen>(() => api.get('/activos/resumen'), []);
  const categorias = useDatos<Categoria[]>(() => api.get('/activos/categorias'), []);

  const guardar = useAccion(async (datos: Record<string, unknown>) => {
    const creado = await api.post<Activo>('/activos', datos);
    avisar(`Activo ${creado.codigo} registrado.`, 'exito');
    setModalAbierto(false);
    void activos.recargar();
    void resumen.recargar();
    return creado;
  });

  const sembrar = useAccion(async () => {
    const r = await api.post<{ creadas: number }>('/activos/categorias/sembrar');
    avisar(
      r.creadas > 0
        ? `Se crearon ${r.creadas} categorías con las tasas del art. 34 LISR.`
        : 'Las categorías ya estaban creadas.',
      'exito',
    );
    void categorias.recargar();
  });

  const sinCategorias = !categorias.cargando && (categorias.datos?.length ?? 0) === 0;

  const totalFiltrado = useMemo(
    () => (activos.datos ?? []).reduce((s, a) => s + Number(a.valorEnLibros), 0),
    [activos.datos],
  );

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <EncabezadoPantalla
        titulo="Registro de activos"
        descripcion="Altas, costo histórico y valor en libros"
        acciones={
          <Boton
            variante="primario"
            icono={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setModalAbierto(true)}
            disabled={sinCategorias}
          >
            Registrar activo
          </Boton>
        }
      />

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Activos en uso" color="#65a30d" cargando={resumen.cargando}
          icono={<Building className="w-4 h-4" />}
          valor={resumen.datos?.totalActivos ?? 0}
          detalle={`${resumen.datos?.totalmenteDepreciados ?? 0} totalmente depreciados`}
        />
        <Indicador
          etiqueta="Costo histórico" color="#0f172a" cargando={resumen.cargando}
          valor={dinero(resumen.datos?.costoTotal)}
        />
        <Indicador
          etiqueta="Depreciación acumulada" color="#d97706" cargando={resumen.cargando}
          valor={dinero(resumen.datos?.depreciacionAcumulada)}
        />
        <Indicador
          etiqueta="Valor en libros" color="#059669" cargando={resumen.cargando}
          valor={dinero(resumen.datos?.valorEnLibros)}
          detalle="neto contable"
        />
      </div>

      {sinCategorias && (
        <div className="panel p-4 mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-slate-800">
              Falta configurar las categorías
            </p>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Cada activo pertenece a una categoría, que define su tasa de depreciación.
            </p>
          </div>
          <Boton
            variante="primario"
            cargando={sembrar.ejecutando}
            onClick={() => void sembrar.ejecutar()}
          >
            Crear las siete categorías estándar
          </Boton>
        </div>
      )}

      {/* Tabla */}
      <Panel sinRelleno>
        <div className="panel-cabecera">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Entrada
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por código, nombre o serie"
                className="pl-8"
              />
            </div>
            <Seleccion value={estado} onChange={(e) => setEstado(e.target.value)} className="w-40">
              <option value="">Todos los estados</option>
              {Object.entries(ETIQUETA_ESTADO).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Seleccion>
          </div>
          <p className="text-[12px] text-slate-500 cifra">
            {activos.datos?.length ?? 0} activos · {dinero(totalFiltrado)} en libros
          </p>
        </div>

        {activos.cargando ? (
          <Cargando />
        ) : activos.error ? (
          <ErrorPantalla mensaje={activos.error} onReintentar={activos.recargar} />
        ) : (activos.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo={busqueda || estado ? 'Ningún activo coincide con el filtro' : 'Todavía no hay activos registrados'}
            descripcion={
              busqueda || estado
                ? 'Prueba con otro término o quita el filtro de estado.'
                : 'Registra la maquinaria, el equipo de cómputo y el transporte para que la depreciación se calcule sola.'
            }
            icono={<Building className="w-5 h-5" />}
            accion={
              !busqueda && !estado && !sinCategorias ? (
                <Boton variante="primario" onClick={() => setModalAbierto(true)}>
                  Registrar el primero
                </Boton>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Activo</th>
                  <th>Categoría</th>
                  <th>Adquisición</th>
                  <th className="text-right">Costo</th>
                  <th className="text-right">Tasa</th>
                  <th className="text-right">Depreciado</th>
                  <th className="text-right">En libros</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {activos.datos!.map((a) => (
                  <tr key={a.id}>
                    <td className="font-semibold text-slate-900 cifra">{a.codigo}</td>
                    <td>
                      <p className="text-slate-900">{a.nombre}</p>
                      {a.ubicacion && (
                        <p className="text-[11px] text-slate-400">{a.ubicacion}</p>
                      )}
                    </td>
                    <td className="text-slate-500">{a.categoria?.nombre ?? '—'}</td>
                    <td className="text-slate-500 cifra">{fecha(a.fechaAdquisicion)}</td>
                    <td className="text-right cifra">{dinero(a.costoAdquisicion)}</td>
                    <td className="text-right cifra text-slate-500">{porcentaje(a.tasaAnual, 0)}</td>
                    <td className="text-right cifra text-amber-700">{dinero(a.depreciacionAcumulada)}</td>
                    <td className="text-right cifra font-semibold text-slate-900">{dinero(a.valorEnLibros)}</td>
                    <td>
                      <Distintivo tono={TONO_ESTADO[a.estado] ?? 'neutro'}>
                        {ETIQUETA_ESTADO[a.estado] ?? a.estado}
                      </Distintivo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ModalNuevoActivo
        abierto={modalAbierto}
        categorias={categorias.datos ?? []}
        guardando={guardar.ejecutando}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={(d) => void guardar.ejecutar(d).catch(() => {})}
      />
    </div>
  );
}

/* ── Alta ─────────────────────────────────────────────────────────────────── */

function ModalNuevoActivo({
  abierto, categorias, guardando, onCerrar, onGuardar,
}: {
  abierto: boolean;
  categorias: Categoria[];
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (datos: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    nombre: '', categoriaId: '', fechaAdquisicion: '',
    costoAdquisicion: '', valorResidual: '0',
    numeroSerie: '', marca: '', modelo: '', ubicacion: '',
  });
  const [errores, setErrores] = useState<Record<string, string>>({});

  const cambiar = (campo: string, valor: string) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: '' }));
  };

  const validar = () => {
    const e: Record<string, string> = {};
    if (!form.nombre.trim()) e.nombre = 'Escribe cómo se llama el activo.';
    if (!form.categoriaId) e.categoriaId = 'Elige una categoría.';
    if (!form.fechaAdquisicion) e.fechaAdquisicion = 'Indica la fecha de compra.';

    const costo = parseFloat(form.costoAdquisicion);
    if (!costo || costo <= 0) e.costoAdquisicion = 'El costo debe ser mayor que cero.';

    const residual = parseFloat(form.valorResidual || '0');
    if (residual >= costo) {
      e.valorResidual = 'El valor residual debe ser menor al costo.';
    }

    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const enviar = () => {
    if (!validar()) return;
    onGuardar({
      ...form,
      costoAdquisicion: parseFloat(form.costoAdquisicion),
      valorResidual: parseFloat(form.valorResidual || '0'),
    });
  };

  const categoria = categorias.find((c) => c.id === form.categoriaId);

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Registrar activo"
      descripcion="La depreciación empieza el mes siguiente a la fecha de adquisición."
      ancho={620}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={guardando}>Registrar activo</Boton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2">
          <Campo etiqueta="Nombre del activo" requerido error={errores.nombre}>
            <Entrada
              value={form.nombre}
              onChange={(e) => cambiar('nombre', e.target.value)}
              error={!!errores.nombre}
              placeholder="Camioneta Nissan NP300 blanca"
            />
          </Campo>
        </div>

        <Campo etiqueta="Categoría" requerido error={errores.categoriaId}
          ayuda={categoria ? `Se depreciará al ${categoria.tasaAnual}% anual` : undefined}>
          <Seleccion
            value={form.categoriaId}
            onChange={(e) => cambiar('categoriaId', e.target.value)}
            error={!!errores.categoriaId}
          >
            <option value="">Elige una…</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} · {c.tasaAnual}%</option>
            ))}
          </Seleccion>
        </Campo>

        <Campo etiqueta="Fecha de adquisición" requerido error={errores.fechaAdquisicion}>
          <Entrada
            type="date"
            value={form.fechaAdquisicion}
            onChange={(e) => cambiar('fechaAdquisicion', e.target.value)}
            error={!!errores.fechaAdquisicion}
          />
        </Campo>

        <Campo etiqueta="Costo de adquisición" requerido error={errores.costoAdquisicion}>
          <Entrada
            type="number" step="0.01" min="0"
            value={form.costoAdquisicion}
            onChange={(e) => cambiar('costoAdquisicion', e.target.value)}
            error={!!errores.costoAdquisicion}
            placeholder="0.00"
          />
        </Campo>

        <Campo etiqueta="Valor residual" error={errores.valorResidual}
          ayuda="Lo que valdrá al final de su vida útil">
          <Entrada
            type="number" step="0.01" min="0"
            value={form.valorResidual}
            onChange={(e) => cambiar('valorResidual', e.target.value)}
            error={!!errores.valorResidual}
          />
        </Campo>

        <Campo etiqueta="Marca"><Entrada value={form.marca} onChange={(e) => cambiar('marca', e.target.value)} /></Campo>
        <Campo etiqueta="Modelo"><Entrada value={form.modelo} onChange={(e) => cambiar('modelo', e.target.value)} /></Campo>
        <Campo etiqueta="Número de serie"><Entrada value={form.numeroSerie} onChange={(e) => cambiar('numeroSerie', e.target.value)} /></Campo>
        <Campo etiqueta="Ubicación" ayuda="Dónde está físicamente">
          <Entrada value={form.ubicacion} onChange={(e) => cambiar('ubicacion', e.target.value)} placeholder="Almacén central" />
        </Campo>
      </div>
    </Modal>
  );
}
