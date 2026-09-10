"use client";

import { useState, useEffect } from 'react';
import {
  Users, Loader2, ShieldCheck, Mail, UserPlus,
  Edit, Search, UserCheck, UserX, AlertCircle
} from 'lucide-react';
import { extraerLista } from '@/lib/normalizar-respuesta';
import { Boton, Campo, Entrada, Modal, Seleccion, useAvisos } from '@/components/ui';
import { confirmarElegante } from '@/components/ui/dialogos';

export default function UsuariosPage() {
  const { avisar } = useAvisos();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState<'CREAR'|'ROL'|null>(null);
  const [editando, setEditando] = useState<any>(null);
  const [form, setForm] = useState({ nombreCompleto:'', email:'', password:'', rol:'empleado' });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

  const cargarUsuarios = async () => {
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/usuarios?activos=false`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setUsuarios(extraerLista(data));
      } else {
        const errorData = await res.text();
        avisar(`No se pudieron cargar usuarios (${res.status}): ${errorData}`, 'error');
      }
    } catch (error) {
      console.error("Error de conexión:", error);
      avisar('No se pudo conectar con el servidor.', 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarUsuarios();
  }, []);

  // FILTRO DE BÚSQUEDA
  const usuariosFiltrados = usuarios.filter(u =>
    u.nombreCompleto.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email.toLowerCase().includes(busqueda.toLowerCase())
  );

  // CREAR USUARIO
  const handleCrearUsuario = async () => {
    if (!form.nombreCompleto.trim() || !/^\S+@\S+\.\S+$/.test(form.email) || form.password.length < 8) return avisar('Captura nombre, correo válido y contraseña de al menos 8 caracteres.', 'alerta');
      setCargando(true);
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/usuarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(form)
        });

        if (res.ok) {
          avisar('Usuario creado exitosamente.', 'exito'); setModal(null); setForm({nombreCompleto:'',email:'',password:'',rol:'empleado'});
          cargarUsuarios();
        } else {
          const errorData = await res.json();
          avisar(errorData.message || 'No se pudo crear el usuario.', 'error');
        }
      } catch (error) {
        avisar('No se pudo conectar con el servidor.', 'error');
      } finally {
        setCargando(false);
      }
  };

  // EDITAR ROL
  const handleEditarRol = async (usuario: any) => {
    const nuevoRol = form.rol;
    if (nuevoRol && nuevoRol !== usuario.rol) {
      setProcesandoId(usuario.id);
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/usuarios/${usuario.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ rol: nuevoRol })
        });

        if (res.ok) {
          avisar('Rol actualizado correctamente.', 'exito'); setModal(null);
          cargarUsuarios();
        }
      } catch (error) {
        avisar('No se pudo actualizar el usuario.', 'error');
      } finally {
        setProcesandoId(null);
      }
    }
  };

  // ACTIVAR / DESACTIVAR USUARIO
  const handleToggleEstado = async (usuario: any) => {
    const accion = usuario.activo ? 'desactivar' : 'reactivar';
    if (await confirmarElegante(`El usuario ${usuario.nombreCompleto} ${usuario.activo ? 'perderá' : 'recuperará'} el acceso al sistema.`, { titulo: usuario.activo ? 'Suspender acceso' : 'Reactivar acceso', peligroso: usuario.activo })) {
      setProcesandoId(usuario.id);
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/usuarios/${usuario.id}/estado`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          avisar(`Usuario ${accion === 'desactivar' ? 'suspendido' : 'reactivado'}.`, 'exito');
          // Actualizar estado localmente para no hacer otra petición a la base de datos
          setUsuarios(usuarios.map(u => u.id === usuario.id ? { ...u, activo: !u.activo } : u));
        }
      } catch (error) {
        avisar('No se pudo cambiar el estado del usuario.', 'error');
      } finally {
        setProcesandoId(null);
      }
    }
  };

  // ESTILOS DE ROLES
  const getRoleBadge = (rol: string) => {
    const roles: Record<string, string> = {
      admin: 'bg-rose-100 text-rose-700 border-rose-200',
      comprador: 'bg-blue-100 text-blue-700 border-blue-200',
      almacenista: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      finanzas: 'bg-amber-100 text-amber-700 border-amber-200',
      gerencia: 'bg-violet-100 text-violet-700 border-violet-200',
      rrhh: 'bg-pink-100 text-pink-700 border-pink-200',
      empleado: 'bg-slate-100 text-slate-700 border-slate-200',
    };
    return roles[rol] || roles['empleado'];
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
      
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <div className="p-3 bg-indigo-100 rounded-2xl"><Users className="w-6 h-6 text-indigo-600" /></div>
            Directorio de Personal
          </h1>
          <p className="text-slate-500 font-medium mt-2">Administra accesos, roles y credenciales de tu equipo de trabajo.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* BARRA DE BÚSQUEDA */}
          <div className="relative flex-grow sm:min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por nombre o correo..." 
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all text-sm font-medium text-slate-700"
            />
          </div>

          <button 
            onClick={()=>{setForm({nombreCompleto:'',email:'',password:'',rol:'empleado'});setModal('CREAR')}}
            className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-600 transition-colors shadow-lg whitespace-nowrap"
          >
            <UserPlus className="w-5 h-5" /> Nuevo Usuario
          </button>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Colaborador</th>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-center">Nivel de Acceso</th>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-center">Estado</th>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-right">Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando ? (
                <tr>
                  <td colSpan={4} className="p-16 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mx-auto mb-4" />
                    <p className="text-slate-500 font-bold">Sincronizando base de datos...</p>
                  </td>
                </tr>
              ) : usuariosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-16 text-center text-slate-500">
                    <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="font-bold text-lg text-slate-700">No se encontraron registros</p>
                    <p className="text-sm mt-1">Intenta con otro término de búsqueda o crea un nuevo usuario.</p>
                  </td>
                </tr>
              ) : (
                usuariosFiltrados.map((user) => (
                  <tr key={user.id} className={`hover:bg-slate-50 transition-colors ${!user.activo ? 'opacity-60 bg-slate-50/50' : ''}`}>
                    
                    {/* INFO DEL USUARIO */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black border ${user.activo ? 'bg-gradient-to-br from-indigo-100 to-blue-50 text-indigo-700 border-indigo-200 shadow-inner' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                          {user.nombreCompleto.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className={`font-bold ${user.activo ? 'text-slate-800' : 'text-slate-500 line-through'}`}>
                            {user.nombreCompleto}
                          </p>
                          <div className="flex items-center gap-1.5 text-slate-500 text-sm font-medium mt-0.5">
                            <Mail className="w-3.5 h-3.5" /> {user.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* ROL */}
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest border ${getRoleBadge(user.rol)}`}>
                        <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> {user.rol}
                      </span>
                    </td>

                    {/* ESTADO */}
                    <td className="px-6 py-4 text-center">
                      {user.activo ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-xs font-bold">
                          <span className="w-2 h-2 rounded-full bg-slate-400"></span> Suspendido
                        </span>
                      )}
                    </td>

                    {/* ACCIONES */}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {setEditando(user);setForm((f)=>({...f,rol:user.rol}));setModal('ROL')}}
                          disabled={procesandoId === user.id}
                          title="Cambiar Rol"
                          className="p-2 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 rounded-xl transition-colors"
                        >
                          {procesandoId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit className="w-4 h-4" />}
                        </button>
                        
                        <button
                          onClick={() => handleToggleEstado(user)}
                          disabled={procesandoId === user.id}
                          title={user.activo ? "Suspender Usuario" : "Reactivar Usuario"}
                          className={`p-2 rounded-xl transition-colors ${
                            user.activo 
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-600' 
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600'
                          }`}
                        >
                          {procesandoId === user.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : user.activo ? (
                            <UserX className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* FOOTER DE TABLA */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-sm font-medium text-slate-500">
          <span>Mostrando {usuariosFiltrados.length} colaboradores</span>
          {busqueda && <span>Filtrado por: "{busqueda}"</span>}
        </div>
      </div>
      <Modal abierto={modal==='CREAR'} onCerrar={()=>setModal(null)} titulo="Nuevo usuario del sistema" descripcion="Crea el acceso inicial; después podrás ajustar permisos específicos." pie={<><Boton onClick={()=>setModal(null)}>Cancelar</Boton><Boton variante="primario" onClick={()=>void handleCrearUsuario()}>Registrar usuario</Boton></>}><div className="space-y-4"><Campo etiqueta="Nombre completo" requerido><Entrada value={form.nombreCompleto} onChange={(e)=>setForm({...form,nombreCompleto:e.target.value})}/></Campo><Campo etiqueta="Correo electrónico" requerido><Entrada type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value.toLowerCase()})}/></Campo><Campo etiqueta="Contraseña temporal" requerido ayuda="Mínimo 8 caracteres."><Entrada type="password" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})}/></Campo><Campo etiqueta="Rol"><Seleccion value={form.rol} onChange={(e)=>setForm({...form,rol:e.target.value})}><Roles/></Seleccion></Campo></div></Modal>
      <Modal abierto={modal==='ROL'} onCerrar={()=>setModal(null)} titulo="Ajustar nivel de acceso" descripcion={editando?`Usuario: ${editando.nombreCompleto}`:undefined} pie={<><Boton onClick={()=>setModal(null)}>Cancelar</Boton><Boton variante="primario" onClick={()=>void handleEditarRol(editando)}>Guardar cambio</Boton></>}><Campo etiqueta="Nuevo rol"><Seleccion value={form.rol} onChange={(e)=>setForm({...form,rol:e.target.value})}><Roles/></Seleccion></Campo></Modal>
    </div>
  );
}

function Roles(){return <><option value="empleado">Empleado</option><option value="admin">Administrador</option><option value="gerencia">Gerencia</option><option value="rrhh">Recursos Humanos</option><option value="comprador">Comprador</option><option value="almacenista">Almacenista</option><option value="finanzas">Finanzas</option></>}
