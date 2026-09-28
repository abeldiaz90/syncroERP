# 01 · Instalación y puesta en marcha

**Revisión:** 28 de septiembre de 2026
**Para:** quien despliega o levanta el sistema en una máquina nueva.

---

## 1. Las piezas

| Pieza | Puerto | Qué es | ¿Obligatoria? |
|---|---|---|---|
| **PostgreSQL ERP** | 55432 | Base de datos del ERP. | Sí |
| **Syncro ERP · backend** | 4000 | NestJS + TypeORM. Prefijo `/api`. | Sí |
| **Syncro ERP · frontend** | 3000 | Next.js (App Router). | Sí |
| **Keycloak** | — | `key-access.sumamexico.com`, realm `suma`. | Sí |
| **Consola SUMA** | 3010 | Donde SUMA da de alta a sus clientes. | Sólo SUMA |
| **Apache Fineract** | 8443 | Core financiero. | Sólo en modos con core |
| **Portal Fineract** | 3002 | Frontend del core (BFF + 80 pantallas). | Sólo en modos con core |
| **PostgreSQL Fineract** | 5432 | Base del core. | Sólo en modos con core |

**Requisitos:** Node 20 o superior (el desarrollo corre sobre Node 22),
PostgreSQL 14 o superior, y salida HTTPS hacia el Keycloak.

> El código que corre vive en `syncroERP/claude/backend` y
> `syncroERP/claude/frontend`. Las carpetas `syncro-erp-backend` y
> `syncro-erp-frontend` están **congeladas** y no ejecutan nada.

---

## 2. Variables de entorno del backend

Van en `claude/backend/.env.local`. **El arranque valida el entorno antes de
levantar nada** (`src/config/validar-entorno.ts`): si falta algo obligatorio o
está mal escrito, el proceso se detiene con el motivo en castellano en vez de
arrancar y fallar en la primera consulta.

### 2.1 Obligatorias siempre

| Variable | Qué es |
|---|---|
| `DB_HOST` | Servidor de PostgreSQL. |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Credenciales y base. |
| `JWT_SECRET` | **Mínimo 32 caracteres.** Genéralo, no lo inventes: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Al cambiarlo se cierran todas las sesiones abiertas. |

### 2.2 Con valor por omisión

| Variable | Omisión | Nota |
|---|---|---|
| `NODE_ENV` | `development` | `development` · `production` · `test`. |
| `PORT` | `4000` | |
| `DB_PORT` | `5432` | En esta instalación, **`55432`**. |
| `DB_POOL_MAX` | `20` | |
| `DB_SSL` / `DB_SSL_REJECT_UNAUTHORIZED` | `false` / `true` | |
| `DB_SYNC` | `true` | **Ponlo en `false` fuera de desarrollo.** TypeORM puede borrar columnas al detectar diferencias. |
| `DB_MIGRATIONS_RUN` | `false` | Recomendado: dejarlo en `false` y correr las migraciones a mano en el despliegue. |
| `JWT_EXPIRATION` | `8h` | |
| `AUTH_MODE` | `keycloak` | Ver §2.6. |
| `KEYCLOAK_ISSUER_URL` | `https://key-access.sumamexico.com/realms/suma` | |
| `KEYCLOAK_CLIENT_ID` | `syncro-erp` | |
| `FRONTEND_URL` | `http://localhost:3000` | En producción **no puede ser local**: el arranque se detiene. Los correos de alta saldrían con enlaces que sólo funcionan dentro del servidor. |
| `CORS_ORIGINS` | `http://localhost:3000` | Lista separada por comas. En producción **no puede ser local**: el navegador rechazaría toda llamada del frontend real con un error de red que no menciona esta configuración. |
| `SWAGGER_HABILITADO` | `false` | |
| `CURP_RPA_HABILITADO` | `false` | Sólo se habilita tras confirmar autorización legal e institucional. |

### 2.3 Obligatorias en producción

| Variable | Por qué |
|---|---|
| `CFDI_ENCRYPTION_KEY` | Protege las credenciales del PAC. 32 bytes en Base64 o 64 caracteres hex. |
| `NOMINA_DATA_ENCRYPTION_KEY` | Cifra la CLABE de cada empleado. Misma forma. **Sin ella la nómina arranca, se contrata gente, se calcula y se firma entera, y el fallo aparece el día que Tesorería captura la primera cuenta bancaria.** Ocurrió exactamente así; por eso el arranque en producción se detiene y en desarrollo avisa. |

Y `JWT_SECRET` no puede empezar por `secret`, `changeme`, `test`, `123`,
`syncro` ni `password`: un secreto de ejemplo en producción es tan malo como no
tener ninguno.

### 2.4 Correo

`MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`. Todas
opcionales; sin ellas sólo se pierden las invitaciones. `MAIL_FROM` acepta
`correo@dominio.com` y también `Nombre Visible <correo@dominio.com>`.

### 2.5 Aprovisionamiento

