/*
  Regulariza un lote histórico que nació con existencia pero sin costo.

  IMPORTANTE:
  - Ejecutar primero en desarrollo/QA.
  - Confirmar que @CostoUnitario es el costo histórico defendible.
  - El script no cambia cantidades; corrige valuación, kardex y encola las
    pólizas de costo faltantes de ventas que siguen COMPLETADAS.
*/

SET XACT_ABORT ON;

DECLARE @EmpresaId UNIQUEIDENTIFIER =
  '24A97602-B08A-F111-8D68-C0B883CD616B';
DECLARE @ProductoId UNIQUEIDENTIFIER =
  '72C5415B-B18A-F111-8D68-C0B883CD616B';
DECLARE @LoteId UNIQUEIDENTIFIER =
  '705A47B7-B18A-F111-8D68-C0B883CD616B';
DECLARE @CostoUnitario DECIMAL(18,4) = 69.2000;

BEGIN TRANSACTION;

IF @CostoUnitario <= 0
  THROW 51000, 'El costo de regularización debe ser mayor a cero.', 1;

IF NOT EXISTS (
  SELECT 1
  FROM lotes_inventario
  WHERE id = @LoteId
    AND empresaId = @EmpresaId
    AND productoId = @ProductoId
)
  THROW 51000, 'El lote no corresponde a la empresa y producto indicados.', 1;

IF EXISTS (
  SELECT 1
  FROM lotes_inventario
  WHERE id = @LoteId AND costoUnitario > 0
)
  THROW 51000, 'El lote ya tiene costo. No se aplicó ninguna modificación.', 1;

DECLARE @StockActual DECIMAL(18,4);
DECLARE @StockInicial DECIMAL(18,4);
DECLARE @StockReconstruido DECIMAL(18,4);

SELECT @StockActual = stockRestante
FROM lotes_inventario WITH (UPDLOCK, HOLDLOCK)
WHERE id = @LoteId;

SELECT TOP 1 @StockInicial = stock_anterior
FROM movimientos_inventario
WHERE lote_id = @LoteId
ORDER BY fecha_movimiento, id;

IF @StockInicial IS NULL
  THROW 51000, 'No hay movimientos suficientes para reconstruir el kardex.', 1;

SELECT
  @StockReconstruido =
    @StockInicial +
    SUM(CASE WHEN tipo = 'ENTRADA' THEN cantidad ELSE -cantidad END)
FROM movimientos_inventario
WHERE lote_id = @LoteId;

IF ABS(@StockReconstruido - @StockActual) > 0.0001
  THROW 51000, 'El kardex reconstruido no coincide con el stock actual.', 1;

-- Reconstruye stock anterior/posterior de cada movimiento. Corrige las
-- anulaciones antiguas que se habían registrado como 0 -> 0.
;WITH Secuencia AS (
  SELECT
    id,
    delta =
      CASE WHEN tipo = 'ENTRADA' THEN cantidad ELSE -cantidad END,
    acumuladoAnterior =
      COALESCE(
        SUM(CASE WHEN tipo = 'ENTRADA' THEN cantidad ELSE -cantidad END)
          OVER (
            ORDER BY fecha_movimiento, id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ),
        0
      ),
    acumuladoActual =
      SUM(CASE WHEN tipo = 'ENTRADA' THEN cantidad ELSE -cantidad END)
        OVER (
          ORDER BY fecha_movimiento, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )
  FROM movimientos_inventario
  WHERE lote_id = @LoteId
)
UPDATE m
SET
  stock_anterior = @StockInicial + s.acumuladoAnterior,
  stock_nuevo = @StockInicial + s.acumuladoActual,
  costo_unitario = @CostoUnitario,
  costo_total = ROUND(m.cantidad * @CostoUnitario, 2)
FROM movimientos_inventario m
INNER JOIN Secuencia s ON s.id = m.id;

UPDATE lotes_inventario
SET
  costoUnitario = @CostoUnitario,
  valorTotal = ROUND(stockRestante * @CostoUnitario, 2)
WHERE id = @LoteId;

/*
  Encola ventas vigentes que consumieron este lote y no tienen póliza de
  costo. El reintento creará sólo la póliza faltante; la de ingreso se omite
  por su clave idempotente.
*/
INSERT INTO asientos_pendientes (
  id,
  empresaId,
  tipo,
  documentoId,
  folioDocumento,
  payload,
  estado,
  intentos,
  ultimoError,
  fechaUltimoIntento,
  proximoIntento
)
SELECT
  NEWID(),
  v.empresaId,
  'VENTA',
  v.id,
  CONCAT('VENTA-', v.folio),
  (
    SELECT
      v.id AS ventaId,
      v.folio AS folio,
      CONVERT(varchar(33), v.fechaVenta, 126) AS fecha,
      v.empresaId AS empresaId,
      v.metodoPago AS metodoPago,
      JSON_QUERY((
        SELECT
          d.productoId,
          d.cantidad,
          d.subtotal,
          d.impuestoMonto,
          COALESCE((
            SELECT SUM(mi.costo_total)
            FROM movimientos_inventario mi
            WHERE mi.documento_id = v.id
              AND mi.producto_id = d.productoId
              AND mi.tipo = 'SALIDA'
          ), 0) AS costoTotal
        FROM detalles_venta d
        WHERE d.ventaId = v.id
        FOR JSON PATH
      )) AS detalles,
      v.total AS totalGeneral
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
  ),
  'PENDIENTE',
  0,
  'Regularización histórica: lote originalmente valuado en cero.',
  SYSUTCDATETIME(),
  DATEADD(SECOND, -1, SYSUTCDATETIME())
FROM ventas v
WHERE v.empresaId = @EmpresaId
  AND v.estado = 'COMPLETADA'
  AND EXISTS (
    SELECT 1
    FROM movimientos_inventario mi
    WHERE mi.documento_id = v.id
      AND mi.lote_id = @LoteId
      AND mi.tipo = 'SALIDA'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM polizas p
    WHERE p.empresaId = v.empresaId
      AND p.origenClave = CONCAT('VENTA:', CONVERT(varchar(36), v.id), ':COSTO')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM asientos_pendientes ap
    WHERE ap.empresaId = v.empresaId
      AND ap.tipo = 'VENTA'
      AND ap.documentoId = v.id
      AND ap.estado IN ('PENDIENTE', 'REINTENTANDO', 'FALLIDO')
  );

COMMIT TRANSACTION;

SELECT
  id,
  numeroLote,
  stockRestante,
  costoUnitario,
  valorTotal
FROM lotes_inventario
WHERE id = @LoteId;

SELECT
  tipo,
  estado,
  folioDocumento,
  ultimoError,
  proximoIntento
FROM asientos_pendientes
WHERE empresaId = @EmpresaId
  AND tipo = 'VENTA'
ORDER BY fechaCreacion DESC;
