// ─── Plantillas HTML para SyncroERP ──────────────────────────────────────────
// Base de diseño: header oscuro, contenido limpio, footer de marca

const BASE_STYLE = `
  body { margin:0; padding:0; background:#f1f5f9; font-family:'Segoe UI',Arial,sans-serif; }
  .wrapper { max-width:600px; margin:0 auto; padding:24px 16px; }
  .card { background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08); }
  .header { background:#0f172a; padding:28px 32px; text-align:center; }
  .header h1 { color:#ffffff; margin:0; font-size:22px; letter-spacing:1px; font-weight:900; }
  .header p  { color:#94a3b8; margin:6px 0 0; font-size:13px; }
  .body { padding:28px 32px; }
  .badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; }
  .table { width:100%; border-collapse:collapse; margin:16px 0; }
  .table th { background:#f8fafc; padding:10px 12px; text-align:left; font-size:11px; text-transform:uppercase; color:#64748b; border-bottom:2px solid #e2e8f0; }
  .table td { padding:10px 12px; font-size:13px; border-bottom:1px solid #f1f5f9; color:#1e293b; }
  .total-row td { font-weight:900; font-size:16px; border-top:2px solid #0f172a; background:#f8fafc; }
  .highlight { background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:16px; margin:16px 0; }
  .btn { display:inline-block; padding:12px 24px; background:#4f46e5; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:700; font-size:14px; }
  .footer { background:#f8fafc; padding:20px 32px; text-align:center; border-top:1px solid #e2e8f0; }
  .footer p { color:#94a3b8; font-size:11px; margin:4px 0; }
  h2 { color:#0f172a; font-size:18px; margin:0 0 16px; }
  p { color:#475569; font-size:14px; line-height:1.6; margin:8px 0; }
  .divider { border:none; border-top:1px solid #e2e8f0; margin:20px 0; }
`;

const wrap = (titulo: string, subtitulo: string, content: string) => `
<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${BASE_STYLE}</style></head>
<body><div class="wrapper"><div class="card">
  <div class="header">
    <h1>⚡ Syncro ERP</h1>
    <p>${subtitulo}</p>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    <p><strong>Syncro ERP</strong> — Sistema de Gestión Empresarial</p>
    <p>Este correo fue generado automáticamente. Por favor no responder.</p>
  </div>
</div></div></body></html>`;

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);
const fmtFecha = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

// ─── 1. CONFIRMACIÓN DE VENTA (efectivo/tarjeta) ────────────────────────────
export function htmlConfirmacionVenta(venta: any, cliente?: any): string {
  const detalles = (venta.detalles ?? []).map((d: any) => `
    <tr>
      <td>${d.producto?.nombre ?? 'Producto'}</td>
      <td style="text-align:center">${d.cantidad}</td>
      <td style="text-align:right">${fmt$(d.precioUnitario)}</td>
      <td style="text-align:right">${fmt$(d.subtotal)}</td>
    </tr>`).join('');

  const METODO: Record<string, string> = {
    EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta bancaria',
    TRANSFERENCIA: 'Transferencia SPEI', MSI_BANCO: 'Meses sin intereses'
  };

  return wrap('Comprobante de Venta', 'Tu compra ha sido procesada exitosamente', `
    <h2>¡Gracias por tu compra! 🎉</h2>
    <p>Hola <strong>${cliente?.nombre ?? 'estimado cliente'}</strong>,<br>
    te confirmamos que tu venta ha sido registrada correctamente.</p>
    <div class="highlight">
      <strong>Folio:</strong> #${String(venta.folio ?? '').padStart(5,'0')} &nbsp;·&nbsp;
      <strong>Fecha:</strong> ${new Date(venta.fechaVenta).toLocaleDateString('es-MX')} &nbsp;·&nbsp;
      <strong>Método:</strong> ${METODO[venta.metodoPago] ?? venta.metodoPago}
    </div>
    <table class="table">
      <thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Importe</th></tr></thead>
      <tbody>${detalles}</tbody>
      <tfoot>
        <tr><td colspan="3" style="text-align:right;padding:10px 12px;color:#64748b">Subtotal</td><td style="text-align:right;padding:10px 12px">${fmt$(venta.subtotal)}</td></tr>
        <tr><td colspan="3" style="text-align:right;padding:10px 12px;color:#64748b">IVA</td><td style="text-align:right;padding:10px 12px">${fmt$(venta.impuestoTotal)}</td></tr>
        <tr class="total-row"><td colspan="3" style="text-align:right;padding:12px">TOTAL</td><td style="text-align:right;padding:12px">${fmt$(venta.total)}</td></tr>
      </tfoot>
    </table>
    <p style="color:#64748b;font-size:12px;text-align:center">Conserva este correo como comprobante de tu compra.</p>
  `);
}

