# Starts the FastAPI backend and the Vite frontend together (Windows PowerShell).
#
#   .\scripts\dev-all.ps1                 # backend :8000, frontend :5173
#   .\scripts\dev-all.ps1 -BackendPort 8001 -FrontendPort 5180
#
# Assumes the backend repo is a sibling folder named E-Invoice-Backend-system
# (override with -BackendDir) and that its Python environment is active or
# reachable via -Python (default: a venv outside OneDrive at C:\venvs\einvoice).

param(
  [string]$BackendDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "..\E-Invoice-Backend-system"),
  [string]$Python = "C:\venvs\einvoice\Scripts\python.exe",
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

$BackendDir = (Resolve-Path $BackendDir).Path
if (-not (Test-Path $Python)) { $Python = "python" }

Write-Host "Backend : $BackendDir  (http://127.0.0.1:$BackendPort, docs at /docs)"
Write-Host "Frontend: $PSScriptRoot\..  (http://127.0.0.1:$FrontendPort, proxy -> :$BackendPort)"

$backend = Start-Process -PassThru -NoNewWindow -WorkingDirectory $BackendDir -FilePath $Python `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "$BackendPort"

try {
  $env:VITE_PROXY_TARGET = "http://127.0.0.1:$BackendPort"
  Set-Location (Split-Path $PSScriptRoot -Parent)
  npx vite --port $FrontendPort --strictPort
}
finally {
  if ($backend -and -not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
}
