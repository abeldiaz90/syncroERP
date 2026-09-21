@echo off
setlocal EnableExtensions EnableDelayedExpansion
title SUMA - Inicio completo (Fineract + SyncroERP)

rem ============================================================================
rem  Levanta los dos sistemas de un jalon.
rem
rem  Uso:
rem    INICIAR_TODO.bat              arranca lo que falte, respeta lo ya vivo
rem    INICIAR_TODO.bat /reiniciar   ademas mata lo que ocupe 8443, 4200, 3002, 4000 y 3000
rem
rem  El /reiniciar existe por una razon concreta: si un backend viejo quedo
rem  colgado en el 4000, el nuevo falla al arrancar con EADDRINUSE y la ventana
rem  se cierra tan rapido que parece que si arranco. Es lo que nos paso.
rem
rem  OJO con el backend del ERP: el que sirve es claude\backend (migrado a
rem  Postgres). La carpeta syncro-erp-backend es la foto vieja en SQL Server y
rem  NO se usa.
rem ============================================================================

for %%I in ("%~dp0.") do set "ERP_ROOT=%%~fI"
for %%I in ("%ERP_ROOT%\..\..\fineract") do set "FINERACT_ROOT=%%~fI"
set "FINERACT_BAT=%FINERACT_ROOT%\INICIAR_FINERACT_LOCAL.bat"
set "ERP_BACKEND=%ERP_ROOT%\backend"
set "ERP_FRONTEND=%ERP_ROOT%\frontend"
set "ERP_DB_CONTAINER=syncroerp-postgres"
set "FINERACT_CERT=%FINERACT_ROOT%\fineract-local.crt"

set "REINICIAR="
if /I "%~1"=="/reiniciar" set "REINICIAR=1"

echo.
echo ============================================================
echo   SUMA - INICIO COMPLETO
echo ============================================================
echo   Fineract API : https://localhost:8443
echo   Portal BFF   : http://localhost:3002
echo   Mifos X      : http://localhost:4200
echo   ERP backend  : http://localhost:4000
echo   ERP frontend : http://localhost:3000
if defined REINICIAR echo   Modo         : REINICIAR ^(se liberan 8443, 4200, 3002, 4000 y 3000^)
echo ============================================================
echo.

rem -- Comprobaciones previas --------------------------------------------------
if not exist "%FINERACT_BAT%" (
    echo [ERROR] No se encontro %FINERACT_BAT%
    pause & exit /b 1
)
if not exist "%ERP_BACKEND%\package.json" (
    echo [ERROR] No se encontro %ERP_BACKEND%\package.json
    pause & exit /b 1
)
if not exist "%ERP_FRONTEND%\package.json" (
    echo [ERROR] No se encontro %ERP_FRONTEND%\package.json
    pause & exit /b 1
)

rem Guardia contra el error que ya cometimos una vez.
findstr /C:"type: 'postgres'" "%ERP_BACKEND%\src\app.module.ts" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] %ERP_BACKEND% no es el backend migrado a Postgres.
    echo         Revisa que ERP_ROOT apunte a la carpeta correcta.
    pause & exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 ( echo [ERROR] npm no esta en PATH. & pause & exit /b 1 )
where docker >nul 2>&1
if errorlevel 1 ( echo [ERROR] docker no esta en PATH. & pause & exit /b 1 )

rem -- 1. Fineract (reusa tu script, no lo duplico) ----------------------------
echo [1/4] Levantando Fineract, Portal y Mifos X...
echo       ^(se delega en INICIAR_FINERACT_LOCAL.bat para no tener dos verdades^)
rem El /reiniciar se propaga: si no, INICIAR_TODO /reiniciar liberaba 3000 y 4000
rem pero dejaba vivo un Fineract colgado en 8443, que es justo lo que uno quiere
rem tirar cuando escribe /reiniciar.
if defined REINICIAR (
    call "%FINERACT_BAT%" /reiniciar
) else (
    call "%FINERACT_BAT%"
)
if errorlevel 1 (
    echo [ERROR] El arranque de Fineract fallo. No sigo con el ERP.
    pause & exit /b 1
)
echo [OK] Fineract lanzado.
echo.

rem -- 2. Postgres del ERP -----------------------------------------------------
echo [2/4] Postgres del ERP (%ERP_DB_CONTAINER%)...
docker inspect "%ERP_DB_CONTAINER%" >nul 2>&1
if errorlevel 1 (
    echo [INFO] El contenedor no existe. Creandolo con docker compose...
    pushd "%ERP_ROOT%"
    docker compose -f docker-compose.postgres.yml up -d
    set "COMPOSE_ERR=!errorlevel!"
    popd
    if not "!COMPOSE_ERR!"=="0" (
        echo [ERROR] docker compose no pudo crear %ERP_DB_CONTAINER%.
        pause & exit /b 1
    )
) else (
    for /f %%S in ('docker inspect -f "{{.State.Running}}" "%ERP_DB_CONTAINER%" 2^>nul') do set "ERP_DB_RUNNING=%%S"
    if /I not "!ERP_DB_RUNNING!"=="true" (
        echo [INFO] Iniciando %ERP_DB_CONTAINER%...
        docker start "%ERP_DB_CONTAINER%" >nul
    )
)

