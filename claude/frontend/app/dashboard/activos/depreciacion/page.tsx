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

import { useT } from '@/components/I18nProvider';
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
  const t = useT();
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
      r.activosProcesados === 1
        ? `1 activo depreciado por ${dinero(r.importeTotal)}.`
        : r.activosProcesados > 1
          ? `${r.activosProcesados} activos depreciados por ${dinero(r.importeTotal)}.`
          : t("No había activos por depreciar en ese periodo."),
      r.activosProcesados > 0 ? 'exito' : 'info',
    );
    return r;
    // `errorVisible`: la negativa se pinta dentro del diálogo de confirmación,
    // que es donde están los ojos cuando el servidor contesta que no.
  }, { errorVisible: true });

  /*
   * `errorVisible`: la negativa de revertir se pinta dentro del propio diálogo.
   * El servidor contesta aquí cosas largas y accionables —«ya está contabilizada
   * en la póliza DI-…, cancélala primero desde Finanzas → Pólizas»— que no caben
   * en un aviso de esquina de 4.5 segundos. Antes el diálogo se quedaba abierto
   * sin decir nada y el clic parecía no haber hecho nada.
   */
  const revertir = useAccion(async () => {
    const r = await api.post<{ revertidos: number }>('/activos/depreciacion/revertir', { ejercicio, mes });
    setResultado(null);
    setConfirmarReversion(false);
    avisar(
      r.revertidos === 1
        ? t("Se revirtió 1 registro de depreciación.")
        : `Se revirtieron ${r.revertidos} registros de depreciación.`,
      'exito',
    );
    return r;
  }, { errorVisible: true });

  const anios = Array.from({ length: 6 }, (_, i) => ahora.getFullYear() - 4 + i);

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <EncabezadoPantalla
        titulo={t("Corrida de depreciación")}
        descripcion={t("Calcula y registra la depreciación mensual de todos los activos")}
      />

      {/* Periodo */}
      <Panel titulo={t("Periodo a depreciar")} className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Campo etiqueta={t("Mes")}>
              <Seleccion value={mes} onChange={(e) => { setMes(Number(e.target.value)); setResultado(null); }}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Seleccion>
            </Campo>
          </div>
          <div className="w-32">
            <Campo etiqueta={t("Ejercicio")}>
              <Seleccion value={ejercicio} onChange={(e) => { setEjercicio(Number(e.target.value)); setResultado(null); }}>
                {anios.map((a) => <option key={a} value={a}>{a}</option>)}
              </Seleccion>
            </Campo>
          </div>

          <Boton
            variante="primario"
            icono={<CalendarCheck className="w-3.5 h-3.5" />}
            onClick={() => { correr.limpiarError(); setConfirmarCorrida(true); }}
            cargando={correr.ejecutando}
          >
            
            {t("Ejecutar corrida")}
          </Boton>

          {resultado && (
            <Boton
              variante="neutro"
              icono={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => { revertir.limpiarError(); setConfirmarReversion(true); }}
            >
              
              {t("Revertir este periodo")}
            </Boton>
          )}
        </div>

        <p className="text-[12px] text-slate-500 mt-3.5 flex items-start gap-1.5">
          <TriangleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px" />
          
          {t("Ejecutar dos veces el mismo periodo no duplica el gasto: los activos ya depreciados se omiten.")}
        </p>
      </Panel>

      {/* Resultado */}
      {!resultado ? (
        <Panel sinRelleno>
          <SinDatos
            titulo={t("Aún no has ejecutado la corrida")}
            descripcion={t("Elige el periodo y ejecuta. Verás el detalle activo por activo antes de que nada se registre en la contabilidad.")}
            icono={<CalendarCheck className="w-5 h-5" />}
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <ResumenCorrida etiqueta={t("Activos depreciados")} valor={String(resultado.activosProcesados)} color="#65a30d" />
            <ResumenCorrida etiqueta={t("Importe del mes")} valor={dinero(resultado.importeTotal)} color="#0f172a" />
            <ResumenCorrida etiqueta={t("Omitidos")} valor={String(resultado.activosOmitidos)} color="#64748b" />
            <ResumenCorrida etiqueta={t("Quedaron al 100%")} valor={String(resultado.totalmenteDepreciados)} color="#d97706" />
          </div>

          <Panel
            sinRelleno
            titulo={`Detalle de ${MESES[resultado.mes - 1]} ${resultado.ejercicio}`}
          >
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>{t("Código")}</th>
                    <th>{t("Activo")}</th>
                    <th className="text-right">{t("Depreciación del mes")}</th>
                    <th>{t("Observación")}</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.detalle.map((d) => (
                    <tr key={d.codigo}>
                      <td className="font-semibold text-slate-900 cifra">{d.codigo}</td>
                      <td className="text-slate-700">{t(d.nombre)}</td>
                      <td className="text-right cifra">
                        {d.importe > 0
                          ? <span className="font-semibold text-slate-900">{dinero(d.importe)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td>
                        {d.motivo
                          ? <Distintivo tono="neutro">{t(d.motivo)}</Distintivo>
                          : <Distintivo tono="exito">{t("Depreciado")}</Distintivo>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>{t("Total del periodo")}</td>
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
        titulo={t("Ejecutar la corrida")}
        mensaje={`Se depreciarán todos los activos elegibles de ${MESES[mes - 1]} ${ejercicio}. La operación queda registrada y afecta el valor en libros.`}
        textoConfirmar={t("Ejecutar")}
        procesando={correr.ejecutando}
        error={correr.error}
        onConfirmar={() => void correr.ejecutar()}
        onCancelar={() => { correr.limpiarError(); setConfirmarCorrida(false); }}
      />

      <Confirmacion
        abierto={confirmarReversion}
        peligroso
        titulo={t("Revertir la depreciación")}
        mensaje={`Se eliminarán los registros de ${MESES[mes - 1]} ${ejercicio} y la depreciación acumulada de cada activo volverá a su valor anterior. Sólo se puede revertir el último periodo depreciado.`}
        textoConfirmar={t("Revertir")}
        procesando={revertir.ejecutando}
        error={revertir.error}
        onConfirmar={() => void revertir.ejecutar()}
        onCancelar={() => { revertir.limpiarError(); setConfirmarReversion(false); }}
      />
    </div>
  );
}

function ResumenCorrida({ etiqueta, valor, color }: { etiqueta: string; valor: string; color: string }) {
  const t = useT();
  return (
    <div className="panel px-4 py-3">
      <p className="eyebrow">{t(etiqueta)}</p>
      <p className="text-[20px] font-bold mt-1 cifra" style={{ color }}>{valor}</p>
    </div>
  );
}
