# Corrección de compilación v14.2.1

## Error corregido

`src/hoteleria/services/city-ledger.service.ts:640` presentaba `TS2363` al calcular el crédito disponible.

## Causa

Los mapas creados a partir de resultados SQL no declaraban explícitamente los tipos de clave y valor. TypeScript podía inferir un valor unión para `saldoGlobal`, impidiendo usarlo con el operador aritmético `-`.

## Solución

- `porCliente` se tipó como `Map<string, Cliente>`.
- `exposicionPorCliente` se tipó como `Map<string, number>`.
- `porConvenio` se tipó como `Map<string, number>`.
- Las claves provenientes de SQL y entidades se normalizan con `String(...)`.
- El límite vigente se normaliza con `money(...)`.
- El disponible se calcula como `money(Math.max(0, limite - saldoGlobal))`.

No se utilizó `any`, casting forzado ni supresión de errores para el cálculo.

## Validación realizada

- 453 archivos TypeScript del backend analizados sintácticamente.
- 0 errores de sintaxis.
- La comprobación aislada del archivo ya no reporta TS2363; sin dependencias instaladas solo aparecen errores esperados de módulos no encontrados.
- No se incluyó `node_modules`, `.env`, `dist` ni cachés.
