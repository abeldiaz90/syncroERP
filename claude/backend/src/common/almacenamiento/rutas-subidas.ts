import { join } from 'path';

/**
 * ============================================================================
 * Dónde viven los archivos que suben los usuarios
 * ----------------------------------------------------------------------------
 * Existe porque el que escribía y el que servía apuntaban a carpetas distintas,
 * y nadie lo notaba: la subida respondía 200, el archivo quedaba en disco, el
 * registro se guardaba, y la imagen salía en blanco para siempre.
 *
 * El que escribe usaba `process.cwd()/uploads`, que es la carpeta del backend.
 * El que sirve usaba `join(__dirname, '..', 'uploads')`, y ahí estaba el error:
 * `__dirname` en ejecución no es `dist/`, es `dist/src/` —el compilador
 * conserva la carpeta `src` porque el proyecto también compila `scripts/`—, así
 * que subir un nivel daba `dist/uploads`, una carpeta que no existe. Cada
 * imagen de producto respondía 404 desde que el árbol de compilación tomó esa
 * forma, y en la pantalla sólo se veía un recuadro vacío.
 *
 * Por eso la ruta se declara UNA vez y los dos lados la importan. Dos
 * expresiones independientes para la misma carpeta son dos oportunidades de que
 * se separen, y cuando se separan no falla nada: sólo deja de verse.
 * ============================================================================
 */
export const RAIZ_SUBIDAS = join(process.cwd(), 'uploads');

/** Prefijo público bajo el que se sirven. Queda FUERA del prefijo `/api`. */
export const PREFIJO_SUBIDAS = '/uploads/';

export const SUBIDAS_PRODUCTOS = join(RAIZ_SUBIDAS, 'productos');
export const SUBIDAS_IMPORTACIONES = join(RAIZ_SUBIDAS, 'importaciones');
