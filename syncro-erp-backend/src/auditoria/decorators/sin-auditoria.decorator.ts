import { SetMetadata } from '@nestjs/common';

/**
 * @SinAuditoria() — marca un endpoint para que el interceptor NO lo registre.
 *
 * Útil en operaciones ruidosas o irrelevantes (por ejemplo endpoints de
 * escritura de alto volumen que no aportan valor de auditoría). Por defecto
 * TODO endpoint de escritura sobre entidades sensibles se audita.
 */
export const SIN_AUDITORIA = 'sinAuditoria';
export const SinAuditoria = () => SetMetadata(SIN_AUDITORIA, true);
