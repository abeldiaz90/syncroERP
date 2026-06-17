"use client";

import { useState } from 'react';

export default function RegisterPage() {
    const [formData, setFormData] = useState({
        nombreComercial: '',
        nombreCompleto: '',
        email: '',
        password: ''
    });
    const [mensaje, setMensaje] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setMensaje('Registrando...');

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

        try {
            // AGREGA EL /api AQUÍ
            const res = await fetch(`${apiUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setMensaje('¡Registro exitoso! Redirigiendo al login...');
                setTimeout(() => { window.location.href = '/login'; }, 2000);
            } else {
                // Manejo seguro: intenta leer JSON, si falla, lee texto
                const text = await res.text();
                try {
                    const errorData = JSON.parse(text);
                    setMensaje(`Error: ${errorData.message}`);
                } catch {
                    setMensaje(`Error del servidor: ${res.status}`);
                }
            }
        } catch (error) {
            setMensaje('Error de conexión con el servidor.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
                <h1 className="text-2xl font-bold text-center mb-6 text-slate-800">Registrar Empresa</h1>

                {mensaje && (
                    <div className="mb-4 p-3 bg-blue-50 text-blue-800 rounded text-center text-sm font-medium">
                        {mensaje}
                    </div>
                )}

                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nombre de la Empresa</label>
                        <input required name="nombreComercial" value={formData.nombreComercial} onChange={handleChange} className="w-full mt-1 px-3 py-2 border rounded-md text-black focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Tu Nombre Completo</label>
                        <input required name="nombreCompleto" value={formData.nombreCompleto} onChange={handleChange} className="w-full mt-1 px-3 py-2 border rounded-md text-black focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
                        <input required type="email" name="email" value={formData.email} onChange={handleChange} className="w-full mt-1 px-3 py-2 border rounded-md text-black focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                        <input required type="password" name="password" value={formData.password} onChange={handleChange} className="w-full mt-1 px-3 py-2 border rounded-md text-black focus:ring-blue-500" />
                    </div>

                    <button type="submit" className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 transition font-bold mt-4">
                        Crear Cuenta
                    </button>
                </form>

                <div className="mt-4 text-center">
                    <a href="/login" className="text-sm text-blue-600 hover:underline">¿Ya tienes cuenta? Inicia sesión aquí</a>
                </div>
            </div>
        </div>
    );
}