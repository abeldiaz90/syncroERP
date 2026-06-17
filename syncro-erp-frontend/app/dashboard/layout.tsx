"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  // Íconos disponibles — el backend devuelve el nombre como string
  LayoutDashboard, Package, Users, ShoppingCart, ShoppingBag, Settings,
  ChevronDown, Menu, X, LogOut, Hexagon, CircleDollarSign, Truck,
  Folder, Shield, Building2, Tags, Percent, Landmark, Globe, CreditCard,
  ClipboardList, Receipt, Warehouse, DollarSign,
} from 'lucide-react';
import ProtectorDeRutas from '@/app/components/ProtectorDeRutas';

// ─────────────────────────────────────────────────────────────────
// MAPA DE ÍCONOS
// El backend devuelve el nombre del ícono como string.
// Este mapa lo convierte al componente real de Lucide.
// Para agregar un ícono nuevo: importarlo arriba y agregarlo aquí.
// ─────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Package, Users, ShoppingCart, ShoppingBag, Settings,
  CircleDollarSign, Truck, Folder, Shield, Building2, Tags, Percent,
  Landmark, Globe, CreditCard, ClipboardList, Receipt, Warehouse, DollarSign,
};

const IconoComponente = ({ nombre, size = 20, className = '' }: { nombre: string; size?: number; className?: string }) => {
  const Comp = ICON_MAP[nombre] ?? Folder;
  return <Comp size={size} className={className} />;
};

// ─────────────────────────────────────────────────────────────────
// TIPOS — espejo de lo que devuelve GET /api/auth/menu
// ─────────────────────────────────────────────────────────────────
interface IMenuItemNav {
  titulo: string;
  rutaFrontend: string;
  ordenMenu: number;
}

interface IMenuModulo {
  titulo: string;
  icono: string;
  orden: number;
  items: IMenuItemNav[];
}

