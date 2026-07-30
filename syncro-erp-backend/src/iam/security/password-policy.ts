import { BadRequestException } from '@nestjs/common';

/**
 * Política de contraseñas de SyncroERP.
 *
 * Pensada para una plataforma financiera: mínimo 10 caracteres,
 * al menos una mayúscula, una minúscula y un dígito.
 * (No se exigen símbolos: longitud > complejidad artificial.)
 *
 * Uso:
 *   exigirPoliticaPassword(dto.password);  // lanza BadRequest con el detalle
 */
export function validarPoliticaPassword(password: string): string[] {
  const faltas: string[] = [];
  const p = password ?? '';

  if (p.length < 10) faltas.push('al menos 10 caracteres');
  if (!/[a-záéíóúñü]/.test(p)) faltas.push('una letra minúscula');
  if (!/[A-ZÁÉÍÓÚÑÜ]/.test(p)) faltas.push('una letra mayúscula');
  if (!/[0-9]/.test(p)) faltas.push('un número');

  // contraseñas triviales aunque cumplan lo anterior
  const trivial =
    /^(password|contraseña|qwerty|abc|admin|syncro)/i.test(p) ||
    /^(\d)\1+$/.test(p);
  if (trivial) faltas.push('no ser una contraseña común');

  return faltas;
}

export function exigirPoliticaPassword(password: string): void {
  const faltas = validarPoliticaPassword(password);
  if (faltas.length > 0) {
    throw new BadRequestException(
      `La contraseña no cumple la política de seguridad. Debe tener: ${faltas.join(', ')}.`,
    );
  }
}
