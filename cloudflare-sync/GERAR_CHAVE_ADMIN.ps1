$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$token = [Convert]::ToBase64String($bytes)
Write-Host "Copie esta chave e guarde-a em local privado:" -ForegroundColor Green
Write-Host $token
Write-Host "Nao envie essa chave ao Val e nao coloque no GitHub." -ForegroundColor Yellow
