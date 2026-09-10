"use client";
/**
 * ============================================================================
 * SyncroERP · Activos fijos — bajas y ventas
 * ----------------------------------------------------------------------------
 * La baja de un activo tiene efecto contable inmediato: la diferencia entre lo
 * que se recibe y el valor en libros es utilidad o pérdida del ejercicio. La
 * pantalla lo calcula ANTES de confirmar, porque es el dato que decide si la
 * operación conviene.
 * ============================================================================
 */

import { useMemo, useState } from 'react';
import { ArchiveX, PackageMinus, Search } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, fecha, isoCorto } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Campo, Cargando, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Modal, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Activo {
  id: string;
  codigo: string;
  nombre: string;
  categoria?: { nombre: string };
  costoAdquisicion: number;
  depreciacionAcumulada: number;
  valorEnLibros: number;
  estado: string;
  fechaBaja?: string;
  motivoBaja?: string;
  valorVenta?: number;
}

const MOTIVOS = [
  { valor: 'VENTA', etiqueta: 'Venta' },
  { valor: 'OBSOLESCENCIA', etiqueta: 'Obsolescencia' },
  { valor: 'SINIESTRO', etiqueta: 'Siniestro' },
  { valor: 'DONACION', etiqueta: 'Donación' },
  { valor: 'ROBO', etiqueta: 'Robo' },
];

