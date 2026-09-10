"use client";
/**
 * ============================================================================
 * SyncroERP · Estructura del área de trabajo
 * ----------------------------------------------------------------------------
 * CORRECCIONES SOBRE LA VERSIÓN ANTERIOR
 *
 * 1. La barra de módulo sólo se pintaba si `detectarModulo()` encontraba un
 *    prefijo. Seis secciones no tenían prefijo y quedaban sin navegación
 *    alguna: el usuario entraba y no había forma de salir salvo el botón atrás.
 *    Ahora el menú lateral es persistente y siempre hay ruta de regreso.
 *
 * 2. Mientras `rutasPermitidas` era null se renderizaban los hijos. Cada
 *    pantalla disparaba sus peticiones antes de saber si el usuario podía
 *    verlas: parpadeo, 403 en consola y datos a medio pintar. Ahora hay un
 *    estado de carga real.
 *
 * 3. El permiso se comparaba con `startsWith()` en ambas direcciones, lo que
 *    concedía acceso por coincidencia parcial de texto. Ahora se compara por
 *    segmentos (ver `lib/session.ts`).
 *
 * 4. `cargando` nunca pasaba a false en la rama de administrador con error, y
 *    un token corrupto dejaba la pantalla colgada. Ahora hay salida en todos
 *    los caminos.
 *
 * 5. Todo estaba en estilos en línea mientras el resto del proyecto usa
 *    Tailwind. Unificado.
 * ============================================================================
 */

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronRight, ChevronsLeft, ChevronsRight, LayoutGrid, LogOut,
  Search, ShieldOff, Loader2, Landmark, ExternalLink,
} from 'lucide-react';

import { MODULOS, detectarModulo, detectarItem, agruparItems } from './module-config';
import { api, token, intentar } from '@/lib/api';
import { leerSesion, sesionVigente, iniciales, puedeEntrar, puedeVerEnlace, type Sesion } from '@/lib/session';
import PaletaComandos from '@/components/PaletaComandos';
import { esRolAdministrador } from '@/lib/roles';
import { PermisosProvider } from '@/app/context/PermisosContext';
import { BarraContextualModulo } from '@/components/navigation/BarraContextualModulo';
import { useI18n } from '@/components/I18nProvider';
import { cerrarSesionKeycloak } from '@/lib/keycloak';

