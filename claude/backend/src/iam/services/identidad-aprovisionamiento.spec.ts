import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { IdentidadEmpresaService } from './identidad-empresa.service';
import { SecretosService } from '../../common/services/secretos.service';
import { EmpresaIdentidad } from '../entities/empresa-identidad.entity';

/**
 * ============================================================================
 * Registrar y encender la identidad de una empresa
 * ----------------------------------------------------------------------------
 * Este es el camino por el que la consola de SUMA anota el realm de un cliente
 * recién creado. Lo que se prueba aquí no es que guarde —eso se ve— sino las
 * condiciones que impiden que guardar sea peligroso:
 *
 *  · Nace apagada. Un realm a medio armar no debe autenticar a nadie.
 *  · Sin cifrado no se guarda el secreto. Un secreto en claro en la base es
 *    peor que un alta incompleta, porque el alta se nota y el secreto no.
 *  · Un emisor no se comparte entre empresas. Si se compartiera, los tokens de
 *    una valdrían para la otra.
 *  · Suspender no borra. Borrar devolvería a la empresa al realm compartido,
 *    que es una puerta abierta, no cerrada.
 * ============================================================================
 */

const LLAVE = 'llave-de-pruebas-suficientemente-larga';

const config = (valores: Record<string, string | undefined>) =>
  ({ get: (c: string) => valores[c] }) as unknown as ConfigService;

const ENTORNO = {
  KEYCLOAK_ISSUER_URL: 'https://key-access.sumamexico.com/realms/suma',
  KEYCLOAK_CLIENT_ID: 'syncro-erp',
};

/** Repositorio en memoria: lo justo para ejercitar las reglas. */
const repoMemoria = (filas: Partial<EmpresaIdentidad>[] = []) => {
  const datos = [...filas];
  return {
    datos,
    repo: {
      create: (x: Partial<EmpresaIdentidad>) => ({ ...x }),
      findOne: async ({ where }: any) =>
        datos.find((f) =>
          where.empresaId
            ? f.empresaId === where.empresaId
            : f.emisor === where.emisor,
        ) ?? null,
      find: async ({ where }: any) =>
        datos.filter((f) => !where?.estado || f.estado === where.estado),
      save: async (f: any) => {
        const i = datos.findIndex((x) => x.empresaId === f.empresaId);
        if (i >= 0) datos[i] = f;
        else datos.push(f);
        return f;
      },
    } as unknown as Repository<EmpresaIdentidad>,
  };
};

const armar = (filas: Partial<EmpresaIdentidad>[] = [], conLlave = true) => {
  const m = repoMemoria(filas);
  const secretos = new SecretosService(
    config(conLlave ? { SECRETOS_LLAVE: LLAVE } : {}),
  );
  return {
    ...m,
    servicio: new IdentidadEmpresaService(m.repo, config(ENTORNO), secretos),
  };
};

const DATOS = {
  empresaId: 'empresa-a',
  emisor: 'https://key-access.sumamexico.com/realms/cliente-a',
  realm: 'cliente-a',
  clientIdPublico: 'erp-cliente-a',
  clientIdProvisionador: 'prov-cliente-a',
  secretoProvisionador: 'secreto-de-cliente-a',
  dominiosPermitidos: 'clientea.mx',
  aprovisionadoPor: 'abel.diaz',
};

const falla = async (f: () => Promise<unknown>, textoEsperado: string) => {
  let mensaje = '(no lanzó)';
  try {
    await f();
  } catch (e: any) {
    mensaje = e?.message ?? String(e);
  }
  expect(mensaje).toContain(textoEsperado);
};