export default function BajasPage() {
  const { avisar } = useAvisos();
  const [busqueda, setBusqueda] = useState('');
  const [aDarDeBaja, setADarDeBaja] = useState<Activo | null>(null);

  const activos = useDatos<Activo[]>(
    () => api.get('/activos', { query: { busqueda } }),
    [busqueda],
  );

  const darDeBaja = useAccion(async (id: string, datos: Record<string, unknown>) => {
    const r = await api.patch<{ resultado: number; tipoResultado: string; valorEnLibros: number }>(
      `/activos/${id}/baja`,
      datos,
    );
    setADarDeBaja(null);
    avisar(
      r.tipoResultado === 'UTILIDAD'
        ? `Activo dado de baja con utilidad de ${dinero(r.resultado)}.`
        : r.tipoResultado === 'PERDIDA'
          ? `Activo dado de baja con pérdida de ${dinero(Math.abs(r.resultado))}.`
          : 'Activo dado de baja sin efecto en resultados.',
      r.tipoResultado === 'PERDIDA' ? 'alerta' : 'exito',
    );
    void activos.recargar();
    return r;
  });

  const { vigentes, dadosDeBaja } = useMemo(() => {
    const lista = activos.datos ?? [];
    return {
      vigentes: lista.filter((a) => a.estado !== 'BAJA' && a.estado !== 'VENDIDO'),
      dadosDeBaja: lista.filter((a) => a.estado === 'BAJA' || a.estado === 'VENDIDO'),
    };
  }, [activos.datos]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <EncabezadoPantalla
        titulo="Bajas y ventas"
        descripcion="Retiro de activos con cálculo de utilidad o pérdida"
      />

      {/* Disponibles para baja */}
      <Panel sinRelleno className="mb-4">
        <div className="panel-cabecera">
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Entrada
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código o nombre"
              className="pl-8"
            />
          </div>
          <p className="text-[12px] text-slate-500 cifra">
            {vigentes.length} activos vigentes
          </p>
        </div>

        {activos.cargando ? (
          <Cargando />
        ) : activos.error ? (
          <ErrorPantalla mensaje={activos.error} onReintentar={activos.recargar} />
        ) : vigentes.length === 0 ? (
          <SinDatos
            titulo="No hay activos disponibles para dar de baja"
            descripcion="Todos los activos registrados ya fueron retirados, o todavía no has registrado ninguno."
            icono={<PackageMinus className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Activo</th>
                  <th>Categoría</th>
                  <th className="text-right">Costo</th>
                  <th className="text-right">Depreciado</th>
                  <th className="text-right">Valor en libros</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vigentes.map((a) => (
                  <tr key={a.id}>
                    <td className="cifra font-semibold text-slate-900">{a.codigo}</td>
                    <td className="text-slate-800">{a.nombre}</td>
                    <td className="text-slate-500">{a.categoria?.nombre ?? '—'}</td>
                    <td className="text-right cifra">{dinero(a.costoAdquisicion)}</td>
                    <td className="text-right cifra text-amber-700">{dinero(a.depreciacionAcumulada)}</td>
                    <td className="text-right cifra font-semibold text-slate-900">
                      {dinero(a.valorEnLibros)}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setADarDeBaja(a)}
                        className="btn btn-fantasma btn-sm"
                      >
                        <ArchiveX className="w-3.5 h-3.5" /> Dar de baja
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Historial */}
      {dadosDeBaja.length > 0 && (
        <Panel sinRelleno titulo="Activos retirados">
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Activo</th>
                  <th>Fecha de baja</th>
                  <th>Motivo</th>
                  <th className="text-right">Valor en libros</th>
                  <th className="text-right">Recibido</th>
                  <th className="text-right">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {dadosDeBaja.map((a) => {
                  const recibido = Number(a.valorVenta ?? 0);
                  const libros = Number(a.valorEnLibros);
                  const resultado = recibido - libros;
                  return (
                    <tr key={a.id}>
                      <td className="cifra font-semibold text-slate-900">{a.codigo}</td>
                      <td className="text-slate-700">{a.nombre}</td>
                      <td className="cifra text-slate-500">{fecha(a.fechaBaja)}</td>
                      <td>
                        <Distintivo tono={a.estado === 'VENDIDO' ? 'info' : 'neutro'}>
                          {MOTIVOS.find((m) => m.valor === a.motivoBaja)?.etiqueta ?? a.motivoBaja ?? '—'}
                        </Distintivo>
                      </td>
                      <td className="text-right cifra text-slate-600">{dinero(libros)}</td>
                      <td className="text-right cifra text-slate-600">
                        {recibido > 0 ? dinero(recibido) : '—'}
                      </td>
                      <td
                        className="text-right cifra font-semibold"
                        style={{ color: resultado > 0 ? '#047857' : resultado < 0 ? '#be123c' : '#64748b' }}
                      >
                        {resultado === 0 ? '—' : dinero(resultado)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {aDarDeBaja && (
        <ModalBaja
          activo={aDarDeBaja}
          procesando={darDeBaja.ejecutando}
          onCerrar={() => setADarDeBaja(null)}
          onConfirmar={(d) => void darDeBaja.ejecutar(aDarDeBaja.id, d).catch(() => {})}
        />
      )}
    </div>
  );
}

/* ── Baja ─────────────────────────────────────────────────────────────────── */

function ModalBaja({
  activo, procesando, onCerrar, onConfirmar,
}: {
  activo: Activo;
  procesando: boolean;
  onCerrar: () => void;
  onConfirmar: (datos: Record<string, unknown>) => void;
}) {
  const [motivo, setMotivo] = useState('VENTA');
  const [fechaBaja, setFechaBaja] = useState(isoCorto());
  const [valorVenta, setValorVenta] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');

  const esVenta = motivo === 'VENTA';
  const libros = Number(activo.valorEnLibros);
  const recibido = esVenta ? parseFloat(valorVenta || '0') : 0;
  const resultado = recibido - libros;

  const enviar = () => {
    if (esVenta && (!valorVenta || parseFloat(valorVenta) <= 0)) {
      setError('Indica en cuánto se vendió.');
      return;
    }
    setError('');
    onConfirmar({
      motivo,
      fecha: fechaBaja,
      valorVenta: esVenta ? parseFloat(valorVenta) : undefined,
      notas: notas || undefined,
    });
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Dar de baja el activo"
      descripcion={`${activo.codigo} · ${activo.nombre}`}
      ancho={520}
      pie={
        <>
          <Boton variante="neutro" onClick={onCerrar} disabled={procesando}>Cancelar</Boton>
          <Boton variante="peligro" onClick={enviar} cargando={procesando}>
            Confirmar baja
          </Boton>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5">
          <Campo etiqueta="Motivo" requerido>
            <Seleccion value={motivo} onChange={(e) => { setMotivo(e.target.value); setError(''); }}>
              {MOTIVOS.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
            </Seleccion>
          </Campo>

          <Campo etiqueta="Fecha de baja" requerido>
            <Entrada type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)} />
          </Campo>
        </div>

        {esVenta && (
          <Campo etiqueta="Valor de venta" requerido error={error}>
            <Entrada
              type="number" step="0.01" min="0"
              value={valorVenta}
              onChange={(e) => { setValorVenta(e.target.value); setError(''); }}
              error={!!error}
              placeholder="0.00"
              autoFocus
            />
          </Campo>
        )}

        <Campo etiqueta="Notas">
          <Entrada
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Comprador, número de factura, referencia del siniestro…"
          />
        </Campo>

        {/* Efecto contable, antes de confirmar */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-3 space-y-1.5">
          <p className="eyebrow">Efecto en resultados</p>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-slate-600">Valor en libros</span>
            <span className="cifra text-slate-800">{dinero(libros)}</span>
          </div>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-slate-600">{esVenta ? 'Se recibe' : 'No se recibe nada'}</span>
            <span className="cifra text-slate-800">{dinero(recibido)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
            <span className="text-[12.5px] font-semibold text-slate-700">
              {resultado > 0 ? 'Utilidad' : resultado < 0 ? 'Pérdida' : 'Sin efecto'}
            </span>
            <span
              className="text-[14px] font-bold cifra"
              style={{ color: resultado > 0 ? '#047857' : resultado < 0 ? '#be123c' : '#64748b' }}
            >
              {dinero(Math.abs(resultado))}
            </span>
          </div>
        </div>

        <p className="text-[11.5px] text-slate-400">
          La baja no se puede deshacer desde la pantalla. Verifica la fecha antes de confirmar.
        </p>
      </div>
    </Modal>
  );
}
