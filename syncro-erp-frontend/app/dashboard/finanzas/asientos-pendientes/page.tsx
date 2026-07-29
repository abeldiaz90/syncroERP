"use client";
/**
 * ============================================================================
 * SyncroERP · Finanzas — asientos pendientes
 * ----------------------------------------------------------------------------
 * Esta pantalla no debería tener nada. Cuando tiene algo, significa que hay
 * operaciones registradas que no llegaron a la contabilidad — y eso es lo que
 * antes pasaba en silencio.
 *
 * Por eso el vacío se celebra en vez de disculparse, y lo fallido va primero
 * en rojo: es lo único que exige acción humana.
 * ============================================================================
 */

import { useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';

import { api } from '@/lib/api';
import { fechaHora } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Asiento {
  id: string;
  tipo: string;
  folioDocumento?: string;
  estado: 'PENDIENTE' | 'REINTENTANDO' | 'GENERADO' | 'FALLIDO' | 'DESCARTADO';
  intentos: number;
  ultimoError?: string;
  fechaUltimoIntento?: string;
  proximoIntento?: string;
  fechaCreacion: string;
  payload?: { folio?: string; total?: number; fecha?: string; partidas?: number };
}

interface Resumen {
  pendientes: number;
  fallidos: number;
  generados: number;
  descartados: number;
  requierenAtencion: number;
}

const TONO = {
  PENDIENTE: 'alerta',
  REINTENTANDO: 'info',
  GENERADO: 'exito',
  FALLIDO: 'peligro',
  DESCARTADO: 'neutro',
} as const;

const ETIQUETA = {
  PENDIENTE: 'En cola',
  REINTENTANDO: 'Reintentando',
  GENERADO: 'Resuelto',
  FALLIDO: 'Requiere revisión',
  DESCARTADO: 'Descartado',
} as const;

const ETIQUETA_TIPO: Record<string, string> = {
  VENTA: 'Venta',
  COMPRA: 'Compra',
  PAGO_PROVEEDOR: 'Pago a proveedor',
  COBRANZA: 'Cobranza',
  SALIDA_INVENTARIO: 'Salida de inventario',
  INVENTARIO_INICIAL: 'Inventario inicial',
  NOMINA: 'Nómina',
  DEPRECIACION: 'Depreciación',
  TESORERIA: 'Tesorería',
};

export default function AsientosPendientesPage() {
  const { avisar } = useAvisos();
  const [estado, setEstado] = useState<string>('');
  const [aDescartar, setADescartar] = useState<Asiento | null>(null);
  const [nota, setNota] = useState('');

  const resumen = useDatos<Resumen>(() => api.get('/finanzas/asientos-pendientes/resumen'), []);
  const asientos = useDatos<Asiento[]>(
    () => api.get('/finanzas/asientos-pendientes', { query: { estado } }),
    [estado],
  );

  const reintentar = useAccion(async (id: string) => {
    const r = await api.post<{ generado: boolean; mensaje: string }>(
      `/finanzas/asientos-pendientes/${id}/reintentar`,
    );
    avisar(r.mensaje, r.generado ? 'exito' : 'error');
    void asientos.recargar();
    void resumen.recargar();
    return r;
  });

  const descartar = useAccion(async (id: string, texto: string) => {
    await api.post(`/finanzas/asientos-pendientes/${id}/descartar`, { nota: texto });
    avisar('Asiento descartado. Queda registrada la justificación.', 'info');
    setADescartar(null);
    setNota('');
    void asientos.recargar();
    void resumen.recargar();
  });

  const todoLimpio =
    !resumen.cargando &&
    (resumen.datos?.pendientes ?? 0) === 0 &&
    (resumen.datos?.fallidos ?? 0) === 0;

  return (
    <div className="p-6 max-w-[1300px] mx-auto">
      <EncabezadoPantalla
        titulo="Asientos pendientes"
        descripcion="Operaciones registradas cuya póliza contable no pudo generarse"
        acciones={
          <Boton
            variante="neutro"
            icono={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => { void asientos.recargar(); void resumen.recargar(); }}
          >
            Actualizar
          </Boton>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Requieren revisión"
          color={(resumen.datos?.fallidos ?? 0) > 0 ? '#e11d48' : '#64748b'}
          cargando={resumen.cargando}
          icono={<ShieldAlert className="w-4 h-4" />}
          valor={resumen.datos?.fallidos ?? 0}
          detalle="agotaron los reintentos"
        />
        <Indicador
          etiqueta="En cola"
          color={(resumen.datos?.pendientes ?? 0) > 0 ? '#d97706' : '#64748b'}
          cargando={resumen.cargando}
          valor={resumen.datos?.pendientes ?? 0}
          detalle="se reintentan solos"
        />
        <Indicador
          etiqueta="Resueltos" color="#059669" cargando={resumen.cargando}
          valor={resumen.datos?.generados ?? 0}
        />
        <Indicador
          etiqueta="Descartados" color="#64748b" cargando={resumen.cargando}
          valor={resumen.datos?.descartados ?? 0}
        />
      </div>

      {todoLimpio && (
        <div className="panel p-4 mb-4 border-l-[3px] border-l-emerald-400">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-slate-900">
                Toda la operación está reflejada en la contabilidad
              </p>
              <p className="text-[12.5px] text-slate-500 mt-0.5">
                No hay ventas, compras ni movimientos sin su póliza correspondiente.
              </p>
            </div>
          </div>
        </div>
      )}

      <Panel sinRelleno>
        <div className="panel-cabecera">
          <Seleccion value={estado} onChange={(e) => setEstado(e.target.value)} className="w-52">
            <option value="">Todos los estados</option>
            <option value="FALLIDO">Requieren revisión</option>
            <option value="PENDIENTE">En cola</option>
            <option value="GENERADO">Resueltos</option>
            <option value="DESCARTADO">Descartados</option>
          </Seleccion>
          <p className="text-[12px] text-slate-500 cifra">
            {asientos.datos?.length ?? 0} registros
          </p>
        </div>

        {asientos.cargando ? (
          <Cargando />
        ) : asientos.error ? (
          <ErrorPantalla mensaje={asientos.error} onReintentar={asientos.recargar} />
        ) : (asientos.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo="Nada pendiente"
            descripcion="Cada operación que se registró tiene su asiento contable. Así debe verse esta pantalla."
            icono={<CheckCircle2 className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Origen</th>
                  <th>Documento</th>
                  <th>Estado</th>
                  <th className="text-right">Intentos</th>
                  <th>Qué falló</th>
                  <th>Último intento</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {asientos.datos!.map((a) => (
                  <tr key={a.id} className={a.estado === 'FALLIDO' ? 'bg-rose-50/40' : ''}>
                    <td className="text-slate-900">{ETIQUETA_TIPO[a.tipo] ?? a.tipo}</td>
                    <td className="cifra text-slate-600">
                      {a.folioDocumento ?? a.payload?.folio ?? '—'}
                      {a.payload?.total !== undefined && (
                        <span className="text-[11px] text-slate-400 ml-1.5">
                          ${Number(a.payload.total).toLocaleString('es-MX')}
                        </span>
                      )}
                    </td>
                    <td>
                      <Distintivo tono={TONO[a.estado]}>{ETIQUETA[a.estado]}</Distintivo>
                    </td>
                    <td className="text-right cifra text-slate-500">{a.intentos}</td>
                    <td className="max-w-md">
                      <p className="text-[12px] text-slate-600 line-clamp-2">
                        {a.ultimoError ?? '—'}
                      </p>
                    </td>
                    <td className="cifra text-[12px] text-slate-500">
                      {a.fechaUltimoIntento ? fechaHora(a.fechaUltimoIntento) : '—'}
                    </td>
                    <td>
                      {(a.estado === 'FALLIDO' || a.estado === 'PENDIENTE') && (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => void reintentar.ejecutar(a.id).catch(() => {})}
                            disabled={reintentar.ejecutando}
                            className="btn btn-fantasma btn-sm"
                            title="Reintentar ahora"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setADescartar(a)}
                            className="btn btn-fantasma btn-sm btn-icono"
                            title="Descartar"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
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

      <p className="text-[11.5px] text-slate-400 mt-3">
        La causa más común es una categoría de producto sin cuentas contables asignadas.
        Corrígelo en Finanzas → Categorías contables y reintenta desde aquí.
      </p>

      <Modal
        abierto={!!aDescartar}
        onCerrar={() => { setADescartar(null); setNota(''); }}
        titulo="Descartar el asiento"
        descripcion={`${ETIQUETA_TIPO[aDescartar?.tipo ?? ''] ?? ''} ${aDescartar?.folioDocumento ?? ''}`}
        ancho={480}
        pie={
          <>
            <Boton variante="neutro" onClick={() => { setADescartar(null); setNota(''); }}>
              Volver
            </Boton>
            <Boton
              variante="peligro"
              disabled={!nota.trim()}
              cargando={descartar.ejecutando}
              onClick={() => void descartar.ejecutar(aDescartar!.id, nota).catch(() => {})}
            >
              Descartar
            </Boton>
          </>
        }
      >
        <p className="text-[13px] text-slate-600 mb-3.5 leading-relaxed">
          Descartar significa que esta operación <span className="font-semibold">no se
          reflejará en la contabilidad</span>. La justificación queda registrada con tu
          nombre.
        </p>
        <Campo etiqueta="Justificación" requerido>
          <Entrada
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Duplicado de la póliza P-1042, ya registrada a mano"
            autoFocus
          />
        </Campo>
      </Modal>
    </div>
  );
}