interface IMenuSeccion {
  seccion: string;
  modulos: IMenuModulo[];
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarAbierto, setSidebarAbierto] = useState(true);
  const [modulosExpandidos, setModulosExpandidos] = useState<Set<string>>(new Set(['Ventas', 'Compras']));
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<any>(null);

  // ✅ Menú viene 100% del backend — sin arrays hardcodeados
  const [menuSecciones, setMenuSecciones] = useState<IMenuSeccion[]>([]);
  const [cargandoMenu, setCargandoMenu] = useState(true);

  // ── Cargar usuario y menú al montar ──
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('syncro_user') || '{}');
    setUsuario(user);
    cargarMenu();
  }, []);

  const cargarMenu = async () => {
    const token = localStorage.getItem('syncro_token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/auth/menu`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: IMenuSeccion[] = await res.json();

        // Siempre insertamos "Panel Principal" al inicio
        const menuConDashboard: IMenuSeccion[] = [
          {
            seccion: 'General',
            modulos: [{
              titulo: 'Panel Principal',
              icono: 'LayoutDashboard',
              orden: 0,
              items: [{ titulo: 'Panel Principal', rutaFrontend: '/dashboard', ordenMenu: 0 }],
            }],
          },
          ...data.filter(s => s.seccion !== 'General'), // Evitar duplicado si backend lo devuelve
        ];

        setMenuSecciones(menuConDashboard);
      }
    } catch (e) {
      console.error('[Menu] Error cargando menú:', e);
    } finally {
      setCargandoMenu(false);
    }
  };

  // ── Helpers ──
  const toggleModulo = (titulo: string) => {
    setModulosExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(titulo)) next.delete(titulo);
      else next.add(titulo);
      return next;
    });
  };

  const isActive = (ruta: string) => pathname === ruta || (ruta !== '/dashboard' && pathname.startsWith(ruta + '/'));

  const inicialesUsuario = (nombre = '') =>
    nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'US';

  const cerrarSesion = () => { localStorage.clear(); window.location.href = '/login'; };

  // Título del header — busca en el árbol cuál ítem está activo
  const tituloActual = useMemo(() => {
    for (const sec of menuSecciones) {
      for (const mod of sec.modulos) {
        for (const item of mod.items) {
          if (isActive(item.rutaFrontend)) return item.titulo;
        }
        // Si el módulo tiene un único ítem y coincide con la ruta base
        if (mod.items.length === 1 && isActive(mod.items[0].rutaFrontend)) return mod.titulo;
      }
    }
    return 'Panel de Control';
  }, [menuSecciones, pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900">

      {/* ========== SIDEBAR ========== */}
      <aside className={`${sidebarAbierto ? 'w-[280px]' : 'w-[80px]'} bg-[#060B14] text-slate-300 transition-all duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] flex flex-col border-r border-slate-800/80 shadow-[10px_0_30px_-15px_rgba(0,0,0,0.5)] relative z-20`}>

        {/* Logo */}
        <div className="flex items-center justify-between h-20 px-5 border-b border-white/5 bg-[#060B14]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
            <div className="min-w-[40px] h-10 bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              <Hexagon className="w-6 h-6 text-white" fill="currentColor" strokeWidth={1} />
            </div>
            {sidebarAbierto && (
              <span className="text-xl font-black text-white tracking-tight animate-in fade-in duration-300">
                Syncro <span className="text-indigo-500">ERP</span>
              </span>
            )}
          </div>
          <button onClick={() => setSidebarAbierto(!sidebarAbierto)} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors">
            {sidebarAbierto ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navegación dinámica */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4 [&::-webkit-scrollbar]:hidden">
          {cargandoMenu ? (
            // Skeleton mientras carga
            <div className="space-y-3 px-2 pt-4">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
          ) : (
            menuSecciones.map((seccion, sIdx) => (
              <div key={seccion.seccion} className="mb-2 animate-in slide-in-from-left-4 fade-in duration-500 fill-mode-both" style={{ animationDelay: `${sIdx * 80}ms` }}>

                {/* Título de sección */}
                {sidebarAbierto ? (
                  <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-600 mb-2 mt-4 px-3">
                    {seccion.seccion}
                  </h3>
                ) : (
                  sIdx !== 0 && <hr className="border-white/5 my-4 mx-2" />
                )}

                <div className="space-y-1.5">
                  {seccion.modulos.map(modulo => {
                    const esItemSimple = modulo.items.length === 1;
                    const itemUnico = modulo.items[0];

                    // ── Ítem simple (1 solo hijo = no necesita submenú) ──
                    if (esItemSimple) {
                      const active = isActive(itemUnico.rutaFrontend);
                      return (
                        <Link
                          key={itemUnico.rutaFrontend}
                          href={itemUnico.rutaFrontend}
                          className={`group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 relative overflow-hidden ${
                            active
                              ? 'bg-gradient-to-r from-indigo-500/15 to-transparent text-indigo-400 font-bold border border-indigo-500/20'
                              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
                          }`}
                        >
                          {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.8)]" />}
                          <IconoComponente
                            nombre={modulo.icono}
                            size={20}
                            className={active ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300 transition-colors'}
                          />
                          {sidebarAbierto && <span className="text-[13px] truncate">{modulo.titulo}</span>}
                        </Link>
                      );
                    }

                    // ── Módulo con submenú ──
                    const expandido = modulosExpandidos.has(modulo.titulo);
                    const tieneHijoActivo = modulo.items.some(i => isActive(i.rutaFrontend));

                    return (
                      <div key={modulo.titulo} className="flex flex-col gap-1">
                        <button
                          onClick={() => toggleModulo(modulo.titulo)}
                          className={`w-full group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 outline-none border ${
                            tieneHijoActivo && !expandido
                              ? 'bg-indigo-500/10 text-indigo-400 font-bold border-indigo-500/20'
                              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border-transparent'
                          }`}
                        >
                          <IconoComponente
                            nombre={modulo.icono}
                            size={20}
                            className={tieneHijoActivo && !expandido ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300 transition-colors'}
                          />
                          {sidebarAbierto && (
                            <>
                              <span className="flex-1 text-left text-[13px] truncate">{modulo.titulo}</span>
                              <div className={`transition-transform duration-300 ${expandido ? 'rotate-180' : ''}`}>
                                <ChevronDown size={16} className="opacity-50" />
                              </div>
                            </>
                          )}
                        </button>

                        {expandido && sidebarAbierto && (
                          <div className="ml-[22px] mt-1 space-y-1 border-l border-slate-800 pl-4 py-1 animate-in slide-in-from-top-2 fade-in duration-200">
                            {modulo.items.map(item => {
                              const isSubActive = isActive(item.rutaFrontend);
                              return (
                                <Link
                                  key={item.rutaFrontend}
                                  href={item.rutaFrontend}
                                  className={`block px-3 py-2.5 rounded-lg text-[13px] transition-all duration-300 relative ${
                                    isSubActive
                                      ? 'bg-indigo-500/10 text-indigo-400 font-bold'
                                      : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 font-medium'
                                  }`}
                                >
                                  {isSubActive && (
                                    <div className="absolute -left-[17px] top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,1)]" />
                                  )}
                                  {item.titulo}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </nav>

        {/* Usuario + Cerrar sesión */}
        <div className="p-4 border-t border-white/5 bg-[#060B14]">
          {sidebarAbierto && usuario && (
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white font-bold text-xs border border-slate-600 shadow-inner">
                {inicialesUsuario(usuario.nombre || usuario.nombreCompleto)}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-white truncate">{usuario.nombre || usuario.nombreCompleto}</p>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest truncate">{usuario.rol}</p>
              </div>
            </div>
          )}
          <button
            onClick={cerrarSesion}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all duration-300 font-bold group border border-transparent hover:border-rose-400/50"
          >
            <LogOut size={16} className="transition-transform group-hover:-translate-x-1" />
            {sidebarAbierto && <span className="text-[13px]">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* ========== CONTENIDO PRINCIPAL ========== */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 bg-slate-50/80 backdrop-blur-xl border-b border-slate-200/60 px-8 flex items-center justify-between sticky top-0 z-10">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">{tituloActual}</h2>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 text-right">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-800 leading-none">
                  {usuario?.nombre || usuario?.nombreCompleto || 'Cargando...'}
                </span>
                <span className="text-[9px] font-black text-indigo-600 mt-1 uppercase tracking-widest">
                  {usuario?.departamento || 'Syncro ERP'}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-blue-50 text-indigo-700 flex items-center justify-center font-sm shadow-sm border border-indigo-200/60">
                {inicialesUsuario(usuario?.nombre || usuario?.nombreCompleto)}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-transparent scroll-smooth">
          <div className="max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
            <ProtectorDeRutas>
              {children}
            </ProtectorDeRutas>
          </div>
        </main>
      </div>
    </div>
  );
}
