import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { CurpRpaService } from '../services/curp-rpa.service';
import { ActiveUser } from '../../iam/decorators/active-user.decorator';

@Controller('rpa/curp')
export class CurpRpaController {
  constructor(private readonly svc: CurpRpaService) {}

  @Post('consultar')
  consultar(
    @Body() body: {
      tipo:             'CURP' | 'DATOS';
      curp?:            string;
      nombre?:          string;
      primerApellido?:  string;
      segundoApellido?: string;
      fechaNacimiento?: string;
      sexo?:            string;
      entidadNacimiento?: string;
    },
    @ActiveUser('empresaId') empresaId: string,
    @ActiveUser('id')        usuarioId: string,
  ) {
    return this.svc.consultar(
      body.tipo,
      body,
      empresaId,
      usuarioId,
    );
  }

  @Get('historial')
  historial(
    @ActiveUser('empresaId') empresaId: string,
    @Query('pagina') pagina = '1',
    @Query('limite') limite = '20',
  ) {
    return this.svc.obtenerHistorial(empresaId, Number(pagina), Number(limite));
  }

  @Get('entidades')
  entidades() {
    return [
      { clave: 'AS', nombre: 'Aguascalientes'          },
      { clave: 'BC', nombre: 'Baja California'         },
      { clave: 'BS', nombre: 'Baja California Sur'     },
      { clave: 'CC', nombre: 'Campeche'                },
      { clave: 'CL', nombre: 'Coahuila'                },
      { clave: 'CM', nombre: 'Colima'                  },
      { clave: 'CS', nombre: 'Chiapas'                 },
      { clave: 'CH', nombre: 'Chihuahua'               },
      { clave: 'DF', nombre: 'Ciudad de México'        },
      { clave: 'DG', nombre: 'Durango'                 },
      { clave: 'GT', nombre: 'Guanajuato'              },
      { clave: 'GR', nombre: 'Guerrero'                },
      { clave: 'HG', nombre: 'Hidalgo'                 },
      { clave: 'JC', nombre: 'Jalisco'                 },
      { clave: 'MC', nombre: 'Estado de México'        },
      { clave: 'MN', nombre: 'Michoacán'               },
      { clave: 'MS', nombre: 'Morelos'                 },
      { clave: 'NT', nombre: 'Nayarit'                 },
      { clave: 'NL', nombre: 'Nuevo León'              },
      { clave: 'OC', nombre: 'Oaxaca'                  },
      { clave: 'PL', nombre: 'Puebla'                  },
      { clave: 'QT', nombre: 'Querétaro'               },
      { clave: 'QR', nombre: 'Quintana Roo'            },
      { clave: 'SP', nombre: 'San Luis Potosí'         },
      { clave: 'SL', nombre: 'Sinaloa'                 },
      { clave: 'SR', nombre: 'Sonora'                  },
      { clave: 'TC', nombre: 'Tabasco'                 },
      { clave: 'TS', nombre: 'Tamaulipas'              },
      { clave: 'TL', nombre: 'Tlaxcala'                },
      { clave: 'VZ', nombre: 'Veracruz'                },
      { clave: 'YN', nombre: 'Yucatán'                 },
      { clave: 'ZS', nombre: 'Zacatecas'               },
      { clave: 'NE', nombre: 'Nacido en el Extranjero' },
    ];
  }
}
