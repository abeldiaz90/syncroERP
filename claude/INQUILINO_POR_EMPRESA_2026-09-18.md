

---

## El inquilino del core, por empresa (18 de septiembre)

Decisión tomada: **un inquilino de Fineract por empresa**, y la reserva es el
mecanismo correcto. La razón que cierra la discusión no es el aislamiento de
datos —que también— sino la **contabilidad**: en Fineract el catálogo de cuentas
y el mayor son del inquilino, no de la oficina. Con un inquilino compartido los
asientos de todos los clientes caen en un solo mayor, y son personas morales
distintas con sus propios libros. No es un defecto que se corrija después: los
créditos con historia contable no se borran ni se mueven, así que el día que
haya que separar a un cliente no se va a poder.

Lo segundo: la separación por oficina depende de que **cada llamada lleve bien
la oficina, siempre**. Ya se comprobó que no la llevaba (`?? 1`, la oficina raíz,
con todos los clientes de todas las empresas replicándose al mismo sitio). Una
barrera que vive en la disciplina del código se rompe; una que vive en la
estructura, no.

### Por qué no se resolvió pasando `empresaId` a cada método

La mitad de los métodos del puerto no lo recibe —`saldoCredito`,
`cuentasDisponibles`, `consultarAsiento`— y añadirlo a todos deja el riesgo
intacto: basta olvidarlo en uno para escribir en el inquilino equivocado, y eso
no da error, escribe en el lugar de otro cliente.

El contexto viaja **por fuera**, con `AsyncLocalStorage`. Se abre en la frontera
—un interceptor global para cada petición autenticada, y el despachador para
cada evento de la cola— y lo lee un solo sitio: el punto por donde salen todas
las llamadas HTTP al core. Un camino nuevo no puede olvidarlo, porque no tiene
que acordarse de nada.

### Cómo entra, sin romper lo que hoy opera

Interruptor `FINERACT_TENANT_POR_EMPRESA`, hoy en `false`:

- **Apagado** (lo de hoy): si la empresa tiene inquilino asignado, ya se usa el
  suyo; si no lo tiene, sigue el global. Nadie se detiene.
- **Encendido**: la empresa sin inquilino **no opera** contra el core; se detiene
  con un mensaje que dice qué falta. Y una llamada que no declara empresa
  también se detiene: eso es un defecto de programación —falta abrir el
  contexto— y tiene que doler en desarrollo, no en la base de un cliente.

También se corrigió el portal del core: devolvía el inquilino global al abrirlo,
así que la persona entraba y veía una cartera que no es la suya.

### Para encenderlo

1. Registrar en la reserva los inquilinos que el core ya tiene creados (la
   consola ya puede leer su registro: `FINERACT_TENANTS_DB_URL` está puesta).
2. Asignar inquilino a cada empresa que use el core — hoy `SUMA Local` está en
   modo SOMBRA **sin inquilino**.
3. Poner `FINERACT_TENANT_POR_EMPRESA=true` y reiniciar.

Mientras el paso 2 no esté hecho, encenderlo detiene la replicación de esa
empresa. Es el orden correcto: primero el inquilino, después el candado.

### Lo que queda de esta línea

- **Las migraciones del core se aplican por inquilino**, no una vez. Eso es
  trabajo operativo real y repetido, y es el precio de la decisión.
- El alta de una empresa nueva sigue necesitando **ventana de mantenimiento**
  del core para construir el esquema del inquilino; por eso la reserva se
  prepara por lote y el alta toma uno ya listo.
- Falta que la consola **muestre** qué inquilino tiene cada empresa y avise de
  las que operan sin uno. Hoy hay que mirarlo en la base.
