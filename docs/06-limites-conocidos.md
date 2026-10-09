# 06 · Límites conocidos

**Revisión:** 9 de octubre de 2026

> Esta es la parte del conjunto que más vale. Una lista de verdes no dice nada si
> no va acompañada de lo que **no** se ha mirado y por qué. Aquí está todo en un
> solo sitio, para que nadie tenga que deducirlo del silencio de los otros
> documentos.

---

## 1. Los dos grandes pendientes

### 1.1 Timbrado CFDI

**No hay PAC real conectado.** El ciclo llega hasta *preparar* los comprobantes;
el timbrado es lo único que nadie ha visto funcionar de punta a punta, ni en
facturación ni en nómina.

Además, falta cargar la **ClaveProdServ** y la **ClaveUnidad** del SAT a los
productos. Son datos fiscales de negocio y los define el cliente. Sin ellos no se
puede facturar nada, y es lo único que separa al centro de configuración del
100 %.

### 1.2 Realm por empresa

Escrito, probado por unidad y **dormido**. Falta una credencial manual —una vez
por instalación, no una por cliente— y no se ha ejercitado contra un Keycloak
vivo: la plantilla se valida como JSON en las pruebas, y la comprobación
posterior existe justamente porque un import puede aceptarse a medias.

Detalle completo en `05-aprovisionamiento-y-consola-suma.md` §5.

**Decisión pendiente asociada:** un ERP instalado por cliente, o un ERP compartido
que necesite una pantalla de resolución de realm. El dato para lo segundo ya
existe (`dominiosPermitidos`); la decisión no está tomada.

---

## 2. Lo que no se pudo probar, y por qué

| Qué | Por qué no |
|---|---|
| **Las 85 pantallas del portal de Fineract con sesión** | El acceso es OIDC. Su capa de permisos sí está verificada entera —449 funciones de ruta, 437 con guarda, 12 excepciones declaradas una por una— y sus pruebas pasan. El recorrido sin sesión sí se hizo: el portal responde, y su página de «no existe» se comporta bien en vez de parecer una avería. |
| **El cierre de septiembre** | Ya se puede hacer: el mes terminó. Agosto se cerró y fue el primer cierre en la historia del sistema; septiembre sigue abierto y es el siguiente a ejercitar. |
| **El menú lateral completo con el plan apagado** | Apagarlo de verdad exige `PATCH /integracion/configuracion`, que es del administrador, y el menú resuelve el plan al cargar la página. **Sí quedó verificado en vivo** el centro de trabajo con el plan apagado: deja fuera «Flujo de verificación» y «Avisos del core» y conserva el resto. Falta la foto del menú entero; la puede dar SUMA cambiando el plan de una empresa de prueba. |
| **El alta ERP + core en vivo con una empresa nueva** | A propósito: el core sólo conoce un inquilino, `default`, y su dueño natural es la empresa principal. Gastarlo en una empresa de prueba habría sido definitivo. El camino quedó fijado por prueba y el paso final —entregar el inquilino— se ejecutó en vivo sobre la empresa correcta. |
| **`CONCILIACION_CARTERA` con diferencias reales** | Esta instalación tiene cero diferencias abiertas; habría que inventar una para verla en amarillo. |
| **La carrera del doble clic en «recibir mercancía»** | Es lo que cierra el índice único nuevo. Reproducirla exige dos peticiones simultáneas de verdad. |
| **Reenviar invitación y sembrar catálogo desde la consola** | No hay ninguna empresa en ese estado. |
| **El SMTP del realm** | Rechaza credenciales; las invitaciones fallan hasta arreglarlo. La identidad queda creada igual. |
| **El arqueo de caja por pantalla con el rol de tesorería, y las pólizas con el de contabilidad** | Lo que falta medir ahí es **qué ofrece la pantalla** a ese rol, y eso un guion no lo mide: hay que verlo. La vía existe —«ver el ERP como otro», §4 de `03-manual-por-rol.md`— y no se ha recorrido entera. |

---

## 3. Circuitos del ERP que todavía no se han ejercitado

Ordenados por lo que más se usa el día uno:

1. **Devoluciones de venta.** El corte de caja ya está documentado y recorrido
   (ver `07-flujos-y-procesos.md` §6); la devolución no.
2. **Conteos físicos de inventario y ajustes (WMS).** Existe la pantalla; no se ha
   contado nunca, así que no se sabe qué hace un ajuste con la valuación ni con la
   contabilidad.
3. **Depreciación de activos fijos.**
4. **RRHH: incidencias y vacaciones.** La nómina corrió; el resto del módulo no.
5. **CRM de punta a punta:** prospecto → oportunidad → venta ganada.
6. **Compras: cotizaciones y adjudicación** con dos proveedores compitiendo. La
   segregación está verificada; la comparación de ofertas no.

---

## 4. Funciones que faltan

