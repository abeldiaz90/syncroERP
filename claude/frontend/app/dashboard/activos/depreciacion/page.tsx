"use client";
/**
 * ============================================================================
 * SyncroERP · Activos fijos — corrida de depreciación
 * ----------------------------------------------------------------------------
 * Pantalla de una sola acción con consecuencias contables. El diseño lo trata
 * como tal: se ve el periodo, se ve el resultado línea por línea, y la
 * reversión está a la vista pero no al alcance de un clic distraído.
 * ============================================================================
 */

import { useState } from 'react';
import { CalendarCheck, RotateCcw, TriangleAlert } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero } from '@/lib/format';
import { useAccion } from '@/hooks/use-datos';
import {
  Boton, Campo, Confirmacion, Distintivo, EncabezadoPantalla,
  Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Resultado {
  ejercicio: number;
  mes: number;
  activosProcesados: number;
  activosOmitidos: number;
  importeTotal: number;
  totalmenteDepreciados: number;
  detalle: Array<{ codigo: string; nombre: string; importe: number; motivo?: string }>;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function DepreciacionPage() {
  const { avisar } = useAvisos();
  const ahora = new Date();

  // Por omisión, el mes anterior: es el último periodo cerrado.
  const mesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const [ejercicio, setEjercicio] = useState(mesAnterior.getFullYear());
  const [mes, setMes] = useState(mesAnterior.getMonth() + 1);

  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmarCorrida, setConfirmarCorrida] = useState(false);
  const [confirmarReversion, setConfirmarReversion] = useState(false);

  const correr = useAccion(async () => {
    const r = await api.post<Resultado>('/activos/depreciacion/corrida', { ejercicio, mes });
    setResultado(r);
    setConfirmarCorrida(false);
    avisar(
      r.activosProcesados > 0
        ? `${r.activosProcesados} activos depreciados por ${dinero(r.importeTotal)}.`
        : 'No había activos por depreciar en ese periodo.',
      r.activosProcesados > 0 ? 'exito' : 'info',
    );
    return r;
    // `errorVisible`: esta pantalla pinta `correr.error` en su propio bloque.
  }, { errorVisible: true });

  const revertir = useAccion(async () => {
    const r = await api.post<{ revertidos: number }>('/activos/depreciacion/revertir', { ejercicio, mes });
    setResultado(null);
    setConfirmarReversion(false);
    avisar(`Se revirtieron ${r.revertidos} registros de depreciación.`, 'exito');
    return r;
  });

  const anios = Array.from({ length: 6 }, (_, i) => ahora.getFullYear() - 4 + i);

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <EncabezadoPantalla
        titulo="Corrida de depreciación"
        descripcion="Calcula y registra la depreciación mensual de todos los activos"
      />

      {/* Periodo */}
      <Panel titulo="Periodo a depreciar" className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Campo etiqueta="Mes">
              <Seleccion value={mes} onChange={(e) => { setMes(Number(e.target.value)); setResultado(null); }}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Seleccion>
            </Campo>
          </div>
          <div className="w-32">
            <Campo etiqueta="Ejercicio">
              <Seleccion value={ejercicio} onChange={(e) => { setEjercicio(Number(e.target.value)); setResultado(null); }}>
                {anios.map((a) => <option key={a} value={a}>{a}</option>)}
              </Seleccion>
            </Campo>
          </div>

          <Boton
            variante="primario"
            icono={<CalendarCheck className="w-3.5 h-3.5" />}
            onClick={() => setConfirmarCorrida(true)}
            cargando={correr.ejecutando}
          >
            Ejecutar corrida
          </Boton>

          {resultado && (
            <Boton
              variante="neutro"
              icono={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => setConfirmarReversion(true)}
            >
              Revertir este periodo
            </Boton>
          )}
        </div>

        <p className="text-[12px] text-slate-500 mt-3.5 flex items-start gap-1.5">
          <TriangleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px" />
          Ejecutar dos veces el mismo periodo no duplica el gasto: los activos ya
          depreciados se omiten.
        </p>

        {correr.error && (
          <p className="text-[12.5px] text-rose-600 mt-2 font-medium">{correr.error}</p>
        )}
      </Panel>

      {/* Resultado */}
      {!resultado ? (
        <Panel sinRelleno>
          <SinDatos
            titulo="Aún no has ejecutado la corrida"
            descripcion="Elige el periodo y ejecuta. Verás el detalle activo por activo antes de que nada se registre en la contabilidad."
            icono={<CalendarCheck className="w-5 h-5" />}
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <ResumenCorrida etiqueta="Activos depreciados" valor={String(resultado.activosProcesados)} color="#65a30d" />
            <ResumenCorrida etiqueta="Importe del mes" valor={dinero(resultado.importeTotal)} color="#0f172a" />
            <ResumenCorrida etiqueta="Omitidos" valor={String(resultado.activosOmitidos)} color="#64748b" />
            <ResumenCorrida etiqueta="Quedaron al 100%" valor={String(resultado.totalmenteDepreciados)} color="#d97706" />
          </div>

          <Panel
            sinRelleno
            titulo={`Detalle de ${MESES[resultado.mes - 1]} ${resultado.ejercicio}`}
          >
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Activo</th>
                    <th className="text-right">Depreciación del mes</th>
                    <th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.detalle.map((d) => (
                    <tr key={d.codigo}>
                      <td className="font-semibold text-slate-900 cifra">{d.codigo}</td>
                      <td className="text-slate-700">{d.nombre}</td>
                      <td className="text-right cifra">
                        {d.importe > 0
                          ? <span className="font-semibold text-slate-900">{dinero(d.importe)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td>
                        {d.motivo
                          ? <Distintivo tono="neutro">{d.motivo}</Distintivo>
                          : <Distintivo tono="exito">Depreciado</Distintivo>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total del periodo</td>
                    <td className="text-right cifra">{dinero(resultado.importeTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </>
      )}

      <Confirmacion
        abierto={confirmarCorrida}
        titulo="Ejecutar la corrida"
        mensaje={`Se depreciarán todos los activos elegibles de ${MESES[mes - 1]} ${ejercicio}. La operación queda registrada y afecta el valor en libros.`}
        textoConfirmar="Ejecutar"
        procesando={correr.ejecutando}
        onConfirmar={() => void correr.ejecutar()}
        onCancelar={() => setConfirmarCorrida(false)}
      />

      <Confirmacion
        abierto={confirmarReversion}
        peligroso
        titulo="Revertir la depreciación"
        mensaje={`Se eliminarán los registros de ${MESES[mes - 1]} ${ejercicio} y la depreciación acumulada de cada activo volverá a su valor anterior. Sólo se puede revertir el último periodo depreciado.`}
        textoConfirmar="Revertir"
        procesando={revertir.ejecutando}
        onConfirmar={() => void revertir.ejecutar()}
        onCancelar={() => setConfirmarReversion(false)}
      />
    </div>
  );
}

function ResumenCorrida({ etiqueta, valor, color }: { etiqueta: string; valor: string; color: string }) {
  return (
    <div className="panel px-4 py-3">
      <p className="eyebrow">{etiqueta}</p>
      <p className="text-[20px] font-bold mt-1 cifra" style={{ color }}>{valor}</p>
    </div>
  );
}
