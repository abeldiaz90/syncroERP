"use client";

/**
 * ============================================================================
 * Roles y accesos — la única pantalla de roles del ERP
 * ----------------------------------------------------------------------------
 * Se administra por MÓDULO, que es como se habla de esto fuera del código: el
 * almacenista atiende el almacén, recursos humanos atiende recursos humanos.
 *
 * Tres estados por módulo, y no más, porque son los que un administrador sabe
 * explicar sin abrir el código:
 *
 *   Acceso completo → ver, crear, modificar y eliminar dentro del módulo
 *   Solo consulta   → únicamente leer
 *   Sin acceso      → nada
 *
 * Hay un cuarto estado que se muestra pero no se elige: «ajustado a mano».
 * Aparece cuando alguien afinó acciones sueltas con el detalle de abajo. No se
 * pierde al guardar: solo se reescriben los módulos que se tocaron.
 *
 * Qué NO cambió: `rol_endpoint_permiso` sigue siendo el motor y
 * `PermisoEndpointGuard` le sigue preguntando endpoint por endpoint. Un módulo
 * es un conjunto de rutas declarado en el backend (`modulos-catalogo.ts`);
 * conceder un módulo enciende sus endpoints. La decisión de qué ruta pertenece
 * a qué módulo vive en un solo sitio, y no es éste.
 *
 * Sobre «un usuario tiene un rol o roles»: hoy `usuario.rol` es una sola
 * columna, y de ese único valor dependen la estrategia JWT, el guard y el mapeo
 * hacia Fineract. Varios roles por usuario es un cambio de esquema con
 * consecuencias de autorización; queda planteado y sin hacer a propósito.
 * ============================================================================
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { confirmarElegante } from '@/components/ui/dialogos';
import {
  Shield, Save, Plus, X, Loader2, ChevronDown, ChevronRight, Check, Sparkles,
  Users, Crown, SlidersHorizontal, AlertTriangle, ShoppingCart, FileText,
  CreditCard, ShoppingBag, Truck, BedDouble, Target, CheckCircle2, Package,
  Tags, BookMarked, ChefHat, Calculator, Landmark, Wallet, Building2, UserCog,
  LayoutDashboard, Link2, ShieldCheck, HelpCircle, type LucideIcon,
} from 'lucide-react';
import { esRolAdministrador } from '@/lib/roles';

// ── Tipos ───────────────────────────────────────────────────────────────────

type Acceso = 'completo' | 'consulta' | 'ninguno';
type EstadoModulo = Acceso | 'parcial';

interface IResumenRol {
  rol: string;
  etiqueta: string;
  descripcion: string;
  esAdministrador: boolean;
  tienePlantilla: boolean;
  usuarios: number;
  accionesActivas: number | null;
}

interface IModulo {
  id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  grupo: string;
  orden: number;
  sensible: boolean;
  acciones: number;
  accionesConsulta: number;
  activos: number;
  consultaActivos: number;
  estado: EstadoModulo;
  /** Módulo propio del rol: se le puede quitar la escritura, no el acceso. */
  minimo?: boolean;
}

interface IAccion { id: string; metodo: string; ruta: string; nombre: string; permitido: boolean }
interface ISeccion { clave: string; etiqueta: string; rutaFrontend: string | null; acciones: IAccion[] }

// ── Diccionarios de presentación ────────────────────────────────────────────

const ICONOS: Record<string, LucideIcon> = {
  ShoppingCart, FileText, CreditCard, ShoppingBag, Truck, BedDouble, Target,
  CheckCircle2, Package, Tags, BookMarked, ChefHat, Calculator, Landmark,
  Wallet, Building2, UserCog, LayoutDashboard, Link2, ShieldCheck, HelpCircle,
  Users, Shield,
};

