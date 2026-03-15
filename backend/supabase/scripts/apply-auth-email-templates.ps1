param(
  [string]$ProjectRef = "jwozsflxmctizfucwnjz",
  [string]$TokenPath = "C:\\temp\\supabase.token"
)

$ErrorActionPreference = "Stop"

function Read-AccessToken {
  param([string]$Path)

  if ($env:SUPABASE_ACCESS_TOKEN) {
    return $env:SUPABASE_ACCESS_TOKEN.Trim()
  }

  if (Test-Path $Path) {
    $token = (Get-Content $Path -Raw).Trim()
    if ($token) {
      return $token
    }
  }

  throw "Defina SUPABASE_ACCESS_TOKEN ou salve o token em $Path."
}

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$templateDirectory = Join-Path (Split-Path -Parent $scriptDirectory) "auth-templates"

$confirmationTemplate = [System.IO.File]::ReadAllText((Join-Path $templateDirectory "confirmation.html"))
$recoveryTemplate = [System.IO.File]::ReadAllText((Join-Path $templateDirectory "recovery.html"))
$accessToken = Read-AccessToken -Path $TokenPath

$payload = @{
  mailer_subjects_confirmation = "Confirme seu cadastro no Mapa Rede Verde"
  mailer_subjects_recovery = "Redefina sua senha no Mapa Rede Verde"
  mailer_templates_confirmation_content = $confirmationTemplate
  mailer_templates_recovery_content = $recoveryTemplate
} | ConvertTo-Json -Depth 4

$headers = @{
  Authorization = "Bearer $accessToken"
  apikey = $accessToken
  "Content-Type" = "application/json"
}

$endpoint = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"

Invoke-RestMethod -Method Patch -Uri $endpoint -Headers $headers -Body $payload | Out-Null
Write-Host "Templates de e-mail atualizadas para o projeto $ProjectRef."
