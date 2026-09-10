# SyncroERP — Integración RH y nómina guiada

## Cambios del backend

- Nuevo `GET /api/rrhh/preparacion` con el semáforo operativo de puestos,
  empleados, conceptos, tarifas fiscales, incidencias y periodos abiertos.
- El alta de un empleado ahora crea, en una sola transacción, el empleado, su
  contrato inicial y el movimiento laboral de alta.
- Los cambios de puesto, departamento, contrato o salario generan un nuevo
  contrato vigente y conservan el movimiento con valores anteriores y nuevos.
- Se validan los rangos salariales del puesto también durante la actualización.
- Las pruebas fiscales y de CLABE quedan en verde.

## Verificación realizada

```bash
npm run build
npm test -- --runInBand --runTestsByPath src/rrhh/data/tarifas-fiscales.spec.ts src/rrhh/utils/clabe.util.spec.ts
```

El proyecto continúa usando entidades TypeORM con `synchronize: true` y sin
migraciones, conforme a la configuración solicitada para la base vacía.
