import { ErrorFineract, pudoAplicarse } from './fineract-http.service';

/**
 * ============================================================================
 * «No sé si llegó» y «me dijo que no» son cosas distintas
 * ----------------------------------------------------------------------------
 * Se midió con la nómina: Fineract contestó 403 «the journal entry cannot be
 * made for a future date» a dos pólizas fechadas en octubre. El adaptador lo
 * clasificó como «pudo aplicarse», que es lo que se asume cuando no se sabe si
 * la petición llegó — y aquí sí se sabía: llegó, la evaluó y la rechazó.
 *
 * El precio de esa confusión no fue el rechazo, que era correcto, sino lo que
 * dejó detrás: dos vínculos EN_VUELO sin identificador para siempre, la
 * conciliación contable denunciándolos cada diez minutos como discrepancia, y
 * cada reintento gastando una vuelta de red en preguntarle a Fineract si el
 * asiento había llegado.
 * ============================================================================
 */
describe('Clasificación de la respuesta de Fineract', () => {
  it('un rechazo de negocio prueba que el asiento no se aplicó', () => {
    for (const estado of [400, 403, 404, 422]) {
      expect(pudoAplicarse(estado)).toBe(false);
    }
  });

  it('deja como ambiguo lo que de verdad no dice nada del desenlace', () => {
    // «Ahora no»: la petición pudo estar a medio aplicar.
    expect(pudoAplicarse(408)).toBe(true);
    expect(pudoAplicarse(429)).toBe(true);
    // El conflicto puede ser precisamente que YA existe.
    expect(pudoAplicarse(409)).toBe(true);
    // El servidor falló después de recibirla.
    expect(pudoAplicarse(500)).toBe(true);
    expect(pudoAplicarse(503)).toBe(true);
  });

  it('el error conserva el estado y la clasificación para quien decide', () => {
    const error = new ErrorFineract(
      'Fineract respondió 403: The journal entry cannot be made for a future date',
      403,
      null,
      false,
      pudoAplicarse(403),
    );
    expect(error.estadoHttp).toBe(403);
    expect(error.reintentable).toBe(false);
    expect(error.pudoAplicarse).toBe(false);
  });
});
