@echo off
REM ============================================================
REM   SyncroERP - Iniciar entorno de desarrollo
REM   Abre backend y frontend en ventanas separadas
REM ============================================================

echo.
echo   Iniciando SyncroERP...
echo.

REM --- Backend (NestJS) ---
echo   [1/2] Levantando BACKEND  (npm run start:dev)
start "SyncroERP - Backend" cmd /k "cd /d D:\syncroERP\syncroERP\syncro-erp-backend && npm run start:dev"

REM Pequena pausa para que el backend arranque primero
timeout /t 4 /nobreak >nul

REM --- Frontend (Next.js) ---
echo   [2/2] Levantando FRONTEND (npm run dev)
start "SyncroERP - Frontend" cmd /k "cd /d D:\syncroERP\syncroERP\syncro-erp-frontend && npm run dev"

echo.
echo   Listo. Se abrieron dos ventanas:
echo     - SyncroERP - Backend
echo     - SyncroERP - Frontend
echo.
echo   Cierra cada ventana para detener su servidor.
echo   Puedes cerrar esta ventana sin afectar a los servidores.
echo.
pause
