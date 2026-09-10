$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$base64 = [Convert]::ToBase64String($bytes)
Write-Host "Agrega al .env del backend:" -ForegroundColor Cyan
Write-Host "NOMINA_DATA_ENCRYPTION_KEY=$base64"
Write-Host "Guarda esta clave en un gestor de secretos. Si se pierde, no podrán descifrarse las cuentas bancarias." -ForegroundColor Yellow