| Qué | Nota |
|---|---|
| **Reversa de pagos a proveedor** | El ERP no la tiene, y por eso el movimiento de tesorería de un pago no se puede cancelar (ver `03-manual-por-rol.md`). `CobranzaService.cancelarPago` es la plantilla natural, pero toca tesorería, turno de caja, póliza e IVA reclasificado. |
| **Umbrales por monto en compras** | Implementados, sin configurar. Hoy toda requisición sube al mando. Los números los pone el cliente. |
| **Un hallazgo que dice *cuáles*, no *cuántas*** | El hallazgo de «cuentas con saldo contrario» dice cuántas y manda a revisar la balanza. Con cuatro entre cientos, es hacerle al contador el trabajo que el sistema ya hizo. |
| **Reubicar lo que ya quedó sin ubicar** | Desde el 8 de octubre, toda entrada cae en una posición —el andén de recepción— y el descuadre no se puede volver a producir. Lo que existía antes sigue existiendo: en SUMA Local queda **una pieza sin ubicar en FER-CAS-SEG, Almacén Central** (99 en el almacén, 98 en las posiciones). Corregirlo es decidir dónde va esa pieza, y eso lo sabe el almacén, no el sistema. |

---

## 5. Decisiones abiertas

| # | Qué hay que decidir |
|---|---|
| A | **Cuentas con saldo contrario.** Hay cuentas de prueba sobregiradas. Decidir cuáles van a existir de verdad. |
| B | **Quién firma la REQUISICION de Compras.** Hoy la matriz apunta a contabilidad, y autorizar la necesidad de compra es la función equivocada; pero quién firme es del organigrama del cliente. |
| C | **`capacidadesValidacion: []`.** Con la lista vacía se esconde «Flujo de verificación» entera, pero tres de sus siete pasos no consultan a nadie. ¿Se esconde, o se deja con los pasos internos? |
| D | **~35 pares rol/pantalla** donde la pantalla abre y una lectura suya da 403. Triaje pendiente. Tres de ellos ya se cerraron —las consultas de política de crédito, saldo a favor y lista de precios del mostrador— y el patrón que los delató quedó como prueba, así que el resto se puede recorrer con ella. |
| E | **`AUTH_MODE=local`.** Si Keycloak es obligatorio, debería retirarse por completo: la rama HS256 de la estrategia JWT, el flujo de invitación local y su validación de entorno. Mientras exista, es una segunda puerta que nadie mantiene. |
| F | **Los registros de auditoría anteriores al 25-sep-2026** quedaron sin encadenar. Ver `01-instalacion-y-puesta-en-marcha.md` §7. |
| G | **La duración de la sesión en Keycloak.** El token de acceso vive sesenta minutos, y la renovación automática ya funciona y está probada. Falta decidir *SSO Session Idle* y *SSO Session Max* del realm `suma`: son los que deciden cuándo se acaba la sesión aunque la persona siga trabajando. |
| H | **El realm `suma` en español.** La pantalla de Keycloak sale en inglés y el botón dice «Iniciar sesion con Microsoft», sin acento. Es lo primero que ve cualquiera. |

---

## 6. Antes de producción

Dos cosas que no son decisiones sino comprobaciones, y que conviene hacer el
mismo día del despliegue:

- **`NODE_ENV=production`.** De eso depende, entre otras cosas, que «ver el ERP
  como otro» quede apagado: tiene tres candados —entorno distinto de producción,
  `SUPLANTACION_HABILITADA=true` puesto a mano, y rol de administrador— y el
  primero basta para cerrarlo. No hay que apagar nada: hay que comprobar que el
  entorno dice lo que debe.
- **El navegador del PDF.** La documentación se descarga en PDF desde el propio
  ERP, y para eso el servidor necesita un navegador. Ya no hay que adivinar si lo
  encuentra: `npm run documentacion:pdf` lo dice —qué navegador eligió y si los
  siete documentos salieron— y termina en rojo si alguno no sale. Si falta,
  `npx puppeteer browsers install chrome` o la ruta de uno instalado en
  `DOCUMENTACION_NAVEGADOR`.

Lo demás de la puesta en marcha está en
`LISTA-ANTES-DE-PRODUCCION-configuracion`.

---

## 7. Deuda estructural

- **Las carpetas `syncro-erp-backend` y `syncro-erp-frontend`** están congeladas
  desde el 10 de septiembre y no ejecutan nada. Conviene retirarlas: ya costaron
  horas de trabajo sobre el árbol equivocado.
- **El repositorio `suma-consola` tiene el árbol de trabajo en CRLF y el contenido
  commiteado en LF, en todos los archivos.** Cada archivo que se toque arrastra su
  diff entero. Pide un `.gitattributes`.
- **La prueba del PDF acepta sus dos finales.** Bajo jest siempre toma el de
  error, porque puppeteer es sólo ESM y el transformador de jest no lo carga; en
  node corriente sí funciona. Mientras esa prueba siga pasando por la rama de la
  disculpa, quien comprueba el PDF de verdad es `npm run documentacion:pdf`, no
  `npm test`. Es el mismo patrón que la resolución del navegador, que durante
  meses tuvo una rama que no se tomaba nunca sin que nadie lo notara.
