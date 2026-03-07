# KLARA OS — Run system compliance script.
# Run from cgidatahackathon:  .\scripts\run_compliance.ps1
# With live server:           .\scripts\run_compliance.ps1 -Live

param([switch]$Live)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$py = Join-Path $root ".venv\Scripts\python.exe"
if (Test-Path $py) {
    & $py scripts/run_compliance.py @(if ($Live) { "--live" })
} else {
    & python scripts/run_compliance.py @(if ($Live) { "--live" })
}
exit $LASTEXITCODE
