import path from "node:path";
import type { NextConfig } from "next";

/**
 * ============================================================================
 * SyncroERP · configuración de Next
 * ----------------------------------------------------------------------------
 * LA RAÍZ DEL PROYECTO SE DECLARA, NO SE ADIVINA
 *
 * Al arrancar, Next avisaba:
 *
 *     Warning: Next.js inferred your workspace root, but it may not be correct.
 *     We detected multiple lockfiles and selected the directory of
 *     D:\SUMA\package-lock.json as the root directory.
 *
 * Hay un `package-lock.json` suelto tres carpetas más arriba —fuera del
 * repositorio, en `D:\SUMA`— y Turbopack lo tomó como raíz del espacio de
 * trabajo. Desde ahí resuelve el seguimiento de archivos y el grafo de
 * módulos, así que el servidor de desarrollo estaba vigilando un árbol que
 * incluye otros veinte proyectos y no empieza donde empieza éste.
 *
 * El aviso es de los que se leen una vez y se ignoran para siempre, porque
 * nada falla: compila, sirve, recarga. Lo que hace es apoyar el comportamiento
 * del entorno en un archivo que no es de este proyecto y que nadie recuerda
 * haber puesto. El día que ese archivo cambie o desaparezca, el
 * comportamiento cambia con él y el aviso ya no estará para explicarlo.
 *
 * Declararlo cuesta una línea y no depende de borrar nada ajeno: el
 * `package-lock.json` de `D:\SUMA` puede seguir donde está.
 * ============================================================================
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
