// app/components/AsistenteConfiguracion.tsx
"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermiso } from '@/hooks/use-permisos';
import {
  Sparkles, CheckCircle2, Circle, ChevronRight, ChevronDown,
  ChevronUp, X, Loader2, Rocket, ArrowRight,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════
// Cada paso: cómo se detecta si está completo, a dónde lleva, y su texto.
//   endpoint  → se consulta para saber si ya hay datos
//   completoSi→ función que recibe la respuesta y decide si está hecho
//   ruta      → a dónde llevar al usuario si falta
// ═══════════════════════════════════════════════════════════════════════
interface PasoDef {
  clave: string;
  titulo: string;
  descripcion: string;
  endpoint: string;
  completoSi: (data: any) => boolean;
  ruta: string;
  textoBoton: string;
  opcional?: boolean;
  /**
   * Paso de puesta en marcha de la EMPRESA, no del puesto de nadie.
   *
   * Los dos que lo llevan —la identidad fiscal y la activación de Finanzas— se
   * corren una vez, al abrir la empresa. No se retiraban por el 403 de su
   * comprobación porque `/finanzas/activacion/acceso` responde 200 a cualquiera
   * (es una sonda de «¿ya está activo?», no un dato reservado), así que al
   * almacenista le seguía apareciendo «Activar Finanzas de forma segura» como
   * pendiente suyo, con un botón que lo lleva a una pantalla que le niega el
   * paso.
   */
  soloAdministracion?: boolean;
}

const PASOS: PasoDef[] = [
  {
    clave: 'almacen',
    titulo: 'Crear un almacén',
    descripcion: 'Necesitas al menos un almacén para guardar inventario.',
    endpoint: '/catalogo/almacenes',
    completoSi: (d) => Array.isArray(d) && d.length > 0,
    ruta: '/dashboard/almacenes',
    textoBoton: 'Crear almacén',
  },
  {
    clave: 'fiscalMexico',
    titulo: 'Completar configuración fiscal México',
    descripcion: 'Captura los datos de tu constancia y prepara cuentas e impuestos con guía SAT.',
    endpoint: '/cfdi/configuracion-mexico/diagnostico',
    completoSi: (d) => d?.configuracionBaseCompleta === true,
    ruta: '/configuracion-inicial',
    textoBoton: 'Abrir asistente',
    soloAdministracion: true,
  },
  {
    clave: 'activarFinanzas',
    titulo: 'Activar Finanzas de forma segura',
    descripcion: 'Define cómo opera la empresa, revisa saldos y prueba la apertura antes de habilitar los libros.',
    endpoint: '/finanzas/activacion/acceso',
    completoSi: (d) => d?.activa === true,
    ruta: '/configuracion-financiera',
    textoBoton: 'Configurar Finanzas',
    soloAdministracion: true,
  },
  {
    clave: 'categorias',
    titulo: 'Crear categorías de productos',
    descripcion: 'Agrupan tus productos y los enlazan a sus cuentas contables.',
    endpoint: '/catalogo/categorias',
    completoSi: (d) => Array.isArray(d) && d.length > 0,
    ruta: '/dashboard/categorias',
    textoBoton: 'Crear categorías',
  },
  {
    clave: 'unidades',
    titulo: 'Definir unidades de medida',
    descripcion: 'Pieza, kilo, litro… cómo se miden tus productos.',
    endpoint: '/catalogo/unidades-medida',
    completoSi: (d) => Array.isArray(d) && d.length > 0,
    ruta: '/dashboard/unidades-medida',
    textoBoton: 'Configurar unidades',
  },
  {
    clave: 'marcas',
    titulo: 'Registrar marcas',
    descripcion: 'Opcional, pero útil para organizar y filtrar productos.',
    endpoint: '/catalogo/marcas',
    completoSi: (d) => Array.isArray(d) && d.length > 0,
    ruta: '/dashboard/marcas',
    textoBoton: 'Crear marcas',
    opcional: true,
  },
  {
    clave: 'productos',
    titulo: 'Dar de alta tu primer producto',
    descripcion: 'Con lo anterior listo, ya puedes crear productos completos.',
    endpoint: '/catalogo/productos',
    completoSi: (d) => (Array.isArray(d) && d.length > 0) || (d?.data && d.data.length > 0) || (d?.total > 0),
    ruta: '/dashboard/productos',
    textoBoton: 'Crear producto',
  },
];

interface EstadoPaso extends PasoDef { completo: boolean; }

export default function AsistenteConfiguracion({
  // Si lo pones dentro de la página de productos, puedes pasar onCrearProducto
  // para que el último paso abra el modal en vez de navegar.
  onCrearProducto,
}: {
  onCrearProducto?: () => void;
}) {
  const router = useRouter();
  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('syncro_token') ?? '' : '');

  const [pasos, setPasos] = useState<EstadoPaso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [colapsado, setColapsado] = useState(false);
  const [oculto, setOculto] = useState(false);
  const { tienePermiso } = usePermiso();
  const puedeAdministrar = tienePermiso('GET', '/api/configuracion/empresa');

  /*
   * ══════════════════════════════════════════════════════════════════════
   * Cada quien ve sólo los pasos que son suyos
   * ----------------------------------------------------------------------
   * La lista era la misma para todos, y eso le ponía al almacenista dos
   * renglones que no le tocan —«Completar configuración fiscal México» y
   * «Activar Finanzas»— con sus botones. Los endpoints que los verifican le
   * responden 403, así que se quedaban marcados como pendientes para siempre,
   * el contador de progreso nunca llegaba a 100 y el paso «Dar de alta tu
   * primer producto» aparecía condicionado a «con lo anterior listo». Quien
   * acomoda mercancía no tiene por qué saber qué es un régimen fiscal, ni
   * puede capturarlo: los botones lo llevaban a una pantalla que le decía «no
   * tienes permisos».
   *
   * Un 403 en la comprobación no significa «falta»: significa «no es tuyo».
   * Esos pasos se retiran de la lista, no se marcan pendientes. Si al final no
   * queda ninguno que sea suyo, el asistente no se pinta.
   * ══════════════════════════════════════════════════════════════════════
   */
  const revisarEstado = async () => {
    setCargando(true);
    const h = { Authorization: `Bearer ${tok()}` };

    const resultados = await Promise.all(
      PASOS.map(async (paso) => {
        // Los pasos de puesta en marcha de la empresa son del administrador.
        if (paso.soloAdministracion && !puedeAdministrar) return null;
        try {
          const r = await fetch(`${api}${paso.endpoint}`, { headers: h });
          if (r.status === 401 || r.status === 403) return null;
          const d = r.ok ? await r.json().catch(() => null) : null;
          return { ...paso, completo: paso.completoSi(d) };
        } catch {
          return { ...paso, completo: false };
        }
      }),
    );
    setPasos(resultados.filter((p): p is EstadoPaso => p !== null));
    setCargando(false);
  };

  /*
   * Depende de `puedeAdministrar`: los permisos llegan en una segunda vuelta y
   * al primer render `tienePermiso` todavía dice que no. Sin esta dependencia,
   * al administrador le faltarían para siempre los dos pasos de puesta en
   * marcha de la empresa, que son justamente los suyos.
   */
  useEffect(() => { revisarEstado(); }, [puedeAdministrar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalcular cuando la ventana recupera foco (el usuario volvió de crear algo)
  useEffect(() => {
    const onFocus = () => revisarEstado();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const obligatorios = pasos.filter((p) => !p.opcional);
  const completos = obligatorios.filter((p) => p.completo).length;
  const total = obligatorios.length;
  const progreso = total > 0 ? Math.round((completos / total) * 100) : 0;
  const todoListo = completos === total && total > 0;

  const irA = (paso: EstadoPaso) => {
    if (paso.clave === 'productos' && onCrearProducto) {
      onCrearProducto();
      return;
    }
    router.push(paso.ruta);
  };

  // Si el usuario lo ocultó manualmente en esta sesión, no molestar
  if (oculto) return null;

  // Ningún paso de esta lista es suyo: el asistente no tiene nada que decirle.
  if (!cargando && pasos.length === 0) return null;

  // Si ya está TODO listo, mostrar una versión mínima de felicitación (una vez)
  if (!cargando && todoListo) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-emerald-900">Tu parte ya está lista</p>
          {/*
            * Antes decía «ya puedes vender», y la lista es ahora por perfil:
            * al almacenista le quedan sus pasos, no los de la empresa entera.
            * Decirle que ya puede vender es prometerle algo que ni le toca ni
            * puede hacer.
            */}
          <p className="text-sm text-emerald-700">
            Completaste los pasos que te corresponden en la puesta en marcha.
          </p>
        </div>
        <button onClick={() => setOculto(true)} className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-full">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 overflow-hidden">
      {/* Cabecera */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <Rocket className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white flex items-center gap-2">
              Primeros pasos para vender
            </h3>
            <p className="text-indigo-100 text-sm">
              {cargando ? 'Revisando tu configuración…' : `${completos} de ${total} pasos completados`}
            </p>
          </div>
          <button
            onClick={() => setColapsado((c) => !c)}
            className="p-2 text-white/80 hover:bg-white/10 rounded-lg"
            title={colapsado ? 'Expandir' : 'Colapsar'}
          >
            {colapsado ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>

        {/* Barra de progreso */}
        {!cargando && (
          <div className="mt-3">
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${progreso}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Lista de pasos */}
      {!colapsado && (
        <div className="p-4">
          {cargando ? (
            <div className="py-8 text-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Revisando qué tienes configurado…
            </div>
          ) : (
            <div className="space-y-2">
              {pasos.map((paso) => (
                <div
                  key={paso.clave}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    paso.completo
                      ? 'bg-emerald-50 border-emerald-100'
                      : 'bg-slate-50 border-slate-200 hover:border-indigo-200'
                  }`}
                >
                  {/* Icono de estado */}
                  {paso.completo ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="w-6 h-6 text-slate-300 shrink-0" />
                  )}

                  {/* Texto */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${paso.completo ? 'text-emerald-800 line-through' : 'text-slate-800'}`}>
                      {paso.titulo}
                      {paso.opcional && (
                        <span className="ml-2 text-[10px] font-normal text-slate-400 uppercase">opcional</span>
                      )}
                    </p>
                    {!paso.completo && (
                      <p className="text-xs text-slate-500 mt-0.5">{paso.descripcion}</p>
                    )}
                  </div>

                  {/* Botón de acción (solo si falta) */}
                  {!paso.completo && (
                    <button
                      onClick={() => irA(paso)}
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      {paso.textoBoton} <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pie */}
          {!cargando && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={revisarEstado}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <Loader2 className="w-3 h-3" /> Actualizar estado
              </button>
              <button
                onClick={() => setOculto(true)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Ocultar por ahora
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
