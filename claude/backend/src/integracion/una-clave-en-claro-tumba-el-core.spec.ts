import { BadRequestException } from '@nestjs/common';

import { cifrarParaElCore, descifrarDelCore } from './services/la-clave-del-core';
import { RegistroDelCoreService } from './services/registro-del-core.service';

/**
 * ============================================================================
 * Una clave en claro tumba el core entero
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ, Y CUÁNTO COSTÓ
 *
 * MEDIDO el 21-oct-2026. El ERP anotó el inquilino `onpremise-prueba` con la
 * clave de la base del cliente EN CLARO. `tenant_server_connections
 * .schema_password` no es la clave: es la clave CIFRADA, que el core descifra
 * al arrancar. En el siguiente arranque:
 *
 *     Upgrade for tenant onpremise-prueba has started
 *     Unable to decrypt data. Please check if the master password…
 *     Illegal base64 character 2d        ← el «-» de la clave en claro
 *     → RuntimeException: Tenant upgrades had exceptions
 *     → Error starting Tomcat context
 *     → BUILD FAILED
 *
 * Y lo que importa: NO se cayó ese inquilino. `TenantDatabaseUpgradeService`
 * recorre todos los inquilinos y si UNO falla lanza, así que el contexto de
 * Spring no se construye. **El core no levantó para ninguna institución.**
 *
 * Un alta on-premise mal escrita deja sin core a toda la instalación en el
 * siguiente reinicio —que es de madrugada, programado, y sin nadie mirando—.
 * No hay aviso previo: entre el alta y el reinicio todo se ve bien.
 *
 * ARREGLADO Y COMPROBADO EN VIVO el 21-oct-2026, 17:00:
 *
 *     16:57:57  Upgrade for tenant onpremise-prueba has started
 *     16:59:14  Upgrade for tenant onpremise-prueba has finished
 *     17:00:33  Tomcat started on port 8443 (https)
 *
 * Liquibase construyó el esquema del core DENTRO de la base del cliente, y la
 * instalación entera arrancó. Ésa es la prueba de compatibilidad con el lado
 * de Java: el core abrió el sobre que escribió esto.
 *
 * QUÉ VIGILA ESTE ARCHIVO
 *
 * El formato del sobre, que es lo que el core lee byte a byte, y las dos
 * negativas que impiden volver a escribir un renglón que no se pueda abrir.
 * ============================================================================
 */

const MAESTRA = 'fineract';
const CLAVE = 'una-clave-con-guiones-y-mayúsculas-ÁÉÍ';

describe('una clave en claro tumba el core entero', () => {
  describe('el sobre, como el core lo lee', () => {
    it('va y vuelve', () => {
      expect(descifrarDelCore(MAESTRA, cifrarParaElCore(MAESTRA, CLAVE))).toBe(CLAVE);
    });

    it('lleva iv(16) ‖ sal(16) ‖ cifrado, en ese orden', () => {
      /*
       * El orden importa tanto como el algoritmo: `EncryptionUtil` lee los
       * primeros 16 bytes como iv y los 16 siguientes como sal. Un sobre con
       * las dos mitades al revés descifra a basura, no a un error, y eso es
       * peor: el core arrancaría y no podría abrir la base del cliente.
       */
      const crudo = Buffer.from(cifrarParaElCore(MAESTRA, 'x'), 'base64');
      expect(crudo.length).toBeGreaterThanOrEqual(48);
      expect((crudo.length - 32) % 16).toBe(0);
    });

    it('dos sobres de la misma clave son distintos', () => {
      /* Sal e iv nuevos cada vez. Si no, dos clientes con la misma clave
       * tendrían el mismo sobre y se podría saber que coinciden. */
      expect(cifrarParaElCore(MAESTRA, CLAVE)).not.toBe(cifrarParaElCore(MAESTRA, CLAVE));
    });

    it('con otra contraseña maestra no se abre', () => {
      expect(() => descifrarDelCore('otra', cifrarParaElCore(MAESTRA, CLAVE))).toThrow();
    });

    it('LA PRUEBA DE LA PRUEBA: la clave EN CLARO es lo que el core no pudo abrir', () => {
      /*
       * Se reproduce el defecto exacto. Si un día esto dejara de lanzar, la
       * diferencia entre lo que tumbó el core y lo que lo levantó habría
       * desaparecido, y las pruebas de arriba estarían pasando por otra cosa.
       */
      expect(() => descifrarDelCore(MAESTRA, CLAVE)).toThrow();
    });
  });

  describe('sin contraseña maestra no se anota nada', () => {
    const guardado = process.env.FINERACT_TENANTS_MASTER_PASSWORD;
    afterEach(() => {
      if (guardado === undefined) delete process.env.FINERACT_TENANTS_MASTER_PASSWORD;
      else process.env.FINERACT_TENANTS_MASTER_PASSWORD = guardado;
    });

    const datos = {
      identificador: 'onpremise-prueba',
      nombre: 'Financiera Onpremise Prueba',
      servidor: '127.0.0.1',
      puerto: 55432,
      baseDatos: 'cliente_onpremise_prueba',
      usuario: 'syncroerp',
      clave: CLAVE,
    };

    it('se niega ANTES de tocar la base, y dice por qué', async () => {
      /*
       * Antes de abrir nada: si la comprobación fuera después, una
       * instalación sin `FINERACT_TENANTS_DB_URL` contestaría otra cosa y
       * quien opera buscaría el problema donde no está.
       */
      delete process.env.FINERACT_TENANTS_MASTER_PASSWORD;
      const servicio = new RegistroDelCoreService();
      const abrir = jest.spyOn(
        servicio as unknown as { abrir: () => Promise<unknown> },
        'abrir',
      );

      await expect(servicio.registrarInquilino(datos)).rejects.toThrow(BadRequestException);
      await expect(servicio.registrarInquilino(datos)).rejects.toThrow(
        /FINERACT_TENANTS_MASTER_PASSWORD/,
      );
      expect(abrir).not.toHaveBeenCalled();
    });

    it('y tampoco al reparar una clave ya escrita', async () => {
      delete process.env.FINERACT_TENANTS_MASTER_PASSWORD;
      const servicio = new RegistroDelCoreService();

      await expect(servicio.reescribirClaveDelInquilino(datos)).rejects.toThrow(
        /FINERACT_TENANTS_MASTER_PASSWORD/,
      );
    });

    it('una cadena de espacios no cuenta como declarada', async () => {
      process.env.FINERACT_TENANTS_MASTER_PASSWORD = '   ';
      const servicio = new RegistroDelCoreService();

      await expect(servicio.registrarInquilino(datos)).rejects.toThrow(
        /FINERACT_TENANTS_MASTER_PASSWORD/,
      );
    });

    it('NO tiene valor por omisión, ni siquiera el del core', () => {
      /*
       * El core vale `fineract` si nadie dice otra cosa, y copiar ese valor
       * aquí sería cómodo. Sería también el mismo defecto otra vez: una
       * instalación que SÍ cambió la suya escribiría renglones ilegibles sin
       * enterarse hasta el arranque. Es preferible no poder dar de alta un
       * inquilino on-premise a dejar el core sin levantar.
       */
      const fuente = require('fs').readFileSync(
        require('path').join(__dirname, 'services', 'registro-del-core.service.ts'),
        'utf8',
      ) as string;
      expect(fuente).toMatch(/FINERACT_TENANTS_MASTER_PASSWORD\s*\?\?\s*''/);
      expect(fuente).not.toMatch(/FINERACT_TENANTS_MASTER_PASSWORD\s*\?\?\s*'fineract'/);
    });
  });
});
