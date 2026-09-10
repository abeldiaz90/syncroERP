# El core no separa empresas por inquilino, sino por realm emisor

Encontrado el 2026-09-10 intentando vaciar los inquilinos antes de la corrida
end-to-end. Vale la pena escribirlo entero porque invalida una pieza que ya
estaba construida y en uso.

---

## Qué se creía

Que la separación entre empresas en Fineract se conseguía mandando el
inquilino en la cabecera `Fineract-Platform-TenantId`, y que por eso bastaba
con guardar en el ERP qué inquilino le tocó a cada empresa
(`integracion_tenants_reserva`) y pasarlo en cada llamada.

Sobre esa idea se construyó la **reserva de inquilinos**: un lote de tenants
preparados de antemano para que dar de alta una empresa nueva no obligara a
reiniciar el core.

## Qué pasa en realidad

    FINERACT_SECURITY_OIDC_TENANT_ID = 'default'      (INICIAR_FINERACT_LOCAL.bat)
    FINERACT_SECURITY_BASICAUTH_ENABLED = 'false'

Y del propio `ALTA_INSTITUCION.md` de este repositorio:

> el core decide a cuál pertenece cada petición leyendo el emisor (`iss`) del
> token contra la tabla `m_tenant_oidc_config` de la base maestra

**El inquilino se deduce del realm que emitió el token, no de la cabecera.**
El ERP se autentica siempre con `syncro-erp-service` del realm `suma`, ese
emisor resuelve a `default`, y ahí aterriza todo — venga la petición de la
empresa que venga.

## Cómo se comprobó

Sin deducirlo: midiéndolo.

| Inquilino pedido | Existe en el core | Clientes que devolvió la API |
|---|---|---|
| `t001`, `t002`, `t003` | **no** | 8 |
| `tzzz` (inventado) | **no** | 8 |
| `sofom_bajio` | sí, y su base tiene **0** clientes | 8 |
| `default` | sí, y su base tiene **8** clientes | 8 |

El caso decisivo es `sofom_bajio`: su base está vacía y la API contestó 8. La
cabecera no cambia nada. Un inquilino inexistente tampoco produce error: cae en
`default` en silencio, que es la peor forma de fallar.

Registro real de inquilinos (`fineract_tenants.tenants`):

    1 | default      | Default Demo Tenant
    2 | sofom_bajio  | Financiera del Bajio SA de CV SOFOM ENR

## Consecuencias

1. **La reserva de inquilinos miente.** Acepta cualquier identificador —yo
   registré `t001`, `t002` y `t003`, que no existen— y los presenta en la
   consola como si aislaran. Un alta hecha así se ve correcta y comparte
   cartera con las demás.
2. **Dos empresas con core compartirían datos en Fineract.** El aislamiento del
   lado del ERP (una persona, una empresa; `empresaId` en cada consulta) es
   real y está probado. Del lado del core, hoy, no existe.
3. **El alta sin reiniciar sigue sin resolverse** para el caso ERP + core. El
   paso 2 de `ALTA_INSTITUCION.md` dice que hay que reiniciar el backend para
   que se construya el esquema del tenant nuevo.

## Qué haría falta

No es un parche; es el aprovisionamiento entero:

- Un **realm de Keycloak por empresa cliente**, no uno compartido.
- Un **tenant de Fineract por empresa**, creado en una ventana de
  mantenimiento —ahí sí sirve la idea de la reserva, pero con tenants que
  existen de verdad.
- El **registro del emisor** (`m_tenant_oidc_config`) uniendo los dos.
- Un adaptador de Fineract que **pida el token del realm que le toca a cada
  empresa**, en lugar del cliente de servicio único de hoy. Ésta es la parte
  con más trabajo: hoy hay un solo `syncro-erp-service`.
- La consola debe **verificar contra el core** que el tenant existe antes de
  anotarlo. Advertir al que teclea, como hace hoy, no sirve: no comprueba nada.

## Mientras tanto

Es seguro operar **una sola empresa con core** sobre `default`. Es lo que se
hizo para la corrida end-to-end: `DGA SA DE CV`. No se debe dar de alta una
segunda empresa con core hasta que lo de arriba esté hecho.
