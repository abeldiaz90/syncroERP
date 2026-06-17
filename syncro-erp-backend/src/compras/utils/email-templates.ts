const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Layout base para mantener consistencia visual
const baseLayout = (title: string, color: string, content: string) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #ffffff;">
    <div style="background-color: ${color}; padding: 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">${title}</h1>
    </div>
    <div style="padding: 32px; color: #374151; line-height: 1.6;">
      ${content}
    </div>
    <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px; background: #f9fafb;">
      © ${new Date().getFullYear()} Syncro ERP. Sistema de Compras Automatizado.
    </div>
  </div>
`;

export function htmlNuevaRequisicion(requisicion: any, nombreDestinatario: string): string {
  const resumen = requisicion.detalles
    ?.map((det: any) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${det.producto?.nombre || det.productoId}</td>
        <td style="padding: 12px; border-bottom: 1px solid #f3f4f6; text-align: center; font-weight: bold;">${det.cantidadSolicitada}</td>
      </tr>`)
    .join('') || '';

  const enlace = `${FRONTEND_URL}/dashboard/compras/requisiciones/${requisicion.id}`;

  const content = `
    <p>Hola <strong>${nombreDestinatario}</strong>,</p>
    <p>Se ha generado una nueva requisición <strong>#${requisicion.id.slice(0, 8).toUpperCase()}</strong> que requiere tu revisión y aprobación.</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px;">
      <thead style="background: #f9fafb;">
        <tr>
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Producto</th>
          <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Cantidad</th>
        </tr>
      </thead>
      <tbody>${resumen}</tbody>
    </table>

    <p><strong>Notas del solicitante:</strong><br>${requisicion.notas || 'Sin notas adicionales'}</p>
    
    <div style="text-align: center; margin-top: 30px;">
      <a href="${enlace}" style="background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        Revisar Requisición
      </a>
    </div>
  `;

  return baseLayout('Nueva Requisición', '#4f46e5', content);
}

export function htmlRechazoRequisicion(requisicion: any, comentario: string): string {
  const enlace = `${FRONTEND_URL}/dashboard/compras/requisiciones/${requisicion.id}`;
  const content = `
    <p>Te informamos que tu requisición <strong>#${requisicion.id.slice(0, 8).toUpperCase()}</strong> ha sido rechazada.</p>
    <div style="background: #fef2f2; padding: 16px; border-left: 4px solid #ef4444; margin: 20px 0;">
      <p style="margin: 0; color: #991b1b;"><strong>Comentario del aprobador:</strong><br>${comentario || 'Sin comentarios'}</p>
    </div>
    <div style="text-align: center; margin-top: 30px;">
      <a href="${enlace}" style="background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        Ver Requisición
      </a>
    </div>
  `;
  return baseLayout('Requisición Rechazada', '#ef4444', content);
}

export function htmlAprobadaRequisicion(requisicion: any): string {
  const enlace = `${FRONTEND_URL}/dashboard/compras/requisiciones/${requisicion.id}`;
  const content = `
    <p>¡Buenas noticias!</p>
    <p>Tu requisición <strong>#${requisicion.id.slice(0, 8).toUpperCase()}</strong> ha sido completamente aprobada y está lista para el siguiente paso.</p>
    <div style="text-align: center; margin-top: 30px;">
      <a href="${enlace}" style="background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        Ver Detalle
      </a>
    </div>
  `;
  return baseLayout('Requisición Aprobada', '#10b981', content);
}