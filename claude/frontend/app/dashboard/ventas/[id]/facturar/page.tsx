"use client";

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSignature,
  Loader2,
  ReceiptText,
} from 'lucide-react';

import { api, ApiError } from '@/lib/api';

type ClienteVenta = {
  id: string;
  nombre: string;
  razonSocial?: string;
  rfc?: string;
  codigoPostal?: string;
  email?: string;
};

type Venta = {
  id: string;
  folio: number;
  fechaVenta: string;
  total: number;
  estado: string;
  cliente?: ClienteVenta;
};

type Factura = {
  id: string;
  serie: string;
  folio: number;
  uuid: string;
  estado: string;
  total: number;
};

const FORMULARIO_INICIAL = {
  rfcReceptor: '',
  nombreReceptor: '',
  regimenFiscalReceptor: '',
  codigoPostalReceptor: '',
  usoCFDI: 'G03',
  notas: '',
};

export default function FacturarVentaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const ventaId = params.id;

  const [venta, setVenta] = useState<Venta | null>(null);
  const [form, setForm] = useState(FORMULARIO_INICIAL);
  const [cargando, setCargando] = useState(true);
  const [timbrando, setTimbrando] = useState(false);
  const [error, setError] = useState('');
  const [factura, setFactura] = useState<Factura | null>(null);

  useEffect(() => {
    let activo = true;
    void api
      .get<Venta>(`/ventas/${ventaId}`)
      .then((datos) => {
        if (!activo) return;
        setVenta(datos);
        const publico = !datos.cliente;
        setForm({
          rfcReceptor: datos.cliente?.rfc || (publico ? 'XAXX010101000' : ''),
          nombreReceptor:
            datos.cliente?.razonSocial ||
            datos.cliente?.nombre ||
            'PUBLICO EN GENERAL',
          regimenFiscalReceptor: publico ? '616' : '',
          codigoPostalReceptor: datos.cliente?.codigoPostal || '',
          usoCFDI: publico ? 'S01' : 'G03',
          notas: `Factura de venta #${datos.folio}`,
        });
      })
      .catch((e) => {
        if (!activo) return;
        setError(
          e instanceof ApiError
            ? e.mensajeParaPantalla()
            : 'No se pudo cargar la venta.',
        );
      })
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [ventaId]);

  const valido = useMemo(
    () =>
      /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i.test(form.rfcReceptor.trim()) &&
      form.nombreReceptor.trim().length > 1 &&
      /^\d{3}$/.test(form.regimenFiscalReceptor.trim()) &&
      /^\d{5}$/.test(form.codigoPostalReceptor.trim()) &&
      /^[A-Z0-9]{3}$/i.test(form.usoCFDI.trim()),
    [form],
  );

  const timbrar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valido || !venta) return;
    setTimbrando(true);
    setError('');
    try {
      const resultado = await api.post<Factura>(
        `/cfdi/ventas/${venta.id}/timbrar`,
        {
          ...form,
          rfcReceptor: form.rfcReceptor.trim().toUpperCase(),
          nombreReceptor: form.nombreReceptor.trim().toUpperCase(),
          regimenFiscalReceptor: form.regimenFiscalReceptor.trim(),
          codigoPostalReceptor: form.codigoPostalReceptor.trim(),
          usoCFDI: form.usoCFDI.trim().toUpperCase(),
          notas: form.notas.trim() || undefined,
        },
        { headers: { 'Idempotency-Key': `VENTA:${venta.id}` } },
      );
      setFactura(resultado);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : 'No se pudo timbrar la factura.',
      );
    } finally {
      setTimbrando(false);
    }
  };

  if (cargando) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="w-9 h-9 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!venta) {
    return (
      <div className="max-w-xl mx-auto p-8 mt-12 bg-white border rounded-2xl">
        <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
        <h1 className="text-xl font-bold">No fue posible abrir la venta</h1>
        <p className="text-slate-500 mt-2">{error}</p>
      </div>
    );
  }

  if (factura) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-8">
        <div className="bg-white border border-emerald-200 rounded-3xl p-8 text-center shadow-sm">
          <div className="w-20 h-20 rounded-full bg-emerald-100 grid place-items-center mx-auto">
            <CheckCircle2 className="w-11 h-11 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black mt-5">CFDI timbrado</h1>
          <p className="text-slate-500 mt-2">
            {factura.serie}-{factura.folio} · Venta #{venta.folio}
          </p>
          <p className="font-mono text-xs break-all bg-slate-50 rounded-xl p-3 mt-5">
            {factura.uuid}
          </p>
          <div className="grid sm:grid-cols-2 gap-3 mt-6">
            <button
              onClick={() =>
                void api.descargar(
                  `/cfdi/${factura.id}/pdf`,
                  `${factura.serie}${factura.folio}.pdf`,
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-3 font-bold"
            >
              <Download className="w-4 h-4" /> Descargar PDF
            </button>
            <button
              onClick={() =>
                void api.descargar(
                  `/cfdi/${factura.id}/xml`,
                  `${factura.serie}${factura.folio}.xml`,
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 font-bold"
            >
              <ReceiptText className="w-4 h-4" /> Descargar XML
            </button>
          </div>
          <button
            onClick={() => router.push('/dashboard/ventas/historial')}
            className="mt-6 text-sm font-semibold text-indigo-600"
          >
            Volver al historial
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-slate-600 mb-5"
      >
        <ArrowLeft className="w-4 h-4" /> Regresar
      </button>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 md:p-8 border-b border-slate-100 flex gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 grid place-items-center shrink-0">
            <FileSignature className="w-6 h-6 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Facturar venta #{venta.folio}</h1>
            <p className="text-sm text-slate-500 mt-1">
              Total: ${Number(venta.total).toLocaleString('es-MX', {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        <form onSubmit={timbrar} className="p-6 md:p-8 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-4 rounded-xl bg-rose-50 text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" /> {error}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Campo
              label="RFC receptor"
              value={form.rfcReceptor}
              onChange={(value) => setForm((v) => ({ ...v, rfcReceptor: value }))}
              maxLength={13}
            />
            <Campo
              label="Código postal fiscal"
              value={form.codigoPostalReceptor}
              onChange={(value) =>
                setForm((v) => ({ ...v, codigoPostalReceptor: value }))
              }
              maxLength={5}
            />
          </div>
          <Campo
            label="Nombre o razón social"
            value={form.nombreReceptor}
            onChange={(value) =>
              setForm((v) => ({ ...v, nombreReceptor: value }))
            }
            maxLength={300}
          />
          <div className="grid md:grid-cols-2 gap-4">
            <Campo
              label="Régimen fiscal"
              value={form.regimenFiscalReceptor}
              onChange={(value) =>
                setForm((v) => ({ ...v, regimenFiscalReceptor: value }))
              }
              placeholder="Ej. 601"
              maxLength={3}
            />
            <Campo
              label="Uso CFDI"
              value={form.usoCFDI}
              onChange={(value) => setForm((v) => ({ ...v, usoCFDI: value }))}
              placeholder="Ej. G03"
              maxLength={3}
            />
          </div>
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1.5">
              Observaciones
            </span>
            <textarea
              value={form.notas}
              onChange={(e) => setForm((v) => ({ ...v, notas: e.target.value }))}
              maxLength={500}
              className="w-full min-h-24 rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
            />
          </label>

          <button
            type="submit"
            disabled={!valido || timbrando || venta.estado === 'ANULADA'}
            className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3.5 font-black"
          >
            {timbrando ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <FileSignature className="w-5 h-5" />
            )}
            Timbrar CFDI
          </button>
        </form>
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1.5">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        required
        className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500"
      />
    </label>
  );
}
