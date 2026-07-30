/**
 * Valida una CLABE mexicana conforme a su longitud, contenido y dígito de
 * control. No consulta al banco ni demuestra que la cuenta exista.
 */
export function esClabeValida(valor: string): boolean {
  if (!/^\d{18}$/.test(valor)) return false;

  const pesos = [3, 7, 1];
  const suma = valor
    .slice(0, 17)
    .split('')
    .reduce(
      (total, digito, indice) =>
        total + ((Number(digito) * pesos[indice % pesos.length]) % 10),
      0,
    );
  const digitoVerificador = (10 - (suma % 10)) % 10;
  return digitoVerificador === Number(valor[17]);
}

/** Devuelve la clave de institución contenida en la CLABE. */
export function claveBancoDeClabe(valor: string): string {
  return valor.slice(0, 3);
}
