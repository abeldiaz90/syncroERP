"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MODULOS } from './module-config';

interface IKpis {
  ventasHoy: number; totalHoy: number;
  ticketPromedio: number; totalSemana: number;
}

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function fechaHoy() {
  const d = new Date();
  return `${DIAS[d.getDay()].charAt(0).toUpperCase() + DIAS[d.getDay()].slice(1)} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export default function PanelPrincipalPage() {
  const [kpis, setKpis]             = useState<IKpis | null>(null);
  const [usuario, setUsuario]       = useState<any>(null);
  const [saldo, setSaldo]           = useState<number | null>(null);
  const [rutasPermitidas, setRutas] = useState<string[] | null>(null);

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });

  useEffect(() => {
    const cargar = async () => {
      // Leer rol desde JWT para fallback correcto
      const token = localStorage.getItem('syncro_token') ?? '';
      let rolActual = 'empleado';
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        rolActual = payload.rol ?? 'empleado';
        // Intentar cargar nombre del usuario desde BD
        const ru = await fetch(`${api}/usuarios/${payload.sub}`, { headers: h() }).catch(() => null);
        const nombreCompleto = ru?.ok
          ? (await ru.json())?.nombreCompleto ?? payload.email
          : payload.nombreCompleto ?? payload.nombre ?? payload.email;
        setUsuario({ email: payload.email, rol: payload.rol, nombreCompleto });
      } catch { /* ignorar */ }

      // Rutas permitidas — admin recibe '*', otros reciben lista real
      if (rolActual === 'admin') {
        setRutas(['*']); // Admin siempre ve todo sin consultar
      } else {
        const rp = await fetch(`${api}/admin/permisos/mis-rutas`, { headers: h() }).catch(() => null);
        if (rp?.ok) {
          const d = await rp.json();
          setRutas(Array.isArray(d?.rutas) ? d.rutas : []);
        } else {
          setRutas([]); // Sin acceso si el endpoint falla
        }
      }

      // KPIs ventas
      const rk = await fetch(`${api}/ventas/dashboard/metricas`, { headers: h() }).catch(() => null);
      if (rk?.ok) setKpis(await rk.json());

      // Saldo CxC
      const rb = await fetch(`${api}/finanzas/polizas/balanza`, { headers: h() }).catch(() => null);
      if (rb?.ok) {
        const bal = await rb.json();
        const cxc = bal.find?.((b: any) => b.numeroCuenta?.startsWith('14'));
        if (cxc) setSaldo(Number(cxc.saldoFinal ?? 0));
      }
    };
    cargar();
  }, []);

  const nombre = usuario?.nombreCompleto ?? usuario?.nombre ?? 'bienvenido';
  const hora   = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div style={{ padding: '32px 28px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Saludo */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
          {saludo}, {nombre.split(' ')[0]}
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b' }}>{fechaHoy()} · SyncroERP</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
        {[
          { label: 'Ventas hoy',      val: fmt$(kpis?.totalHoy ?? 0),      sub: `${kpis?.ventasHoy ?? 0} transacciones`, color: '#4f46e5', bg: '#eef2ff' },
          { label: 'Ticket promedio', val: fmt$(kpis?.ticketPromedio ?? 0), sub: 'promedio del día',                       color: '#059669', bg: '#ecfdf5' },
          { label: 'Ventas semana',   val: fmt$(kpis?.totalSemana ?? 0),    sub: 'últimos 7 días',                         color: '#0284c7', bg: '#eff6ff' },
          { label: 'Por cobrar',      val: saldo !== null ? fmt$(saldo) : '—', sub: 'saldo CxC clientes',                  color: '#d97706', bg: '#fffbeb' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#fff', border: '0.5px solid #e2e8f0',
            borderRadius: '12px', padding: '16px 18px',
          }}>
            <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#64748b', marginBottom: '6px' }}>
              {k.label}
            </p>
            <p style={{ fontSize: '22px', fontWeight: 800, color: k.color, marginBottom: '3px' }}>{k.val}</p>
            <p style={{ fontSize: '11px', color: '#94a3b8' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Módulos */}
      <div style={{ marginBottom: '14px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8' }}>
          Módulos del sistema
        </p>
      </div>

      {rutasPermitidas === null && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
          Cargando módulos...
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {(rutasPermitidas ?? []).length === 0 && rutasPermitidas !== null && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px',
            background: '#fff', borderRadius: '14px', border: '0.5px solid #e2e8f0' }}>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>Sin módulos asignados</p>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Contacta al administrador para que configure tus permisos.
            </p>
          </div>
        )}
        {MODULOS.filter(m => {
          if (!rutasPermitidas) return false; // cargando — no mostrar nada aún
          if (rutasPermitidas.includes('*')) return true;
          // Mostrar el módulo si al menos uno de sus items está permitido
          return m.items.some(item =>
            rutasPermitidas.some(r => item.href === r || item.href.startsWith(r) || r.startsWith(item.href))
          );
        }).map(m => (
          <Link key={m.id} href={m.href} style={{ textDecoration: 'none' }}>
            <div style={{
              background: '#fff', border: '0.5px solid #e2e8f0',
              borderRadius: '14px', padding: '18px',
              cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s',
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = m.color + '80';
                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 2px 12px ${m.color}15`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
              }}>

              {/* Ícono */}
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: m.bg, display: 'flex', alignItems: 'center',
                justifyContent: 'center', marginBottom: '12px',
              }}>
                <i className={`ti ${m.icon}`} style={{ fontSize: '20px', color: m.color }}/>
              </div>

              {/* Título */}
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px', lineHeight: 1.3 }}>
                {m.nombre}
              </p>
              <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '10px' }}>
                {m.desc}
              </p>

              {/* Badge con submódulos */}
              <span style={{
                display: 'inline-block', fontSize: '10px', fontWeight: 700,
                padding: '2px 8px', borderRadius: '20px',
                color: m.color, background: m.bg, border: `0.5px solid ${m.border}`,
              }}>
                {m.items.length} secciones
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Accesos rápidos */}
      <div style={{ marginTop: '32px', background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8', marginBottom: '12px' }}>
          Accesos rápidos
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: '+ Nueva venta',        href: '/dashboard/ventas/pos',                      color: '#4f46e5' },
            { label: '+ Nueva póliza',        href: '/dashboard/finanzas/polizas/nueva',           color: '#7c3aed' },
            { label: 'Corte de caja',         href: '/dashboard/reportes/corte-caja',             color: '#059669' },
            { label: 'Declaración IVA',       href: '/dashboard/finanzas/declaracion-iva',        color: '#d97706' },
            { label: 'Cartera vencida',       href: '/dashboard/creditos/cartera-vencida',        color: '#e11d48' },
            { label: 'Reporte de ventas',     href: '/dashboard/reportes/ventas',                 color: '#0284c7' },
          ].map(a => (
            <Link key={a.href} href={a.href} style={{
              display: 'inline-block', padding: '6px 14px',
              background: '#f8fafc', border: '0.5px solid #e2e8f0',
              borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              color: a.color, textDecoration: 'none',
              transition: 'background .15s',
            }}>
              {a.label}
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
