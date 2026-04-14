# 🪖 MLOPS: Military Logistics Optimization & Prediction System

### 🛡️ Predictive Readiness · Immutable Governance · AI-Driven Logistics

---

## 🌟 Mission Profile
**MLOPS** is a production-grade enterprise system designed for the Indian Army to transition from reactive maintenance to a **Predictive readiness** model. By unifying machine learning, private blockchain auditing, and a high-performance command dashboard, the system ensures that 5,000+ assets remain operationally ready while every action is backed by a tamper-proof digital audit trail.

---

## 🏗️ System Architecture
The project follows a modular, 4-tier architecture designed for scalability and extreme security.

### 1. Data & Analytics Layer (MySQL)
*   **Normalized Core:** A 12-table enterprise schema (`mlops_db`) tracking everything from OBD-II telemetry to spare part inventories.
*   **Real-time Views:** High-performance SQL views (e.g., `v_fleet_health_summary`) serve optimized data to the dashboard.

### 2. The Intelligence Engine (ML Pipeline)
*   **Ensemble Strategy:** Combines **XGBoost** (gradient boosting), **TabNet** (deep learning for tabular data), and **Bi-LSTM** (time-series analysis) to predict failure probabilities.
*   **Automated Pipeline:** Orchestrated via PowerShell, handling everything from SQL extraction to feature engineering and batch inference.

### 3. Immutable Governance (Dual-Layer Blockchain)
*   **Layer 1 (AssetLedger.sol):** Validates and records base admin actions (movements/maintenance) **before** they are committed to MySQL.
*   **Layer 2 (AuditTrail.sol):** Stores SHA-256 hashes of MySQL records and ML predictions to enable tamper detection and accountability.

### 4. Command & Control Layer (Django + Vanilla JS)
*   **Modular Backend:** Follows the **Repository-Service-Gateway** pattern for clean decoupling of Blockchain and ML logic.
*   **Mission Dashboard:** A real-time interface featuring interactive India maps, health alerts, and verified data visualization.

---

## 🚀 The Full Stack

| Module | Technologies |
|---|---|
| **Frontend** | HTML5, CSS3, JavaScript (Vanilla), SVG Mapping |
| **Backend** | Python 3.12, Django REST Framework, Web3.py |
| **Blockchain** | Solidity, Truffle, Ganache, OpenZeppelin |
| **ML Engine** | XGBoost, PyTorch, TabNet, Optuna, Scikit-learn |
| **Database** | MySQL 8.0 (Enterprise-grade indices & views) |
| **Orchestration** | PowerShell 7.0 (Automated CI/CD-like pipeline) |

---

## 📂 Project Anatomy

```bash
├── Army_ML_Pipeline_and_Files/  # The 'Brain' — ML training, inference & logic
├── backend/                     # Modular Django App (Models, Repositories, Services)
├── blockchain/                  # Private Ethereum Layer (Solidity Contracts & Truffle)
│   ├── contracts/               # AssetLedger & AuditTrail smart contracts
│   └── blockchain_service/      # Python ↔ Blockchain bridge (Web3.py)
├── database/                    # Enterprise MySQL Schema & Guides
├── docs/                        # Detailed ER Diagrams & Technical references
├── js/ & css/                   # Frontend Dashboard assets
├── mlops_backend/               # Django project core settings
└── run_pipeline.ps1             # Total System Orchestrator
```

---

## 🛠️ Multi-Stage Installation Guide

### Phase 1: Database Initialization
1.  Ensure **MySQL 8.0** is running.
2.  Import the schema:
    ```bash
    mysql -u root -p < database/schema.sql
    ```

### Phase 2: Blockchain Deployment
1.  Launch **Ganache** (GUI or CLI).
2.  Deploy smart contracts:
    ```bash
    cd blockchain
    npm install
    truffle migrate --network development
    ```

### Phase 3: Backend & Environment
1.  Set up your virtual environment and install dependencies:
    ```bash
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r backend/requirements.txt
    ```
2.  Configure your `.env` (use `.env.example` as a template).

### Phase 4: Run the System
1.  **Launch Dashboard API:**
    ```bash
    python manage.py runserver
    ```
2.  **Trigger AI Predictions:**
    ```powershell
    .\run_pipeline.ps1
    ```

---

## 📡 Modern API Interface (REST)

*   `GET /api/fleet/summary/`: High-level readiness metrics for the entire fleet.
*   `GET /api/vehicles/{id}/health/`: Detailed predictive analysis for a specific asset.
*   `POST /api/operations/vehicle-movement/`: Execute a blockchain-validated movement.
*   `POST /api/ml/run-inference/`: Manually trigger the fleet health refresh.

---

## 📊 Database Reference
For the full architectural breakdown, see our **[Attribute-Level ER Diagram →](docs/attribute-level-er-diagram.md)**.

---

## 👥 Meet the Team (Group G4)
*Developed at PICT | Dept. of Computer Engineering | 2025–26*

---

<div align="center">
  <b>Built for Operational Excellence and National Security.</b>
</div>
