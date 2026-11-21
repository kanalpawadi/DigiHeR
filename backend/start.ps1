# Starts the DigiHeR backend on http://127.0.0.1:8000 using the project's own venv.
# The React dev server forwards /api to it, so phones reach it through Vite.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path .\.venv\Scripts\python.exe)) {
  Write-Host 'Creating virtual environment and installing packages (first run only)...'
  python -m venv .venv
  .\.venv\Scripts\python.exe -m pip install --upgrade pip
  .\.venv\Scripts\python.exe -m pip install -r requirements.txt
}
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
