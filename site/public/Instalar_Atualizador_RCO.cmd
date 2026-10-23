@echo off
setlocal
set "RCO_SCRIPT=%~f0"
powershell.exe -NoProfile -Command "& { $raw = [IO.File]::ReadAllText($env:RCO_SCRIPT, [Text.Encoding]::UTF8); $code = ($raw -split '(?m)^# RCO-POWERSHELL\r?$', 2)[1]; & ([ScriptBlock]::Create($code)) }"
exit /b %errorlevel%
# RCO-POWERSHELL
# Embedded in the one-time installer and local scheduled runner; Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$origin = 'https://rco-manutencao.fernandorosa-mb.chatgpt.site'
$root = Join-Path $env:LOCALAPPDATA 'RCO_IMAS'
$live = Join-Path $root 'Extensao_IMAS'
$runner = Join-Path $root 'Atualizar_RCO.cmd'
$install = [IO.Path]::GetFullPath($env:RCO_SCRIPT) -ne [IO.Path]::GetFullPath($runner)
$allowed = @('INSTALAR.txt','background.js','imas.js','manifest.json','popup.html','popup.js','rco.js','schedule.js','update.js')
New-Item -ItemType Directory -Path $root -Force | Out-Null
$log = Join-Path $root 'atualizacao.log'
function Write-Log([string]$message) {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 524288) { Move-Item $log ($log + '.anterior') -Force }
  Add-Content -LiteralPath $log -Value (('{0:u} {1}' -f (Get-Date), $message)) -Encoding UTF8
}
function Download([string]$path,[string]$destination) {
  # Fixed origin and locally approved paths only. Reject redirects to other origins.
  if ($path -notmatch '^/(extension-release\.json|extension-source/[a-zA-Z0-9._-]+)$') { throw 'Endereco de atualizacao invalido.' }
  Invoke-WebRequest -UseBasicParsing -Uri ($origin + $path + '?nocache=' + [DateTime]::UtcNow.Ticks) -OutFile $destination -MaximumRedirection 0 -TimeoutSec 30
}
$lock = $null
$stage = $null
try {
  try { $lock = [IO.File]::Open((Join-Path $root 'update.lock'), 'OpenOrCreate', 'ReadWrite', 'None') } catch { exit 0 }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $releasePath = Join-Path $root 'release.tmp.json'
  Download '/extension-release.json' $releasePath
  $release = Get-Content -LiteralPath $releasePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($release.mode -ne 'validation' -or $release.saveAllowed -ne $false) { throw 'Atualizacao com gravacao bloqueada ate validacao completa.' }
  if ($release.version -notmatch '^\d+\.\d+\.\d+$' -or $release.releaseId -notmatch '^[a-f0-9]{64}$') { throw 'Identificacao de versao invalida.' }
  $names = @($release.files | ForEach-Object { $_.name })
  if (@($names | Select-Object -Unique).Count -ne $allowed.Count -or $names.Count -ne $allowed.Count -or @($allowed | Where-Object { $_ -notin $names }).Count -ne 0) { throw 'Lista de arquivos inesperada.' }
  foreach ($file in $release.files) {
    if ($file.name -notin $allowed -or $file.path -ne ('/extension-source/' + $file.name + '.bin') -or $file.sha256 -notmatch '^[a-f0-9]{64}$' -or $file.size -le 0 -or $file.size -gt 524288) { throw 'Arquivo fora do pacote aprovado. Baixe o instalador atualizado.' }
  }
  $statePath = Join-Path $live 'update-state.json'
  $current = $null
  if (Test-Path $statePath) { try { $current = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {} }
  if (-not $current -or $current.releaseId -ne $release.releaseId) {
    if ($current -and [version]$release.version -le [version]$current.version) { throw 'Versao antiga ou numero de versao repetido. Pasta atual preservada.' }
    $stage = Join-Path $root ('stage-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage | Out-Null
    foreach ($file in $release.files) {
      $target = Join-Path $stage $file.name
      Download $file.path $target
      $receivedSize = (Get-Item -LiteralPath $target).Length
      $receivedHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($receivedSize -ne $file.size -or $receivedHash -ne $file.sha256) { throw ('Arquivo incompleto ou divergente: ' + $file.name + '. Esperado: ' + $file.size + ' bytes; recebido: ' + $receivedSize + ' bytes. SHA256 recebido: ' + $receivedHash) }
    }
    $manifest = Get-Content -LiteralPath (Join-Path $stage 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.version -ne $release.version -or $manifest.manifest_version -ne 3) { throw 'Manifesto divergente.' }
    $permissions = @('alarms','debugger','downloads','scripting','storage','tabs')
    if ((($manifest.permissions | Sort-Object) -join ',') -ne ($permissions -join ',')) { throw 'Novas permissoes precisam de revisao. Atualizacao bloqueada.' }
    $hosts = @(($origin + '/*'),'https://admin.rcoengenharia.com/*') | Sort-Object
    if ((($manifest.host_permissions | Sort-Object) -join ',') -ne ($hosts -join ',')) { throw 'Destino adicional nao autorizado.' }
    $manifestHash = ($release.files | Where-Object { $_.name -eq 'manifest.json' }).sha256
    @{version=$release.version;releaseId=$release.releaseId;manifestHash=$manifestHash;mode='validation';saveAllowed=$false;updatedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'update-state.json') -Encoding UTF8
    $backup = Join-Path $root 'Anterior'
    if (Test-Path $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
    if (Test-Path $live) { [IO.Directory]::Move($live,$backup) }
    try { [IO.Directory]::Move($stage,$live); $stage = $null } catch { if ((Test-Path $backup) -and -not (Test-Path $live)) { [IO.Directory]::Move($backup,$live) }; throw }
    Write-Log ('Arquivos atualizados para ' + $release.version + '. Gravacao IMAS bloqueada.')
  }
  if ($install) {
    Copy-Item -LiteralPath $env:RCO_SCRIPT -Destination $runner -Force
    # Per-user, interactive logon, limited privileges. No passwords stored or administrator elevation.
    $taskName = 'RCO Atualizar Extensao'
    $action = 'cmd.exe /d /c "' + $runner + '"'
    & schtasks.exe /Create /SC MINUTE /MO 5 /TN $taskName /TR $action /IT /RL LIMITED /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'O Windows nao permitiu registrar o atualizador. Os arquivos foram baixados, mas a atualizacao automatica ainda nao foi instalada.' }
    Write-Log 'Atualizador registrado a cada 5 minutos.'
    Write-Host ''
    Write-Host 'ATUALIZADOR INSTALADO/ATUALIZADO. Se a extensao ja existe, clique em RECARREGAR no Chrome.'
    Write-Host $live
    Write-Host 'chrome://extensions > RCO > Recarregar. Somente na primeira instalacao: Carregar sem compactacao.'
    Write-Host 'As proximas versoes serao sincronizadas nesta mesma pasta.'
    Start-Process explorer.exe -ArgumentList $live
  }
} catch {
  Write-Log ('FALHA: ' + $_.Exception.Message)
  if ($install) { Write-Host ('FALHA: ' + $_.Exception.Message) -ForegroundColor Red }
  exit 1
} finally {
  if ($stage -and (Test-Path $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force }
  if ($lock) { $lock.Dispose() }
  if ($install) { Read-Host 'Pressione ENTER para fechar' | Out-Null }
}
