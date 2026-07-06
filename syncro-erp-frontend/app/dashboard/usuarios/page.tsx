"use client";

import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import {
  Users, Loader2, ShieldCheck, Mail, UserPlus,
  Edit, Search, UserCheck, UserX, AlertCircle
} from 'lucide-react';

// Configuración de notificaciones discretas (Toasts)
const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

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
        setUsuarios(data);
      } else {
        const errorData = await res.text();
        Swal.fire('Error del Servidor', `Código: ${res.status} <br/> Detalle: ${errorData}`, 'error');
      }
    } catch (error) {
      console.error("Error de conexión:", error);
      Swal.fire('Error de red', 'No se pudo conectar con el servidor', 'error');
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
    const { value: formValues } = await Swal.fire({
      title: 'Nuevo Usuario del Sistema',
      html: `
        <div class="flex flex-col gap-4 text-left mt-4">
          <div>
            <label class="text-sm font-bold text-slate-600 mb-1 block">Nombre Completo</label>
            <input id="swal-nombre" class="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="Ej. Juan Pérez">
          </div>
          <div>
            <label class="text-sm font-bold text-slate-600 mb-1 block">Correo Electrónico</label>
            <input id="swal-email" type="email" class="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="juan@empresa.com">
          </div>
          <div>
            <label class="text-sm font-bold text-slate-600 mb-1 block">Contraseña de acceso</label>
            <input id="swal-pass" type="password" class="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="Min. 6 caracteres">
          </div>
          <div>
            <label class="text-sm font-bold text-slate-600 mb-1 block">Rol Asignado</label>
            <select id="swal-rol" class="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-white">
              <option value="empleado">Empleado (Básico)</option>
              <option value="admin">Administrador (Total)</option>
              <option value="comprador">Comprador (Compras)</option>
              <option value="almacenista">Almacenista (Inventarios)</option>
              <option value="finanzas">Finanzas (Pagos)</option>
            </select>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar Usuario',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#4f46e5',
      customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2 rounded-xl font-bold' },
      preConfirm: () => {
        const nombreCompleto = (document.getElementById('swal-nombre') as HTMLInputElement).value;
        const email = (document.getElementById('swal-email') as HTMLInputElement).value;
        const password = (document.getElementById('swal-pass') as HTMLInputElement).value;
        const rol = (document.getElementById('swal-rol') as HTMLSelectElement).value;

        if (!nombreCompleto || !email || !password) {
          Swal.showValidationMessage('⚠️ Por favor, completa todos los campos requeridos');
          return false;
        }
        return { nombreCompleto, email, password, rol };
      }
    });

    if (formValues) {
      setCargando(true);
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/usuarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(formValues)
        });

        if (res.ok) {
          Toast.fire({ icon: 'success', title: 'Usuario creado exitosamente' });
          cargarUsuarios();
        } else {
          const errorData = await res.json();
          Swal.fire('Error', errorData.message || 'No se pudo crear el usuario', 'error');
        }
      } catch (error) {
        Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
      } finally {
        setCargando(false);
      }
    }
  };

  // EDITAR ROL
  const handleEditarRol = async (usuario: any) => {
    const { value: nuevoRol } = await Swal.fire({
      title: 'Ajustar Nivel de Acceso',
      text: `Selecciona el nuevo rol para ${usuario.nombreCompleto}`,
      input: 'select',
      inputOptions: {
        admin: 'Administrador (Acceso Total)',
        empleado: 'Empleado (Básico)',
        comprador: 'Comprador (Compras)',
        almacenista: 'Almacenista (Inventarios)',
        finanzas: 'Finanzas (Pagos)'
      },
      inputValue: usuario.rol,
      showCancelButton: true,
      confirmButtonColor: '#4f46e5',
      confirmButtonText: 'Guardar Cambio',
      cancelButtonText: 'Cancelar',
      customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2 rounded-xl font-bold' }
    });

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
          Toast.fire({ icon: 'success', title: 'Rol actualizado correctamente' });
          cargarUsuarios();
        }
      } catch (error) {
        Swal.fire('Error', 'No se pudo actualizar el usuario', 'error');
      } finally {
        setProcesandoId(null);
      }
    }
  };

  // ACTIVAR / DESACTIVAR USUARIO
  const handleToggleEstado = async (usuario: any) => {
    const accion = usuario.activo ? 'desactivar' : 'reactivar';
    const color = usuario.activo ? '#e11d48' : '#059669'; // Rojo o Verde
    
    const result = await Swal.fire({
      title: `¿${accion === 'desactivar' ? 'Suspender' : 'Reactivar'} acceso?`,
      text: `El usuario ${usuario.nombreCompleto} ${usuario.activo ? 'perderá' : 'recuperará'} el acceso al sistema.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: color,
      cancelButtonColor: '#94a3b8',
      confirmButtonText: `Sí, ${accion}`,
      cancelButtonText: 'Cancelar',
      customClass: { popup: 'rounded-[24px]', confirmButton: 'px-6 py-2 rounded-xl font-bold' }
    });

    if (result.isConfirmed) {
      setProcesandoId(usuario.id);
      const token = localStorage.getItem('syncro_token');
      try {
        const res = await fetch(`${apiUrl}/usuarios/${usuario.id}/estado`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          Toast.fire({ icon: 'success', title: `Usuario ${accion === 'desactivar' ? 'suspendido' : 'reactivado'}` });
          // Actualizar estado localmente para no hacer otra petición a la base de datos
          setUsuarios(usuarios.map(u => u.id === usuario.id ? { ...u, activo: !u.activo } : u));
        }
      } catch (error) {
        Swal.fire('Error', 'No se pudo cambiar el estado del usuario', 'error');
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
            onClick={handleCrearUsuario}
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
                          onClick={() => handleEditarRol(user)}
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
    </div>
  );
}