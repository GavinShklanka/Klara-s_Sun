@echo off
REM KLARA OS — Run system compliance script.
REM Run from cgidatahackathon:  scripts\run_compliance.bat
REM Or:  scripts\run_compliance.bat --live   (requires server on port 8000)

cd /d "%~dp0.."
if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe scripts\run_compliance.py %*
) else if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
    python scripts\run_compliance.py %*
) else (
    python scripts\run_compliance.py %*
)
exit /b %ERRORLEVEL%
