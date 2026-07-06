"use client";
import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { detectarModulo } from './module-config';
import { ShieldOff } from 'lucide-react';

interface IUsuario {
  id?: string; nombreCompleto?: string; nombre?: string;
  email: string; rol: string; empresaId: string;
}

// Rutas que NO requieren verificación de permisos
const RUTAS_LIBRES = new Set(['/dashboard', '/dashboard/']);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const modulo   = detectarModulo(pathname);

  const [usuario, setUsuario]               = useState<IUsuario | null>(null);
  const [empresa, setEmpresa]               = useState('');
  const [menuOpen, setMenuOpen]             = useState(false);
  const [rutasPermitidas, setRutasPermitidas] = useState<string[] | null>(null); // null = cargando
  const [accesoDenegado, setAccesoDenegado] = useState(false);
  const [cargando, setCargando]             = useState(true);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => typeof window !== 'undefined' ? localStorage.getItem('syncro_token') ?? '' : '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });

  // ── 1. Leer JWT y cargar permisos ─────────────────────────────────────────
  useEffect(() => {
    const token = tok();
    if (!token) { router.push('/login'); return; }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('syncro_token');
        router.push('/login'); return;
      }

      const u: IUsuario = {
        id:             payload.sub ?? payload.id,
        email:          payload.email,
        rol:            payload.rol,
        empresaId:      payload.empresaId,
        nombreCompleto: payload.nombreCompleto ?? payload.nombre ?? payload.email,
      };
      setUsuario(u);

      // Nombre de empresa (no crítico)
      if (u.empresaId) {
        fetch(`${api}/empresas/${u.empresaId}`, { headers: h() })
          .then(r => r.ok ? r.json() : null)
          .then(e => { if (e?.nombre) setEmpresa(e.nombre); })
          .catch(() => {});
      }

      // Admin siempre tiene acceso total — no necesita consultar
      if (u.rol === 'admin') {
        setRutasPermitidas(['*']);
        setCargando(false);
        return;
      }

      // Otros roles — consultar permisos reales
      fetch(`${api}/admin/permisos/mis-rutas`, { headers: h() })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          setRutasPermitidas(Array.isArray(d?.rutas) ? d.rutas : []);
        })
        .catch(() => {
          setRutasPermitidas([]); // Sin acceso si el endpoint falla
        })
        .finally(() => setCargando(false));

    } catch {
      localStorage.removeItem('syncro_token');
      router.push('/login');
    }
  }, []);

  // ── 2. Verificar acceso cada vez que cambia la ruta ───────────────────────
  useEffect(() => {
    if (rutasPermitidas === null) return; // todavía cargando
    if (RUTAS_LIBRES.has(pathname)) { setAccesoDenegado(false); return; }
    if (rutasPermitidas.includes('*')) { setAccesoDenegado(false); return; } // admin

    // Verificar si la ruta actual está permitida (match exacto o por prefijo)
    const permitida = rutasPermitidas.some(r =>
      pathname === r || pathname.startsWith(r + '/') || r.startsWith(pathname)
    );
    setAccesoDenegado(!permitida);
  }, [pathname, rutasPermitidas]);

  const cerrarSesion = () => {
    localStorage.removeItem('syncro_token');
    router.push('/login');
  };

  // ── Filtrar items del módulo según permisos ───────────────────────────────
  const itemsPermitidos = modulo?.items.filter(item => {
    if (!rutasPermitidas) return true; // todavía cargando, mostrar todo
    if (rutasPermitidas.includes('*')) return true; // admin
    return rutasPermitidas.some(r =>
      item.href === r || item.href.startsWith(r) || r.startsWith(item.href)
    );
  }) ?? [];

  const nombre   = usuario?.nombreCompleto ?? usuario?.nombre ?? usuario?.email ?? '';
  const iniciales = nombre.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase() || 'U';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8fafc' }}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <header style={{
        background: '#0f172a', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: '48px', flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#818cf8' }}/>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>SyncroERP</span>
          </Link>
          {modulo && (
            <>
              <span style={{ color: '#334155', fontSize: '12px' }}>›</span>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>{modulo.nombre}</span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {empresa && (
            <span style={{ fontSize: '11px', color: '#475569', background: '#1e293b', padding: '3px 10px', borderRadius: '20px' }}>
              {empresa}
            </span>
          )}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: '#1e293b', border: '0.5px solid #334155',
              borderRadius: '6px', padding: '4px 10px',
              color: '#e2e8f0', fontSize: '12px', cursor: 'pointer',
            }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: '#4f46e5', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#fff',
              }}>{iniciales}</div>
              <span>{nombre || 'Usuario'}</span>
              <span style={{ color: '#64748b', fontSize: '10px' }}>▾</span>
            </button>
            {menuOpen && (
              <div onClick={() => setMenuOpen(false)} style={{
                position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '10px',
                boxShadow: '0 4px 16px rgba(0,0,0,.08)', minWidth: '180px', zIndex: 200,
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid #f1f5f9' }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>{nombre}</p>
                  <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {usuario?.rol} {usuario?.rol !== 'admin' && rutasPermitidas
                      ? `· ${rutasPermitidas === null ? '…' : rutasPermitidas.length} permisos`
                      : '· acceso total'}
                  </p>
                </div>
                <button onClick={cerrarSesion} style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px',
                  background: 'none', border: 'none', fontSize: '12px',
                  color: '#ef4444', cursor: 'pointer',
                }}>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── MODULE TAB NAV ────────────────────────────────────────────────── */}
      {modulo && itemsPermitidos.length > 0 && (
        <nav style={{
          background: '#fff', borderBottom: '0.5px solid #e2e8f0',
          display: 'flex', alignItems: 'center',
          padding: '0 20px', gap: '2px',
          overflowX: 'auto', flexShrink: 0,
        }}>
          <Link href="/dashboard" style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '11px', color: '#64748b', padding: '0 12px', height: '40px',
            borderRight: '0.5px solid #f1f5f9', marginRight: '8px',
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>
            ← Panel
          </Link>
          {itemsPermitidos.map(item => {
            const activo = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href} style={{
                padding: '0 14px', height: '40px', display: 'flex', alignItems: 'center',
                fontSize: '12px', textDecoration: 'none', whiteSpace: 'nowrap',
                color:        activo ? modulo.color : '#64748b',
                fontWeight:   activo ? 600 : 400,
                borderBottom: activo ? `2px solid ${modulo.color}` : '2px solid transparent',
              }}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* ── CONTENT o ACCESO DENEGADO ─────────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {accesoDenegado ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: '60vh', padding: '40px', textAlign: 'center',
          }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: '#fff1f2', display: 'flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: '20px',
            }}>
              <ShieldOff style={{ width: '36px', height: '36px', color: '#e11d48' }}/>
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
              Acceso denegado
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '360px', lineHeight: 1.6, marginBottom: '24px' }}>
              No tienes permisos para acceder a esta sección.
              Contacta al administrador si crees que esto es un error.
            </p>
            <Link href="/dashboard" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', background: '#0f172a', color: '#fff',
              borderRadius: '10px', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}>
              ← Volver al panel principal
            </Link>
          </div>
        ) : children}
      </main>
    </div>
  );
}
