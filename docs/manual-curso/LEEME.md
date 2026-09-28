# Manual de operación — fuentes

El PDF se arma concatenando los fragmentos HTML en orden y renderizando con Chromium.

## Regenerar

```sh
cat 00-estilo.html 01-portada.html 01b-indice.html 02-parte0.html \
    03-parte1a.html 03b-compras.html 04-parte1b.html 04b-tesoreria.html \
    05-parte1c.html 06-parte2.html 07-parte3.html 08-anexos.html > manual.html
echo '</body></html>' >> manual.html
python render.py
```

Requiere `playwright` con Chromium instalado.

## Qué contiene cada fragmento

| Archivo | Contenido |
|---|---|
| `00-estilo.html` | Hoja de estilo y apertura del documento. Toda la tipografía y la paleta están aquí. |
| `01-portada.html` | Portada y preliminar (cómo está construido el documento). |
| `01b-indice.html` | Índice. |
| `02-parte0.html` | Parte 0 — fundamentos, modalidades, identidad, interfaz, roles. |
| `03-parte1a.html` | Capítulos 1 a 3 — puesta a punto, catálogos, almacenes. |
| `03b-compras.html` | Capítulo 4 — compras, campo por campo. |
| `04-parte1b.html` | Capítulos 5 y 6 — ventas y crédito. |
| `04b-tesoreria.html` | Capítulos 7 y 8 — tesorería y contabilidad. |
| `05-parte1c.html` | Capítulos 9 a 15 — activos, nómina, hotelería, CRM, aprobaciones, reportes, administración. |
| `06-parte2.html` | Parte II — Apache Fineract. |
| `07-parte3.html` | Parte III — integración. |
| `08-anexos.html` | Anexos A a E. |

## Actualizar una pantalla

Reemplazar el `.jpg` correspondiente en `img/` conservando el nombre y volver a renderizar.

## Actualizar un campo o un estado

Los campos, validaciones y estados descritos proceden de los DTO y las entidades del
backend. Al cambiar uno, el fragmento correspondiente debe actualizarse a mano: el
documento no se genera a partir del código.
