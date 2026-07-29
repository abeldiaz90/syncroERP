"use client";
import { useState, useEffect, useCallback } from 'react';
import { Shield, Save, Plus, X, Loader2, ChevronDown, ChevronRight, Check, Sparkles } from 'lucide-react';
import { MODULOS } from '../module-config';

interface IEndpoint { id: string; metodo: string; ruta: string; nombre: string; rutaFrontend?: string; }
interface INavegable { label: string; href: string; endpoints: IEndpoint[]; }
interface IModuloUI   { id: string; nombre: string; color: string; bg: string; border: string; icon: string; navegables: INavegable[]; }

const METODO_COLOR: Record<string, { bg: string; text: string }> = {
  GET:    { bg: '#dcfce7', text: '#15803d' },
  POST:   { bg: '#ede9fe', text: '#6d28d9' },
  PUT:    { bg: '#fef3c7', text: '#b45309' },
  PATCH:  { bg: '#fef3c7', text: '#b45309' },
  DELETE: { bg: '#fee2e2', text: '#b91c1c' },
};

type Estado = 'full' | 'partial' | 'none';

function Toggle({ on, onChange, size = 'md' }: { on: boolean; onChange: () => void; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 32 : 40;
  const h = size === 'sm' ? 18 : 22;
  const d = size === 'sm' ? 12 : 16;
  return (
    <div onClick={e => { e.stopPropagation(); onChange(); }}
      style={{
        width: w, height: h, borderRadius: h, cursor: 'pointer',
        background: on ? '#4f46e5' : '#cbd5e1',
        position: 'relative', transition: 'background .2s', flexShrink: 0,
      }}>
      <div style={{
        position: 'absolute', top: (h - d) / 2,
        left: on ? w - d - (h - d) / 2 : (h - d) / 2,
        width: d, height: d, borderRadius: '50%',
        background: '#fff', transition: 'left .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      }}/>
    </div>
  );
}

function TriState({ estado, onChange }: { estado: Estado; onChange: () => void }) {
  return (
    <div onClick={e => { e.stopPropagation(); onChange(); }}
      style={{
        width: 20, height: 20, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: estado === 'full' ? '#4f46e5' : estado === 'partial' ? '#fff' : '#f1f5f9',
        border: `2px solid ${estado === 'full' ? '#4f46e5' : estado === 'partial' ? '#4f46e5' : '#cbd5e1'}`,
        transition: 'all .15s',
      }}>
      {estado === 'full'    && <Check style={{ width: 11, height: 11, color: '#fff', strokeWidth: 3 }}/>}
      {estado === 'partial' && <div style={{ width: 8, height: 2, background: '#4f46e5', borderRadius: 2 }}/>}
    </div>
  );
}

export default function PermisosPage() {
  const [rol, setRol]         = useState('');
  const [roles, setRoles]     = useState<string[]>([]);
  const [arbol, setArbol]     = useState<any[]>([]);
  const [permisos, setPermisos] = useState<Record<string, boolean>>({});
  const [modulosUI, setModulosUI] = useState<IModuloUI[]>([]);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [cargando, setCargando]   = useState(true);
  const [cargandoRol, setCargandoRol] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cambios, setCambios]     = useState(false);
  const [nuevoRol, setNuevoRol]   = useState('');
  const [creandoRol, setCreandoRol] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [aplicandoPlantilla, setAplicandoPlantilla] = useState(false);
  const [confirmPlantilla, setConfirmPlantilla] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const mostrarToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });

  // Cargar árbol y roles
  useEffect(() => {
    const init = async () => {
      const [ra, rr] = await Promise.all([
        fetch(`${api}/admin/permisos/arbol`, { headers: h() }),
        fetch(`${api}/admin/permisos/roles`, { headers: h() }),
      ]);
      if (ra.ok) setArbol(await ra.json());
      if (rr.ok) {
        const data: string[] = await rr.json();
        const sinAdmin = data.filter(r => r !== 'admin');
        setRoles(sinAdmin);
        if (sinAdmin.length > 0) setRol(sinAdmin[0]);
      }
      setCargando(false);
    };
    init();
  }, []);

  // Construir módulos UI desde árbol + module-config
  useEffect(() => {
    if (!arbol.length) return;
    const eps: IEndpoint[] = arbol.flatMap((c: any) => c.endpoints ?? []);
    const ui: IModuloUI[] = MODULOS.map(m => ({
      id: m.id, nombre: m.nombre, color: m.color, bg: m.bg, border: m.border, icon: m.icon,
      navegables: m.items.map(item => ({
        label: item.label, href: item.href,
        endpoints: eps.filter(ep =>
          ep.rutaFrontend === item.href ||
          ep.rutaFrontend?.startsWith(item.href + '/')
        ),
      })).filter(n => n.endpoints.length > 0),
    })).filter(m => m.navegables.length > 0);
    setModulosUI(ui);
    // Expandir todos por defecto
    setExpandidos(new Set(ui.map(m => m.id)));
  }, [arbol]);

  // Cargar permisos del rol
  const cargarPermisos = useCallback(async (r: string) => {
    setCargandoRol(true);
    const res = await fetch(`${api}/admin/permisos/rol/${r}`, { headers: h() });
    if (res.ok) setPermisos(await res.json());
    setCargandoRol(false);
    setCambios(false);
  }, []);

  useEffect(() => { if (rol) cargarPermisos(rol); }, [rol]);

  // Helpers estado
  const estadoNav = (nav: INavegable): Estado => {
    const con = nav.endpoints.filter(ep => permisos[ep.id]).length;
    if (con === 0) return 'none';
    if (con === nav.endpoints.length) return 'full';
    return 'partial';
  };

  const estadoModulo = (m: IModuloUI): Estado => {
    const eps = m.navegables.flatMap(n => n.endpoints);
    const con = eps.filter(ep => permisos[ep.id]).length;
    if (con === 0) return 'none';
    if (con === eps.length) return 'full';
    return 'partial';
  };

  // Toggles
  const toggleEndpoint = (id: string) => {
    setPermisos(p => ({ ...p, [id]: !p[id] }));
    setCambios(true);
  };

  const toggleNav = (nav: INavegable) => {
    const todos = nav.endpoints.every(ep => permisos[ep.id]);
    const copia = { ...permisos };
    nav.endpoints.forEach(ep => { copia[ep.id] = !todos; });
    setPermisos(copia); setCambios(true);
  };

  const toggleModulo = (m: IModuloUI) => {
    const eps   = m.navegables.flatMap(n => n.endpoints);
    const todos = eps.every(ep => permisos[ep.id]);
    const copia = { ...permisos };
    eps.forEach(ep => { copia[ep.id] = !todos; });
    setPermisos(copia); setCambios(true);
  };

  const toggleExpandir = (key: string) =>
    setExpandidos(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });

  // Guardar
  const guardar = async () => {
    setGuardando(true);
    const res = await fetch(`${api}/admin/permisos/rol/${rol}`, {
      method: 'PUT', headers: h(), body: JSON.stringify({ permisos }),
    });
    setGuardando(false);
    if (res.ok) {
      setCambios(false);
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2000);
    }
  };

  // Crear rol
  const crearRol = () => {
    const r = nuevoRol.trim().toLowerCase().replace(/\s+/g, '_');
    if (!r || roles.some(x => x.toLowerCase() === r)) return;
    setRoles(prev => [...prev, r]);
    setRol(r);
    setPermisos({});
    setCambios(false);
    setNuevoRol('');
    setCreandoRol(false);
  };

  // Abre el modal de confirmación
  const pedirConfirmacionPlantilla = () => {
    if (!rol || rol === 'admin') return;
    setConfirmPlantilla(true);
  };

  // Ejecuta al confirmar en el modal
  const aplicarPlantilla = async () => {
    setConfirmPlantilla(false);
    if (!rol || rol === 'admin') return;

    setAplicandoPlantilla(true);
    try {
      const res = await fetch(`${api}/admin/permisos/rol/${encodeURIComponent(rol)}/aplicar-plantilla`, {
        method: 'POST', headers: h(), body: JSON.stringify({ modo: 'agregar' }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) {
        await cargarPermisos(rol);
        setCambios(false);
        mostrarToast(d.mensaje || 'Permisos sugeridos aplicados.', true);
      } else {
        mostrarToast(d?.mensaje || 'No hay permisos sugeridos para este perfil.', false);
      }
    } catch {
      mostrarToast('Error de conexión con el servidor.', false);
    }
    setAplicandoPlantilla(false);
  };

  // Conteo total para el rol
  const totalEps    = modulosUI.flatMap(m => m.navegables.flatMap(n => n.endpoints)).length;
  const activosEps  = modulosUI.flatMap(m => m.navegables.flatMap(n => n.endpoints)).filter(ep => permisos[ep.id]).length;

  if (cargando) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <Loader2 style={{ width: 32, height: 32, color: '#4f46e5', animation: 'spin 1s linear infinite' }}/>
      <p style={{ color: '#64748b', fontSize: 13 }}>Cargando matriz de permisos...</p>
    </div>
  );

  return (
    <div style={{ padding: '28px 24px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Toast de notificación */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 22px', borderRadius: 12,
          background: toast.ok ? '#059669' : '#e11d48', color: '#fff',
          fontSize: 14, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }}>
          {toast.ok
            ? <Check style={{ width: 18, height: 18 }}/>
            : <X style={{ width: 18, height: 18 }}/>}
          {toast.msg}
        </div>
      )}

      {/* Modal de confirmación para aplicar plantilla */}
      {confirmPlantilla && (
        <div onClick={() => !aplicandoPlantilla && setConfirmPlantilla(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 18, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles style={{ width: 22, height: 22, color: '#4f46e5' }}/>
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: 0 }}>Cargar permisos sugeridos</h3>
                  <p style={{ fontSize: 13, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
                    Se activarán los permisos típicos del perfil <b style={{ textTransform: 'capitalize' }}>{rol}</b>.
                    {cambios && ' Perderás los cambios sin guardar.'} Podrás ajustarlos después.
                  </p>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 18px 18px' }}>
              <button onClick={() => setConfirmPlantilla(false)}
                style={{ padding: '9px 18px', border: 'none', background: 'transparent', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 8 }}>
                Cancelar
              </button>
              <button onClick={aplicarPlantilla}
                style={{ padding: '9px 20px', border: 'none', background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles style={{ width: 15, height: 15 }}/> Sí, cargar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#eef2ff', padding: 8, borderRadius: 10 }}>
              <Shield style={{ width: 20, height: 20, color: '#4f46e5' }}/>
            </div>
            Roles y Permisos
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            Selecciona un perfil y activa o desactiva cada sección del sistema.
          </p>
        </div>

        {/* Guardar */}
        <button onClick={guardar} disabled={!cambios || guardando}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
            background: guardadoOk ? '#059669' : cambios ? '#4f46e5' : '#e2e8f0',
            color: cambios || guardadoOk ? '#fff' : '#94a3b8',
            border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: cambios ? 'pointer' : 'not-allowed', transition: 'all .2s',
          }}>
          {guardando
            ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }}/>
            : guardadoOk
              ? <Check style={{ width: 14, height: 14 }}/>
              : <Save style={{ width: 14, height: 14 }}/>}
          {guardadoOk ? 'Guardado' : cambios ? 'Guardar cambios' : 'Sin cambios'}
        </button>
      </div>

      {/* Selector de roles — horizontal */}
      <div style={{
        background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14,
        padding: 16, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8' }}>
            Perfil a configurar
          </p>
          {rol && (
            <p style={{ fontSize: 12, color: '#64748b' }}>
              <span style={{ color: '#4f46e5', fontWeight: 700 }}>{activosEps}</span>
              <span style={{ color: '#94a3b8' }}> / {totalEps} acciones activas</span>
              {cambios && <span style={{ color: '#f59e0b', marginLeft: 8, fontWeight: 700 }}>● cambios sin guardar</span>}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {roles.map(r => (
            <button key={r} onClick={() => {
              if (r !== rol) {
                if (cambios && !confirm('¿Descartar cambios y cambiar de perfil?')) return;
                setRol(r); setCambios(false);
              }
            }}
              style={{
                padding: '8px 18px', borderRadius: 30, border: '1.5px solid',
                borderColor: r === rol ? '#4f46e5' : '#e2e8f0',
                background: r === rol ? '#4f46e5' : '#fff',
                color: r === rol ? '#fff' : '#475569',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                textTransform: 'capitalize', transition: 'all .15s',
              }}>
              {r}
            </button>
          ))}

          {/* Crear rol */}
          {creandoRol ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input autoFocus value={nuevoRol} onChange={e => setNuevoRol(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') crearRol(); if (e.key === 'Escape') setCreandoRol(false); }}
                placeholder="nombre del rol"
                style={{
                  padding: '8px 12px', border: '1.5px solid #c7d2fe', borderRadius: 30,
                  fontSize: 13, outline: 'none', width: 160,
                }}/>
              <button onClick={crearRol} style={{
                padding: '8px 14px', background: '#4f46e5', color: '#fff',
                border: 'none', borderRadius: 30, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>Crear</button>
              <button onClick={() => setCreandoRol(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X style={{ width: 14, height: 14, color: '#94a3b8' }}/>
              </button>
            </div>
          ) : (
            <button onClick={() => setCreandoRol(true)} style={{
              padding: '8px 14px', background: '#f8fafc', border: '1.5px dashed #cbd5e1',
              borderRadius: 30, fontSize: 12, color: '#64748b', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Plus style={{ width: 12, height: 12 }}/> Nuevo perfil
            </button>
          )}
        </div>

        {/* Botón: cargar permisos sugeridos para el rol actual */}
        {rol && rol !== 'admin' && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
              ¿No sabes qué activar? Carga los permisos típicos de este perfil y ajústalos después.
            </p>
            <button onClick={pedirConfirmacionPlantilla} disabled={aplicandoPlantilla}
              style={{
                padding: '9px 18px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(90deg,#4f46e5,#7c3aed)', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: aplicandoPlantilla ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, opacity: aplicandoPlantilla ? 0.6 : 1,
                boxShadow: '0 2px 8px rgba(79,70,229,0.25)', whiteSpace: 'nowrap',
              }}>
              {aplicandoPlantilla
                ? <><Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }}/> Aplicando…</>
                : <><Sparkles style={{ width: 15, height: 15 }}/> Cargar permisos sugeridos</>}
            </button>
          </div>
        )}
      </div>

      {/* Contenido */}
      {cargandoRol ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader2 style={{ width: 24, height: 24, color: '#4f46e5', animation: 'spin 1s linear infinite' }}/>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {modulosUI.map(m => {
            const estMod  = estadoModulo(m);
            const expMod  = expandidos.has(m.id);
            const navActivos = m.navegables.filter(n => estadoNav(n) !== 'none').length;

            return (
              <div key={m.id} style={{
                background: '#fff', border: `1.5px solid ${estMod !== 'none' ? m.border : '#e2e8f0'}`,
                borderRadius: 14, overflow: 'hidden', transition: 'border-color .2s',
              }}>

                {/* Header módulo — clic para expandir/colapsar */}
                <div onClick={() => toggleExpandir(m.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                  cursor: 'pointer', background: estMod !== 'none' ? m.bg + 'aa' : '#fff',
                  borderBottom: expMod ? `0.5px solid ${m.border}` : 'none',
                  userSelect: 'none',
                }}>

                  {/* Tri-state del módulo */}
                  <TriState estado={estMod} onChange={() => toggleModulo(m)}/>

                  {/* Ícono */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, background: m.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <i className={`ti ${m.icon}`} style={{ fontSize: 18, color: m.color }}/>
                  </div>

                  {/* Nombre */}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{m.nombre}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                      {navActivos > 0
                        ? `${navActivos} de ${m.navegables.length} secciones activas`
                        : `${m.navegables.length} secciones disponibles — sin acceso`}
                    </p>
                  </div>

                  {/* Estado */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    color:   estMod === 'full' ? m.color : estMod === 'partial' ? '#b45309' : '#94a3b8',
                    background: estMod === 'full' ? m.bg : estMod === 'partial' ? '#fef3c7' : '#f8fafc',
                    border: `0.5px solid ${estMod === 'full' ? m.border : estMod === 'partial' ? '#fde68a' : '#e2e8f0'}`,
                  }}>
                    {estMod === 'full' ? '✓ Acceso completo' : estMod === 'partial' ? '◎ Acceso parcial' : '○ Sin acceso'}
                  </span>

                  {expMod
                    ? <ChevronDown style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }}/>
                    : <ChevronRight style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }}/>}
                </div>

                {/* Navegables */}
                {expMod && (
                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {m.navegables.map(nav => {
                      const estNav  = estadoNav(nav);
                      const navKey  = `${m.id}::${nav.href}`;
                      const navExp  = expandidos.has(navKey);
                      const tieneAcciones = nav.endpoints.length > 1;

                      return (
                        <div key={nav.href} style={{
                          border: `1px solid ${estNav !== 'none' ? '#c7d2fe' : '#f1f5f9'}`,
                          borderRadius: 10, overflow: 'hidden',
                          background: estNav !== 'none' ? '#fafafe' : '#fafafa',
                          transition: 'border-color .15s',
                        }}>
                          {/* Fila del navegable */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>

                            {/* Toggle ON/OFF */}
                            <Toggle on={estNav === 'full'} onChange={() => toggleNav(nav)}/>

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{
                                fontSize: 13, fontWeight: 600,
                                color: estNav !== 'none' ? '#1e1b4b' : '#64748b',
                              }}>{nav.label}</p>
                              <p style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8', marginTop: 1 }}>
                                {nav.href}
                              </p>
                            </div>

                            {/* Métodos disponibles */}
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                              {nav.endpoints.map(ep => {
                                const mc = METODO_COLOR[ep.metodo] ?? { bg: '#f1f5f9', text: '#64748b' };
                                return (
                                  <span key={ep.id} style={{
                                    fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4,
                                    background: permisos[ep.id] ? mc.bg : '#f1f5f9',
                                    color:      permisos[ep.id] ? mc.text : '#cbd5e1',
                                    transition: 'all .15s',
                                  }}>
                                    {ep.metodo}
                                  </span>
                                );
                              })}
                            </div>

                            {/* Estado parcial */}
                            {estNav === 'partial' && (
                              <span style={{ fontSize: 10, color: '#b45309', fontWeight: 700, flexShrink: 0 }}>
                                parcial
                              </span>
                            )}

                            {/* Expandir acciones (solo si hay más de 1 endpoint) */}
                            {tieneAcciones && (
                              <button onClick={e => { e.stopPropagation(); toggleExpandir(navKey); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                                {navExp
                                  ? <ChevronDown style={{ width: 13, height: 13, color: '#94a3b8' }}/>
                                  : <ChevronRight style={{ width: 13, height: 13, color: '#94a3b8' }}/>}
                              </button>
                            )}
                          </div>

                          {/* Acciones individuales */}
                          {navExp && tieneAcciones && (
                            <div style={{ borderTop: '0.5px solid #e0e7ff', background: '#f5f3ff' }}>
                              <p style={{
                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                letterSpacing: '.5px', color: '#7c3aed', padding: '6px 14px 4px',
                              }}>
                                Acciones específicas
                              </p>
                              {nav.endpoints.map(ep => {
                                const mc = METODO_COLOR[ep.metodo] ?? { bg: '#f1f5f9', text: '#64748b' };
                                return (
                                  <label key={ep.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '7px 14px', cursor: 'pointer',
                                    borderBottom: '0.5px solid #ede9fe',
                                  }}>
                                    <Toggle on={!!permisos[ep.id]} onChange={() => toggleEndpoint(ep.id)} size="sm"/>
                                    <span style={{
                                      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                                      background: mc.bg, color: mc.text, minWidth: 42, textAlign: 'center', flexShrink: 0,
                                    }}>
                                      {ep.metodo}
                                    </span>
                                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', flex: 1 }}>
                                      {ep.ruta}
                                    </span>
                                    <span style={{ fontSize: 12, color: '#475569' }}>{ep.nombre}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
