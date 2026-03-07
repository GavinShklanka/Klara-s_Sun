@echo off
REM KLARA OS — Run trial script (all features).
REM From cgidatahackathon:  scripts\run_trial.bat
REM With live server:       scripts\run_trial.bat --live

cd /d "%~dp0.."
if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe scripts\run_trial.py %*
) else (
    python scripts\run_trial.py %*
)
exit /b %ERRORLEVEL%