// ─── 2. CRÉDITO OTORGADO ────────────────────────────────────────────────────
export function htmlCreditoOtorgado(venta: any, credito: any, cliente?: any): string {
  const cuotas = (credito.cuotas ?? []).slice(0, 6).map((c: any) => `
    <tr>
      <td style="text-align:center">${c.numeroCuota}</td>
      <td>${fmtFecha(c.fechaVencimiento)}</td>
      <td style="text-align:right">${fmt$(c.montoCapital)}</td>
      ${!credito.sinInteres ? `<td style="text-align:right;color:#ef4444">${fmt$(c.montoInteres)}</td>` : ''}
      <td style="text-align:right;font-weight:700">${fmt$(c.montoCuota)}</td>
    </tr>`).join('');

  const TIPO: Record<string, string> = {
    CREDITO_30D: 'Crédito a 30 días', CREDITO_60D: 'Crédito a 60 días',
    CREDITO_90D: 'Crédito a 90 días', MENSUALIDADES: 'Crédito en mensualidades'
  };

  return wrap('Crédito Autorizado', 'Tu plan de pago ha sido generado', `
    <h2>Crédito autorizado ✅</h2>
    <p>Hola <strong>${cliente?.nombre ?? 'estimado cliente'}</strong>,<br>
    tu compra ha sido procesada con crédito. A continuación los detalles de tu plan de pago:</p>
    <div class="highlight">
      <table style="width:100%;font-size:13px">
        <tr><td><strong>Folio crédito:</strong></td><td>${credito.folio}</td></tr>
        <tr><td><strong>Tipo:</strong></td><td>${TIPO[credito.tipoCredito] ?? credito.tipoCredito}</td></tr>
        <tr><td><strong>Monto total:</strong></td><td>${fmt$(credito.montoTotal)}</td></tr>
        ${credito.enganche > 0 ? `<tr><td><strong>Enganche:</strong></td><td>${fmt$(credito.enganche)}</td></tr>` : ''}
        <tr><td><strong>Interés:</strong></td><td>${credito.sinInteres ? 'Sin interés' : `${credito.tasaInteresMensual}% mensual`}</td></tr>
      </table>
    </div>
    ${credito.cuotas?.length > 0 ? `
    <h2 style="font-size:15px;margin-top:20px">Tu calendario de pagos</h2>
    <table class="table">
      <thead><tr>
        <th style="text-align:center">#</th>
        <th>Vencimiento</th>
        <th style="text-align:right">Capital</th>
        ${!credito.sinInteres ? '<th style="text-align:right">Interés</th>' : ''}
        <th style="text-align:right">Cuota</th>
      </tr></thead>
      <tbody>${cuotas}</tbody>
    </table>
    ${credito.cuotas.length > 6 ? `<p style="text-align:center;color:#94a3b8;font-size:12px">+ ${credito.cuotas.length - 6} pagos adicionales</p>` : ''}
    ` : ''}
    <p style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:13px;color:#92400e">
      ⚠️ <strong>Recuerda:</strong> Los pagos son puntales. El incumplimiento puede generar intereses moratorios.
    </p>
  `);
}

