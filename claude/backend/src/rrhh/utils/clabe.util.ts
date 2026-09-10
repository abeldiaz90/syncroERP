/** Valida longitud, caracteres y dígito verificador de una CLABE mexicana. */
export function clabeEsValida(valor: string): boolean {
  const clabe = String(valor ?? '').replace(/\D/g, '');
  if (!/^\d{18}$/.test(clabe)) return false;
  const factores = [3, 7, 1] as const;
  const suma = clabe
    .slice(0, 17)
    .split('')
    .reduce(
      (acumulado, digito, indice) =>
        acumulado + ((Number(digito) * factores[indice % 3]) % 10),
      0,
    );
  return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}
