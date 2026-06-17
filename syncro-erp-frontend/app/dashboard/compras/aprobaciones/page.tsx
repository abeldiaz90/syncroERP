"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, Eye } from 'lucide-react';
import { ProtectedElement } from "@/app/components/ProtectedElement"; // ← NUEVO

export default function AprobacionesPage() {
  const [aprobaciones, setAprobaciones] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [comentarios, setComentarios] = useState<{ [key: string]: string }>({});
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  const [toast, setToast] = useState<{ mensaje: string; tipo: 'exito' | 'error' | 'info' } | null>(null);
  const mostrarToast = (mensaje: string, tipo: 'exito' | 'error' | 'info' = 'info') => { setToast({ mensaje, tipo }); setTimeout(() => setToast(null), 4000); };

  const fetchAprobaciones = async () => {
    const token = localStorage.getItem('syncro_token');
    try {
      const res = await fetch(`${apiUrl}/compras/requisiciones/aprobaciones/pendientes`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAprobaciones(await res.json());
      else mostrarToast('Error al cargar aprobaciones', 'error');
    } catch { mostrarToast('Error de conexión', 'error'); }
    finally { setCargando(false); }
  };

  useEffect(() => { fetchAprobaciones(); }, []);

  const handleResolver = async (id: string, estado: 'APROBADO' | 'RECHAZADO') => {
    const token = localStorage.getItem('syncro_token');
    const comentario = comentarios[id] || '';
    try {
      const res = await fetch(`${apiUrl}/compras/requisiciones/aprobaciones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado, comentario }),
      });
      if (res.ok) {
        mostrarToast(`Requisición ${estado === 'APROBADO' ? 'aprobada' : 'rechazada'}.`, 'exito');
        fetchAprobaciones();
        setComentarios(prev => ({ ...prev, [id]: '' }));
      } else mostrarToast('Error al procesar', 'error');
    } catch { mostrarToast('Error de conexión', 'error'); }
  };

  if (cargando) return <div className="p-8 text-center">Cargando aprobaciones...</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-6 py-4 rounded-lg shadow-lg text-white font-medium ${toast.tipo === 'exito' ? 'bg-green-600' : toast.tipo === 'error' ? 'bg-red-600' : 'bg-blue-600'}`}>
          {toast.mensaje}
        </div>
      )}

      <h1 className="text-3xl font-bold mb-6">Aprobaciones Pendientes</h1>

      {aprobaciones.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">No tienes aprobaciones pendientes.</div>
      ) : (
        <div className="space-y-4">
          {aprobaciones.map((ap) => (
            <div key={ap.id} className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                  <p className="font-semibold text-lg">Requisición #{ap.requisicion?.id?.substring(0, 8)}</p>
                  <p className="text-sm text-gray-500">
                    Solicitante: {ap.requisicion?.usuarioSolicitante?.nombreCompleto || 'N/A'} | Fecha: {ap.requisicion?.fechaSolicitud ? new Date(ap.requisicion.fechaSolicitud).toLocaleDateString() : 'N/A'}
                  </p>
                  <p className="text-sm text-gray-500">Productos: {ap.requisicion?.detalles?.length || 0}</p>

                  {/* ✅ Solo aparece si tiene GET /api/compras/requisiciones/:id */}
                  <ProtectedElement metodo="GET" ruta="/api/compras/requisiciones/:id">
                    <Link href={`/dashboard/compras/requisiciones/${ap.requisicion?.id}`} className="text-indigo-600 hover:underline text-sm inline-flex items-center gap-1 mt-2">
                      <Eye className="w-4 h-4" /> Ver detalle
                    </Link>
                  </ProtectedElement>
                </div>

                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Comentario (opcional)"
                    className="border rounded px-3 py-1 text-black text-sm"
                    value={comentarios[ap.id] || ''}
                    onChange={(e) => setComentarios({ ...comentarios, [ap.id]: e.target.value })}
                  />
                  <div className="flex gap-2">
                    {/* ✅ Solo aparece si tiene PATCH /api/compras/requisiciones/aprobaciones/:id */}
                    <ProtectedElement metodo="PATCH" ruta="/api/compras/requisiciones/aprobaciones/:id">
                      <button onClick={() => handleResolver(ap.id, 'APROBADO')} className="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 flex items-center gap-1 text-sm">
                        <CheckCircle2 className="w-4 h-4" /> Aprobar
                      </button>
                    </ProtectedElement>
                    <ProtectedElement metodo="PATCH" ruta="/api/compras/requisiciones/aprobaciones/:id">
                      <button onClick={() => handleResolver(ap.id, 'RECHAZADO')} className="px-3 py-1 bg-rose-600 text-white rounded hover:bg-rose-700 flex items-center gap-1 text-sm">
                        <XCircle className="w-4 h-4" /> Rechazar
                      </button>
                    </ProtectedElement>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