// ─── 3. RECORDATORIO CUOTA (3 días antes) ───────────────────────────────────
export function htmlRecordatorioCuota(cuota: any, credito: any, cliente?: any): string {
  return wrap('Recordatorio de Pago', 'Tu próximo pago vence en 3 días', `
    <h2>Recordatorio de pago 🔔</h2>
    <p>Hola <strong>${cliente?.nombre ?? 'estimado cliente'}</strong>,<br>
    te recordamos que tu próximo pago vence en <strong>3 días</strong>.</p>
    <div class="highlight" style="background:#fef3c7;border-color:#fcd34d">
      <table style="width:100%;font-size:14px">
        <tr><td><strong>Crédito:</strong></td><td>${credito.folio}</td></tr>
        <tr><td><strong>Cuota #:</strong></td><td>${cuota.numeroCuota} de ${credito.numeroCuotas}</td></tr>
        <tr><td><strong>Fecha límite:</strong></td><td style="color:#dc2626;font-weight:700">${fmtFecha(cuota.fechaVencimiento)}</td></tr>
        <tr><td><strong>Monto a pagar:</strong></td><td style="font-size:18px;font-weight:900;color:#0f172a">${fmt$(cuota.montoCuota - cuota.montoPagado)}</td></tr>
      </table>
    </div>
    <p>Para evitar cargos adicionales, realiza tu pago antes de la fecha límite y comunícate con nosotros para confirmar tu abono.</p>
    <p style="color:#64748b;font-size:12px">Referencia de crédito: ${credito.folio}</p>
  `);
}

// ─── 4. ALERTA CUOTA VENCIDA ────────────────────────────────────────────────
export function htmlCuotaVencida(cuota: any, credito: any, cliente?: any, diasVencida = 0): string {
  return wrap('Pago Vencido', 'Tienes un pago pendiente', `
    <h2 style="color:#dc2626">⚠️ Pago vencido</h2>
    <p>Hola <strong>${cliente?.nombre ?? 'estimado cliente'}</strong>,<br>
    detectamos que tu pago venció hace <strong>${diasVencida} día(s)</strong>. Por favor regulariza tu cuenta a la brevedad.</p>
    <div class="highlight" style="background:#fef2f2;border-color:#fca5a5">
      <table style="width:100%;font-size:14px">
        <tr><td><strong>Crédito:</strong></td><td>${credito.folio}</td></tr>
        <tr><td><strong>Cuota #:</strong></td><td>${cuota.numeroCuota}</td></tr>
        <tr><td><strong>Venció el:</strong></td><td style="color:#dc2626">${fmtFecha(cuota.fechaVencimiento)}</td></tr>
        <tr><td><strong>Días vencida:</strong></td><td style="color:#dc2626;font-weight:700">${diasVencida} días</td></tr>
        <tr><td><strong>Saldo pendiente:</strong></td><td style="font-size:20px;font-weight:900;color:#dc2626">${fmt$(cuota.montoCuota - cuota.montoPagado)}</td></tr>
      </table>
    </div>
    <p>Para regularizar tu cuenta, comunícate de inmediato con el área de cobranza.</p>
    <p style="background:#fee2e2;border-radius:8px;padding:12px;font-size:13px;color:#991b1b">
      🚨 El incumplimiento prolongado puede afectar tu historial crediticio con nosotros.
    </p>
  `);
}