echo [INFO] Esperando Postgres del ERP...
set "ERP_DB_READY="
for /L %%I in (1,1,30) do (
    docker exec "%ERP_DB_CONTAINER%" pg_isready >nul 2>&1
    if not errorlevel 1 (
        set "ERP_DB_READY=1"
        goto :erp_db_ready
    )
    timeout /t 1 /nobreak >nul
)
:erp_db_ready
if not defined ERP_DB_READY (
    echo [ERROR] Postgres del ERP no quedo listo.
    pause & exit /b 1
)
echo [OK] Postgres del ERP disponible en 55432.
echo.

rem -- 3. Liberar puertos si se pidio ------------------------------------------
if defined REINICIAR (
    echo [3/4] Liberando puertos 4000 y 3000...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
      "foreach ($p in 4000,3000) { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; if ($c) { $c.OwningProcess | Select-Object -Unique | ForEach-Object { try { $n=(Get-Process -Id $_ -ErrorAction Stop).ProcessName; Stop-Process -Id $_ -Force; Write-Host ('[OK] Puerto ' + $p + ' liberado (' + $n + ' PID ' + $_ + ')') -ForegroundColor Green } catch {} } } else { Write-Host ('[INFO] Puerto ' + $p + ' ya estaba libre') -ForegroundColor DarkGray } }"
    timeout /t 2 /nobreak >nul
) else (
    echo [3/4] Sin /reiniciar: se respeta lo que ya este escuchando.
)
echo.

rem -- 4. Backend y frontend del ERP -------------------------------------------
echo [4/4] Abriendo ERP...

start "ERP Backend 4000" powershell.exe -NoExit -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference='Stop'; $env:TZ='UTC'; Set-Location '%ERP_BACKEND%'; if (Test-Path '%FINERACT_CERT%') { $env:NODE_EXTRA_CA_CERTS='%FINERACT_CERT%'; Write-Host '[OK] Node confiara en el certificado de Fineract.' -ForegroundColor Green } else { Write-Host '[AVISO] Falta %FINERACT_CERT%; las llamadas a Fineract fallaran por TLS.' -ForegroundColor Yellow }; if (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) { Write-Host '[INFO] El puerto 4000 ya esta ocupado. No se inicia otro backend.' -ForegroundColor Yellow; Write-Host '       Si querias recargar codigo nuevo, cierra eso y usa INICIAR_TODO.bat /reiniciar' -ForegroundColor Yellow } else { if (-not (Test-Path 'node_modules')) { Write-Host '[INFO] Instalando dependencias del backend...' -ForegroundColor Cyan; npm.cmd install; if ($LASTEXITCODE -ne 0) { throw 'Fallo npm install del backend.' } }; Write-Host '[INFO] Backend en modo watch. Busca la linea: Mapped {/integracion/estado, GET}' -ForegroundColor Cyan; npm.cmd run start:dev }"

start "ERP Frontend 3000" powershell.exe -NoExit -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference='Stop'; Set-Location '%ERP_FRONTEND%'; if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { Write-Host '[INFO] El puerto 3000 ya esta ocupado. No se inicia otro frontend.' -ForegroundColor Yellow } else { if (-not (Test-Path 'node_modules')) { Write-Host '[INFO] Instalando dependencias del frontend...' -ForegroundColor Cyan; npm.cmd install; if ($LASTEXITCODE -ne 0) { throw 'Fallo npm install del frontend.' } }; Write-Host '[INFO] Frontend en http://localhost:3000 ...' -ForegroundColor Cyan; npm.cmd run dev }"

echo.
echo ============================================================
echo   Todo lanzado. Ventanas abiertas:
echo     Fineract Backend 8443 . Portal 3002 . Mifos X 4200
echo     ERP Backend 4000 . ERP Frontend 3000
echo.
echo   COMPROBACION RAPIDA
echo     El backend del ERP cargo bien si en su ventana aparece
echo     la linea:  Mapped {/integracion/estado, GET}
echo     y si esta URL responde 401 y no 404:
echo       http://localhost:4000/integracion/estado
echo.
echo   NOTA: mientras Fineract corra en Windows, schema_server del
echo   tenant queda en localhost. No lo cambies a 'db' en esta sesion.
echo ============================================================
echo.
echo Puedes cerrar esta ventana; los servicios siguen abiertos.
timeout /t 6 /nobreak >nul
exit /b 0
