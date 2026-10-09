"use client";

/**
 * ============================================================================
 * Las impresoras de ticket del mostrador
 * ----------------------------------------------------------------------------
 * PARA QUÉ EXISTE
 *
 * Para que enchufar una impresora térmica no exija entrar a la base de datos.
 * Se declara dónde está —su IP—, de qué ancho es el papel y qué dice al pie, y
 * se prueba **aquí mismo**: la alternativa es configurarla y descubrir el error
 * con el primer cliente enfrente.
 *
 * LOS TRES MODOS, DICHOS SIN JERGA
 *
 *   · Por red     · la impresora tiene su propia dirección. El servidor le
 *                   escribe directo. No hay que instalar nada en la caja.
 *   · Navegador   · cuelga por USB de la computadora del mostrador. El
 *                   servidor no la alcanza; el ticket se manda con el diálogo
 *                   de impresión, como siempre. **No es un fallo.**
 *   · Ninguna     · no se imprime. Un mostrador que sólo factura por correo no
 *                   tiene por qué ver avisos de impresora en cada venta.
 *
 * Y la fila sin caja es la impresora de la empresa: la que usan todas las que
 * no declararon la suya, que es lo que necesita un negocio de un solo
 * mostrador —la mayoría—.
 * ============================================================================
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Printer, Loader2, CheckCircle2, AlertTriangle, Save, Plug, Info,
} from 'lucide-react';

type Modo = 'RED' | 'NAVEGADOR' | 'NINGUNA';

interface IImpresora {
  id: string;
  cuentaCajaId: string | null;
  nombre: string;
  modo: Modo;
  host: string | null;
  puerto: number;
  ancho: number;
  abrirCajon: boolean;
  pie: string | null;
  copias: number;
  activo: boolean;
  ultimoIntento: string | null;
  ultimoExito: boolean | null;
  ultimoMotivo: string | null;
}

interface ICuentaCaja { id: string; nombre: string }

const VACIA = {
  cuentaCajaId: '',
  nombre: 'Impresora de tickets',
  modo: 'RED' as Modo,
  host: '',
  puerto: 9100,
  ancho: 48,
  abrirCajon: true,
  pie: '',
  copias: 1,
  activo: true,
};

export default function ImpresorasPage() {
  const [impresoras, setImpresoras] = useState<IImpresora[] | null>(null);
  const [cuentas, setCuentas] = useState<ICuentaCaja[]>([]);
  const [form, setForm] = useState({ ...VACIA });
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string } | null>(null);
  /*
   * «No pude leer el catálogo de cajas» no es «no hay cajas». Sin esta
   * distinción, un 403 dejaría el desplegable vacío y parecería que el negocio
   * no tiene mostradores.
   */
  const [cuentasLegibles, setCuentasLegibles] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const lista = await api.get<IImpresora[]>('/ventas/impresoras');
      setImpresoras(Array.isArray(lista) ? lista : []);
    } catch {
      setError('No se pudo leer la configuración de impresoras.');
      setImpresoras(null);
    } finally {
      setCargando(false);
    }
    try {
      const c = await api.get<ICuentaCaja[]>('/credito/cuentas-bancarias/para-cobro');
      setCuentas(Array.isArray(c) ? c : []);
      setCuentasLegibles(true);
    } catch {
      setCuentasLegibles(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      /*
       * Los campos van uno a uno y no con `...form`. Dos razones: que no se
       * cuele en el cuerpo nada que la pantalla use para sí misma, y que el
       * barrido que compara cada formulario con su DTO pueda ver lo que se
       * manda —a través de un `...` no ve nada, y una prueba que no ve no
       * está comprobando, está pasando—.
       */
      await api.put('/ventas/impresoras', {
        cuentaCajaId: form.cuentaCajaId || undefined,
        nombre: form.nombre,
        modo: form.modo,
        host: form.modo === 'RED' ? form.host.trim() : undefined,
        puerto: form.puerto,
        ancho: form.ancho,
        abrirCajon: form.abrirCajon,
        pie: form.pie.trim() || undefined,
        copias: form.copias,
        activo: form.activo,
      });
      setAviso({ bien: true, texto: 'Guardado.' });
      await cargar();
    } catch (e) {
      setAviso({
        bien: false,
        texto: e instanceof Error ? e.message : 'No se pudo guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    setAviso(null);
    try {
      const r = await api.post<{ impreso: boolean; motivo?: string }>(
        '/ventas/impresora/probar',
        { cuentaCajaId: form.cuentaCajaId || undefined },
      );
      setAviso(
        r.impreso
          ? { bien: true, texto: 'Salió la página de prueba. Comprueba que los acentos se lean bien.' }
          : { bien: false, texto: r.motivo ?? 'No salió.' },
      );
    } catch (e) {
      setAviso({
        bien: false,
        texto: e instanceof Error ? e.message : 'No se pudo probar.',
      });
    } finally {
      setProbando(false);
    }
  };

  const editar = (i: IImpresora) =>
    setForm({
      cuentaCajaId: i.cuentaCajaId ?? '',
      nombre: i.nombre,
      modo: i.modo,
      host: i.host ?? '',
      puerto: i.puerto,
      ancho: i.ancho,
      abrirCajon: i.abrirCajon,
      pie: i.pie ?? '',
      copias: i.copias,
      activo: i.activo,
    });

  const nombreDeCaja = (id: string | null) =>
    id ? (cuentas.find((c) => c.id === id)?.nombre ?? 'Caja') : 'Toda la empresa';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <Printer className="w-6 h-6" /> Impresoras de ticket
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Dónde sale el ticket de cada caja al cobrar.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="font-bold text-slate-700 mb-3">Configuradas</h2>
        {cargando && (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Consultando…
          </p>
        )}
        {!cargando && error && (
          <p className="text-sm text-rose-600">{error}</p>
        )}
        {!cargando && !error && impresoras?.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Todavía no hay ninguna declarada. Mientras no la haya, el ticket se
            manda desde el navegador, igual que antes: nadie se queda sin
            comprobante por esto.
          </div>
        )}
        <div className="space-y-2">
          {(impresoras ?? []).map((i) => (
            <button
              key={i.id}
              onClick={() => editar(i)}
              className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">{nombreDeCaja(i.cuentaCajaId)}</p>
                  <p className="text-xs text-slate-500">
                    {i.modo === 'RED'
                      ? `Por red · ${i.host}:${i.puerto} · ${i.ancho === 32 ? '58 mm' : '80 mm'}`
                      : i.modo === 'NAVEGADOR'
                        ? 'Desde el navegador de la caja'
                        : 'No imprime'}
                  </p>
                </div>
                {i.modo === 'RED' && i.ultimoIntento && (
                  <span
                    className={`text-xs font-medium flex items-center gap-1 ${
                      i.ultimoExito ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                    title={i.ultimoMotivo ?? ''}
                  >
                    {i.ultimoExito ? (
                      <><CheckCircle2 className="w-4 h-4" /> Última: salió</>
                    ) : (
                      <><AlertTriangle className="w-4 h-4" /> Última: no salió</>
                    )}
                  </span>
                )}
              </div>
              {i.modo === 'RED' && i.ultimoExito === false && i.ultimoMotivo && (
                <p className="text-xs text-amber-700 mt-2">{i.ultimoMotivo}</p>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-bold text-slate-700 mb-4">Declarar o cambiar</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Caja</span>
            <select
              value={form.cuentaCajaId}
              onChange={(e) => setForm({ ...form, cuentaCajaId: e.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
            >
              <option value="">Toda la empresa (impresora por omisión)</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            {!cuentasLegibles && (
              <span className="text-xs text-amber-600 mt-1 block">
                No se pudo leer el catálogo de cajas con tu perfil, así que aquí
                sólo aparece la opción de empresa. No significa que no haya cajas.
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">Cómo imprime</span>
            <select
              value={form.modo}
              onChange={(e) => setForm({ ...form, modo: e.target.value as Modo })}
              className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
            >
              <option value="RED">Por red (la impresora tiene su propia IP)</option>
              <option value="NAVEGADOR">Desde el navegador (impresora USB en la caja)</option>
              <option value="NINGUNA">No imprimir</option>
            </select>
          </label>

          {form.modo === 'RED' && (
            <>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">
                  Dirección IP de la impresora
                </span>
                <input
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  placeholder="192.168.1.50"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
                <span className="text-xs text-slate-500 mt-1 block">
                  Suele imprimirse en una hoja de autoprueba al encender la
                  impresora con el botón de avance pulsado.
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Puerto</span>
                <input
                  type="number"
                  value={form.puerto}
                  onChange={(e) => setForm({ ...form, puerto: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
                <span className="text-xs text-slate-500 mt-1 block">
                  9100 salvo que alguien lo haya cambiado.
                </span>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Ancho del papel</span>
                <select
                  value={form.ancho}
                  onChange={(e) => setForm({ ...form, ancho: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                >
                  <option value={48}>80 mm (lo habitual)</option>
                  <option value={32}>58 mm (estrecho)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Copias</span>
                <select
                  value={form.copias}
                  onChange={(e) => setForm({ ...form, copias: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                >
                  <option value={1}>Una</option>
                  <option value={2}>Dos (cliente y negocio)</option>
                </select>
              </label>
              <label className="flex items-start gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.abrirCajon}
                  onChange={(e) => setForm({ ...form, abrirCajon: e.target.checked })}
                  className="mt-1"
                />
                <span className="text-sm text-slate-700">
                  Abrir el cajón de dinero al cobrar en efectivo
                  <span className="block text-xs text-slate-500">
                    Sólo con efectivo. Un cajón que se abre con cada tarjeta
                    acaba quedándose abierto.
                  </span>
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-slate-600">
                  Texto al pie del ticket
                </span>
                <input
                  value={form.pie}
                  onChange={(e) => setForm({ ...form, pie: e.target.value })}
                  placeholder="Gracias por su compra · Cambios dentro de 15 días con ticket"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </label>
            </>
          )}
        </div>

        {form.modo === 'NAVEGADOR' && (
          <p className="mt-4 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 flex gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            El servidor no alcanza una impresora conectada por USB a la caja. El
            punto de venta abrirá el ticket y lo mandará con el diálogo de
            impresión del navegador, que es como funcionaba hasta ahora.
          </p>
        )}

        {aviso && (
          <p className={`mt-4 text-sm font-medium ${aviso.bien ? 'text-emerald-600' : 'text-amber-700'}`}>
            {aviso.texto}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={guardar}
            disabled={guardando || (form.modo === 'RED' && !form.host.trim())}
            title={
              form.modo === 'RED' && !form.host.trim()
                ? 'Una impresora de red necesita su dirección IP'
                : 'Guardar la configuración de esta caja'
            }
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
          {form.modo === 'RED' && (
            <button
              onClick={probar}
              disabled={probando || !form.host.trim()}
              title="Manda una página de prueba a esta impresora"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-slate-700 disabled:opacity-50"
            >
              {probando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              Probar impresora
            </button>
          )}
        </div>
        {form.modo === 'RED' && (
          <p className="text-xs text-slate-500 mt-2">
            La prueba usa lo que está <strong>guardado</strong> para esta caja.
            Si acabas de cambiar la dirección, guarda primero.
          </p>
        )}
      </section>
    </div>
  );
}