| Variable | Qué es |
|---|---|
| `APROVISIONAMIENTO_TOKEN` | Clave de servicio que la consola SUMA manda en la cabecera `x-aprovisionamiento`. **Mínimo 32 caracteres**: con menos, o sin ella, las diez rutas de alta responden **404** —parecen no existir—. La comparación es en tiempo constante. |
| `SECRETOS_LLAVE` | Cifra los secretos de realm que el ERP guarda por empresa. |
| `DIRECTORIO_CLIENT_ID`, `DIRECTORIO_CLIENT_SECRET` | Cliente de servicio del ERP en Keycloak, para crear identidades de empleados. |
| `DIRECTORIO_DOMINIOS_PERMITIDOS` | Dominios de correo aceptados. |

### 2.6 Los dos ejes de contratación

| Variable | Valores | Omisión |
|---|---|---|
| `CARTERA_MODO` | `APAGADO` · `SOMBRA` · `AUTORIDAD` | `APAGADO` |
| `CONTABILIDAD_EXTERNA_MODO` | `APAGADO` · `ESPEJO` | `APAGADO` |
| `CREDITO_TOPE_AUTOMATICO` | importe | — |

**Estos valores son un techo global, nunca un valor por omisión de las
empresas.** Una empresa puede quedarse por debajo; ninguna puede pasar por
encima. `FINERACT_MODO` existe como alias heredado de `CARTERA_MODO` para no
romper archivos `.env` viejos.

No hay un modo en el que el externo decida el asiento: el motor contable del ERP
es siempre quien calcula el cargo y el abono —es el único que conoce el IVA, el
catálogo SAT y el CFDI—; el externo recibe el espejo.

### 2.7 Apache Fineract

Sin `FINERACT_URL` el adaptador queda **inerte** y el ERP se comporta como si no
existiera. Es deliberado: la contabilidad y la cartera no pueden depender de que
un servicio externo esté configurado para que el sistema arranque.

| Variable | Omisión |
|---|---|
| `FINERACT_URL` | — |
| `FINERACT_TENANT` | `default` |
| `FINERACT_TENANT_POR_EMPRESA` | — |
| `FINERACT_TENANTS_DB_URL` | — (la base de inquilinos del core, para el inventario de reservas) |
| `FINERACT_WEB_APP_URL` | — |
| `FINERACT_CA_CERT` | — (se añade al almacén de confianza; **nunca** se desactiva la verificación TLS) |
| `FINERACT_OFICINA_ID` | `1` |
| `FINERACT_MONEDA` | `MXN` |
| `FINERACT_KEYCLOAK_ISSUER_URL`, `FINERACT_CLIENT_ID`, `FINERACT_CLIENT_SECRET` | cliente de servicio en el mismo Keycloak |
| `FINERACT_BASIC_USER`, `FINERACT_BASIC_PASSWORD` | respaldo, **sólo desarrollo local** |
| `FINERACT_TIMEOUT_POS_MS` | `1200` — lo máximo que el punto de venta espera por una consulta de crédito |
| `FINERACT_TIMEOUT_FONDO_MS` | `15000` |
| `FINERACT_OUTBOX_MAX_INTENTOS` | `8` |
| `FINERACT_WEBHOOK_TOKEN`, `FINERACT_BUCKET_MORA` | avisos y cubeta de mora |

### 2.8 Cierre mensual

| Variable | Omisión |
|---|---|
| `CIERRE_RESPALDO_COMANDO` | — (`{{archivo}}` es el destino) |
| `CIERRE_RESPALDO_DIR` | `respaldos/` |
| `CIERRE_RESPALDO_TIMEOUT_S` | `300` |
| `CIERRE_EXIGIR_CONCILIACION_BANCARIA` | ver §7 de `02-arquitectura.md` |

### 2.9 La ayuda dentro del ERP

Estos documentos se leen desde el propio ERP, en **Ayuda y documentación**, y se
descargan en PDF. El backend los lee de esta misma carpeta `docs/` en cada
petición: **no hay copia dentro del backend a propósito**, porque dos copias del
mismo texto divergen y la pantalla acabaría enseñando la versión vieja.

| Variable | Para qué |
|---|---|
| `DOCUMENTACION_DIR` | Dónde está esta carpeta. Sin ella se busca en las rutas habituales relativas al backend, que es lo que funciona en un despliegue normal. Si no la encuentra, **la pantalla dice en qué rutas buscó** en vez de salir vacía. |
| `DOCUMENTACION_NAVEGADOR` | Ruta de un Chrome o Edge ya instalado, para componer el PDF. Sin ella se usa el Chromium que `puppeteer` descarga al instalar, y si tampoco está, se prueban las rutas habituales de Chrome y Edge. |

Si no hay ningún navegador, el PDF no se genera y la pantalla lo dice **y ofrece
imprimir desde el navegador**, que produce el mismo documento y siempre existe.
Para que el servidor lo genere solo: `npx puppeteer browsers install chrome`.