/** Un verbo HTTP no le dice nada a quien reparte accesos; una acción sí. */
const ACCION_DE_METODO: Record<string, string> = {
  GET: 'Consultar', POST: 'Crear', PUT: 'Modificar', PATCH: 'Modificar', DELETE: 'Eliminar',
};
const COLOR_ACCION: Record<string, { bg: string; text: string; border: string }> = {
  Consultar: { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  Crear:     { bg: '#ede9fe', text: '#6d28d9', border: '#ddd6fe' },
  Modificar: { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  Eliminar:  { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' },
};
const accionDe = (metodo: string) => ACCION_DE_METODO[String(metodo ?? '').toUpperCase()] ?? 'Consultar';

const ORDEN_GRUPOS = ['Operación', 'Catálogos', 'Finanzas', 'Personas', 'Sistema'];

const ESTILO_ACCESO: Record<EstadoModulo, { etiqueta: string; color: string; bg: string; border: string }> = {
  completo: { etiqueta: 'Acceso completo', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  consulta: { etiqueta: 'Solo consulta',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  parcial:  { etiqueta: 'Ajustado a mano', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  ninguno:  { etiqueta: 'Sin acceso',      color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
};

// ── Piezas ──────────────────────────────────────────────────────────────────

function Selector({ valor, onChange, deshabilitado, minimo }: {
  valor: EstadoModulo; onChange: (a: Acceso) => void; deshabilitado?: boolean;
  /*
   * `minimo` marca los módulos propios del rol. «Sin acceso» se muestra pero no
   * se puede elegir: el servidor lo devolvería a consulta de todos modos, y un
   * botón que se deshace solo confunde más que uno que explica por qué no.
   */
  minimo?: boolean;
}) {
  const opciones: Array<{ id: Acceso; texto: string }> = [
    { id: 'ninguno', texto: 'Sin acceso' },
    { id: 'consulta', texto: 'Solo consulta' },
    { id: 'completo', texto: 'Completo' },
  ];
  return (
    <div style={{
      display: 'inline-flex', background: '#f1f5f9', borderRadius: 9, padding: 2,
      opacity: deshabilitado ? 0.5 : 1, flexShrink: 0,
    }}>
      {opciones.map(o => {
        const activo = valor === o.id;
        const est = ESTILO_ACCESO[o.id];
        const bloqueado = !!minimo && o.id === 'ninguno';
        return (
          <button key={o.id} type="button" disabled={deshabilitado || bloqueado}
            title={bloqueado ? 'Este módulo es el trabajo propio del rol: se le puede quitar la escritura, no el acceso.' : undefined}
            onClick={e => { e.stopPropagation(); if (!bloqueado) onChange(o.id); }}
            style={{
              padding: '5px 11px', borderRadius: 7, border: 'none',
              fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
              cursor: deshabilitado || bloqueado ? 'not-allowed' : 'pointer',
              opacity: bloqueado ? 0.45 : 1,
              background: activo ? '#fff' : 'transparent',
              color: activo ? est.color : '#94a3b8',
              boxShadow: activo ? '0 1px 3px rgba(15,23,42,.12)' : 'none',
              transition: 'all .15s',
            }}>
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div onClick={e => { e.stopPropagation(); onChange(); }}
      style={{
        width: 32, height: 18, borderRadius: 18, cursor: 'pointer', flexShrink: 0,
        background: on ? '#4f46e5' : '#cbd5e1', position: 'relative', transition: 'background .2s',
      }}>
      <div style={{
        position: 'absolute', top: 3, left: on ? 17 : 3, width: 12, height: 12,
        borderRadius: '50%', background: '#fff', transition: 'left .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }}/>
    </div>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function PermisosPage() {
  const [rol, setRol] = useState('');
  const [resumen, setResumen] = useState<IResumenRol[]>([]);
  const [modulos, setModulos] = useState<IModulo[]>([]);
  const [accesos, setAccesos] = useState<Record<string, Acceso>>({});
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<Record<string, ISeccion[]>>({});
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const [cargando, setCargando] = useState(true);
  const [cargandoRol, setCargandoRol] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmPlantilla, setConfirmPlantilla] = useState(false);
  const [nuevoRol, setNuevoRol] = useState('');
  const [creandoRol, setCreandoRol] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const mostrarToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  };

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });

  const cargarResumen = useCallback(async (): Promise<IResumenRol[]> => {
    const res = await fetch(`${api}/admin/permisos/resumen-roles`, { headers: h() });
    if (!res.ok) return [];
    const data: IResumenRol[] = await res.json();
    setResumen(data);
    return data;
  }, []);

  const cargarModulos = useCallback(async (r: string) => {
    setCargandoRol(true);
    const res = await fetch(`${api}/admin/permisos/rol/${encodeURIComponent(r)}/modulos`, { headers: h() });
    if (res.ok) {
      const data: IModulo[] = await res.json();
      setModulos(data);
      const mapa: Record<string, Acceso> = {};
      data.forEach(m => { if (m.estado !== 'parcial') mapa[m.id] = m.estado as Acceso; });
      setAccesos(mapa);
    }
    setTocados(new Set());
    setDetalle({});
    setAbiertos(new Set());
    setCargandoRol(false);
  }, []);

  useEffect(() => {
    (async () => {
      const lista = await cargarResumen();
      const primero = lista.find(r => !r.esAdministrador) ?? lista[0];
      if (primero) setRol(primero.rol);
      setCargando(false);
    })();
  }, []);

  useEffect(() => { if (rol) cargarModulos(rol); }, [rol]);

  const rolActual = useMemo(() => resumen.find(r => r.rol === rol), [resumen, rol]);
  const esAdmin = rolActual?.esAdministrador ?? esRolAdministrador(rol);
  const hayCambios = tocados.size > 0;

  const estadoDe = (m: IModulo): EstadoModulo => accesos[m.id] ?? (tocados.has(m.id) ? 'ninguno' : m.estado);

  const cambiarAcceso = (m: IModulo, valor: Acceso) => {
    setAccesos(prev => ({ ...prev, [m.id]: valor }));
    setTocados(prev => new Set(prev).add(m.id));
  };

  const guardar = async () => {
    const aEnviar: Record<string, Acceso> = {};
    tocados.forEach(id => { aEnviar[id] = accesos[id] ?? 'ninguno'; });
    setGuardando(true);
    const res = await fetch(`${api}/admin/permisos/rol/${encodeURIComponent(rol)}/modulos`, {
      method: 'PUT', headers: h(), body: JSON.stringify({ accesos: aEnviar, modo: 'reemplazar' }),
    });
    setGuardando(false);
    if (res.ok) {
      /*
       * El servidor devuelve qué módulos NO pudo recortar: son el trabajo
       * propio del rol y se conservan. Antes esa respuesta se tiraba y la
       * pantalla decía «guardado» a secas, así que el administrador se
       * quedaba creyendo que había restringido un rol que sigue intacto. Un
       * candado que no se ve es peor que no tener candado: nadie lo audita
       * porque nadie sabe que actuó.
       */
      const datos = await res.json().catch(() => null);
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2000);
      if (datos?.aviso) mostrarToast(datos.aviso, false);
      await Promise.all([cargarModulos(rol), cargarResumen()]);
    } else {
      mostrarToast('No se pudieron guardar los accesos.', false);
    }
  };

  const aplicarPlantilla = async () => {
    setConfirmPlantilla(false);
    setAplicando(true);
    try {
      const res = await fetch(`${api}/admin/permisos/rol/${encodeURIComponent(rol)}/aplicar-plantilla`, {
        method: 'POST', headers: h(), body: JSON.stringify({ modo: 'reemplazar' }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) {
        await Promise.all([cargarModulos(rol), cargarResumen()]);
        mostrarToast(d.mensaje || 'Accesos sugeridos aplicados.', true);
      } else {
        mostrarToast(d?.mensaje || 'Este rol no tiene accesos sugeridos.', false);
      }
    } catch {
      mostrarToast('Error de conexión con el servidor.', false);
    }
    setAplicando(false);
  };

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const res = await fetch(`${api}/admin/permisos/sincronizar`, { method: 'POST', headers: h() });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || 'No fue posible sincronizar');
      await cargarModulos(rol);
      mostrarToast(`${d?.endpoints ?? 0} acciones sincronizadas.`, true);
    } catch (e: any) {
      mostrarToast(e?.message || 'Error al sincronizar.', false);
    }
    setSincronizando(false);
  };

  const abrirDetalle = async (m: IModulo) => {
    const s = new Set(abiertos);
    if (s.has(m.id)) { s.delete(m.id); setAbiertos(s); return; }
    s.add(m.id); setAbiertos(s);
    if (detalle[m.id]) return;
    const res = await fetch(
      `${api}/admin/permisos/rol/${encodeURIComponent(rol)}/modulo/${encodeURIComponent(m.id)}`,
      { headers: h() },
    );
    if (!res.ok) return;
    const secciones = await res.json();
    setDetalle(prev => ({ ...prev, [m.id]: secciones }));
  };

  /**
   * El ajuste fino escribe endpoint por endpoint, por la puerta de siempre.
   *
   * Y vuelve a LEER lo que el servidor guardó, en vez de dar por hecho el
   * cambio. No es lo mismo: hay acciones que el rol no puede tener —el pago a
   * proveedores en el comprador, por separación de funciones— y el servidor las
   * retira aunque se enciendan a mano. La pantalla pintaba el interruptor en
   * azul igualmente, así que el administrador se quedaba creyendo que había
   * concedido un permiso que nunca se concedió. Un candado que no se ve es
   * peor que no tener candado: nadie lo audita porque nadie sabe que actuó.
   */
  const alternarAccion = async (moduloId: string, accion: IAccion) => {
    const deseado = !accion.permitido;
    const res = await fetch(`${api}/admin/permisos/rol/${encodeURIComponent(rol)}`, {
      method: 'PUT', headers: h(), body: JSON.stringify({ permisos: { [accion.id]: deseado } }),
    });
    if (!res.ok) { mostrarToast('No se pudo cambiar esa acción.', false); return; }

    const releido = await fetch(
      `${api}/admin/permisos/rol/${encodeURIComponent(rol)}/modulo/${encodeURIComponent(moduloId)}`,
      { headers: h() },
    );
    if (releido.ok) {
      const secciones: ISeccion[] = await releido.json();
      setDetalle(prev => ({ ...prev, [moduloId]: secciones }));
      const real = secciones
        .flatMap(sec => sec.acciones)
        .find(a => a.id === accion.id);
      if (real && real.permitido !== deseado) {
        mostrarToast(
          deseado
            ? `«${accion.nombre}» no puede concederse a este rol: el sistema la retiró.`
            : `«${accion.nombre}» es parte del trabajo de este rol y se repuso.`,
          false,
        );
      }
    }

    const r = await fetch(`${api}/admin/permisos/rol/${encodeURIComponent(rol)}/modulos`, { headers: h() });
    if (r.ok) setModulos(await r.json());
  };

  const crearRol = () => {
    const r = nuevoRol.trim().toLowerCase().replace(/\s+/g, '_');
    if (!r || resumen.some(x => x.rol.toLowerCase() === r)) return;
    setResumen(prev => [...prev, {
      rol: r, etiqueta: r, esAdministrador: false, tienePlantilla: false,
      descripcion: 'Rol nuevo: todavía no tiene accesos. Elige sus módulos aquí abajo.',
      usuarios: 0, accionesActivas: 0,
    }].sort((a, b) => a.rol.localeCompare(b.rol)));
    setRol(r); setNuevoRol(''); setCreandoRol(false);
  };

  const cambiarRol = async (r: string) => {
    if (r === rol) return;
    if (hayCambios && !await confirmarElegante('¿Descartar cambios y cambiar de rol?', { peligroso: true })) return;
    setRol(r);
  };

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, IModulo[]>();
    modulos.forEach(m => {
      const lista = mapa.get(m.grupo) ?? [];
      lista.push(m); mapa.set(m.grupo, lista);
    });
    return Array.from(mapa.entries()).sort(
      (a, b) => (ORDEN_GRUPOS.indexOf(a[0]) + 99) - (ORDEN_GRUPOS.indexOf(b[0]) + 99),
    );
  }, [modulos]);

  const conAcceso = modulos.filter(m => estadoDe(m) !== 'ninguno').length;
  const accionesActivas = modulos.reduce((s, m) => s + m.activos, 0);
  const totalAcciones = modulos.reduce((s, m) => s + m.acciones, 0);

  if (cargando) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <Loader2 style={{ width: 32, height: 32, color: '#4f46e5', animation: 'spin 1s linear infinite' }}/>
      <p style={{ color: '#64748b', fontSize: 13 }}>Cargando roles...</p>
    </div>
  );

  return (
    <div style={{ padding: '20px 0 40px' }}>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 100, maxWidth: 420,
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', borderRadius: 12,
          background: toast.ok ? '#059669' : '#e11d48', color: '#fff',
          fontSize: 13.5, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }}>
          {toast.ok ? <Check style={{ width: 18, height: 18, flexShrink: 0 }}/> : <X style={{ width: 18, height: 18, flexShrink: 0 }}/>}
          {toast.msg}
        </div>
      )}

      {confirmPlantilla && (
        <div onClick={() => !aplicando && setConfirmPlantilla(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,23,42,0.6)',
            backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 18, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkles style={{ width: 22, height: 22, color: '#4f46e5' }}/>
              </div>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: 0 }}>Usar los módulos sugeridos</h3>
                <p style={{ fontSize: 13, color: '#64748b', marginTop: 6, lineHeight: 1.55 }}>
                  Se reemplazará el acceso de <b>{rolActual?.etiqueta ?? rol}</b> por los módulos que le
                  corresponden a ese perfil, incluidos los que solo consulta. Lo que hayas ajustado a mano
                  en esos módulos se pierde; podrás cambiarlo después.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 18px 18px' }}>
              <button onClick={() => setConfirmPlantilla(false)}
                style={{ padding: '9px 18px', border: 'none', background: 'transparent', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 8 }}>
                Cancelar
              </button>
              <button onClick={aplicarPlantilla}
                style={{ padding: '9px 20px', border: 'none', background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles style={{ width: 15, height: 15 }}/> Sí, aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: 18, alignItems: 'start' }}>

        {/* ── Los roles ──────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', position: 'sticky', top: 16 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8' }}>
              Roles de la empresa
            </p>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>
              Cada usuario tiene uno. El rol decide qué módulos puede atender.
            </p>
          </div>

          <div style={{ maxHeight: 'calc(100vh - 290px)', overflowY: 'auto' }}>
            {resumen.map(r => {
              const sel = r.rol === rol;
              return (
                <div key={r.rol} onClick={() => cambiarRol(r.rol)}
                  style={{
                    padding: '11px 16px', cursor: 'pointer',
                    borderLeft: `3px solid ${sel ? '#4f46e5' : 'transparent'}`,
                    background: sel ? '#eef2ff' : '#fff', borderBottom: '1px solid #f8fafc',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {r.esAdministrador && <Crown style={{ width: 13, height: 13, color: '#d97706', flexShrink: 0 }}/>}
                    <p style={{ fontSize: 13, fontWeight: 700, color: sel ? '#3730a3' : '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.etiqueta}
                    </p>
                    {r.usuarios > 0 && (
                      <span title={`${r.usuarios} usuario(s) con este rol`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700,
                        color: '#475569', background: '#f1f5f9', borderRadius: 20, padding: '2px 7px', flexShrink: 0,
                      }}>
                        <Users style={{ width: 10, height: 10 }}/> {r.usuarios}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                    {r.esAdministrador
                      ? 'Acceso total'
                      : r.accionesActivas === 0 ? 'Sin accesos configurados' : `${r.accionesActivas} acciones activas`}
                  </p>
                </div>
              );
            })}
          </div>

          <div style={{ padding: 12, borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>
            {creandoRol ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input autoFocus value={nuevoRol} onChange={e => setNuevoRol(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') crearRol(); if (e.key === 'Escape') setCreandoRol(false); }}
                  placeholder="nombre del rol"
                  style={{ padding: '7px 10px', border: '1.5px solid #c7d2fe', borderRadius: 8, fontSize: 12, outline: 'none', flex: 1, minWidth: 0 }}/>
                <button onClick={crearRol} style={{ padding: '7px 12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Crear</button>
                <button onClick={() => setCreandoRol(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                  <X style={{ width: 14, height: 14, color: '#94a3b8' }}/>
                </button>
              </div>
            ) : (
              <button onClick={() => setCreandoRol(true)} style={{
                width: '100%', padding: '8px 12px', background: '#fff', border: '1.5px dashed #cbd5e1',
                borderRadius: 8, fontSize: 12, color: '#64748b', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600,
              }}>
                <Plus style={{ width: 13, height: 13 }}/> Nuevo rol
              </button>
            )}
          </div>
        </div>

        {/* ── El rol y sus módulos ───────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 9 }}>
                  {esAdmin
                    ? <Crown style={{ width: 19, height: 19, color: '#d97706' }}/>
                    : <Shield style={{ width: 19, height: 19, color: '#4f46e5' }}/>}
                  {rolActual?.etiqueta ?? rol ?? '—'}
                </h1>
                <p style={{ color: '#64748b', fontSize: 12.5, marginTop: 5, maxWidth: 640, lineHeight: 1.5 }}>
                  {rolActual?.descripcion}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, fontFamily: 'monospace' }}>
                  identificador: {rol}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={sincronizar} disabled={sincronizando}
                  title="Vuelve a descubrir las acciones que expone el servidor"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px',
                    borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#475569',
                    cursor: sincronizando ? 'wait' : 'pointer', fontWeight: 700, fontSize: 12.5,
                  }}>
                  {sincronizando
                    ? <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }}/>
                    : <SlidersHorizontal style={{ width: 15, height: 15 }}/>}
                  Sincronizar
                </button>
                {!esAdmin && (
                  <button onClick={guardar} disabled={!hayCambios || guardando}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                      background: guardadoOk ? '#059669' : hayCambios ? '#4f46e5' : '#e2e8f0',
                      color: hayCambios || guardadoOk ? '#fff' : '#94a3b8',
                      border: 'none', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
                      cursor: hayCambios ? 'pointer' : 'not-allowed', transition: 'all .2s',
                    }}>
                    {guardando
                      ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}/>
                      : guardadoOk ? <Check style={{ width: 14, height: 14 }}/> : <Save style={{ width: 14, height: 14 }}/>}
                    {guardadoOk ? 'Guardado' : hayCambios ? `Guardar ${tocados.size} ${tocados.size === 1 ? 'módulo' : 'módulos'}` : 'Sin cambios'}
                  </button>
                )}
              </div>
            </div>

            {!esAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                    {conAcceso}<span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}> / {modulos.length}</span>
                  </p>
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>módulos que atiende</p>
                </div>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                    {accionesActivas}<span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}> / {totalAcciones}</span>
                  </p>
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>acciones activas</p>
                </div>
                <div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{rolActual?.usuarios ?? 0}</p>
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>
                    usuarios · <Link href="/dashboard/usuarios" style={{ color: '#4f46e5', fontWeight: 700 }}>asignar</Link>
                  </p>
                </div>
                {hayCambios && <span style={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>● cambios sin guardar</span>}
                <div style={{ marginLeft: 'auto' }}>
                  <button onClick={() => setConfirmPlantilla(true)} disabled={aplicando || !rolActual?.tienePlantilla}
                    title={rolActual?.tienePlantilla ? 'Aplica los módulos típicos de este perfil' : 'Este rol no tiene un perfil sugerido'}
                    style={{
                      padding: '9px 16px', borderRadius: 10, border: 'none',
                      background: rolActual?.tienePlantilla ? 'linear-gradient(90deg,#4f46e5,#7c3aed)' : '#e2e8f0',
                      color: rolActual?.tienePlantilla ? '#fff' : '#94a3b8',
                      fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                      cursor: rolActual?.tienePlantilla && !aplicando ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: 8, opacity: aplicando ? 0.6 : 1,
                    }}>
                    {aplicando
                      ? <><Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }}/> Aplicando…</>
                      : <><Sparkles style={{ width: 15, height: 15 }}/> Usar módulos sugeridos</>}
                  </button>
                </div>
              </div>
            )}

            {esAdmin && (
              <div style={{
                marginTop: 16, padding: '12px 14px', borderRadius: 10, background: '#fffbeb',
                border: '1px solid #fde68a', fontSize: 12.5, color: '#92400e', lineHeight: 1.55,
              }}>
                Este rol no pasa por la tabla de permisos: el servidor lo reconoce como administrador
                y lo deja entrar a todo. Por eso no hay nada que configurar aquí.
              </div>
            )}
          </div>

          {cargandoRol ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Loader2 style={{ width: 24, height: 24, color: '#4f46e5', animation: 'spin 1s linear infinite' }}/>
            </div>
          ) : (
            porGrupo.map(([grupo, lista]) => (
              <div key={grupo}>
                <p style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px',
                  color: '#94a3b8', margin: '4px 0 8px 2px',
                }}>{grupo}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lista.map(m => {
                    const est = estadoDe(m);
                    const estilo = ESTILO_ACCESO[est];
                    const Icono = ICONOS[m.icono] ?? HelpCircle;
                    const abierto = abiertos.has(m.id);
                    const secciones = detalle[m.id];

                    return (
                      <div key={m.id} style={{
                        background: '#fff', borderRadius: 13, overflow: 'hidden',
                        border: `1.5px solid ${est === 'ninguno' ? '#e8edf3' : estilo.border}`,
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px',
                          background: est === 'ninguno' ? '#fff' : estilo.bg,
                        }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: est === 'ninguno' ? '#f1f5f9' : '#fff',
                            border: `1px solid ${est === 'ninguno' ? '#e8edf3' : estilo.border}`,
                          }}>
                            <Icono style={{ width: 18, height: 18, color: est === 'ninguno' ? '#94a3b8' : estilo.color }}/>
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{m.nombre}</p>
                              {m.sensible && (
                                <span title="Da poder sobre el propio sistema. Concédelo a conciencia."
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10,
                                    fontWeight: 700, color: '#b45309', background: '#fffbeb',
                                    border: '1px solid #fde68a', borderRadius: 20, padding: '1px 7px',
                                  }}>
                                  <AlertTriangle style={{ width: 10, height: 10 }}/> sensible
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2, lineHeight: 1.45 }}>
                              {m.descripcion}
                            </p>
                          </div>

                          {!esAdmin && <Selector valor={est} minimo={m.minimo} onChange={v => cambiarAcceso(m, v)}/>}
                          {esAdmin && (
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#15803d' }}>Acceso completo</span>
                          )}
                        </div>

                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px',
                          borderTop: '1px solid #f4f7fa', background: '#fcfdfe', flexWrap: 'wrap',
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: estilo.color }}>
                            {est === 'parcial' ? '◎ Ajustado a mano' : estilo.etiqueta}
                          </span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {m.activos} de {m.acciones} acciones · {m.accionesConsulta} de consulta
                          </span>
                          {!esAdmin && (
                            <button onClick={() => abrirDetalle(m)}
                              style={{
                                marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 11, color: '#64748b', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 3,
                              }}>
                              {abierto ? <ChevronDown style={{ width: 12, height: 12 }}/> : <ChevronRight style={{ width: 12, height: 12 }}/>}
                              ajuste fino
                            </button>
                          )}
                        </div>

                        {abierto && (
                          <div style={{ borderTop: '1px solid #eef2f7', background: '#f8fafc' }}>
                            <p style={{ fontSize: 10.5, color: '#94a3b8', padding: '8px 16px 4px', lineHeight: 1.5 }}>
                              Acción por acción, para los casos raros. Se guarda al instante y deja el módulo
                              marcado como «ajustado a mano».
                            </p>
                            {!secciones ? (
                              <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
                                <Loader2 style={{ width: 16, height: 16, color: '#4f46e5', animation: 'spin 1s linear infinite' }}/>
                              </div>
                            ) : secciones.map(sec => (
                              <div key={sec.clave} style={{ borderTop: '1px solid #eef2f7' }}>
                                <p style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', padding: '8px 16px 2px' }}>
                                  {sec.etiqueta}
                                </p>
                                {sec.acciones.map(a => {
                                  const nombre = accionDe(a.metodo);
                                  const c = COLOR_ACCION[nombre];
                                  return (
                                    <label key={a.id} style={{
                                      display: 'flex', alignItems: 'center', gap: 10,
                                      padding: '6px 16px', cursor: 'pointer',
                                    }}>
                                      <Toggle on={a.permitido} onChange={() => alternarAccion(m.id, a)}/>
                                      <span style={{
                                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                                        background: c.bg, color: c.text, minWidth: 72, textAlign: 'center', flexShrink: 0,
                                      }}>{nombre}</span>
                                      <span style={{ fontSize: 12, color: '#475569', flex: 1, minWidth: 0 }}>{a.nombre}</span>
                                      <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#b0bac9' }}>
                                        {a.metodo} {a.ruta}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
