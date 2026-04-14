$ErrorActionPreference = "Continue"
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUNBUFFERED = "1"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$python = "python"

Write-Host "1. Running assign_vehicle_status.py..."
& $python -X utf8 -u Army_ML_Pipeline_and_Files\assign_vehicle_status.py > Army_ML_Pipeline_and_Files\assign_vehicle_status.log 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "Error in assign_vehicle_status.py"; exit $LASTEXITCODE }

Write-Host "2. Running feature_engineering.py..."
& $python -X utf8 -u Army_ML_Pipeline_and_Files\feature_engineering.py > Army_ML_Pipeline_and_Files\feature_engineering.log 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "Error in feature_engineering.py"; exit $LASTEXITCODE }

Write-Host "3. Running temporal_model.py..."
& $python -X utf8 -u Army_ML_Pipeline_and_Files\temporal_model.py > Army_ML_Pipeline_and_Files\temporal_model.log 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "Error in temporal_model.py"; exit $LASTEXITCODE }

Write-Host "4. Running train_health_model.py..."
& $python -X utf8 -u Army_ML_Pipeline_and_Files\train_health_model.py > Army_ML_Pipeline_and_Files\train_health_model.log 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "Error in train_health_model.py"; exit $LASTEXITCODE }

Write-Host "5. Running optimize_ensemble.py..."
& $python -X utf8 -u Army_ML_Pipeline_and_Files\optimize_ensemble.py > Army_ML_Pipeline_and_Files\optimize_ensemble.log 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "Error in optimize_ensemble.py"; exit $LASTEXITCODE }

Write-Host "6. Running evaluate_ensemble.py..."
& $python -X utf8 -u Army_ML_Pipeline_and_Files\evaluate_ensemble.py > Army_ML_Pipeline_and_Files\evaluate_ensemble.log 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "Error in evaluate_ensemble.py"; exit $LASTEXITCODE }

Write-Host "7. Running run_inference.py..."
& $python -X utf8 -u Army_ML_Pipeline_and_Files\run_inference.py > Army_ML_Pipeline_and_Files\run_inference.log 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "Error in run_inference.py"; exit $LASTEXITCODE }

Write-Host "Pipeline completed successfully!"