**Quién ve qué.** Los dos manuales de usuario —*Manual por rol* y *Compras y
nómina*— los lee cualquier sesión válida. Los cuatro documentos técnicos —éste,
*Arquitectura*, *Aprovisionamiento* y *Límites conocidos*— **sólo los ve el
administrador**: nombran variables de entorno, claves de servicio y lo que
todavía no está probado, y eso no es material para la empresa cliente. El índice
se recorta en el servidor, así que nadie ve listado un documento que al pulsarlo
le va a contestar que no.

### 2.10 Otras

`BUSINESS_TIMEZONE`, `TZ`, `CRONS_HABILITADOS`, `SCHEMA_CACHE_TTL_MS`,
`IMPORT_MAX_FILE_MB`, `IMPORT_STOCK_BATCH_SIZE`,
`DEVOLUCIONES_ROLES_AUTORIZADORES`, `NOMINA_BANK_ADAPTER_ENABLED`,
`NOMINA_PAC_ADAPTER_ENABLED`, `NOMINA_PAC_WEBHOOK_SECRET`,
`DB_REBUILD_CONFIRM` (confirmación destructiva, sólo `db:rebuild:dev`).

---

## 3. Variables de entorno del frontend

Van en `claude/frontend/.env.local`. **Escríbelo siempre**: sin él, el frontend
acierta por coincidencia mientras backend y navegador estén en la misma máquina,
y deja de acertar en cuanto no lo estén.

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_KEYCLOAK_ISSUER_URL=https://key-access.sumamexico.com/realms/suma
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=syncro-erp
NEXT_PUBLIC_KEYCLOAK_REDIRECT_URI=http://localhost:3000/auth/callback
NEXT_PUBLIC_KEYCLOAK_POST_LOGOUT_URI=http://localhost:3000
NEXT_PUBLIC_FINERACT_URL=          # sólo en modos con core
```

---

## 4. Orden de arranque

```
1. PostgreSQL
2. Migraciones            npm run db:migration:run
3. Backend                npm run start:prod      (o start:dev en desarrollo)
4. Frontend               npm run build && npm start
```

El orden importa en un solo punto: **las migraciones van antes que el backend**,
porque `DB_MIGRATIONS_RUN` se recomienda en `false`.

### Comandos de base de datos

| Comando | Qué hace |
|---|---|
| `npm run db:migration:show` | Qué migraciones hay y cuáles están aplicadas. |
| `npm run db:migration:run` | Aplica las pendientes. |
| `npm run db:migration:revert` | Deshace la última. |
| `npm run db:schema:verify` | Comprueba que el esquema real coincide con las entidades. |
| `npm run db:verify` | Verificación de la base. |

---

## 5. Al arrancar, el backend hace tres cosas por sí mismo

1. **Valida el entorno** (§2) y se detiene si algo falta.
2. **Repone el piso de permisos**: las acciones irrenunciables de cada rol se
   vuelven a encender, incluidas las acciones nuevas de un módulo ya concedido.
   **Sólo enciende, nunca apaga**, de modo que una ampliación hecha a mano
   sobrevive al reinicio.
3. **Apaga las filas de permiso que el `@Roles` del controlador vetaría.** Si no
   lo hiciera, quedarían botones que el frontend pinta y el servidor rechaza.

---

## 6. Verificar que quedó bien

| Comprobación | Cómo |
|---|---|
| El backend vive | `GET /api/salud` y `GET /api/salud/listo`. |
| El esquema coincide | `npm run db:schema:verify` |
| Las pruebas pasan | `npx jest` — 1 075 pruebas en 170 suites. |
| Los tipos compilan | `npx tsc --noEmit` |
| La configuración de la empresa está completa | En el ERP: **Configuración → Centro de configuración**. Da un porcentaje por módulo y nombra cada hallazgo con su severidad. |
| La contabilidad está sana | **Finanzas → Diagnóstico de integridad**. `BLOQUEADO` significa que hay un hallazgo crítico. |
| La bitácora encadena | **Configuración → Auditoría → Verificar integridad**. |

---

## 7. Antes de entregar a un cliente

- [ ] `DB_SYNC=false` y `NODE_ENV=production`.
- [ ] `JWT_SECRET`, `CFDI_ENCRYPTION_KEY`, `NOMINA_DATA_ENCRYPTION_KEY` y
      `APROVISIONAMIENTO_TOKEN` generados, no copiados del ejemplo.
- [ ] `FRONTEND_URL` y `CORS_ORIGINS` con el dominio real.
- [ ] `.env.local` del frontend escrito.
- [ ] **Apagar *Direct access grants*** en el cliente `syncro-erp` de Keycloak.
- [ ] **Borrar `frontend/public/_uat-*.json`** si existieran: son puentes de
      sesión de prueba y no pueden viajar a la entrega.
- [ ] `npm run build` del frontend.
- [ ] Decidir qué hacer con `registros_auditoria`: los registros anteriores al
      25-sep-2026 quedaron sin encadenar y **eso no se arregla hacia atrás**
      —reescribir una bitácora de auditoría para que cuadre es exactamente lo
      que una bitácora de auditoría no debe permitir—. Si se quiere entregar con
      la cadena limpia desde el primer registro, la opción honesta es **vaciar
      la tabla** mientras todo sigue siendo dato de prueba.
