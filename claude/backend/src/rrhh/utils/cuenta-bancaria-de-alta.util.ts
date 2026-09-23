/**
 * ============================================================================
 * SyncroERP · La CLABE que se captura al dar de alta es la que se dispersa
 * ----------------------------------------------------------------------------
 * El asistente de alta pide banco y CLABE, y los guardaba en dos columnas del
 * empleado (`banco`, `clabe`). La dispersion de nomina no lee eso: lee
 * `CuentaBancariaEmpleado`, que es la tabla que trae la CLABE cifrada, su
 * huella, la cuenta principal y el estado de validacion.
 *
 * Resultado: se contrataba a alguien capturando su CLABE, todo parecia
 * completo, y al llegar a la dispersion el sistema respondia «Hay empleados
 * sin cuenta principal activa y validada». Para arreglarlo habia que volver a
 * teclear la misma CLABE en otra pantalla. El dato estaba en dos sitios y el
 * que llenaba el operador no era el que usaba el sistema.
 *
 * Aqui se construye la cuenta una sola vez, para el alta y para la captura
 * manual. Nace PENDIENTE a proposito: capturar no es validar. Validar es un
 * control aparte —y de otro rol, porque un control que ejerce quien capturo el
 * dato no controla nada— y la dispersion sigue negandose hasta que exista.
 * ============================================================================
 */
import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  CuentaBancariaEmpleado,
  EstadoCuentaBancariaEmpleado,
  EstadoValidacionCuentaBancaria,
} from '../advanced/nomina-avanzada.entity';
import { cifrarDatoNomina, huellaDatoNomina } from './datos-sensibles.crypto';
import { clabeEsValida } from './clabe.util';

export interface DatosCuentaDeAlta {
  clabe: string;
  bancoClave?: string;
  bancoNombre: string;
  titular: string;
  empresaId: string;
  empleadoId: string;
  creadaPorId?: string;
  /** La primera cuenta de un empleado es su cuenta principal. */
  principal?: boolean;
}

export function construirCuentaBancaria(
  em: EntityManager,
  datos: DatosCuentaDeAlta,
): CuentaBancariaEmpleado {
  if (!clabeEsValida(datos.clabe)) {
    throw new BadRequestException(
      'La CLABE no supera la validación del dígito de control.',
    );
  }
  return em.create(CuentaBancariaEmpleado, {
    empresaId: datos.empresaId,
    empleadoId: datos.empleadoId,
    bancoClave: datos.bancoClave,
    bancoNombre: datos.bancoNombre,
    titular: datos.titular,
    moneda: 'MXN',
    // La CLABE en claro no se guarda nunca: cifrada, con huella para la
    // unicidad y los ultimos cuatro digitos para poder enseñarla enmascarada.
    clabe: undefined,
    clabeCifrada: cifrarDatoNomina(datos.clabe),
    clabeHash: huellaDatoNomina(datos.clabe),
    clabeUltimos4: datos.clabe.slice(-4),
    principal: datos.principal ?? false,
    estado: EstadoCuentaBancariaEmpleado.ACTIVA,
    estadoValidacion: EstadoValidacionCuentaBancaria.PENDIENTE,
    creadaPorId: datos.creadaPorId,
  });
}
