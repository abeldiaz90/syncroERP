"use client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag,
  AlertTriangle, Package, CreditCard, RefreshCw,
  ArrowRight, Users, Truck
} from 'lucide-react';

interface IDashboard {
  fecha: string;
  ventas: { hoy: D; semana: D; mes: D };
  cobranzaHoy: { total: number; pagos: number };
  cxc: { saldo: number; creditos: number };
  cxp: { saldo: number; ordenes: number };
  inventario: { valor: number };
  iva: { traslado: number; acreditable: number; aPagar: number };
  alertas: {
    cuotasVencidas: { total: number; monto: number };
    stockBajo: { total: number };
    requisicionesPendientes: { total: number };
  };
  graficaVentas: { dia: string; total: number; cantidad: number }[];
  topProductos: { nombre: string; sku: string; unidades: number; importe: number }[];
}
interface D { total: number; cantidad: number; }

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n ?? 0);

const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function fmtDia(s: string) {
  const d = new Date(s + 'T12:00:00');
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

function Kpi({ label, valor, sub, color, icon: Icon, href }: {
  label: string; valor: string; sub?: string; color: string; icon: any; href?: string;
}) {
  const inner = (
    <div style={{
      background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14,
      padding: '16px 18px', height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8' }}>{label}</p>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon style={{ width: 16, height: 16, color }}/>
        </div>
      </div>
      <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>{valor}</p>
      {sub && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</p>}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{inner}</Link>;
  return inner;
}

function MiniChart({ data }: { data: { dia: string; total: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!data.length || !canvasRef.current) return;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Llenar días sin venta con 0
      const hoy  = new Date();
      const dias: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(hoy); d.setDate(d.getDate() - i);
        dias.push(d.toISOString().split('T')[0]);
      }
      const mapa = new Map(data.map(d => [d.dia, d.total]));
      const totales = dias.map(d => mapa.get(d) ?? 0);

      const Chart = (window as any).Chart;
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: dias.map(d => fmtDia(d)),
          datasets: [{
            data: totales,
            backgroundColor: totales.map(v => v > 0 ? '#4f46e5' : '#e2e8f0'),
            borderRadius: 3,
            borderSkipped: false,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            callbacks: { label: (c: any) => fmt$(c.raw) }
          }},
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 8, color: '#94a3b8' } },
            y: { grid: { color: '#f1f5f9' }, ticks: {
              color: '#94a3b8', font: { size: 10 },
              callback: (v: number) => v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : '$' + v,
            }},
          },
        },
      });
    };
    if (!(window as any).Chart) document.head.appendChild(script);
    else script.onload!(new Event('load'));
  }, [data]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 180 }}>
      <canvas ref={canvasRef} role="img" aria-label="Gráfica de ventas diarias últimos 30 días"/>
    </div>
  );
}

