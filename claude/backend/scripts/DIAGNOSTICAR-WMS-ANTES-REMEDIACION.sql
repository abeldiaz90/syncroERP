/* Ejecutar antes de la migración. Solo diagnóstico; no modifica datos. */
SELECT empresaId, productoId, almacenId, cantidad, reservado, comprometido, bloqueado,
       cantidad-reservado-comprometido-bloqueado AS disponibleCalculado
FROM stock_por_almacen
WHERE comprometido<>0 OR reservado<0 OR comprometido<0 OR bloqueado<0
   OR reservado+comprometido+bloqueado>cantidad;

SELECT r.*
FROM reservas_inventario r
WHERE r.estado IN ('ACTIVA','PARCIALMENTE_CONSUMIDA')
  AND (r.expiraEn IS NOT NULL AND r.expiraEn<SYSDATETIME());

SELECT s.empresaId,s.productoId,s.almacenId,s.reservado,
       ISNULL((SELECT SUM(r.cantidad-ISNULL(r.cantidadConsumida,0))
               FROM reservas_inventario r
               WHERE r.empresaId=s.empresaId AND r.productoId=s.productoId
                 AND r.almacenId=s.almacenId
                 AND r.estado IN ('ACTIVA','PARCIALMENTE_CONSUMIDA')),0) AS reservasGenericasActivas
FROM stock_por_almacen s
WHERE s.reservado<>0;
