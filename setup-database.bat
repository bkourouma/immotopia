@echo off
echo ========================================
echo   Immobillier - Database Setup
echo ========================================
echo.

REM Check if Node.js is available
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    echo Or add Node.js to your system PATH
    pause
    exit /b 1
)

echo [1/5] Node.js found: 
node --version
npm --version
echo.

REM Navigate to API directory
cd packages\api

REM Check if .env exists
if not exist .env (
    echo [WARNING] .env file not found!
    echo Creating .env from env.example...
    copy env.example .env
    echo.
    echo [IMPORTANT] Please edit .env and set your DATABASE_URL
    echo Example: DATABASE_URL="postgresql://user:password@localhost:5432/immotopia?schema=public"
    echo.
    pause
)

echo [2/5] Generating Prisma client...
call npx prisma generate
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to generate Prisma client
    pause
    exit /b 1
)
echo.

echo [3/5] Running database migrations...
call npx prisma migrate deploy
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Migration deploy failed, trying migrate dev...
    call npx prisma migrate dev --name init
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to run migrations
        pause
        exit /b 1
    )
)
echo.

echo [4/5] Seeding database (main seed)...
call npm run prisma:seed
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to run main seed
    pause
    exit /b 1
)
echo.

echo [5/5] Running additional seed scripts...
echo   - RBAC seed...
call npm run db:seed:rbac
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] RBAC seed failed (may already be seeded)
)

echo   - Geographic seed...
call ts-node prisma\seeds\geographic-seed.ts
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Geographic seed failed (may already be seeded)
)

echo   - Property templates seed...
call ts-node prisma\seeds\property-templates-seed.ts
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Property templates seed failed (may already be seeded)
)

echo   - CRM permissions seed...
call ts-node prisma\seeds\crm-permissions-seed.ts
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] CRM permissions seed failed (may already be seeded)
)

echo   - Property permissions seed...
call ts-node prisma\seeds\property-permissions-seed.ts
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Property permissions seed failed (may already be seeded)
)

echo   - Rental permissions seed...
call ts-node prisma\seeds\rental-permissions-seed.ts
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Rental permissions seed failed (may already be seeded)
)

echo   - Super admin seed...
call ts-node prisma\seeds\create-super-admin.ts
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Super admin seed failed (may already be seeded)
)

cd ..\..

echo.
echo ========================================
echo   Database setup completed!
echo ========================================
echo.
echo   Test accounts created:
echo   - visitor@immobillier.com (Password: Test@123456)
echo   - admin1@agence-mali.com (Password: Test@123456)
echo   - admin2@bamako-immo.com (Password: Test@123456)
echo   - agent@agence-mali.com (Password: Test@123456)
echo   - proprietaire@gmail.com (Password: Test@123456)
echo   - locataire@gmail.com (Password: Test@123456)
echo.
pause


