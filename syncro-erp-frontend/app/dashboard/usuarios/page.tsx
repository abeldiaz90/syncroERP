"use client";

import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import {
  Users, Loader2, ShieldCheck, Mail, Building2,
  ToggleLeft, ToggleRight, Edit, UserPlus
} from 'lucide-react';

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api';

  const cargarUsuarios = async () => {
    setCargando(true);
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/usuarios`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setUsuarios(data);
      } else {
        const errorData = await res.text();
        console.error(`ESTADO ${res.status} RECHAZADO POR NESTJS:`, errorData);
        Swal.fire('Error del Servidor', `Código: ${res.status} <br/> Detalle: ${errorData}`, 'error');
      }
    } catch (error) {
      console.error("Error de conexión:", error);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarUsuarios();
  }, []);

  // Función para cambiar el rol (ej. de empleado a almacenista)
  const handleEditarRol = async (usuario: any) => {
    const { value: nuevoRol } = await Swal.fire({
      title: 'Cambiar Rol de Usuario',
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
          body: JSON.stringify({ rol: nuevoRol }) // Aquí usamos tu ActualizarUsuarioDto
        });

        if (res.ok) {
          Swal.fire({ title: 'Actualizado', text: 'El rol se cambió correctamente', icon: 'success', confirmButtonColor: '#059669' });
          cargarUsuarios(); // Recargamos la tabla
        }
      } catch (error) {
        Swal.fire('Error', 'No se pudo actualizar el usuario', 'error');
      } finally {
        setProcesandoId(null);
      }
    }
  };

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

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <div className="p-3 bg-indigo-100 rounded-2xl"><Users className="w-6 h-6 text-indigo-600" /></div>
            Gestión de Usuarios
          </h1>
          <p className="text-slate-500 font-medium mt-2">Administra el personal, sus credenciales y niveles de acceso.</p>
        </div>
        <button className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-600 transition-colors shadow-lg">
          <UserPlus className="w-5 h-5" /> Nuevo Usuario
        </button>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Nombre Completo</th>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Correo Electrónico</th>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-center">Rol del Sistema</th>
                <th className="px-6 py-5 text-xs font-black uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargando ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">Cargando directorio...</p>
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-500 font-bold">
                    No se encontraron usuarios. Verifica que el Token JWT contenga el empresaId.
                  </td>
                </tr>
              ) : (
                usuarios.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-50 flex items-center justify-center text-indigo-700 font-black border border-indigo-200">
                          {user.nombreCompleto.charAt(0).toUpperCase()}
                        </div>
                        <p className="font-bold text-slate-800">{user.nombreCompleto}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-500 font-medium">
                        <Mail className="w-4 h-4" /> {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest border ${getRoleBadge(user.rol)}`}>
                        <ShieldCheck className="w-3 h-3 mr-1" /> {user.rol}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleEditarRol(user)}
                        disabled={procesandoId === user.id}
                        className="px-4 py-2 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 ml-auto"
                      >
                        {procesandoId === user.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit className="w-4 h-4" />}
                        Cambiar Rol
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}