export default function DashboardEjecutivoPage() {
  const [datos, setDatos]     = useState<IDashboard | null>(null);
  const [cargando, setCargando] = useState(true);
  const [lastUpdate, setLastUpdate] = useState('');

  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}` });

  const cargar = async () => {
    setCargando(true);
    const r = await fetch(`${api}/dashboard/ejecutivo`, { headers: h() }).catch(() => null);
    if (r?.ok) {
      setDatos(await r.json());
      setLastUpdate(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
    }
    setCargando(false);
  };

  useEffect(() => { cargar(); const t = setInterval(cargar, 5 * 60 * 1000); return () => clearInterval(t); }, []);

  const hoy  = new Date();
  const saludo = hoy.getHours() < 12 ? 'Buenos días' : hoy.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  const fechaStr = `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`;

  const totalAlertas = datos
    ? (datos.alertas.cuotasVencidas.total > 0 ? 1 : 0) +
      (datos.alertas.stockBajo.total > 0 ? 1 : 0) +
      (datos.alertas.requisicionesPendientes.total > 0 ? 1 : 0)
    : 0;

  return (
    <div style={{ padding: '28px 24px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
            {saludo} 👋
          </h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>{fechaStr} · Dashboard ejecutivo</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdate && <p style={{ fontSize: 11, color: '#94a3b8' }}>Actualizado: {lastUpdate}</p>}
          <button onClick={cargar} disabled={cargando}
            style={{ padding: '7px 14px', background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
            <RefreshCw style={{ width: 13, height: 13, animation: cargando ? 'spin 1s linear infinite' : 'none' }}/> Actualizar
          </button>
        </div>
      </div>

      {cargando && !datos ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }}/>
            <p style={{ color: '#94a3b8', fontSize: 13 }}>Cargando datos...</p>
          </div>
        </div>
      ) : datos ? (
        <>
          {/* KPIs principales */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            <Kpi label="Ventas hoy"     valor={fmt$(datos.ventas.hoy.total)}    sub={`${datos.ventas.hoy.cantidad} transacciones`}      color="#4f46e5" icon={ShoppingBag} href="/dashboard/ventas/historial"/>
            <Kpi label="Cobrado hoy"    valor={fmt$(datos.cobranzaHoy.total)}   sub={`${datos.cobranzaHoy.pagos} pagos recibidos`}       color="#059669" icon={DollarSign}  href="/dashboard/creditos/cobranza"/>
            <Kpi label="Ventas semana"  valor={fmt$(datos.ventas.semana.total)} sub={`${datos.ventas.semana.cantidad} ventas`}            color="#0284c7" icon={TrendingUp}  href="/dashboard/reportes/ventas"/>
            <Kpi label="Ventas del mes" valor={fmt$(datos.ventas.mes.total)}    sub={`${datos.ventas.mes.cantidad} transacciones`}        color="#7c3aed" icon={TrendingUp}  href="/dashboard/reportes/ventas"/>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            <Kpi label="Por cobrar (CxC)"  valor={fmt$(datos.cxc.saldo)}        sub={`${datos.cxc.creditos} créditos activos`}           color="#d97706" icon={CreditCard}  href="/dashboard/creditos/creditos"/>
            <Kpi label="Por pagar (CxP)"   valor={fmt$(datos.cxp.saldo)}        sub={`${datos.cxp.ordenes} órdenes sin pagar`}           color="#e11d48" icon={Truck}       href="/dashboard/compras/pago-proveedores"/>
            <Kpi label="Inventario valor"  valor={fmt$(datos.inventario.valor)}  sub="Valorado al costo"                                  color="#059669" icon={Package}     href="/dashboard/reportes/inventario"/>
            <Kpi label="IVA a pagar"       valor={fmt$(datos.iva.aPagar)}        sub={`Mes ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`} color="#0891b2" icon={DollarSign}  href="/dashboard/finanzas/declaracion-iva"/>
          </div>

          {/* Alertas */}
          {totalAlertas > 0 && (
            <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 14, padding: '14px 18px', marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle style={{ width: 14, height: 14 }}/> {totalAlertas} alerta{totalAlertas > 1 ? 's' : ''} que requieren atención
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {datos.alertas.cuotasVencidas.total > 0 && (
                  <Link href="/dashboard/creditos/cartera-vencida" style={{ textDecoration: 'none' }}>
                    <div style={{ background: '#fef3c7', border: '0.5px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <p style={{ fontWeight: 700, color: '#b45309' }}>⏰ {datos.alertas.cuotasVencidas.total} cuotas vencidas</p>
                      <p style={{ color: '#92400e', marginTop: 2 }}>{fmt$(datos.alertas.cuotasVencidas.monto)} sin cobrar</p>
                    </div>
                  </Link>
                )}
                {datos.alertas.stockBajo.total > 0 && (
                  <Link href="/dashboard/reportes/inventario" style={{ textDecoration: 'none' }}>
                    <div style={{ background: '#fee2e2', border: '0.5px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <p style={{ fontWeight: 700, color: '#b91c1c' }}>📦 {datos.alertas.stockBajo.total} productos</p>
                      <p style={{ color: '#991b1b', marginTop: 2 }}>con stock bajo mínimo</p>
                    </div>
                  </Link>
                )}
                {datos.alertas.requisicionesPendientes.total > 0 && (
                  <Link href="/dashboard/compras/aprobaciones" style={{ textDecoration: 'none' }}>
                    <div style={{ background: '#ede9fe', border: '0.5px solid #c4b5fd', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <p style={{ fontWeight: 700, color: '#6d28d9' }}>📋 {datos.alertas.requisicionesPendientes.total} requisiciones</p>
                      <p style={{ color: '#5b21b6', marginTop: 2 }}>pendientes de aprobar</p>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Gráfica + Top productos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12 }}>

            {/* Gráfica ventas */}
            <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Ventas — últimos 30 días</p>
                <Link href="/dashboard/reportes/ventas" style={{ fontSize: 11, color: '#4f46e5', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                  Ver reporte <ArrowRight style={{ width: 11, height: 11 }}/>
                </Link>
              </div>
              <MiniChart data={datos.graficaVentas}/>
            </div>

            {/* Top productos */}
            <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Top productos del mes</p>
                <Link href="/dashboard/reportes/top-productos" style={{ fontSize: 11, color: '#4f46e5', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                  Ver más <ArrowRight style={{ width: 11, height: 11 }}/>
                </Link>
              </div>
              {datos.topProductos.length === 0 ? (
                <p style={{ padding: 20, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>Sin ventas este mes</p>
              ) : datos.topProductos.map((p, i) => {
                const max = datos.topProductos[0].importe;
                return (
                  <div key={p.sku} style={{ padding: '10px 16px', borderBottom: '0.5px solid #f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                          background: i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : '#e2e8f0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 800,
                          color: i < 3 ? '#fff' : '#64748b',
                        }}>{i + 1}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{p.nombre}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5' }}>{fmt$(p.importe)}</span>
                    </div>
                    <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(p.importe / max) * 100}%`, background: '#4f46e5', borderRadius: 2 }}/>
                    </div>
                    <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{p.unidades} unidades · {p.sku}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* IVA breakdown */}
          <div style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>IVA del período — {MESES[hoy.getMonth()]} {hoy.getFullYear()}</p>
              <Link href="/dashboard/finanzas/declaracion-iva" style={{ fontSize: 11, color: '#4f46e5', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                Ver declaración <ArrowRight style={{ width: 11, height: 11 }}/>
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'IVA Trasladado (cobrado)', valor: datos.iva.traslado, color: '#059669', desc: 'Cobrado a clientes' },
                { label: 'IVA Acreditable (pagado)', valor: datos.iva.acreditable, color: '#4f46e5', desc: 'Pagado a proveedores' },
                { label: 'A pagar al SAT', valor: datos.iva.aPagar, color: datos.iva.aPagar > 0 ? '#e11d48' : '#059669', desc: datos.iva.aPagar > 0 ? 'Antes del día 17' : 'Saldo a favor' },
              ].map(k => (
                <div key={k.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8', marginBottom: 4 }}>{k.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{fmt$(k.valor)}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{k.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
          No se pudo cargar el dashboard. Verifica que el backend esté corriendo.
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
