# How To Run - Step By Step (Copy-Paste Guide)

This guide is for Windows PowerShell.

Use these commands exactly as written.

---

## 0) Important Activation Command

Do NOT run this:

```powershell
. Activate.ps1
```

Run this:

```powershell
. .\.venv\Scripts\Activate.ps1
```

---

## 1) First-Time Setup (Run Once On This Machine)

### 1.1 Open Ganache

Open Ganache GUI and keep it running on:

- Host: `127.0.0.1`
- Port: `7545`

#### Which Ganache option to use?

Use **Quickstart** (recommended).

- It works immediately with this project.
- You do not need to manually add contracts in Ganache.
- This project deploys contracts itself using Truffle.

Use **New Workspace / Project** only if you want persistent custom settings.

If you choose Workspace, set:

- RPC Server: `127.0.0.1`
- Port: `7545`
- Chain ID: `1337`
- Keep at least 10 accounts

Then continue with the same commands below.

### 1.2 Open PowerShell and run these commands

```powershell
cd C:\Users\Samruddhi\projects\Military-Logistics-Optimization-and-Prediction-System-using-ML-and-Blockchain
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
if (-Not (Test-Path .\.env)) { Copy-Item .\.env.example .\.env }
```

### 1.3 Start MySQL

```powershell
Get-Service *mysql*
Start-Service MYSQL80
Get-Service MYSQL80
```

If `Start-Service MYSQL80` fails, run PowerShell as Administrator.

### 1.4 Initialize database schema

```powershell
python scripts\init_db.py --user root --password root
```

If your MySQL password is not `root`, replace it in the command.

### 1.4b Seed rich demo data (recommended)

This fills major tables with realistic rows so the UI is not empty.

```powershell
python scripts\seed_demo_data.py --user root --password root
```

### 1.5 Deploy blockchain contracts

```powershell
Push-Location blockchain
npm install
npx truffle migrate --reset --network development
Pop-Location
```

### 1.6 Register base admins on blockchain

```powershell
python setup_blockchain_demo.py --register-default-bases
```

### 1.7 Quick validation

```powershell
python manage.py check
.\scripts\preflight_validation.ps1
```

Expected result after this step:

- Port `3306` should be OPEN (MySQL)
- Port `7545` should be OPEN (Ganache)
- Port `8000` may still show CLOSED at this stage. This is normal before `runserver`.

---

## 2) Daily Startup (After Laptop Restart)

### 2.1 Open Ganache first

Start Ganache GUI and keep it running.

Use Quickstart or a Workspace configured with port `7545`.

If your database was reset, rerun demo seed once:

```powershell
python scripts\seed_demo_data.py --user root --password root
```

### 2.2 Terminal A (Backend + Blockchain + API)

```powershell
cd C:\Users\Samruddhi\projects\Military-Logistics-Optimization-and-Prediction-System-using-ML-and-Blockchain
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
.\scripts\preflight_validation.ps1

Push-Location blockchain
npx truffle migrate --reset --network development
Pop-Location

python setup_blockchain_demo.py --register-default-bases

python manage.py check
python manage.py runserver 127.0.0.1:8000
```

Keep Terminal A running.

### 2.3 Terminal B (Frontend)

```powershell
cd C:\Users\Samruddhi\projects\Military-Logistics-Optimization-and-Prediction-System-using-ML-and-Blockchain
python -m http.server 5500
```

Keep Terminal B running.

### 2.4 Open in browser

- Frontend login: `http://127.0.0.1:5500/frontend/index.html`
- Backend health: `http://127.0.0.1:8000/api/health/`

---

## 3) Demo Login Credentials

- Super Admin:
  - Username: `arjun.sharma`
  - Password: `Admin@1234`
- Base Admin (Pune):
  - Username: `priya.patil`
  - Password: `Base@5678`
- Base Admin (Delhi):
  - Username: `rohan.verma`
  - Password: `Base@9012`
- Base Admin (Leh):
  - Username: `aman.rawat`
  - Password: `Base@1122`
- Base Admin (Jaisalmer):
  - Username: `kavya.singh`
  - Password: `Base@3456`
- Base Admin (Kolkata):
  - Username: `neha.iyer`
  - Password: `Base@7788`

---

## 4) Optional: Run ML Pipeline Before Demo

Use this only if you want fresh predictions before showing your teacher.

```powershell
cd C:\Users\Samruddhi\projects\Military-Logistics-Optimization-and-Prediction-System-using-ML-and-Blockchain
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
. .\.venv\Scripts\Activate.ps1
.\run_pipeline.ps1
```

---

## 5) Stop Everything After Demo

- In Terminal A: press `Ctrl + C`
- In Terminal B: press `Ctrl + C`

Optional MySQL stop:

```powershell
Stop-Service MYSQL80
```

---

## 6) Common Errors and Fast Fixes

### Activation error

If you see `Activate.ps1 is not recognized`, run:

```powershell
Test-Path .\.venv\Scripts\Activate.ps1
. .\.venv\Scripts\Activate.ps1
```

### MySQL service name issue

```powershell
Get-Service *mysql*
```

Use the exact service name shown.

### `cryptography package is required` error

Run:

```powershell
pip install cryptography
```

Then rerun your previous command.

### `ModuleNotFoundError: No module named 'pandas'` during ML run

This usually means backend used a non-venv Python for `run_inference.py`.

Run:

```powershell
cd C:\Users\Samruddhi\projects\Military-Logistics-Optimization-and-Prediction-System-using-ML-and-Blockchain
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install pandas
```

Optional explicit lock in `.env`:

```powershell
ML_PYTHON_EXECUTABLE=C:\Users\Samruddhi\projects\Military-Logistics-Optimization-and-Prediction-System-using-ML-and-Blockchain\.venv\Scripts\python.exe
```

Then restart backend server (`Ctrl + C` and run `python manage.py runserver 127.0.0.1:8000` again).

### Port already in use

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3306,5500,7545,8000 } | Select-Object LocalAddress,LocalPort,OwningProcess
```

### Old browser session auto-login

Open browser DevTools Console and run:

```javascript
sessionStorage.clear(); localStorage.clear(); location.href='http://127.0.0.1:5500/frontend/index.html';
```
