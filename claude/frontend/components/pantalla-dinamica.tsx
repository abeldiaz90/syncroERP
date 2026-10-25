'use client';
/**
 * ============================================================================
 * EL REGISTRO DE COMPONENTES DE UNA PANTALLA DINÁMICA
 * ----------------------------------------------------------------------------
 * Esto es lo que faltaba del lado del ERP para que una pantalla descrita por
 * SUMA se pueda dibujar sin desplegar nada: el contrato ya decía qué se acepta
 * y ya rechazaba lo que no; aquí está quien lo pinta.
 *
 * ── LA REGLA QUE SOSTIENE TODO ─────────────────────────────────────────────
 * Un componente desconocido NO se dibuja y NO se salta.
 *
 * El contrato rechaza el esquema entero antes de llegar aquí, así que en teoría
 * esto no debería pasar nunca. Se trata igual, porque «no debería pasar» no es
 * una garantía: si alguien pinta un esquema sin validarlo, saltarse el campo
 * dejaría un dato obligatorio sin capturar y la pantalla se vería completa. El
 * expediente nacería incompleto con aspecto de completo, que es el defecto más
 * caro de los que persigue este proyecto. Así que se pinta un hueco que dice lo
 * que pasa y nombra el componente.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE ────────────────────────────────────────────
 * No valida formatos. El CURP, el RFC y el código postal los valida el servidor,
 * que es quien tiene los catálogos; aquí sólo se ponen el teclado y el teclado
 * correcto —`inputMode`, `autoComplete`, `maxLength`— para que capturar duela
 * menos. Una segunda copia de la validación acabaría separándose de la buena.
 * ============================================================================
 */

import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

import { Campo, Entrada, Seleccion } from '@/components/ui';
import {
  campoVisible,
  type CampoDinamico,
  type ComponenteDibujable,
  type EsquemaDePantalla,
  type PasoDinamico,
  type ValoresDinamicos,
} from '@/lib/pantalla-dinamica';

import { useT } from '@/components/I18nProvider';
type PropsDeCampo = {
  campo: CampoDinamico;
  valor: unknown;
  onCambio: (nombre: string, valor: unknown) => void;
  error?: string;
  soloLectura?: boolean;
};

const comoTexto = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v);

/** Las props sueltas del esquema, acotadas a lo que un input entiende. */
const num = (p: CampoDinamico['props'], k: string): number | undefined => {
  const v = p?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};
const txt = (p: CampoDinamico['props'], k: string): string | undefined => {
  const v = p?.[k];
  return typeof v === 'string' && v ? v : undefined;
};

/* ── Los diecisiete ──────────────────────────────────────────────────────── */

