@echo off
setlocal

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

echo [1/6] Node.js found:
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

echo [2/6] Generating Prisma client...
call npx prisma generate
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to generate Prisma client
    pause
    exit /b 1
)
echo.

echo [3/6] Running database migrations...
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

REM RBAC must run BEFORE the main seed: the main seed looks up TENANT_ADMIN /
REM TENANT_AGENT to attach the demo accounts to their tenant. Without roles in
REM place, admin1/admin2/agent end up with no permission at all.
echo [4/6] Seeding RBAC roles and permissions...
call npm run db:seed:rbac
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to run RBAC seed
    pause
    exit /b 1
)
echo.

echo [5/6] Seeding demo users and tenants...
echo.
echo   [WARNING] The main seed DELETES every user, tenant and all cascading
echo             data on the database pointed to by DATABASE_URL.
echo.
if /I "%~1"=="--yes" goto :run_main_seed
set "CONFIRM="
set /p "CONFIRM=  Type YES to continue (anything else aborts): "
if /I not "%CONFIRM%"=="YES" (
    echo.
    echo [ABORTED] Main seed skipped. Schema and RBAC are in place.
    cd ..\..
    exit /b 0
)

:run_main_seed
set ALLOW_DESTRUCTIVE_SEED=1
call npm run db:seed
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to run main seed
    pause
    exit /b 1
)
set ALLOW_DESTRUCTIVE_SEED=
echo.

echo [6/6] Running additional seed scripts...

echo   - Geographic seed...
call npm run db:seed:geographic
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Geographic seed failed (may already be seeded)
)

echo   - Property templates seed...
call npm run db:seed:property-templates
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Property templates seed failed (may already be seeded)
)

echo   - Document templates seed...
call npm run db:seed:document-templates
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Document templates seed failed (may already be seeded)
)

echo   - Super admin seed...
call npm run db:seed:super-admin
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
echo   - admin1@agence-mali.com (Password: Test@123456) - TENANT_ADMIN
echo   - admin2@bamako-immo.com (Password: Test@123456) - TENANT_ADMIN
echo   - agent@agence-mali.com (Password: Test@123456) - TENANT_AGENT
echo   - proprietaire@gmail.com (Password: Test@123456)
echo   - locataire@gmail.com (Password: Test@123456)
echo   - admin@immobillier.com (Password: Admin@123456) - SUPER_ADMIN
echo.
echo   Optional demo data:
echo     cd packages\api
echo     npm run db:seed:comprehensive    (properties, leases, CRM contacts)
echo     npm run db:seed:tenant-members   (extra managers and agents)
echo     npm run db:seed:maintenance      (maintenance tickets)
echo.
pause