/** Rutas accesibles para cualquier usuario autenticado. */
const RUTAS_LIBRES = new Set(['/dashboard', '/dashboard/']);
const CLAVE_MENU = 'syncro_menu_colapsado';
const FINERACT_URL = process.env.NEXT_PUBLIC_FINERACT_URL ?? 'http://localhost:3002';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { idioma, cambiarIdioma, t } = useI18n();

  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [empresa, setEmpresa] = useState('');
  const [permisos, setPermisos] = useState<string[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(false);      // móvil
  const [colapsado, setColapsado] = useState(false);          // escritorio
  const [menuUsuario, setMenuUsuario] = useState(false);

  const modulo = useMemo(() => detectarModulo(pathname), [pathname]);
  const itemActivo = useMemo(() => detectarItem(modulo, pathname), [modulo, pathname]);

  /* ── Sesión y permisos ─────────────────────────────────────────────────── */

  useEffect(() => {
    let vivo = true;

    (async () => {
      const jwt = token.get();
      const s = leerSesion(jwt);

      if (!sesionVigente(s)) {
        token.clear();
        router.replace('/login');
        return;
      }
      if (!vivo) return;
      setSesion(s);

      // El administrador no necesita consultar: acceso total.
      if (esRolAdministrador(s!.rol)) {
        if (vivo) { setPermisos(['*']); setCargando(false); }
      } else {
        const r = await intentar(
          api.get<{ rutas?: string[] }>('/admin/permisos/mis-rutas'),
          { rutas: [] },
        );
        if (vivo) { setPermisos(Array.isArray(r?.rutas) ? r.rutas : []); setCargando(false); }
      }

      // Dato secundario: si falla, la aplicación sigue funcionando.
      if (s!.empresaId) {
        const e = await intentar(
          api.get<{ nombre?: string }>('/configuracion/empresa'),
          { nombre: '' },
        );
        if (vivo && e?.nombre) setEmpresa(e.nombre);
      }
    })();

    return () => { vivo = false; };
  }, [router]);

  /* ── Preferencia del menú ──────────────────────────────────────────────── */

  useEffect(() => {
    setColapsado(localStorage.getItem(CLAVE_MENU) === '1');
  }, []);

  const alternarColapso = () => {
    setColapsado((v) => {
      localStorage.setItem(CLAVE_MENU, v ? '0' : '1');
      return !v;
    });
  };

  // Cerrar el menú móvil al navegar
  useEffect(() => { setMenuAbierto(false); }, [pathname]);

  /* ── Acceso ────────────────────────────────────────────────────────────── */

  const accesoDenegado = useMemo(() => {
    if (permisos === null) return false;
    if (RUTAS_LIBRES.has(pathname)) return false;
    // Los centros de trabajo son contenedores de navegación. Se permiten cuando
    // el usuario tiene acceso al menos a una pantalla real del módulo.
    if (pathname.startsWith('/dashboard/centros/') && modulo) {
      return !modulo.items.some((i) => !i.oculto && puedeVerEnlace(permisos, i.href));
    }
    if (pathname === '/dashboard/almacenes/centro' && modulo) {
      return !modulo.items.some((i) => !i.oculto && puedeVerEnlace(permisos, i.href));
    }
    return !puedeEntrar(permisos, pathname);
  }, [permisos, pathname, modulo]);

  const modulosVisibles = useMemo(
    () => MODULOS.filter((m) => m.items.some((i) => !i.oculto && puedeVerEnlace(permisos, i.href))),
    [permisos],
  );

  const itemsVisibles = useMemo(
    () => (modulo?.items ?? []).filter((i) => !i.oculto && puedeVerEnlace(permisos, i.href)),
    [modulo, permisos],
  );

  const cerrarSesion = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      cerrarSesionKeycloak();
    }
  };

  /* ── Carga inicial ─────────────────────────────────────────────────────── */

  if (cargando) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[var(--color-lienzo)]">
        <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
        <p className="text-[12.5px] text-slate-500">{t('Preparando tu espacio de trabajo…')}</p>
      </div>
    );
  }

  const nombre = sesion?.nombreCompleto || sesion?.email || 'Usuario';

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <PermisosProvider>
      <div className="min-h-screen flex bg-[var(--color-lienzo)]">

        {/* ══ MENÚ LATERAL ══════════════════════════════════════════════════ */}
        <aside
          className={`fixed lg:sticky top-0 left-0 z-[150] h-screen shrink-0 flex flex-col
                      bg-[var(--color-tinta)] text-slate-300 transition-[width,transform] duration-200
                      ${menuAbierto ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
          style={{ width: colapsado ? 'var(--ancho-menu-min)' : 'var(--ancho-menu)' }}
          data-imprimir="no"
        >
          {/* Marca */}
          <div
            className="flex items-center gap-2.5 px-3.5 shrink-0 border-b border-white/[0.06]"
            style={{ height: 'var(--alto-barra)' }}
          >
            <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
              <span className="w-6 h-6 rounded-md bg-indigo-500 grid place-items-center shrink-0">
                <LayoutGrid className="w-3.5 h-3.5 text-white" />
              </span>
              {!colapsado && (
                <span className="text-white font-bold text-[13.5px] tracking-tight truncate">SyncroERP</span>
              )}
            </Link>
          </div>

          {/* Navegación */}
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {/* Panel principal */}
            <Link
              href="/dashboard"
              title={t('Panel principal')}
              className={`flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[12.5px] transition-colors ${
                pathname === '/dashboard'
                  ? 'bg-white/[0.08] text-white font-semibold'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              {!colapsado && <span>{t('Panel principal')}</span>}
            </Link>

            <div className="h-px bg-white/[0.06] my-2" />

            {/* Módulos */}
            {modulosVisibles.map((m) => {
              const esActual = modulo?.id === m.id;
              const Icono = m.Icono;

              return (
                <div key={m.id}>
                  <Link
                    href={m.href}
                    title={t(m.nombre)}
                    className={`relative flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[12.5px] transition-colors ${
                      esActual
                        ? 'bg-white/[0.08] text-white font-semibold espina'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                    style={esActual ? ({ ['--espina-color' as string]: m.color }) : undefined}
                  >
                    <Icono className="w-4 h-4 shrink-0" style={{ color: esActual ? m.color : undefined }} />
                    {!colapsado && <span className="truncate">{t(m.nombre)}</span>}
                  </Link>

                  {/* Secciones del módulo abierto */}
                  {esActual && !colapsado && (
                    <div className="mt-1 mb-2 ml-[18px] pl-3 border-l border-white/[0.08] space-y-0.5">
                      {agruparItems(itemsVisibles).map(([grupo, items]) => (
                        <div key={grupo} className="pt-1.5 first:pt-0">
                          {grupo !== 'General' && (
                            <p className="eyebrow px-2 pb-1 text-slate-500">{grupo}</p>
                          )}
                          {items.map((it) => {
                            const activo = itemActivo?.href === it.href;
                            return (
                              <Link
                                key={it.href}
                                href={it.href}
                                className={`flex items-center gap-2 h-7 px-2 rounded text-[12px] transition-colors ${
                                  activo
                                    ? 'text-white font-semibold bg-white/[0.06]'
                                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                                }`}
                              >
                                <span className="truncate">{t(it.label)}</span>
                                {it.etiqueta && (
                                  <span className="ml-auto text-[9px] font-bold px-1.5 py-px rounded-full bg-indigo-500/20 text-indigo-300 shrink-0">
                                    {it.etiqueta}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Fineract conserva su propia autorización. Keycloak aporta SSO,
                pero SyncroERP nunca traduce ni suplanta sus permisos bancarios. */}
            <div className="h-px bg-white/[0.06] my-2" />
            <a
              href={FINERACT_URL}
              target="_blank"
              rel="noopener noreferrer"
              title={t('Fineract')}
              className="flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[12.5px] text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              <Landmark className="w-4 h-4 shrink-0 text-emerald-400" />
              {!colapsado && (
                <>
                  <span className="truncate">{t('Fineract')}</span>
                  <ExternalLink className="ml-auto w-3 h-3 shrink-0 text-slate-500" />
                </>
              )}
            </a>
          </nav>

          {/* Colapsar */}
          <button
            onClick={alternarColapso}
            className="hidden lg:flex items-center gap-2.5 h-9 px-3.5 text-[11.5px] text-slate-500 hover:text-white border-t border-white/[0.06] shrink-0"
          >
            {colapsado
              ? <ChevronsRight className="w-4 h-4" />
              : <><ChevronsLeft className="w-4 h-4" /> {t('Contraer menú')}</>}
          </button>
        </aside>

        {/* Velo en móvil */}
        {menuAbierto && (
          <div
            className="fixed inset-0 z-[140] bg-slate-900/50 lg:hidden"
            onClick={() => setMenuAbierto(false)}
          />
        )}

        {/* ══ COLUMNA PRINCIPAL ═════════════════════════════════════════════ */}
        <div className="flex-1 min-w-0 flex flex-col">

          {/* Barra superior */}
          <header
            className="sticky top-0 z-[100] flex items-center gap-3 px-4 bg-white border-b border-[var(--color-linea)]"
            style={{ height: 'var(--alto-barra)' }}
            data-imprimir="no"
          >
            <button
              onClick={() => setMenuAbierto(true)}
              className="lg:hidden btn btn-fantasma btn-icono btn-sm"
              aria-label="Abrir menú"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            {/* Migas de pan: siempre visibles, siempre navegables */}
            <nav aria-label="Ruta" className="flex items-center gap-1.5 min-w-0 text-[12.5px]">
              <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 shrink-0">{t('Panel')}</Link>
              {modulo && (
                <>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <Link href={modulo.href} className="text-slate-500 hover:text-slate-800 truncate">
                    {t(modulo.nombre)}
                  </Link>
                </>
              )}
              {itemActivo && (
                <>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <span className="text-slate-900 font-semibold truncate">{t(itemActivo.label)}</span>
                </>
              )}
            </nav>

            <div className="ml-auto flex items-center gap-2 shrink-0">
              {/* Disparador de la paleta de comandos */}
              <button
                onClick={() => {
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
                }}
                className="hidden sm:flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg border border-[var(--color-linea)] text-slate-400 hover:border-slate-300 hover:text-slate-600 transition-colors"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="text-[12px]">{t('Buscar')}</span>
                <kbd className="text-[10px] font-semibold bg-slate-100 rounded px-1.5 py-0.5 text-slate-500">⌘K</kbd>
              </button>

              {empresa && (
                <span className="hidden md:inline text-[11.5px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full max-w-[180px] truncate">
                  {empresa}
                </span>
              )}

              {/* Usuario */}
              <div className="relative">
                <button
                  onClick={() => setMenuUsuario((v) => !v)}
                  className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white grid place-items-center text-[10px] font-bold">
                    {iniciales(nombre)}
                  </span>
                  <span className="hidden sm:inline text-[12.5px] text-slate-700 max-w-[130px] truncate">
                    {nombre}
                  </span>
                </button>

                {menuUsuario && (
                  <>
                    <div className="fixed inset-0 z-[190]" onClick={() => setMenuUsuario(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-[200] w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="px-3.5 py-3 border-b border-slate-100">
                        <p className="text-[13px] font-semibold text-slate-900 truncate">{nombre}</p>
                        <p className="text-[11.5px] text-slate-500 truncate">{sesion?.email}</p>
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          {sesion?.rol}
                          {permisos?.includes('*')
                            ? ' · acceso total'
                            : ` · ${permisos?.length ?? 0} secciones`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
                        <span className="text-[11.5px] text-slate-500">Language</span>
                        <select value={idioma} onChange={(e) => void cambiarIdioma(e.target.value as 'es-MX' | 'en-US')} className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px]">
                          <option value="es-MX">Español</option><option value="en-US">English</option>
                        </select>
                      </div>
                      <button
                        onClick={cerrarSesion}
                        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" /> {t('Cerrar sesión')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Navegación contextual: el usuario no depende sólo del menú lateral. */}
          {modulo && !accesoDenegado && (
            <BarraContextualModulo modulo={modulo} items={itemsVisibles} activo={itemActivo} />
          )}

          {/* Contenido */}
          <main className="flex-1 min-w-0">
            {accesoDenegado ? <SinAcceso /> : children}
          </main>
        </div>

        <PaletaComandos permisos={permisos} />
      </div>
    </PermisosProvider>
  );
}

/* ── Acceso denegado ──────────────────────────────────────────────────────── */

function SinAcceso() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6" style={{ minHeight: '70vh' }}>
      <div className="w-14 h-14 rounded-2xl bg-rose-50 grid place-items-center mb-4">
        <ShieldOff className="w-6 h-6 text-rose-500" />
      </div>
      <h1 className="text-[18px] font-bold text-slate-900">Esta sección no está en tu perfil</h1>
      <p className="text-[13px] text-slate-500 mt-1.5 max-w-sm leading-relaxed">
        Tu rol no incluye acceso a esta pantalla. Pide al administrador que la agregue
        desde Administración → Roles y permisos.
      </p>
      <Link href="/dashboard" className="btn btn-primario mt-5">Volver al panel</Link>
    </div>
  );
}