function Texto({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
  return (
    <Entrada
      type="text"
      value={comoTexto(valor)}
      error={Boolean(error)}
      disabled={soloLectura}
      maxLength={num(campo.props, 'largoMaximo')}
      placeholder={txt(campo.props, 'ejemplo')}
      onChange={(e) => onCambio(campo.nombre, e.target.value)}
    />
  );
}

function TextoLargo({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
  return (
    <textarea
      className={`campo min-h-24 py-2 ${error ? 'campo-error' : ''}`}
      value={comoTexto(valor)}
      disabled={soloLectura}
      maxLength={num(campo.props, 'largoMaximo') ?? 1000}
      placeholder={txt(campo.props, 'ejemplo')}
      onChange={(e) => onCambio(campo.nombre, e.target.value)}
    />
  );
}

function Numero({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
  return (
    <Entrada
      type="number"
      inputMode="decimal"
      value={comoTexto(valor)}
      error={Boolean(error)}
      disabled={soloLectura}
      min={num(campo.props, 'minimo')}
      max={num(campo.props, 'maximo')}
      step={num(campo.props, 'paso') ?? 'any'}
      onChange={(e) =>
        onCambio(campo.nombre, e.target.value === '' ? '' : Number(e.target.value))
      }
    />
  );
}

/**
 * Moneda. El símbolo va fuera del campo y no dentro del valor: lo que se
 * captura es un número, y meterle el «$» obligaría a limpiarlo en el servidor.
 */
function Moneda({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
      <Entrada
        type="number"
        inputMode="decimal"
        className="pl-7"
        value={comoTexto(valor)}
        error={Boolean(error)}
        disabled={soloLectura}
        min={num(campo.props, 'minimo') ?? 0}
        max={num(campo.props, 'maximo')}
        step="0.01"
        onChange={(e) =>
          onCambio(campo.nombre, e.target.value === '' ? '' : Number(e.target.value))
        }
      />
    </div>
  );
}

function Fecha({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
  return (
    <Entrada
      type="date"
      value={comoTexto(valor)}
      error={Boolean(error)}
      disabled={soloLectura}
      min={txt(campo.props, 'desde')}
      max={txt(campo.props, 'hasta')}
      onChange={(e) => onCambio(campo.nombre, e.target.value)}
    />
  );
}

/**
 * Selección. La opción vacía dice «Elige una opción» y no se queda en blanco:
 * un desplegable que abre con el primer valor ya puesto hace que la gente lo
 * envíe sin haber elegido.
 */
function Eleccion({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
  const t = useT();
  return (
    <Seleccion
      value={comoTexto(valor)}
      error={Boolean(error)}
      disabled={soloLectura}
      onChange={(e) => onCambio(campo.nombre, e.target.value)}
    >
      <option value="">{t("Elige una opción…")}</option>
      {(campo.opciones ?? []).map((o) => (
        <option key={o.valor} value={o.valor}>
          {t(o.etiqueta)}
        </option>
      ))}
    </Seleccion>
  );
}

/** Selección múltiple con casillas: un `select multiple` no se usa bien en móvil. */
function EleccionMultiple({ campo, valor, onCambio, soloLectura }: PropsDeCampo) {
  const t = useT();
  const puestos = Array.isArray(valor) ? (valor as string[]) : [];
  const alternar = (v: string) =>
    onCambio(
      campo.nombre,
      puestos.includes(v) ? puestos.filter((x) => x !== v) : [...puestos, v],
    );
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5">
      {(campo.opciones ?? []).map((o) => (
        <label key={o.valor} className="flex items-center gap-2 text-[13px] text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded"
            checked={puestos.includes(o.valor)}
            disabled={soloLectura}
            onChange={() => alternar(o.valor)}
          />
          {t(o.etiqueta)}
        </label>
      ))}
      {!(campo.opciones ?? []).length && (
        <p className="text-[12px] text-slate-400">{t("Sin opciones configuradas.")}</p>
      )}
    </div>
  );
}

function Booleano({ campo, valor, onCambio, soloLectura }: PropsDeCampo) {
  const t = useT();
  return (
    <label className="flex items-center gap-2 text-[13px] text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded"
        checked={valor === true}
        disabled={soloLectura}
        onChange={(e) => onCambio(campo.nombre, e.target.checked)}
      />
      {txt(campo.props, 'textoSi') ?? t("Sí")}
    </label>
  );
}

/**
 * CURP y RFC en mayúsculas desde el teclado. No es cosmético: quien captura en
 * minúsculas obtiene un «no coincide» del servidor por algo que la pantalla
 * podía resolver sola.
 */
function Mayusculas(largo: number) {
  return function CampoEnMayusculas({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
    return (
      <Entrada
        type="text"
        className="uppercase font-mono tracking-wide"
        value={comoTexto(valor)}
        error={Boolean(error)}
        disabled={soloLectura}
        maxLength={num(campo.props, 'largoMaximo') ?? largo}
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(e) => onCambio(campo.nombre, e.target.value.toUpperCase())}
      />
    );
  };
}

function Telefono({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
  return (
    <Entrada
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={comoTexto(valor)}
      error={Boolean(error)}
      disabled={soloLectura}
      maxLength={num(campo.props, 'largoMaximo') ?? 15}
      onChange={(e) => onCambio(campo.nombre, e.target.value.replace(/[^\d+\-() ]/g, ''))}
    />
  );
}

function Correo({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
  return (
    <Entrada
      type="email"
      inputMode="email"
      autoComplete="email"
      spellCheck={false}
      value={comoTexto(valor)}
      error={Boolean(error)}
      disabled={soloLectura}
      onChange={(e) => onCambio(campo.nombre, e.target.value.trim())}
    />
  );
}

function CodigoPostal({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
  return (
    <Entrada
      type="text"
      inputMode="numeric"
      autoComplete="postal-code"
      className="w-32 font-mono"
      value={comoTexto(valor)}
      error={Boolean(error)}
      disabled={soloLectura}
      maxLength={5}
      onChange={(e) => onCambio(campo.nombre, e.target.value.replace(/\D/g, ''))}
    />
  );
}

/**
 * Documento, foto y firma son los tres de archivo. Se guarda el `File`, no su
 * nombre: lo que hay que subir es el archivo, y quedarse con el nombre es la
 * forma de descubrir en el servidor que no se mandó nada.
 */
function Archivo(acepta: string, captura?: 'user' | 'environment') {
  const t = useT();
  return function CampoDeArchivo({ campo, valor, onCambio, error, soloLectura }: PropsDeCampo) {
    const puesto = valor instanceof File ? valor : null;
    return (
      <div>
        <input
          type="file"
          accept={txt(campo.props, 'acepta') ?? acepta}
          capture={captura}
          disabled={soloLectura}
          className={`campo py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-[12px] ${error ? 'campo-error' : ''}`}
          onChange={(e) => onCambio(campo.nombre, e.target.files?.[0] ?? null)}
        />
        {puesto && (
          <p className="mt-1 text-[11px] text-slate-500">
            {t("{n0} · {n1} KB", { n0: puesto.name, n1: (puesto.size / 1024).toFixed(0) })}</p>
        )}
      </div>
    );
  };
}

/** Un aviso no se captura: se lee. No lleva valor ni cuenta como obligatorio. */
function Aviso({ campo }: PropsDeCampo) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
      <Info className="mt-px h-4 w-4 shrink-0 text-sky-600" />
      <p className="text-[12.5px] leading-snug text-sky-900">
        {txt(campo.props, 'texto') ?? campo.etiqueta}
      </p>
    </div>
  );
}

/**
 * EL REGISTRO. Las llaves tienen que ser exactamente los componentes que
 * declara `COMPONENTES_QUE_SE_DIBUJAN`, que a su vez tienen que ser los del
 * contrato. Lo vigila `el-portal-dibuja-lo-que-el-contrato-declara.spec.ts`.
 */
export const REGISTRO: Record<ComponenteDibujable, React.ComponentType<PropsDeCampo>> = {
  texto: Texto,
  'texto-largo': TextoLargo,
  numero: Numero,
  moneda: Moneda,
  fecha: Fecha,
  seleccion: Eleccion,
  'seleccion-multiple': EleccionMultiple,
  booleano: Booleano,
  curp: Mayusculas(18),
  rfc: Mayusculas(13),
  telefono: Telefono,
  correo: Correo,
  'codigo-postal': CodigoPostal,
  documento: Archivo('application/pdf,image/*'),
  firma: Archivo('image/*'),
  foto: Archivo('image/*', 'environment'),
  aviso: Aviso,
};

/* ── El hueco honesto ────────────────────────────────────────────────────── */

function NoSeDibuja({ campo }: { campo: CampoDinamico }) {
  const t = useT();
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
    >
      <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-600" />
      <div className="text-[12.5px] leading-snug text-amber-900">
        <b>{t("Este portal no sabe dibujar «{n0}».", { n0: String(campo.componente) })}</b>
        <p className="mt-0.5">
          El campo «{t(campo.etiqueta)}» no se puede capturar aquí. No se omite a
          propósito: omitirlo dejaría el expediente incompleto con aspecto de
          completo. Avisa a quien configuró el flujo.
        </p>
      </div>
    </div>
  );
}

/* ── Un campo ────────────────────────────────────────────────────────────── */

export function CampoDePantalla(props: PropsDeCampo) {
  const t = useT();
  const Componente = REGISTRO[props.campo.componente];
  if (!Componente) return <NoSeDibuja campo={props.campo} />;

  /* El aviso no lleva etiqueta ni asterisco: no es un campo que se llene. */
  if (props.campo.componente === 'aviso') return <Componente {...props} />;

  return (
    <Campo
      etiqueta={t(props.campo.etiqueta)}
      requerido={props.campo.requerido}
      ayuda={t(props.campo.ayuda)}
      error={props.error}
    >
      <Componente {...props} />
    </Campo>
  );
}

/* ── Un paso ─────────────────────────────────────────────────────────────── */

export function PasoDePantalla({
  paso, valores, onCambio, errores = {}, soloLectura,
}: {
  paso: PasoDinamico;
  valores: ValoresDinamicos;
  onCambio: (nombre: string, valor: unknown) => void;
  errores?: Record<string, string>;
  soloLectura?: boolean;
}) {
  const t = useT();
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-[15px] font-bold text-slate-900">{t(paso.titulo)}</h3>
        {paso.descripcion && (
          <p className="mt-0.5 text-[12.5px] text-slate-500">{t(paso.descripcion)}</p>
        )}
      </div>
      <div className="space-y-3.5">
        {paso.campos.filter((c) => campoVisible(c, valores)).map((campo) => (
          <CampoDePantalla
            key={campo.nombre}
            campo={campo}
            valor={valores[campo.nombre]}
            onCambio={onCambio}
            error={errores[campo.nombre]}
            soloLectura={soloLectura}
          />
        ))}
      </div>
    </section>
  );
}

/* ── El esquema entero ───────────────────────────────────────────────────── */

export function PantallaDinamica({
  esquema, valores, onCambio, errores = {}, soloLectura,
}: {
  esquema: EsquemaDePantalla;
  valores: ValoresDinamicos;
  onCambio: (nombre: string, valor: unknown) => void;
  errores?: Record<string, string>;
  soloLectura?: boolean;
}) {
  return (
    <div className="space-y-7">
      {esquema.pasos.map((paso) => (
        <PasoDePantalla
          key={paso.id}
          paso={paso}
          valores={valores}
          onCambio={onCambio}
          errores={errores}
          soloLectura={soloLectura}
        />
      ))}
    </div>
  );
}
