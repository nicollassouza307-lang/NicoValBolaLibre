$ErrorActionPreference = 'Stop'
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
function New-SecureKey($length = 48) {
  $bytes = New-Object byte[] $length
  $rng.GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
Write-Host ''
Write-Host 'Guarde estas duas chaves em local seguro. Não as publique no GitHub.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'SYNC_READ_TOKEN (usar no computador do Nico e do Val):' -ForegroundColor Cyan
Write-Host (New-SecureKey 48)
Write-Host ''
Write-Host 'SYNC_ADMIN_TOKEN (somente no computador do administrador):' -ForegroundColor Cyan
Write-Host (New-SecureKey 48)
Write-Host ''
$rng.Dispose()