// ─── 5. ORDEN DE COMPRA AL PROVEEDOR ────────────────────────────────────────
export function htmlOrdenCompraProveedor(oc: any, proveedor: any): string {
  const detalles = (oc.detalles ?? []).map((d: any) => `
    <tr>
      <td>${d.producto?.nombre ?? 'Producto'}</td>
      <td style="font-family:monospace">${d.producto?.sku ?? ''}</td>
      <td style="text-align:center">${d.cantidad}</td>
      <td style="text-align:right">${fmt$(d.precioUnitario)}</td>
      <td style="text-align:right">${fmt$(d.subtotal)}</td>
    </tr>`).join('');

  return wrap('Orden de Compra', 'Has recibido una nueva orden de compra', `
    <h2>Nueva Orden de Compra 📦</h2>
    <p>Estimado proveedor <strong>${proveedor?.nombre ?? ''}</strong>,<br>
    hemos generado una nueva orden de compra. Por favor confirma la recepción y fecha de entrega.</p>
    <div class="highlight">
      <strong>Folio OC:</strong> OC-${oc.id?.slice(0,8).toUpperCase()} &nbsp;·&nbsp;
      <strong>Fecha:</strong> ${new Date(oc.fechaCreacion).toLocaleDateString('es-MX')}
    </div>
    <table class="table">
      <thead><tr><th>Producto</th><th>SKU</th><th style="text-align:center">Cantidad</th><th style="text-align:right">Precio Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${detalles}</tbody>
      <tfoot>
        <tr class="total-row"><td colspan="4" style="text-align:right;padding:12px">TOTAL OC</td><td style="text-align:right;padding:12px">${fmt$(oc.total)}</td></tr>
      </tfoot>
    </table>
    <p>Para confirmar esta orden o reportar alguna observación, responde este correo o comunícate con el área de compras.</p>
    <p style="color:#64748b;font-size:12px">Referencia: OC-${oc.id?.slice(0,8).toUpperCase()}</p>
  `);
}

// ─── 6. ALERTA STOCK BAJO ───────────────────────────────────────────────────
export function htmlStockBajo(productos: any[]): string {
  const filas = productos.map((p: any) => `
    <tr>
      <td>${p.nombre}</td>
      <td style="font-family:monospace;color:#64748b">${p.sku}</td>
      <td style="text-align:center;color:#dc2626;font-weight:700">${p.stockActual}</td>
      <td style="text-align:center;color:#94a3b8">${p.stockMinimo ?? '—'}</td>
    </tr>`).join('');

  return wrap('Alerta de Stock', `${productos.length} producto(s) bajo el mínimo`, `
    <h2 style="color:#dc2626">⚠️ Alerta de inventario bajo</h2>
    <p>Los siguientes productos han bajado del nivel mínimo de stock y requieren reabastecimiento urgente:</p>
    <table class="table">
      <thead><tr><th>Producto</th><th>SKU</th><th style="text-align:center">Stock actual</th><th style="text-align:center">Mínimo</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p>Se recomienda generar una requisición de compra a la brevedad para evitar desabasto.</p>
    <p style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;font-size:13px;color:#991b1b">
      🔴 Estos productos podrían quedarse sin stock pronto.
    </p>
  `);
}

// ─── 7. BIENVENIDA USUARIO ──────────────────────────────────────────────────
export function htmlBienvenidaUsuario(usuario: any, passwordTemporal?: string): string {
  return wrap('Bienvenido a Syncro ERP', 'Tu cuenta ha sido creada', `
    <h2>¡Bienvenido a Syncro ERP! 🎉</h2>
    <p>Hola <strong>${usuario.nombreCompleto ?? usuario.nombre}</strong>,<br>
    tu cuenta de acceso al sistema ha sido creada exitosamente.</p>
    <div class="highlight">
      <table style="width:100%;font-size:14px">
        <tr><td><strong>Usuario (email):</strong></td><td>${usuario.email}</td></tr>
        <tr><td><strong>Rol asignado:</strong></td><td style="text-transform:capitalize">${usuario.rol}</td></tr>
        ${passwordTemporal ? `<tr><td><strong>Contraseña temporal:</strong></td><td style="font-family:monospace;font-size:16px;font-weight:700;color:#4f46e5">${passwordTemporal}</td></tr>` : ''}
      </table>
    </div>
    ${passwordTemporal ? '<p style="color:#dc2626;font-size:13px"><strong>⚠️ Por seguridad, cambia tu contraseña en tu primer inicio de sesión.</strong></p>' : ''}
    <p>Accede al sistema en <a href="${process.env.FRONTEND_URL ?? 'http://localhost:3000'}" style="color:#4f46e5;font-weight:700">Syncro ERP</a></p>
  `);
}