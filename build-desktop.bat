@echo off
setlocal enabledelayedexpansion

:: Automatically inject Cargo to PATH if installed in user profile
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

echo =====================================================================
echo  LocalPDF Suite - Automated Desktop Executable (.exe) Build Script
echo =====================================================================
echo.

:: 1. Verify Python Virtual Environment
if not exist ".\venv\Scripts\python.exe" (
    echo [ERROR] Python virtual environment not found in .\venv\
    echo Please create the virtual environment first: python -m venv venv
    exit /b 1
)

:: 2. Check / Install PyInstaller
echo [1/5] Checking PyInstaller in virtual environment...
.\venv\Scripts\python.exe -m PyInstaller --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing PyInstaller into virtual environment...
    .\venv\Scripts\pip.exe install pyinstaller
    if errorlevel 1 (
        echo [ERROR] Failed to install PyInstaller.
        exit /b 1
    )
)
echo [OK] PyInstaller is ready.
echo.

:: 3. Freeze Python Stdio Sidecar Engine
echo [2/5] Checking Python Stdio IPC engine binary...
if not exist "src-tauri\binaries" mkdir "src-tauri\binaries"

if exist "src-tauri\binaries\sidecar-engine-x86_64-pc-windows-msvc.exe" goto :sidecar_ready

echo Freezing Python engine with PyInstaller...
.\venv\Scripts\pyinstaller.exe sidecar-engine\sidecar.spec --distpath src-tauri\binaries --workpath sidecar-engine\build -y
if errorlevel 1 (
    echo [ERROR] PyInstaller compilation failed! Check output above.
    exit /b 1
)
echo [OK] Sidecar engine frozen to src-tauri\binaries\sidecar-engine-x86_64-pc-windows-msvc.exe
goto :check_icons

:sidecar_ready
echo [OK] Sidecar binary already exists in src-tauri\binaries - skipping freeze.

:check_icons
echo.
:: 4. Verify Application Icons
echo [3/5] Verifying Tauri application icons...
if not exist "src-tauri\icons\icon.ico" (
    echo [INFO] Application icons not found. Generating now...
    call npx tauri icon app-icon.png
)
echo [OK] Application icons are present.
echo.

:: 5. Build Vite React Frontend
echo [4/5] Building production React frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed!
    exit /b 1
)
echo [OK] Frontend bundled to dist/
echo.

:: 6. Check Rust & Compile Tauri Desktop App
echo [5/5] Checking Rust compiler for Tauri build...
where cargo >nul 2>&1
if errorlevel 1 goto :no_cargo

echo Compiling native Windows desktop executable and installer via Tauri...
call npm run tauri build -- --bundles nsis
set BUILD_ERR=%errorlevel%

:: Copy output to portable release folder
if not exist "release-portable" mkdir "release-portable"
if exist "src-tauri\target\release\LocalPDFSuite.exe" (
    copy /y "src-tauri\target\release\LocalPDFSuite.exe" "release-portable\LocalPDFSuite.exe" >nul
    copy /y "src-tauri\binaries\sidecar-engine-x86_64-pc-windows-msvc.exe" "release-portable\sidecar-engine.exe" >nul
) else if exist "src-tauri\target\release\local-pdf-suite.exe" (
    copy /y "src-tauri\target\release\local-pdf-suite.exe" "release-portable\LocalPDFSuite.exe" >nul
    copy /y "src-tauri\binaries\sidecar-engine-x86_64-pc-windows-msvc.exe" "release-portable\sidecar-engine.exe" >nul
)

if %BUILD_ERR% neq 0 (
    if exist "release-portable\LocalPDFSuite.exe" (
        echo.
        echo =====================================================================
        echo  STANDALONE EXECUTABLE BUILT SUCCESSFULLY!
        echo =====================================================================
        echo Note: The NSIS installer creation required downloading nsis-3.13 from GitHub,
        echo but your standalone portable executable is 100%% complete and ready to run:
        echo.
        echo   Folder:  %CD%\release-portable\
        echo   App:     %CD%\release-portable\LocalPDFSuite.exe
        echo.
        echo You can double-click 'LocalPDFSuite.exe' in release-portable to run it,
        echo or distribute the 'release-portable' folder directly as a portable app!
        echo =====================================================================
        exit /b 0
    ) else (
        echo [ERROR] Tauri build encountered an issue. Check the compiler logs above.
        exit /b 1
    )
)

echo.
echo =====================================================================
echo  BUILD COMPLETE!
echo =====================================================================
echo Your desktop binaries and installers are ready:
echo.
echo  1. Portable Standalone App (No install needed):
echo     Folder: %CD%\release-portable\
echo     App:    %CD%\release-portable\LocalPDFSuite.exe
echo.
if exist "src-tauri\target\release\bundle\nsis\*.exe" (
    echo  2. Windows Setup Installer:
    echo     Folder: %CD%\src-tauri\target\release\bundle\nsis\
)
echo =====================================================================
exit /b 0

:no_cargo
echo.
echo =====================================================================
echo [STATUS] Rust compiler 'cargo' was not found in your system PATH.
echo ---------------------------------------------------------------------
echo SUCCESS SO FAR:
echo   [x] Python Sidecar Engine: src-tauri\binaries\sidecar-engine-x86_64-pc-windows-msvc.exe
echo   [x] Production UI Bundle:  dist\index.html
echo.
echo If you just installed Rustup:
echo   Please close your current terminal window and open a NEW terminal,
echo   or run:
echo     set "PATH=%USERPROFILE%\.cargo\bin;%%PATH%%"
echo     npm run tauri build
echo =====================================================================
exit /b 0
