# Renombrar `claude/` a `aplicacion/`

**Preparado el 15-oct-2026. No ejecutado: hace falta que no haya nada corriendo.**

## Por qué no se hizo solo

La carpeta `syncroERP/claude/` tiene **1,338 archivos versionados** — el backend y
el frontend enteros del ERP. Windows se niega a renombrar una carpeta que tenga
procesos con su directorio de trabajo dentro, y el backend y el frontend se
levantan justamente desde ahí. Intentarlo con todo encendido falla a medias, que
es la peor de las tres salidas posibles.

Así que queda escrito, entero, para correrlo de una vez cuando no haya nada
levantado.

## Antes

Cierra **todo** lo que corra desde esa carpeta:

- el backend del ERP (`claude/backend`, puerto 4000)
- el frontend del ERP (`claude/frontend`, puerto 3000)
- cualquier terminal cuyo `cd` esté dentro
- el editor, si lo tiene abierto como carpeta de trabajo

Comprueba que no queda nada:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, Path
```

## El movimiento

```powershell
cd D:\SUMA\erpfineract\syncroERP
git mv claude aplicacion
```

`git mv` conserva el historial: git detecta el renombre y `git log --follow`
sigue funcionando sobre cada archivo.

## Lo que hay que corregir después

Son quince sitios, y dos de ellos no son comentarios sino código que **asevera**
sobre el nombre de la carpeta:

### Código que se rompe si no se toca

| Archivo | Qué dice |
|---|---|
| `aplicacion/backend/src/common/coherencia.spec.ts:53` | `const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']` |
| `aplicacion/backend/src/common/el-arbol-que-miraban-las-pruebas.spec.ts:53` | `const CANDIDATOS = ['claude/frontend', 'frontend', '../claude/frontend']` |

Las dos buscan el árbol de frontend que de verdad corre. Hay que cambiar
`claude/frontend` por `aplicacion/frontend` en las dos listas.

### Lanzadores

| Archivo | Línea |
|---|---|
| `syncroERP/iniciar-syncroerp.bat` | `set RAIZ=D:\SUMA\erpfineract\syncroERP\claude` |
| `aplicacion/INICIAR_TODO.bat` | comentario de la línea 16 |
| `fineract/INICIAR_FINERACT_LOCAL.bat` | `set "ERP_ROOT=%WORKSPACE%\syncroERP\claude"` |

El de Fineract está en **otro repositorio**: es un commit aparte.

### Documentación

`syncroERP/docs/`: `README.md` (4 menciones), `01-instalacion-y-puesta-en-marcha.md`
(4), `02-arquitectura.md` (2), `08-fineract-portal.md` (1).

### Comentarios de pruebas

Cinco `.spec.ts` explican la ruta relativa diciendo «… → backend → claude». Sólo
texto, pero si no se cambian quedan explicando una carpeta que ya no existe, que
es cómo empiezan los comentarios que mienten.

Un reemplazo mecánico los cubre todos:

```powershell
cd D:\SUMA\erpfineract\syncroERP
Get-ChildItem -Recurse -Include *.ts,*.md,*.bat |
  Where-Object { $_.FullName -notmatch 'node_modules|\.next|dist' } |
  ForEach-Object {
    $t = Get-Content $_.FullName -Raw
    if ($t -match 'claude') {
      ($t -replace 'claude/', 'aplicacion/' -replace 'claude\\', 'aplicacion\' -replace '\bclaude\b', 'aplicacion') |
        Set-Content $_.FullName -NoNewline
    }
  }
```

Revísalo con `git diff` antes de aceptarlo: un reemplazo ciego sobre un árbol
grande siempre toca algo que no debía.

## Después

```powershell
cd D:\SUMA\erpfineract\syncroERP\aplicacion\backend
npx jest
```

Las dos pruebas de la tabla de arriba son las que avisan si el renombre quedó a
medias: están ahí precisamente para eso.

Y vuelve a levantar con `iniciar-syncroerp.bat`, ya corregido.

## Si algo sale mal

Mientras no se haya hecho commit:

```powershell
git mv aplicacion claude
git checkout -- .
```

## Lo que NO cambia

- Los `.env.local` viajan dentro de la carpeta: no hay que volver a escribirlos.
- `PORTAL_INSTITUCIONES_FILE` apunta a `suma-consola`, no a esta carpeta.
- El repositorio de Fineract sólo tiene la línea de su `.bat`.