describe('registrar la identidad de una empresa', () => {
  it('nace apagada: registrar no abre la puerta', async () => {
    const { servicio } = armar();
    const r = await servicio.registrar(DATOS);
    expect(r.estado).toBe('APROVISIONANDO');
    // Y mientras esté apagada, la empresa sigue con el realm compartido.
    expect((await servicio.deEmpresa('empresa-a')).origen).toBe('entorno');
    expect(await servicio.emisorAceptado(DATOS.emisor)).toBe(false);
  });

  it('activar es lo que la enciende', async () => {
    const { servicio } = armar();
    await servicio.registrar(DATOS);
    const r = await servicio.activar('empresa-a', 'abel.diaz');
    expect(r.estado).toBe('ACTIVA');
    expect((await servicio.deEmpresa('empresa-a')).origen).toBe('empresa');
    expect(await servicio.emisorAceptado(DATOS.emisor)).toBe(true);
  });

  it('no acepta un emisor sin https', async () => {
    const { servicio } = armar();
    await falla(
      () => servicio.registrar({ ...DATOS, emisor: 'http://key-access.local/realms/x' }),
      'URL https',
    );
  });

  it('exige realm y cliente público', async () => {
    const { servicio } = armar();
    await falla(() => servicio.registrar({ ...DATOS, clientIdPublico: '' }), 'cliente público');
  });

  it('sin cifrado no guarda el secreto: falla en vez de dejarlo en claro', async () => {
    const { servicio, datos } = armar([], false);
    await falla(() => servicio.registrar(DATOS), 'no hay cifrado disponible');
    expect(datos.length).toBe(0);
  });

  it('sin secretos sí registra aunque no haya cifrado', async () => {
    // Registrar sólo el emisor y el cliente público no expone nada.
    const { servicio } = armar([], false);
    const r = await servicio.registrar({
      ...DATOS,
      secretoProvisionador: null,
      clientIdProvisionador: null,
    });
    expect(r.estado).toBe('APROVISIONANDO');
  });

  it('un emisor no se comparte entre empresas', async () => {
    const { servicio } = armar();
    await servicio.registrar(DATOS);
    await falla(
      () => servicio.registrar({ ...DATOS, empresaId: 'empresa-b' }),
      'ya está registrado para otra empresa',
    );
  });

  it('volver a registrar una activa la devuelve a apagada', async () => {
    // Si cambian sus clientes, lo que había dejó de describirla: seguir
    // aceptando tokens con datos viejos es justo lo que no queremos.
    const { servicio } = armar();
    await servicio.registrar(DATOS);
    await servicio.activar('empresa-a', 'abel.diaz');
    const r = await servicio.registrar({ ...DATOS, clientIdPublico: 'erp-cliente-a-v2' });
    expect(r.estado).toBe('APROVISIONANDO');
    expect(await servicio.emisorAceptado(DATOS.emisor)).toBe(false);
  });

  it('el secreto se guarda cifrado y no vuelve nunca', async () => {
    const { servicio, datos } = armar();
    await servicio.registrar(DATOS);
    const guardado = String(datos[0].secretoProvisionador);
    expect(guardado.startsWith('v1:')).toBe(true);
    expect(guardado).not.toContain(DATOS.secretoProvisionador);
    const r = await servicio.activar('empresa-a', 'abel.diaz');
    expect(r.tieneSecretoProvisionador).toBe(true);
    expect(JSON.stringify(r)).not.toContain(DATOS.secretoProvisionador);
  });

  it('un secreto que no viene no se borra', async () => {
    const { servicio, datos } = armar();
    await servicio.registrar(DATOS);
    const antes = datos[0].secretoProvisionador;
    await servicio.registrar({ ...DATOS, secretoProvisionador: null });
    expect(datos[0].secretoProvisionador).toBe(antes);
  });

  it('suspender cierra la puerta sin borrar la fila', async () => {
    const { servicio, datos } = armar();
    await servicio.registrar(DATOS);
    await servicio.activar('empresa-a', 'abel.diaz');
    const r = await servicio.suspender('empresa-a', 'abel.diaz');
    expect(r.estado).toBe('SUSPENDIDA');
    expect(await servicio.emisorAceptado(DATOS.emisor)).toBe(false);
    // La fila sigue ahí: borrarla devolvería la empresa al realm compartido.
    expect(datos.length).toBe(1);
  });

  it('no se activa lo que no existe', async () => {
    const { servicio } = armar();
    await falla(() => servicio.activar('empresa-fantasma', 'abel.diaz'), 'no tiene identidad registrada');
  });
});
