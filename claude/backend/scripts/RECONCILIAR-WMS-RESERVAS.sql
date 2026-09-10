/*
  SyncroERP · Reconciliación WMS
  IMPORTANTE: ejecutar primero DIAGNOSTICAR-WMS-ANTES-REMEDIACION.sql.
  Este script recalcula `reservado` desde sus dos fuentes actuales:
    1) reservas_inventario activas/parcialmente consumidas;
    2) transferencias SOLICITADA/AUTORIZADA que aún no han salido.
  No modifica la existencia física de lotes.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

;WITH ReservasGenericas AS (
  SELECT empresaId, productoId, almacenId,
         SUM(cantidad - ISNULL(cantidadConsumida,0)) AS cantidad
  FROM reservas_inventario
  WHERE estado IN ('ACTIVA','PARCIALMENTE_CONSUMIDA')
    AND (expiraEn IS NULL OR expiraEn > SYSDATETIME())
  GROUP BY empresaId, productoId, almacenId
), TransferenciasPendientes AS (
  SELECT t.empresaId, d.productoId, t.almacenOrigenId AS almacenId,
         SUM(CASE WHEN d.cantidadSolicitada>0 THEN d.cantidadSolicitada ELSE d.cantidad END) AS cantidad
  FROM transferencias_inventario t
  JOIN transferencias_inventario_detalle d ON d.transferenciaId=t.id
  WHERE t.estado IN ('SOLICITADA','AUTORIZADA')
  GROUP BY t.empresaId, d.productoId, t.almacenOrigenId
), Esperado AS (
  SELECT empresaId, productoId, almacenId, SUM(cantidad) cantidad
  FROM (
    SELECT * FROM ReservasGenericas
    UNION ALL
    SELECT * FROM TransferenciasPendientes
  ) x
  GROUP BY empresaId, productoId, almacenId
)
UPDATE s
   SET s.reservado = ISNULL(e.cantidad,0),
       s.comprometido = 0
FROM stock_por_almacen s
LEFT JOIN Esperado e
  ON e.empresaId=s.empresaId AND e.productoId=s.productoId AND e.almacenId=s.almacenId;

/* La reserva física por ubicación solo procede de transferencias pendientes. */
;WITH EsperadoUbicacion AS (
  SELECT t.empresaId, d.productoId, t.almacenOrigenId AS almacenId,
         d.ubicacionOrigenId AS ubicacionId,
         SUM(CASE WHEN d.cantidadSolicitada>0 THEN d.cantidadSolicitada ELSE d.cantidad END) AS cantidad
  FROM transferencias_inventario t
  JOIN transferencias_inventario_detalle d ON d.transferenciaId=t.id
  WHERE t.estado IN ('SOLICITADA','AUTORIZADA')
    AND d.ubicacionOrigenId IS NOT NULL
  GROUP BY t.empresaId, d.productoId, t.almacenOrigenId, d.ubicacionOrigenId
)
UPDATE su
   SET su.reservado = CASE
      WHEN ISNULL(e.cantidad,0) > su.cantidad THEN su.cantidad
      ELSE ISNULL(e.cantidad,0)
   END
FROM stock_ubicaciones su
LEFT JOIN EsperadoUbicacion e
  ON e.empresaId=su.empresaId AND e.productoId=su.productoId
 AND e.almacenId=su.almacenId AND e.ubicacionId=su.ubicacionId;

/* Verificación final: debe regresar cero filas. */
SELECT *
FROM stock_por_almacen
WHERE reservado<0 OR comprometido<>0 OR bloqueado<0
   OR reservado+bloqueado>cantidad+0.0001;

-- Cambiar COMMIT por ROLLBACK en la primera ejecución para revisar resultados.
COMMIT TRANSACTION;
