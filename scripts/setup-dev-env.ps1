<#
.SYNOPSIS
  Prepare l'environnement de developpement ImmoTopia (PowerShell, Windows).

.DESCRIPTION
  1. Cree packages/api/.env et apps/web/.env a partir des env.example, sans jamais
     ecraser une valeur deja renseignee (sauf -Force).
  2. Genere JWT_SECRET, REFRESH_TOKEN_SECRET et PAYMENT_SECRETS_KEY (aleatoires).
  3. Demarre PostgreSQL via Docker (docker compose up -d db) et cree la base de test.
  4. Installe les dependances si besoin, genere le client Prisma, applique les migrations.
  5. Seeds NON destructifs (roles/permissions, referentiel geographique, catalogue des offres).
  6. Optionnel : compte super-admin (-WithSuperAdmin).

  Ce script ne lance JAMAIS `npm run db:seed` (il efface les utilisateurs).
  Les secrets generes ne sont jamais affiches.

.PARAMETER SkipDocker     Ne pas demarrer Docker (vous fournissez deja un PostgreSQL : renseignez -DatabaseUrl).
.PARAMETER DatabaseUrl    URL PostgreSQL a utiliser (defaut : la base du docker-compose).
.PARAMETER WebPort        Port du serveur web de developpement (defaut 3002, reglage de ce poste).
.PARAMETER SkipSeed       Ne lancer aucun seed.
.PARAMETER SkipGenerate   Ne pas lancer prisma generate (client deja a jour, ou moteur Prisma verrouille).
.PARAMETER WithSuperAdmin Creer/mettre a jour un compte super-admin (email et mot de passe demandes).
.PARAMETER Force          Regenerer les secrets et reecrire les valeurs meme si elles existent deja.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup-dev-env.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup-dev-env.ps1 -WithSuperAdmin
#>
[CmdletBinding()]
param(
  [switch]$SkipDocker,
  [string]$DatabaseUrl = '',
  [int]$WebPort = 3002,
  [switch]$SkipSeed,
  [switch]$SkipGenerate,
  [switch]$WithSuperAdmin,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ApiEnv = Join-Path $Root 'packages\api\.env'
$ApiExample = Join-Path $Root 'packages\api\env.example'
$WebEnv = Join-Path $Root 'apps\web\.env'
$WebExample = Join-Path $Root 'apps\web\env.example'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Step([string]$text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Ok([string]$text) { Write-Host "    OK  $text" -ForegroundColor Green }
function Info([string]$text) { Write-Host "    ..  $text" -ForegroundColor Gray }
function Fail([string]$text) { Write-Host "    ERREUR  $text" -ForegroundColor Red; exit 1 }

function Require-Command([string]$name, [string]$hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { Fail "'$name' est introuvable. $hint" }
}

function New-RandomHex([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return ([System.BitConverter]::ToString($buffer) -replace '-', '').ToLower()
}

function New-RandomBase64([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return [System.Convert]::ToBase64String($buffer)
}

function Read-EnvLines([string]$path) { return [System.IO.File]::ReadAllText($path).Replace("`r`n", "`n").Split("`n") }

# Pose KEY=valeur dans un fichier .env. Une valeur deja renseignee est conservee (sauf -Force).
# Retourne $true si la valeur a ete (re)ecrite.
function Set-EnvValue([string]$path, [string]$key, [string]$value, [bool]$quoted = $true) {
  $lines = [System.Collections.Generic.List[string]](Read-EnvLines $path)
  $formatted = if ($quoted) { "$key=`"$value`"" } else { "$key=$value" }
  $pattern = '^\s*' + [regex]::Escape($key) + '\s*=(.*)$'
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $pattern) {
      $current = $Matches[1].Trim().Trim('"').Trim("'")
      if ($current -ne '' -and -not $Force) { return $false }
      $lines[$i] = $formatted
      [System.IO.File]::WriteAllText($path, ($lines -join "`r`n"), $Utf8NoBom)
      return $true
    }
  }
  $lines.Add($formatted)
  [System.IO.File]::WriteAllText($path, ($lines -join "`r`n"), $Utf8NoBom)
  return $true
}

function Run([string]$label, [scriptblock]$command) {
  Info $label
  & $command
  if ($LASTEXITCODE -ne 0) { Fail "'$label' a echoue (code $LASTEXITCODE)." }
}

# ------------------------------------------------------------------ prerequis
Step 'Verification des outils'
Require-Command 'node' 'Installez Node.js 20 ou plus.'
Require-Command 'npm' 'Installez Node.js (npm est inclus).'
if (-not $SkipDocker) { Require-Command 'docker' 'Installez Docker Desktop, ou relancez avec -SkipDocker -DatabaseUrl "postgresql://...".' }
if (-not $SkipDocker) {
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fail "Docker est installe mais ne repond pas : lancez Docker Desktop, attendez qu'il soit pret (icone verte), puis relancez le script." }
}
Ok 'outils presents'

# ------------------------------------------------------------------ fichiers .env
Step 'Fichiers .env'
if (-not (Test-Path $ApiExample)) { Fail "Introuvable : $ApiExample" }
if (-not (Test-Path $WebExample)) { Fail "Introuvable : $WebExample" }
if (-not (Test-Path $ApiEnv)) { Copy-Item $ApiExample $ApiEnv; Ok 'packages\api\.env cree depuis env.example' } else { Info 'packages\api\.env existe deja : valeurs deja renseignees conservees' }
if (-not (Test-Path $WebEnv)) { Copy-Item $WebExample $WebEnv; Ok 'apps\web\.env cree depuis env.example' } else { Info 'apps\web\.env existe deja : valeurs deja renseignees conservees' }

$dbUser = 'immotopia'; $dbPass = 'immotopia'; $dbName = 'immotopia'; $dbTest = 'immotopia_test'; $dbPort = 5432
if ($DatabaseUrl -ne '') {
  $mainUrl = $DatabaseUrl
  $testUrl = ''
} else {
  $mainUrl = "postgresql://${dbUser}:${dbPass}@localhost:${dbPort}/${dbName}?schema=public"
  $testUrl = "postgresql://${dbUser}:${dbPass}@localhost:${dbPort}/${dbTest}?schema=public"
}

if (Set-EnvValue $ApiEnv 'JWT_SECRET' (New-RandomHex 48)) { Ok 'JWT_SECRET genere' } else { Info 'JWT_SECRET deja renseigne' }
if (Set-EnvValue $ApiEnv 'REFRESH_TOKEN_SECRET' (New-RandomHex 48)) { Ok 'REFRESH_TOKEN_SECRET genere' } else { Info 'REFRESH_TOKEN_SECRET deja renseigne' }
if (Set-EnvValue $ApiEnv 'PAYMENT_SECRETS_KEY' (New-RandomBase64 32)) { Ok 'PAYMENT_SECRETS_KEY genere' } else { Info 'PAYMENT_SECRETS_KEY deja renseigne' }
if (Set-EnvValue $ApiEnv 'DATABASE_URL' $mainUrl) { Ok 'DATABASE_URL ecrit' } else { Info 'DATABASE_URL deja renseigne' }
if ($testUrl -ne '') {
  if (Set-EnvValue $ApiEnv 'DATABASE_URL_TEST' $testUrl) { Ok 'DATABASE_URL_TEST ecrit (base de test dediee)' } else { Info 'DATABASE_URL_TEST deja renseigne' }
}
$front = "http://localhost:$WebPort"
if (Set-EnvValue $ApiEnv 'FRONTEND_URL' $front) { Ok "FRONTEND_URL = $front" } else { Info 'FRONTEND_URL deja renseigne' }
if (Set-EnvValue $WebEnv 'PORT' "$WebPort" $false) { Ok "PORT web = $WebPort" } else { Info 'PORT web deja renseigne' }

# ------------------------------------------------------------------ base de donnees
if (-not $SkipDocker) {
  Step 'PostgreSQL (Docker)'
  # docker-compose.yml exige JWT_SECRET pour le service `api` (non demarre ici) : une valeur
  # jetable, limitee a ce processus, evite le refus d'interpolation. Jamais ecrite sur disque.
  $tempJwt = $false
  if (-not $env:JWT_SECRET) { $env:JWT_SECRET = New-RandomHex 32; $tempJwt = $true }
  try { Run 'docker compose up -d db' { docker compose up -d db } }
  finally { if ($tempJwt) { Remove-Item Env:JWT_SECRET -ErrorAction SilentlyContinue } }
  Info 'attente de la base (30 s max)...'
  $healthy = $false
  for ($i = 0; $i -lt 30; $i++) {
    $status = (docker inspect --format '{{.State.Health.Status}}' immotopia-db 2>$null)
    if ($status -eq 'healthy') { $healthy = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $healthy) { Fail "La base ne repond pas. Voir : docker logs immotopia-db" }
  Ok 'PostgreSQL pret'
  $exists = (docker exec immotopia-db psql -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbTest'" 2>$null)
  if ("$exists".Trim() -ne '1') {
    Run "creation de la base de test $dbTest" { docker exec immotopia-db psql -U $dbUser -d postgres -c "CREATE DATABASE $dbTest" }
  } else { Info "base de test $dbTest deja presente" }
}

# ------------------------------------------------------------------ dependances et schema
Step 'Dependances et schema'
if (-not (Test-Path (Join-Path $Root 'node_modules\.bin'))) {
  Run 'npm install (a la racine)' { npm install --no-audit --no-fund }
} else { Info 'node_modules present (npm install saute)' }
if (-not $SkipGenerate) {
  Info 'prisma generate'
  npm run prisma:generate -w '@immotopia/api'
  if ($LASTEXITCODE -ne 0) {
    Write-Host '    ERREUR  prisma generate a echoue. Cause la plus frequente (EPERM sur query_engine) :' -ForegroundColor Red
    Write-Host "            un processus Node utilise encore le moteur Prisma (npm run dev, tests, autre session)." -ForegroundColor Red
    Write-Host "            Arretez-les (Ctrl+C dans leurs terminaux), puis relancez le script." -ForegroundColor Red
    Write-Host "            Si le client Prisma est deja a jour, relancez avec -SkipGenerate." -ForegroundColor Red
    exit 1
  }
}
Run 'prisma migrate deploy' { npx prisma migrate deploy --schema packages/api/prisma/schema.prisma }
Ok 'schema applique'

# ------------------------------------------------------------------ seeds non destructifs
if (-not $SkipSeed) {
  Step 'Donnees de base (seeds non destructifs)'
  Run 'roles et permissions (db:seed:rbac)' { npm run db:seed:rbac -w '@immotopia/api' }
  Run 'referentiel geographique (db:seed:geographic)' { npm run db:seed:geographic -w '@immotopia/api' }
  Run 'catalogue des offres (db:seed:catalog --missing-only)' { npm run db:seed:catalog -w '@immotopia/api' -- --missing-only }
  Ok 'seeds termines'
}

if ($WithSuperAdmin) {
  Step 'Compte super-admin'
  $email = Read-Host 'Email du super-admin'
  $secure = Read-Host 'Mot de passe (8 caracteres minimum)' -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ($plain.Length -lt 8) { Fail 'Mot de passe trop court.' }
    $env:SUPER_ADMIN_EMAIL = $email
    $env:SUPER_ADMIN_PASSWORD = $plain
    Run 'creation du super-admin' { npm run db:seed:super-admin -w '@immotopia/api' }
  } finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    Remove-Item Env:SUPER_ADMIN_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:SUPER_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  }
  Ok 'super-admin pret'
}

Step 'Termine'
Write-Host "    Lancer l'application : npm run dev   (API 8001, web $WebPort)" -ForegroundColor Green
Write-Host "    Tests d'isolation    : npm run test:isolation -w @immotopia/api" -ForegroundColor Gray
