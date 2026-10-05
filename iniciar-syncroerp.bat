@echo off
REM ============================================================
REM   SyncroERP - Iniciar entorno de desarrollo
REM   Abre backend y frontend en ventanas separadas
REM
REM   ── CORREGIDO EL 6-OCT-2026 ──────────────────────────────
REM   Este archivo apuntaba a D:\syncroERP\syncroERP\, que es
REM   una copia del 3 de julio: 174 archivos, tres pruebas y
REM   SIN modulo de integracion con Fineract.
REM
REM   El codigo vivo es D:\SUMA\erpfineract\syncroERP\claude\:
REM   801 archivos, 29 modulos, 239 archivos de prueba.
REM
REM   Quien abriera el archivo anterior levantaba el ERP de
REM   julio y depuraba defectos que ya no existen.
REM ============================================================

set RAIZ=D:\SUMA\erpfineract\syncroERP\claude

echo.
echo   Iniciando SyncroERP desde %RAIZ%
echo.

if not exist "%RAIZ%\backend\package.json" (
  echo   [ERROR] No existe %RAIZ%\backend
  echo           Revisa la ruta antes de seguir: este archivo ya apunto
  echo           una vez a una copia vieja y nadie lo noto.
  pause
  exit /b 1
)
if not exist "%RAIZ%\frontend\package.json" (
  echo   [ERROR] No existe %RAIZ%\frontend
  pause
  exit /b 1
)

REM --- Backend (NestJS) ---
echo   [1/2] Levantando BACKEND  (npm run start:dev)
start "SyncroERP - Backend" cmd /k "cd /d %RAIZ%\backend && npm run start:dev"

REM Pequena pausa para que el backend arranque primero
timeout /t 4 /nobreak >nul

REM --- Frontend (Next.js) ---
echo   [2/2] Levantando FRONTEND (npm run dev)
start "SyncroERP - Frontend" cmd /k "cd /d %RAIZ%\frontend && npm run dev"

echo.
echo   Listo. Se abrieron dos ventanas:
echo     - SyncroERP - Backend
echo     - SyncroERP - Frontend
echo.
echo   Cierra cada ventana para detener su servidor.
echo   Puedes cerrar esta ventana sin afectar a los servidores.
echo.
pause
