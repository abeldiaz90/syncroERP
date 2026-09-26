import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Usuario } from '../entities/usuario.entity';
import * as bcrypt from 'bcrypt';
import { exigirPoliticaPassword } from '../security/password-policy';
import * as crypto from 'crypto';
import { CrearUsuarioDto } from '../dto/crear-usuario.dto';
import { ActualizarUsuarioDto } from '../dto/actualizar-usuario.dto';
// ⚠️ Ajusta la ruta a tu MailService real (el mismo que usa AuthService)
import { MailService } from '../../common/services/mail.service';
import { esRolAdministrador } from '../utils/roles.util';
import { ConfigService } from '@nestjs/config';
import { DirectorioIdentidadService } from './directorio-identidad.service';
import { PermisosDinamicosService } from './permisos-dinamicos.service';

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepo: Repository<Usuario>,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly directorio: DirectorioIdentidadService,
    private readonly permisos: PermisosDinamicosService,
  ) {}

  /**
   * Quien manda en la identidad. Con `keycloak` —lo normal— el ERP NO tiene
   * contraseñas: la persona entra con su cuenta de SUMA y aquí solo vive su
   * pertenencia a la empresa y su rol.
   */
  private get identidadEnDirectorio(): boolean {
    return this.config.get<string>('AUTH_MODE', 'keycloak') === 'keycloak';
  }

  /**
   * Lo que se puede contar de un usuario hacia afuera.
   *
   * `crear()` ya se molestaba en quitar el hash de la respuesta, pero las
   * consultas devolvían la entidad entera: el listado de usuarios venía con
   * `passwordHash` y con `tokenVerificacion`, que es el token de invitación en
   * vivo — con él se activa una cuenta ajena. Un dato así no viaja a un
   * navegador aunque quien mire sea administrador.
   */
  private sanear<T extends object>(usuario: T) {
    const {
      passwordHash: _hash,
      tokenVerificacion: _token,
      tokenExpira: _expira,
      tokenRecuperacion: _recuperacion,
      tokenRecuperacionExpira: _recuperacionExpira,
      ...limpio
    } = usuario as any;
    return limpio;
  }

  private get frontendUrl(): string {
    const url = process.env.FRONTEND_URL;
    if (!url) {
      this.logger.warn(
        'FRONTEND_URL no definida — usando http://localhost:3000',
      );
      return 'http://localhost:3000';
    }
    return url.replace(/\/$/, '');
  }


  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private validarCambioRol(
    rolActual: string | undefined,
    rolNuevo: string | undefined,
    rolSolicitante: string,
  ): void {
    if (!rolNuevo || rolNuevo === rolActual) return;
    if (!esRolAdministrador(rolSolicitante)) {
      throw new ForbiddenException(
        'Solo un administrador puede asignar o cambiar roles.',
      );
    }
  }

  /**
   * El contexto del propio usuario: quién es y de qué departamento cuelga.
   *
   * Existe por un caso concreto. Crear una requisición exige que el
   * solicitante tenga departamento —de él salen los aprobadores— y eso sólo se
   * descubría al guardar, con un 400 y el formulario ya lleno. La pantalla no
   * tenía forma de saberlo antes: no hay endpoint que le diga al usuario quién
   * es. Ahora sí, y sin permisos de por medio, porque nadie necesita permiso
   * para saber su propio departamento.
   */
  /**
   * Contexto propio: quien soy, con que rol, en que area y en que empresa.
   *
   * El nombre comercial viene aqui, y no de /configuracion/empresa, porque el
   * encabezado lo pinta para TODOS los roles y ese endpoint es de
   * administracion. Resultado: cada carga de cada pantalla de un almacenista o
   * un comprador disparaba un 403 que la aplicacion se tragaba —verificado el
   * 21-sep-2026: seis por sesion, y el encabezado quedaba sin nombre igual.
   *
   * El nombre de la empresa no es un dato reservado frente a su propia gente;
   * lo reservado es la configuracion fiscal, y eso se queda donde estaba.
   */
  async obtenerMiContexto(id: string, empresaId: string) {
    const usuario = await this.usuarioRepo.findOne({
      where: { id, empresaId },
      relations: ['departamento', 'empresa'],
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    const empresa = (usuario as any).empresa;
    return {
      id: usuario.id,
      email: usuario.email,
      nombreCompleto: usuario.nombreCompleto,
      rol: usuario.rol,
      departamentoId: usuario.departamentoId ?? null,
      departamento: (usuario as any).departamento?.nombre ?? null,
      empresaId,
      empresa: empresa
        ? {
            id: empresa.id,
            nombre: empresa.nombreComercial ?? empresa.razonSocial ?? null,
          }
        : null,
    };
  }

  async obtenerPreferencias(id: string, empresaId: string) {
    const usuario = await this.usuarioRepo.findOne({ where: { id, empresaId } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    return { idioma: usuario.idioma || 'es-MX', zonaHoraria: usuario.zonaHoraria || 'America/Mexico_City' };
  }

  async actualizarPreferencias(id: string, empresaId: string, dto: ActualizarUsuarioDto) {
    const usuario = await this.usuarioRepo.findOne({ where: { id, empresaId } });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    if (dto.idioma) usuario.idioma = dto.idioma;
    if (dto.zonaHoraria) usuario.zonaHoraria = dto.zonaHoraria;
    await this.usuarioRepo.save(usuario);
    return { idioma: usuario.idioma, zonaHoraria: usuario.zonaHoraria };
  }

  private describirError(error: unknown): { msg: string; stack?: string } {
    if (error instanceof Error)
      return { msg: error.message, stack: error.stack };
    return { msg: String(error) };
  }

  private async enviarCorreoInvitacion(
    email: string,
    nombre: string,
    token: string,
    rol: string,
  ) {
    const url = `${this.frontendUrl}/aceptar-invitacion#token=${token}`;
    await this.mailService.enviarCorreo({
      destinatario: email,
      asunto: 'Te invitaron a SyncroERP — activa tu cuenta',
      cuerpo: `Has sido invitado a SyncroERP. Activa tu cuenta: ${url}`,
      cuerpoHtml: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="color:#0f172a">Te damos la bienvenida a SyncroERP</h2>
          <p style="color:#475569">Hola ${nombre}:</p>
          <p style="color:#475569">
            Has sido invitado a unirte al equipo con el rol de <strong>${rol}</strong>.
            Para activar tu cuenta y crear tu contraseña, haz clic aquí:
          </p>
          <a href="${url}"
             style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;
                    border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0">
            Activar mi cuenta
          </a>
          <p style="color:#94a3b8;font-size:12px">
            El enlace expira en 48 horas. Si no esperabas esta invitación, ignora este correo.
          </p>
          <p style="color:#cbd5e1;font-size:11px">
            Si el botón no funciona, copia esta dirección:<br/>${url}
          </p>
        </div>`,
    });
  }

  /**
   * El correo cuando la identidad vive en el directorio. No hay enlace de
   * activación porque no hay nada que activar aquí: la llave es su cuenta de
   * SUMA, y prometerle otra cosa es mandarlo a una puerta que no abre.
   */
  private async enviarCorreoAltaConDirectorio(
    email: string,
    nombre: string,
    rol: string,
  ) {
    const url = this.frontendUrl;
    await this.mailService.enviarCorreo({
      destinatario: email,
      asunto: 'Ya tienes acceso a SyncroERP',
      cuerpo: `Se te dio de alta en SyncroERP con el rol de ${rol}. Entra en ${url} con tu cuenta de SUMA.`,
      cuerpoHtml: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="color:#0f172a">Ya tienes acceso a SyncroERP</h2>
          <p style="color:#475569">Hola ${nombre}:</p>
          <p style="color:#475569">
            Se te dio de alta con el rol de <strong>${rol}</strong>.
            Entra con <strong>tu misma cuenta de SUMA</strong>; no necesitas crear
            una contraseña nueva.
          </p>
          <a href="${url}"
             style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;
                    border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0">
            Entrar a SyncroERP
          </a>
          <p style="color:#94a3b8;font-size:12px">
            Si al entrar te dice que tu cuenta no est&aacute; en SUMA, av&iacute;sale a quien
            administra los accesos: falta crearte en el directorio.
          </p>
        </div>`,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREAR USUARIO — envía invitación por correo (sin contraseña)
  // ──────────────────────────────────────────────────────────────────────────
  async crear(
    dto: CrearUsuarioDto,
    empresaId: string,
    rolSolicitante: string,
  ) {
    this.validarCambioRol(undefined, dto.rol, rolSolicitante);
    const emailNorm = dto.email.toLowerCase().trim();

    /*
     * El correo es único en TODO el ERP, no dentro de la empresa. Aquí se
     * comprobaba solo contra la empresa que invita, mientras el alta pública y
     * la puerta de aprovisionamiento comprobaban globalmente y la entidad lo
     * declara `unique`. Esa grieta importa porque la sesión se resuelve por
     * correo cuando la persona todavía no tiene `keycloakSubject`: dos filas
     * con el mismo correo en empresas distintas y la cartera que ve al entrar
     * depende de cuál devuelva la base primero.
     */
    const existe = await this.usuarioRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: emailNorm })
      .getOne();
    if (existe) {
      throw new ConflictException(
        existe.empresaId === empresaId
          ? 'Ya existe un usuario con ese correo en esta empresa.'
          : 'Ese correo ya pertenece a otra empresa del ERP. Una persona pertenece a una sola empresa.',
      );
    }

    // Token de invitación (reutiliza los campos de verificación de la entidad)
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 h

    /*
     * Con la identidad en el directorio, esta invitación NO daba acceso a
     * nadie.
     *
     * Se creaba la fila con `activo: false` y se le pedía al invitado que
     * eligiera una contraseña para activarse; pero con `AUTH_MODE=keycloak` el
     * login local está cerrado (`auth.controller.ts`), así que esa contraseña
     * no autentica nada y la cuenta se quedaba inactiva para siempre. La
     * persona recibía un correo de bienvenida a un sitio donde no podía entrar.
     *
     * Ahora, en modo directorio, el alta hace lo único que el ERP puede hacer
     * de verdad: declarar que esa persona pertenece a esta empresa y con qué
     * rol. La cuenta queda lista y el vínculo con SUMA se sella solo la primera
     * vez que entra (`jwt.strategy`), que es cuando Keycloak dice quién es.
     *
     * Lo que el ERP NO hace —y hay que decirlo donde se ve— es dar de alta a la
     * persona en Keycloak. Si no existe allá, al entrar recibirá el mensaje de
     * que su cuenta no está en SUMA. Crear identidades en el directorio es una
     * decisión de quien administra el directorio, no un efecto secundario de
     * que alguien llene un formulario en el ERP.
     */
    const enDirectorio = this.identidadEnDirectorio;

    /*
     * ────────────────────────────────────────────────────────────────────────
     * Un alta, dos sistemas — y en su orden
     * ------------------------------------------------------------------------
     * La identidad va PRIMERO porque es donde vive la credencial: si falla, no
     * se crea la fila. Una fila de usuario cuya persona no puede entrar es
     * exactamente la trampa que tenía este formulario antes —invitaba a alguien
     * a un sitio donde no podía entrar— y no se arregla creando la fila igual.
     *
     * Si la identidad YA EXISTE, no se crea otra: se reutiliza y se sella el
     * vínculo aquí mismo. Ése es el caso de quien fue creado antes en el portal
     * del core o en la consola de SUMA; el ERP lo reconoce en vez de duplicarlo.
     *
     * Y si el directorio no está configurado para dar de alta, el
     * comportamiento es el de antes: se crea la fila y se dice claramente que
     * falta crear la identidad a mano. Es honesto, y no bloquea a quien todavía
     * no ha configurado el provisionador.
     * ────────────────────────────────────────────────────────────────────────
     */
    let subDirectorio: string | null = null;
    let identidad: { estado: string; detalle?: string } = {
      estado: 'no-configurado',
    };

    if (enDirectorio && this.directorio.configurado) {
      const alta = await this.directorio.crearIdentidad({
        email: emailNorm,
        nombre: dto.nombreCompleto.trim().split(/\s+/)[0] ?? dto.nombreCompleto,
        apellido: dto.nombreCompleto.trim().split(/\s+/).slice(1).join(' '),
      });

      if (alta.resultado === 'error') {
        this.logger.error(
          `No se pudo preparar la identidad de ${emailNorm}: [${alta.codigo}] ${alta.motivo}`,
        );
        throw new BadRequestException(
          `No se creó el usuario porque no se pudo preparar su acceso: ${alta.motivo}`,
        );
      }

      subDirectorio = alta.sub;
      identidad = alta.yaExistia
        ? { estado: 'reutilizada' }
        : {
            estado: alta.correo === 'enviado' ? 'creada' : 'creada-sin-correo',
            detalle: alta.motivoCorreo,
          };
    }

    // Sin acceso local: la columna es NOT NULL y se marca como lo que es.
    const passwordHash = enDirectorio
      ? 'sin-acceso-local:identidad-en-el-directorio'
      : await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

    const usuario = this.usuarioRepo.create({
      empresaId,
      nombreCompleto: dto.nombreCompleto,
      email: emailNorm,
      rol: dto.rol ?? 'empleado',
      departamentoId: (dto as any).departamentoId ?? null,
      passwordHash,
      activo: enDirectorio, // en modo local se activa al aceptar la invitación
      /*
       * El vínculo se sella aquí cuando se conoce, en vez de esperar al primer
       * acceso. Además de ahorrarse el enganche por correo, lo cierra: nadie
       * puede presentarse con ese correo y quedarse con esta fila.
       */
      keycloakSubject: subDirectorio,
      emailVerificado: false,
      tokenVerificacion: enDirectorio ? null : this.hashToken(token),
      tokenExpira: enDirectorio ? null : expira,
    } as any);

    // `create()` con `as any` hace que TypeScript infiera `Usuario[]` en el
    // guardado; el tipo se fija aquí en vez de arrastrarlo.
    const guardado: Usuario = (await this.usuarioRepo.save(usuario)) as unknown as Usuario;

    // Enviar invitación fuera del flujo crítico: si el correo falla, el
    // usuario queda creado y se puede reenviar la invitación.
    try {
      if (enDirectorio) {
        /*
         * Si el directorio ya mandó el suyo —el de fijar contraseña—, este
         * correo sobra y confunde: dos mensajes distintos para una sola acción.
         * Solo se manda cuando el directorio no escribió a nadie.
         */
        if (identidad.estado !== 'creada') {
          await this.enviarCorreoAltaConDirectorio(
            emailNorm,
            dto.nombreCompleto,
            dto.rol ?? 'empleado',
          );
        }
      } else {
        await this.enviarCorreoInvitacion(
          emailNorm,
          dto.nombreCompleto,
          token,
          dto.rol ?? 'empleado',
        );
      }
    } catch (error) {
      const { msg, stack } = this.describirError(error);
      this.logger.error(
        `FALLO ENVÍO DE INVITACIÓN a ${emailNorm}: ${msg}`,
        stack,
      );
    }

    /*
     * ────────────────────────────────────────────────────────────────────────
     * Que el rol signifique algo desde el primer día
     * ------------------------------------------------------------------------
     * Las plantillas de permisos existían y no se aplicaban solas. Se comprobó
     * dando de alta usuarios de verdad: `credito` y `rrhh` quedaban con un
     * usuario cada uno y CERO acciones. Como el guardia niega lo que no está
     * concedido, esa persona entraba y no podía hacer nada —menú vacío y «esta
     * sección no está en tu perfil» en todas partes—, hasta que un
     * administrador iba a Roles y permisos y pulsaba «aplicar plantilla», un
     * paso que no estaba escrito en ningún lado.
     *
     * Y es por empresa: cada cliente nuevo de SUMA nacía con los trece roles
     * vacíos. Sembrar sólo ocurre si el rol NO tiene ningún permiso en esta
     * empresa, así que no deshace lo que alguien haya configurado a mano.
     *
     * No tumba el alta si falla: el usuario ya está creado y su acceso se puede
     * arreglar desde la pantalla. Quedarse sin usuario por esto sería peor.
     * ────────────────────────────────────────────────────────────────────────
     */
    let permisosSembrados = 0;
    try {
      const siembra = await this.permisos.sembrarPlantillaSiVacia(
        guardado.rol,
        guardado.empresaId,
      );
      permisosSembrados = siembra.activados;
    } catch (error) {
      this.logger.error(
        `El usuario ${guardado.email} se creó, pero no se pudieron sembrar los permisos de su rol: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    /*
     * La respuesta cuenta sistema por sistema, porque «usuario creado» a secas
     * es lo que hacía que nadie se enterara de que la persona no podía entrar.
     */
    const mensajes: Record<string, string> = {
      creada:
        'Usuario dado de alta. Se creó su identidad en SUMA y le llegó un correo para fijar su contraseña.',
      'creada-sin-correo':
        'Usuario dado de alta y su identidad creada en SUMA, pero el correo para fijar la contraseña no salió. Reenvíaselo desde el directorio.',
      reutilizada:
        'Usuario dado de alta. Ya tenía identidad en SUMA, así que se reutilizó: entra con la cuenta que ya usa.',
      'no-configurado':
        'Usuario dado de alta en esta empresa. Entrará con su cuenta de SUMA; si todavía no existe en el directorio, hay que crearla ahí.',
    };

    return {
      ...this.sanear(guardado),
      mensaje: enDirectorio
        ? (mensajes[identidad.estado] ?? mensajes['no-configurado'])
        : 'Usuario creado. Se envió una invitación por correo para que active su cuenta.',
      identidad: enDirectorio ? identidad : { estado: 'no-aplica' },
      requiereAltaEnDirectorio: enDirectorio && identidad.estado === 'no-configurado',
      /*
       * El tercer sistema no se toca desde aquí: el ERP y el core viven en
       * módulos distintos y encadenarlos haría que una caída del core impidiera
       * dar de alta a un empleado. Se avisa, y la pantalla de correspondencia
       * —que ya sabe de oficinas y roles del core— lo cierra.
       */
      permisosSembrados,
      siguientePaso:
        'Si esta empresa opera con el core, habilítalo allá desde Roles y permisos → Correspondencia.',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACEPTAR INVITACIÓN — el empleado define su contraseña
  // ──────────────────────────────────────────────────────────────────────────
  async aceptarInvitacion(token: string, nuevaPassword: string) {
    if (this.identidadEnDirectorio) {
      // Aceptar una invitación aquí significaba elegir una contraseña local, y
      // las contraseñas locales no autentican en este modo. Decirlo es mejor
      // que dejar que alguien crea que se activó.
      throw new ForbiddenException(
        'Las contraseñas se administran en SUMA. Entra con tu cuenta de SUMA; tu acceso al ERP ya está dado de alta.',
      );
    }
    if (!token) throw new BadRequestException('Token no proporcionado');
    if (!nuevaPassword || nuevaPassword.length < 8) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres',
      );
    }

    const usuario = await this.usuarioRepo.findOne({
      where: {
        tokenVerificacion: In([this.hashToken(token), token]),
      },
    });
    if (!usuario)
      throw new NotFoundException('Invitación inválida o ya utilizada');

    if (usuario.tokenExpira && new Date() > new Date(usuario.tokenExpira)) {
      throw new BadRequestException(
        'La invitación ha expirado. Pide que te reenvíen una nueva.',
      );
    }

    exigirPoliticaPassword(nuevaPassword);
    usuario.passwordHash = await bcrypt.hash(nuevaPassword, 10);
    usuario.activo = true;
    usuario.emailVerificado = true;
    usuario.tokenVerificacion = null;
    usuario.tokenExpira = null;
    usuario.tokenVersion = Number(usuario.tokenVersion ?? 0) + 1;
    await this.usuarioRepo.save(usuario);

    return { mensaje: 'Cuenta activada. Ya puedes iniciar sesión.' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DATOS DE LA INVITACIÓN — para mostrar nombre/email en la página de aceptar
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerInvitacion(token: string) {
    if (!token) throw new BadRequestException('Token no proporcionado');
    const usuario = await this.usuarioRepo.findOne({
      where: {
        tokenVerificacion: In([this.hashToken(token), token]),
      },
    });
    if (!usuario)
      throw new NotFoundException('Invitación inválida o ya utilizada');
    if (usuario.tokenExpira && new Date() > new Date(usuario.tokenExpira)) {
      throw new BadRequestException('La invitación ha expirado.');
    }
    return {
      nombreCompleto: usuario.nombreCompleto,
      email: usuario.email,
      rol: usuario.rol,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REENVIAR INVITACIÓN
  // ──────────────────────────────────────────────────────────────────────────
  async reenviarInvitacion(id: string, empresaId: string) {
    const usuario = await this.obtenerPorId(id, empresaId);
    if (usuario.activo) {
      throw new BadRequestException('Este usuario ya activó su cuenta.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    usuario.tokenVerificacion = this.hashToken(token);
    usuario.tokenExpira = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.usuarioRepo.save(usuario);

    await this.enviarCorreoInvitacion(
      usuario.email,
      usuario.nombreCompleto,
      token,
      usuario.rol,
    );
    return { mensaje: 'Invitación reenviada.' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONSULTAS
  // ──────────────────────────────────────────────────────────────────────────
  async obtenerTodos(empresaId: string, filtro?: string, soloActivos = true) {
    const qb = this.usuarioRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.departamento', 'dep')
      .where('u.empresaId = :empresaId', { empresaId });

    if (soloActivos) qb.andWhere('u.activo = :activo', { activo: true });
    if (filtro) {
      qb.andWhere('(u.nombreCompleto ILIKE :filtro OR u.email ILIKE :filtro)', {
        filtro: `%${filtro}%`,
      });
    }
    const usuarios = await qb.orderBy('u.nombreCompleto', 'ASC').getMany();
    return usuarios.map((u) => this.sanear(u));
  }

  async obtenerPorId(id: string, empresaId: string) {
    const u = await this.usuarioRepo.findOne({
      where: { id, empresaId },
      relations: ['departamento'],
    });
    if (!u) throw new NotFoundException('Usuario no encontrado.');
    return u;
  }

  /** La misma consulta, saneada, para lo que sale hacia el navegador. */
  async obtenerPorIdPublico(id: string, empresaId: string) {
    return this.sanear(await this.obtenerPorId(id, empresaId));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ACTUALIZAR
  // ──────────────────────────────────────────────────────────────────────────
  async actualizar(
    id: string,
    dto: ActualizarUsuarioDto,
    empresaId: string,
    rolSolicitante: string,
  ) {
    const usuario = await this.obtenerPorId(id, empresaId);
    this.validarCambioRol(usuario.rol, dto.rol, rolSolicitante);

    let invalidaSesiones = false;
    if (dto.password) {
      exigirPoliticaPassword(dto.password);
      usuario.passwordHash = await bcrypt.hash(dto.password, 12);
      delete (dto as any).password;
      invalidaSesiones = true;
    }
    if (dto.rol && dto.rol !== usuario.rol) invalidaSesiones = true;

    const rolNuevo = dto.rol && dto.rol !== usuario.rol ? dto.rol : null;

    Object.assign(usuario, dto);
    if (invalidaSesiones) {
      usuario.tokenVersion = Number(usuario.tokenVersion ?? 0) + 1;
    }
    const guardado = await this.usuarioRepo.save(usuario);

    // Cambiar de rol también estrena rol en la empresa: si nadie lo tenía, su
    // plantilla nunca se había sembrado y el cambio dejaba a la persona sin
    // nada. Misma regla: sólo si ese rol no tiene ya permisos aquí.
    if (rolNuevo) {
      try {
        await this.permisos.sembrarPlantillaSiVacia(rolNuevo, empresaId);
      } catch (error) {
        this.logger.error(
          `Se cambió el rol de ${guardado.email} a "${rolNuevo}" pero no se pudieron sembrar sus permisos: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return this.sanear(guardado);
  }

  async toggleActivo(
    id: string,
    empresaId: string,
    usuarioSolicitanteId: string,
    rolSolicitante: string,
  ) {
    if (!esRolAdministrador(rolSolicitante)) {
      throw new ForbiddenException(
        'Solo un administrador puede activar o desactivar usuarios.',
      );
    }
    if (id === usuarioSolicitanteId) {
      throw new BadRequestException(
        'No puedes desactivar tu propia cuenta desde esta operación.',
      );
    }
    const usuario = await this.obtenerPorId(id, empresaId);
    if (usuario.esPropietario && usuario.activo) {
      throw new BadRequestException(
        'El propietario de la empresa no puede desactivarse.',
      );
    }
    usuario.activo = !usuario.activo;
    usuario.tokenVersion = Number(usuario.tokenVersion ?? 0) + 1;
    return this.usuarioRepo.save(usuario);
  }
}
