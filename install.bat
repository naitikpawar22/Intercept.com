@echo off
echo ====================================================================
echo       NetScope / Intercept - Complete Dependency Installer (Windows)
echo ====================================================================
echo.

echo [*] Checking system requirements...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Node.js is not found in PATH!
    echo     Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] npm is not found in PATH!
    pause
    exit /b 1
)

set PY_CMD=
where py >nul 2>nul
if %errorlevel% equ 0 (
    set PY_CMD=py
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set PY_CMD=python
    )
)

if "%PY_CMD%"=="" (
    echo [X] Python was not found in PATH!
    echo     Please install Python from https://www.python.org/
    pause
    exit /b 1
)

echo [1/3] Installing Node.js packages (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo [X] npm install failed!
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Installing Python dependencies (pip install)...
call %PY_CMD% -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [!] Retrying pip install with proxy/requirements.txt...
    call %PY_CMD% -m pip install -r proxy/requirements.txt
)

echo.
echo [3/3] Compiling / Building Application (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo [X] npm run build failed!
    pause
    exit /b %errorlevel%
)

echo.
echo ====================================================================
echo   [SUCCESS] All dependencies installed and application built!
echo ====================================================================
echo   To launch application      : npm start
echo   To run in development mode : npm run dev
echo ====================================================================
pause
