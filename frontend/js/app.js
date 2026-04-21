/* ========================================
   Army Vehicle Management System - App Logic
   ======================================== */

// Global State
let currentUser = null;
let selectedBaseFilter = null;
let map = null;
let mapMarkersLayer = null;
let statusChart = null;
let baseChart = null;
let backendApiConnected = false;
let currentVehicles = [];
let currentMaintenanceLogs = [];
let currentInventoryParts = [];
let lastMlRunDetails = null;
let latestMlStatusSnapshot = null;

const BASE_META = {
     base_delhi: { city: 'Delhi', state: 'Delhi', pincode: '110010' },
     base_leh: { city: 'Leh', state: 'Ladakh', pincode: '194101' },
     base_pune: { city: 'Pune', state: 'Maharashtra', pincode: '411001' },
     base_jaisalmer: { city: 'Jaisalmer', state: 'Rajasthan', pincode: '345001' },
     base_kolkata: { city: 'Kolkata', state: 'West Bengal', pincode: '700001' }
};

function getBaseName(baseId) {
    const base = AppData.MOCK_BASES.find(item => item.id === baseId);
    return base ? base.name : 'Unknown Base';
}

function formatDisplayDate(dateValue) {
    if (!dateValue) {
        return 'N/A';
    }
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
        return String(dateValue);
    }
    return parsed.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function updateClearBaseButton() {
    const clearButton = document.getElementById('clearMapFilterBtn');
    if (!clearButton) {
        return;
    }
    clearButton.style.display = (isSuperAdmin() && selectedBaseFilter) ? 'inline-flex' : 'none';
}

function updateCurrentBaseBadge() {
    const badge = document.getElementById('currentBase');
    if (!badge) {
        return;
    }

    if (!isSuperAdmin() && currentUser && currentUser.baseId) {
        badge.textContent = `Scope: ${getBaseName(currentUser.baseId)} (Base Admin)`;
        return;
    }

    if (selectedBaseFilter) {
        badge.textContent = `Scope: ${getBaseName(selectedBaseFilter)} (Map)`;
        return;
    }

    badge.textContent = 'Scope: All Bases';
}

/* ========================================
   Initialization
   ======================================== */
document.addEventListener('DOMContentLoaded', async function () {
    // Check authentication
    currentUser = AppData.getSession();
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    // Initialize data
    AppData.initializeData();

    // Setup UI
    setupUserInfo();
    setupNavigation();
    setupFilters();
    setupEventListeners();

    await initializeBackendConnection();

    // Load initial page
    await loadDashboard();
});

function isSuperAdmin() {
    return currentUser && (currentUser.roleKey === 'super_admin' || currentUser.role === 'Super Admin');
}

function getBaseMeta(baseId) {
    return BASE_META[baseId] || BASE_META.base_delhi;
}

function canEditBase(baseId) {
    if (isSuperAdmin()) {
        return true;
    }
    return Boolean(currentUser && currentUser.baseId === baseId);
}

function canEditVehicle(vehicle) {
    return vehicle ? canEditBase(vehicle.baseId) : false;
}

function canEditMaintenance(log, vehiclesById) {
    if (isSuperAdmin()) {
        return true;
    }
    const vehicle = vehiclesById.get(log.vehicleId);
    if (!vehicle) {
        return false;
    }
    return canEditBase(vehicle.baseId);
}

function canEditInventory(part, vehiclesById) {
    if (isSuperAdmin()) {
        return true;
    }
    const vehicle = vehiclesById.get(part.vehicleId);
    if (!vehicle) {
        return false;
    }
    return canEditBase(vehicle.baseId);
}

/* ========================================
   User Info & Logout
   ======================================== */
function setupUserInfo() {
    const initials = currentUser.username.substring(0, 2).toUpperCase();
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userName').textContent = currentUser.username;
    document.getElementById('userRole').textContent = currentUser.role;
    updateCurrentBaseBadge();
    updateClearBaseButton();

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', function () {
        AppData.clearSession();
        window.location.href = 'index.html';
    });
}

/* ========================================
   Navigation
   ======================================== */
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            const page = this.dataset.page;

            // Update active state
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');

            // Show page
            showPage(page);
        });
    });
}

function showPage(pageId) {
    const pages = document.querySelectorAll('.page-section');
    pages.forEach(page => page.classList.remove('active'));

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.classList.add('active');

        // Load page-specific content
        switch (pageId) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'map':
                loadMap();
                break;
            case 'vehicles':
                loadVehicles();
                break;
            case 'maintenance':
                loadMaintenance();
                break;
            case 'inventory':
                loadInventory();
                break;
        }
    }
}

/* ========================================
   Filters Setup
   ======================================== */
function setupFilters() {
    // Vehicle Type Filter
    const typeFilter = document.getElementById('vehicleTypeFilter');
    const typeSelect = document.getElementById('vehicleType');
    AppData.VEHICLE_TYPES.forEach(type => {
        typeFilter.innerHTML += `<option value="${type}">${type}</option>`;
        typeSelect.innerHTML += `<option value="${type}">${type}</option>`;
    });

    // Base Filter
    const baseFilter = document.getElementById('vehicleBaseFilter');
    const baseSelect = document.getElementById('vehicleBase');
    const maintenanceBaseFilter = document.getElementById('maintenanceBaseFilter');
    const inventoryBaseFilter = document.getElementById('inventoryBaseFilter');
    AppData.MOCK_BASES.forEach(base => {
        baseFilter.innerHTML += `<option value="${base.id}">${base.name}</option>`;
        baseSelect.innerHTML += `<option value="${base.id}">${base.name}</option>`;
        if (maintenanceBaseFilter) {
            maintenanceBaseFilter.innerHTML += `<option value="${base.id}">${base.name}</option>`;
        }
        if (inventoryBaseFilter) {
            inventoryBaseFilter.innerHTML += `<option value="${base.id}">${base.name}</option>`;
        }
    });

        // Maintenance type filter (supports both legacy mock and backend service types)
        const maintenanceTypeFilter = document.getElementById('maintenanceTypeFilter');
        maintenanceTypeFilter.innerHTML = `
            <option value="">All Types</option>
            <option value="Preventive">Preventive</option>
            <option value="Corrective">Corrective</option>
            <option value="Scheduled Service">Scheduled Service</option>
            <option value="Repair">Repair</option>
            <option value="Inspection">Inspection</option>
        `;

    if (!isSuperAdmin() && currentUser.baseId) {
        baseSelect.value = currentUser.baseId;
    }
}

function refreshMaintenanceTypeFilterOptions(logs = []) {
    const filter = document.getElementById('maintenanceTypeFilter');
    if (!filter) {
        return;
    }

    const currentValue = filter.value;
    const defaultTypes = ['Preventive', 'Corrective', 'Scheduled Service', 'Repair', 'Inspection'];
    const seen = new Set(defaultTypes.map(item => item.toLowerCase()));
    const dynamicTypes = [];

    logs.forEach(log => {
        const type = String(log.type || '').trim();
        const key = type.toLowerCase();
        if (!type || seen.has(key)) {
            return;
        }
        seen.add(key);
        dynamicTypes.push(type);
    });

    dynamicTypes.sort((left, right) => left.localeCompare(right));
    const allTypes = defaultTypes.concat(dynamicTypes);

    filter.innerHTML = `<option value="">All Types</option>${allTypes
        .map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
        .join('')}`;

    if (currentValue && allTypes.includes(currentValue)) {
        filter.value = currentValue;
    }
}

function refreshInventoryCategoryFilterOptions(parts = []) {
    const filter = document.getElementById('inventoryCategoryFilter');
    if (!filter) {
        return;
    }

    const currentValue = filter.value;
    const defaultCategories = ['Engine', 'Transmission', 'Electrical', 'Brakes', 'Tires', 'Tracks'];
    const seen = new Set(defaultCategories.map(item => item.toLowerCase()));
    const dynamicCategories = [];

    parts.forEach(part => {
        const category = String(part.category || '').trim();
        const key = category.toLowerCase();
        if (!category || seen.has(key)) {
            return;
        }
        seen.add(key);
        dynamicCategories.push(category);
    });

    dynamicCategories.sort((left, right) => left.localeCompare(right));
    const allCategories = defaultCategories.concat(dynamicCategories);

    filter.innerHTML = `<option value="">All Categories</option>${allCategories
        .map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
        .join('')}`;

    if (currentValue && allCategories.includes(currentValue)) {
        filter.value = currentValue;
    }
}

/* ========================================
   Event Listeners
   ======================================== */
function setupEventListeners() {
    // Add buttons
    document.getElementById('addVehicleBtn').addEventListener('click', () => openVehicleModal());
    document.getElementById('addMaintenanceBtn').addEventListener('click', () => {
        openMaintenanceModal();
    });
    document.getElementById('addInventoryBtn').addEventListener('click', () => {
        openInventoryModal();
    });

    // Search and filter listeners
    document.getElementById('vehicleSearch').addEventListener('input', loadVehicles);
    document.getElementById('vehicleTypeFilter').addEventListener('change', loadVehicles);
    document.getElementById('vehicleStatusFilter').addEventListener('change', loadVehicles);
    document.getElementById('vehicleBaseFilter').addEventListener('change', loadVehicles);

    document.getElementById('maintenanceSearch').addEventListener('input', loadMaintenance);
    document.getElementById('maintenanceTypeFilter').addEventListener('change', loadMaintenance);
    document.getElementById('maintenanceBaseFilter').addEventListener('change', loadMaintenance);

    document.getElementById('inventorySearch').addEventListener('input', loadInventory);
    document.getElementById('inventoryCategoryFilter').addEventListener('change', loadInventory);
    document.getElementById('inventoryBaseFilter').addEventListener('change', loadInventory);

    const clearBaseButton = document.getElementById('clearMapFilterBtn');
    if (clearBaseButton) {
        clearBaseButton.addEventListener('click', async () => {
            selectedBaseFilter = null;
            updateCurrentBaseBadge();
            updateClearBaseButton();
            showToast('Base scope cleared. Dashboard now shows all bases.', 'success');
            await loadDashboard();
        });
    }

    const mlBtn = document.getElementById('triggerMlBtn');
    if (mlBtn) {
        mlBtn.addEventListener('click', handleTriggerMlInference);
    }
}

function applyBaseScopeForDashboard(vehicles) {
    const scoped = Array.isArray(vehicles) ? vehicles.slice() : [];
    if (!isSuperAdmin()) {
        return scoped;
    }
    if (selectedBaseFilter) {
        return scoped.filter(v => v.baseId === selectedBaseFilter);
    }
    return scoped;
}

function normalizeDistribution(distribution) {
    const normalized = {};
    Object.entries(distribution || {}).forEach(([key, value]) => {
        normalized[String(key).toLowerCase()] = Number(value) || 0;
    });
    return normalized;
}

function mapFleetSummaryToKpis(summary) {
    const distribution = normalizeDistribution(summary && summary.status_distribution);
    const active = (distribution.excellent || 0) + (distribution.good || 0) + (distribution.available || 0) + (distribution.mission_deployed || 0);
    const maintenance = (distribution.poor || 0) + (distribution.critical || 0) + (distribution.in_maintenance || 0);
    const serviceDue = (distribution.fair || 0) + (distribution.unavailable || 0);
    const total = Number(summary && summary.vehicle_count) || (active + maintenance + serviceDue);
    return { total, active, maintenance, serviceDue };
}

function updateDataSourceBadge(message) {
    const badge = document.getElementById('dataSourceBadge');
    if (badge) {
        badge.textContent = message;
    }
}

function getDataSourceLabel() {
    const badge = document.getElementById('dataSourceBadge');
    if (!badge) {
        return backendApiConnected ? 'Live Backend API' : 'Local demo cache';
    }
    return String(badge.textContent || '').replace(/^Data Source:\s*/i, '') || 'Unknown';
}

function getMlSummaryForBase(baseId) {
    if (!latestMlStatusSnapshot) {
        return {
            freshness: 'Unknown',
            nextDue: 'N/A',
            highRiskCount: 0
        };
    }

    const basePredictions = Array.isArray(latestMlStatusSnapshot.predictions)
        ? latestMlStatusSnapshot.predictions.filter(item => item.base_id === baseId)
        : [];
    const highRiskCount = basePredictions.filter(item => {
        const risk = String(item.risk_category || '').toLowerCase();
        return risk === 'high' || risk === 'critical';
    }).length;

    return {
        freshness: latestMlStatusSnapshot.is_stale ? 'Stale' : 'Fresh',
        nextDue: formatDisplayDate(latestMlStatusSnapshot.next_due_date),
        highRiskCount
    };
}

function resolveBadgeClass(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'excellent' || normalized === 'good' || normalized === 'low') {
        return normalized;
    }
    if (normalized === 'fair' || normalized === 'medium') {
        return normalized;
    }
    if (normalized === 'poor' || normalized === 'high' || normalized === 'critical') {
        return normalized;
    }
    return 'medium';
}

function setMlRunOutput(text, isError = false) {
    const wrap = document.getElementById('mlRunOutputWrap');
    const pre = document.getElementById('mlRunOutput');
    if (!wrap || !pre) {
        return;
    }
    if (!text) {
        wrap.style.display = 'none';
        pre.textContent = '';
        return;
    }
    pre.textContent = text;
    wrap.style.display = 'block';
    wrap.style.borderColor = isError ? 'rgba(248, 81, 73, 0.7)' : 'var(--border-color)';
    wrap.classList.toggle('error', isError);
    wrap.classList.toggle('success', !isError);
}

function renderMlPredictions(mlResult) {
    const body = document.getElementById('mlPredictionsBody');
    const panelMeta = document.getElementById('mlPanelMeta');
    if (!body || !panelMeta) {
        return;
    }

    if (!mlResult.success || !mlResult.data) {
        panelMeta.textContent = 'ML data unavailable';
        body.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    ML predictions are unavailable right now.
                </td>
            </tr>
        `;
        return;
    }

    const ml = mlResult.data;
    panelMeta.textContent = `Latest: ${formatDisplayDate(ml.latest_assessment_date)} | Next due: ${formatDisplayDate(ml.next_due_date)}`;

    let predictions = Array.isArray(ml.predictions) ? ml.predictions.slice() : [];
    if (isSuperAdmin() && selectedBaseFilter) {
        predictions = predictions.filter(item => item.base_id === selectedBaseFilter);
    }

    const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    predictions.sort((left, right) => {
        const leftRisk = riskOrder[String(left.risk_category || '').toLowerCase()] ?? 4;
        const rightRisk = riskOrder[String(right.risk_category || '').toLowerCase()] ?? 4;
        if (leftRisk !== rightRisk) {
            return leftRisk - rightRisk;
        }
        return Number(left.overall_health_score || 0) - Number(right.overall_health_score || 0);
    });

    const rows = predictions.slice(0, 20);
    if (rows.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    No ML predictions found for this base scope.
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = rows.map(item => `
        <tr>
            <td><strong>${escapeHtml(item.vehicle_no || item.vehicle_id)}</strong></td>
            <td>${escapeHtml(getBaseName(item.base_id || ''))}</td>
            <td><span class="table-badge ${resolveBadgeClass(item.health_status)}">${escapeHtml(item.health_status || 'unknown')}</span></td>
            <td><span class="table-badge ${resolveBadgeClass(item.risk_category)}">${escapeHtml(item.risk_category || 'unknown')}</span></td>
            <td>${Number(item.overall_health_score || 0).toFixed(1)}</td>
            <td>${item.predicted_days_to_service ?? '-'}</td>
            <td>${escapeHtml(item.recommended_action || '-')}</td>
        </tr>
    `).join('');
}

function updateMlBadge(mlResult) {
    const badge = document.getElementById('mlFreshnessBadge');
    const triggerBtn = document.getElementById('triggerMlBtn');
    if (!badge) {
        return;
    }

    if (triggerBtn) {
        triggerBtn.style.display = isSuperAdmin() ? 'inline-flex' : 'none';
    }

    if (!mlResult.success || !mlResult.data) {
        badge.textContent = 'ML: Status unavailable';
        return;
    }

    const ml = mlResult.data;
    if (ml.is_stale) {
        badge.textContent = `ML: Stale (next due ${formatDisplayDate(ml.next_due_date)})`;
    } else {
        badge.textContent = `ML: Fresh (next due ${formatDisplayDate(ml.next_due_date)})`;
    }
}

async function initializeBackendConnection() {
    const healthResult = await AppData.fetchSystemHealth();

    if (healthResult.success) {
        backendApiConnected = true;
        updateDataSourceBadge('Data Source: Live Backend API');
        showToast('Backend API connected. Dashboard will use live data.', 'success');
        return;
    }

    backendApiConnected = false;
    updateDataSourceBadge('Data Source: Local demo cache');
    showToast('Backend API unavailable. Using local demo cache.', 'warning');
}

/* ========================================
   Dashboard
   ======================================== */
async function loadDashboard() {
    updateCurrentBaseBadge();
    updateClearBaseButton();

    const [vehicleSyncResult, inventoryResult, mlResult] = await Promise.all([
        AppData.fetchVehiclesFromBackend(),
        AppData.fetchInventoryFromBackend(),
        AppData.fetchLatestMlStatus()
    ]);

    if (vehicleSyncResult.success) {
        currentVehicles = vehicleSyncResult.data.slice();
    }
    if (inventoryResult.success) {
        currentInventoryParts = inventoryResult.data.slice();
    }
    if (mlResult.success && mlResult.data) {
        latestMlStatusSnapshot = mlResult.data;
    }

    let vehiclesForMetrics = vehicleSyncResult.success
        ? applyBaseScopeForDashboard(vehicleSyncResult.data)
        : getFilteredVehicles();

    let total = vehiclesForMetrics.length;
    let active = vehiclesForMetrics.filter(v => v.status === 'Active').length;
    let maintenance = vehiclesForMetrics.filter(v => v.status === 'Under Maintenance').length;
    let serviceDue = vehiclesForMetrics.filter(v => v.status === 'Service Due').length;

    if (vehicleSyncResult.success) {
        backendApiConnected = true;
        updateDataSourceBadge('Data Source: Live Backend API');
    }
    else if (!backendApiConnected) {
        updateDataSourceBadge('Data Source: Local demo cache');
    }

    const inventory = inventoryResult.success ? inventoryResult.data : currentInventoryParts;
    const inventoryForMetrics = (isSuperAdmin() && selectedBaseFilter)
        ? inventory.filter(p => p.baseId === selectedBaseFilter)
        : inventory;
    const lowStock = inventoryForMetrics.filter(p => p.quantity < p.minStock).length;

    document.getElementById('kpiTotal').textContent = total;
    document.getElementById('kpiActive').textContent = active;
    document.getElementById('kpiMaintenance').textContent = maintenance;
    document.getElementById('kpiServiceDue').textContent = serviceDue;
    document.getElementById('kpiLowStock').textContent = lowStock;

    const vehiclesForCharts = vehiclesForMetrics;

    // Charts
    renderStatusChart(active, maintenance, serviceDue);
    renderBaseChart(vehiclesForCharts);
    updateMlBadge(mlResult);
    renderMlPredictions(mlResult);

    if (lastMlRunDetails) {
        setMlRunOutput(lastMlRunDetails.text, lastMlRunDetails.isError);
    }
}

function renderStatusChart(active, maintenance, serviceDue) {
    const ctx = document.getElementById('statusChart').getContext('2d');

    if (statusChart) {
        statusChart.destroy();
    }

    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Active', 'Under Maintenance', 'Service Due'],
            datasets: [{
                data: [active, maintenance, serviceDue],
                backgroundColor: ['#238636', '#f85149', '#d29922'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#e6edf3',
                        padding: 20
                    }
                }
            }
        }
    });
}

function renderBaseChart(vehicles) {
    const sourceVehicles = Array.isArray(vehicles) ? vehicles : AppData.getData(AppData.STORAGE_KEYS.VEHICLES);
    const baseCounts = {};

    AppData.MOCK_BASES.forEach(base => {
        baseCounts[base.name] = sourceVehicles.filter(v => v.baseId === base.id).length;
    });

    const ctx = document.getElementById('baseChart').getContext('2d');

    if (baseChart) {
        baseChart.destroy();
    }

    baseChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(baseCounts),
            datasets: [{
                label: 'Vehicles',
                data: Object.values(baseCounts),
                backgroundColor: '#58a6ff',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: { color: '#30363d' },
                    ticks: { color: '#8b949e' }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#e6edf3' }
                }
            }
        }
    });
}

/* ========================================
   Map
   ======================================== */
async function loadMap() {
    if (!map) {
        // Initialize map centered on India
        map = L.map('india-map').setView([22.5, 82.5], 5);

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
    }

    if (mapMarkersLayer) {
        map.removeLayer(mapMarkersLayer);
    }
    mapMarkersLayer = L.layerGroup();

    // Add markers for each base using current vehicle data
    const cachedVehicles = currentVehicles.length > 0 ? currentVehicles : AppData.getCachedBackendVehicles();
    const vehicles = cachedVehicles.length > 0 ? cachedVehicles : AppData.getData(AppData.STORAGE_KEYS.VEHICLES);
    if (!latestMlStatusSnapshot) {
        const mlResult = await AppData.fetchLatestMlStatus();
        if (mlResult.success && mlResult.data) {
            latestMlStatusSnapshot = mlResult.data;
        }
    }
    AppData.MOCK_BASES.forEach(base => {
        const baseVehicles = vehicles.filter(v => v.baseId === base.id);
        const activeCount = baseVehicles.filter(v => v.status === 'Active').length;
        const maintenanceCount = baseVehicles.filter(v => v.status !== 'Active').length;
        const mlSummary = getMlSummaryForBase(base.id);

        const marker = L.marker([base.lat, base.lng]).addTo(mapMarkersLayer);

        marker.bindPopup(`
      <div class="base-popup">
        <h4>${base.name}</h4>
        <p><strong>ML Status:</strong> ${escapeHtml(mlSummary.freshness)} (next due ${escapeHtml(mlSummary.nextDue)})</p>
        <p><strong>High/Critical ML Alerts:</strong> ${mlSummary.highRiskCount}</p>
        <p><strong>Region:</strong> ${base.region}</p>
        <p><strong>Total Vehicles:</strong> ${baseVehicles.length}</p>
        <p><strong>Active:</strong> ${activeCount}</p>
        <p><strong>Maintenance/Due:</strong> ${maintenanceCount}</p>
      </div>
    `);

        // Click to filter
        marker.on('click', function () {
            if (isSuperAdmin()) {
                selectedBaseFilter = base.id;
                updateCurrentBaseBadge();
                updateClearBaseButton();
                showToast(`Dashboard scope set to ${base.name}`, 'success');
                loadDashboard();
            }
        });
    });

    mapMarkersLayer.addTo(map);

    // Fix map rendering issue
    setTimeout(() => map.invalidateSize(), 100);
}

/* ========================================
   Vehicles
   ======================================== */
function getFilteredVehicles() {
    return AppData.getData(AppData.STORAGE_KEYS.VEHICLES);
}

async function loadVehicles(options = {}) {
    const search = document.getElementById('vehicleSearch').value.toLowerCase();
    const typeFilter = document.getElementById('vehicleTypeFilter').value;
    const statusFilter = document.getElementById('vehicleStatusFilter').value;
    const baseFilter = document.getElementById('vehicleBaseFilter').value;

    const requestOptions = { force: Boolean(options.force) };
    if (baseFilter) {
        requestOptions.baseId = baseFilter;
    }

    const apiVehicleResult = await AppData.fetchVehiclesFromBackend(requestOptions);
    let vehicles = apiVehicleResult.success ? apiVehicleResult.data.slice() : getFilteredVehicles();

    if (apiVehicleResult.success) {
        currentVehicles = vehicles.slice();
    } else if (apiVehicleResult.error) {
        showToast(apiVehicleResult.error, 'warning');
    }

    if (search) {
        vehicles = vehicles.filter(v =>
            (v.plateNo || '').toLowerCase().includes(search) ||
            (v.unit || '').toLowerCase().includes(search)
        );
    }
    if (typeFilter) {
        vehicles = vehicles.filter(v => v.type === typeFilter);
    }
    if (statusFilter) {
        vehicles = vehicles.filter(v => v.status === statusFilter);
    }
    if (baseFilter) {
        vehicles = vehicles.filter(v => v.baseId === baseFilter);
    }

    // Render table
    const tbody = document.getElementById('vehicleTableBody');

    if (vehicles.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
          No vehicles found
        </td>
      </tr>
    `;
        return;
    }

    tbody.innerHTML = vehicles.map(v => {
        const base = AppData.MOCK_BASES.find(b => b.id === v.baseId);
        const statusClass = v.status === 'Active'
            ? 'active'
            : v.status === 'Under Maintenance'
                ? 'maintenance'
                : v.status === 'Decommissioned'
                    ? 'decommissioned'
                    : 'service-due';
        const editLabel = isSuperAdmin() ? 'Edit / Transfer' : 'Edit';
        const canDecommission = v.status !== 'Decommissioned';
        const actionCell = canEditVehicle(v)
            ? `
                                <button class="action-btn" onclick="editVehicle('${v.id}')">${editLabel}</button>
                                ${canDecommission
                                    ? `<button class="action-btn delete" onclick="deleteVehicle('${v.id}')">Decommission</button>`
                                    : '<span style="color: var(--text-secondary); font-size: 12px;">Decommissioned</span>'}
              `
            : '<span style="color: var(--text-secondary); font-size: 12px;">View only</span>';

        return `
      <tr>
        <td><strong>${v.plateNo}</strong></td>
        <td>${v.type}</td>
        <td>${v.unit}</td>
        <td>${base ? base.name : 'Unknown'}</td>
        <td><span class="status-badge ${statusClass}">${v.status}</span></td>
        <td>${v.lastService}</td>
        <td class="action-btns">
                    ${actionCell}
        </td>
      </tr>
    `;
    }).join('');
}

function openVehicleModal(vehicle = null) {
    const modal = document.getElementById('vehicleModal');
    const title = document.getElementById('vehicleModalTitle');

    if (vehicle) {
        title.textContent = isSuperAdmin() ? 'Edit / Transfer Vehicle' : 'Edit Vehicle';
        document.getElementById('vehicleId').value = vehicle.id;
        document.getElementById('vehiclePlate').value = vehicle.plateNo;
        document.getElementById('vehicleType').value = vehicle.type;
        document.getElementById('vehicleUnit').value = vehicle.unit;
        document.getElementById('vehicleBase').value = vehicle.baseId;
        document.getElementById('vehicleStatus').value = vehicle.status;
        document.getElementById('vehicleLastService').value = vehicle.lastService;
        document.getElementById('vehicleNextService').value = vehicle.nextService;
        document.getElementById('vehicleBase').disabled = !isSuperAdmin();
    } else {
        title.textContent = 'Add Vehicle';
        document.getElementById('vehicleForm').reset();
        document.getElementById('vehicleId').value = '';
        document.getElementById('vehicleStatus').value = 'Active';
        document.getElementById('vehicleBase').disabled = !isSuperAdmin();

        if (!isSuperAdmin()) {
            document.getElementById('vehicleBase').value = currentUser.baseId;
        }
    }

    modal.classList.add('active');
}

function editVehicle(id) {
    const vehicle = currentVehicles.find(v => v.id === id);
    if (!canEditVehicle(vehicle)) {
        showToast('You cannot edit this vehicle base.', 'warning');
        return;
    }
    if (vehicle) {
        openVehicleModal(vehicle);
    }
}

async function saveVehicle() {
    const id = document.getElementById('vehicleId').value;
    const baseId = document.getElementById('vehicleBase').value;
    if (!canEditBase(baseId)) {
        showToast('You can only edit your own base records.', 'warning');
        return;
    }

    const vehicleData = {
        plateNo: document.getElementById('vehiclePlate').value.trim().toUpperCase(),
        type: document.getElementById('vehicleType').value,
        unit: document.getElementById('vehicleUnit').value,
        baseId: document.getElementById('vehicleBase').value,
        status: document.getElementById('vehicleStatus').value,
        lastService: document.getElementById('vehicleLastService').value,
        nextService: document.getElementById('vehicleNextService').value
    };
    const existingVehicle = id ? currentVehicles.find(v => v.id === id) : null;
    const isTransfer = Boolean(existingVehicle && existingVehicle.baseId !== vehicleData.baseId);

    if (id) {
        const baseMeta = getBaseMeta(vehicleData.baseId);
        const result = await AppData.updateVehicleDetails(id, {
            type: vehicleData.type,
            model: vehicleData.unit,
            city: baseMeta.city,
            state: baseMeta.state,
            pincode: baseMeta.pincode,
            status: vehicleData.status,
            reason: isTransfer
                ? `Vehicle transfer ${existingVehicle.baseId} -> ${vehicleData.baseId} by ${currentUser.username}`
                : 'Vehicle edited from dashboard'
        });
        if (!result.success) {
            showToast(result.error || 'Vehicle update failed.', 'warning');
            return;
        }
        showToast(isTransfer ? 'Vehicle transferred successfully.' : 'Vehicle updated successfully.', 'success');
    } else {
        const result = await AppData.createVehicle({
            baseId: vehicleData.baseId,
            vehicleType: vehicleData.type,
            plateNo: vehicleData.plateNo,
            model: vehicleData.unit,
            status: vehicleData.status,
            reason: `Added from dashboard by ${currentUser.username}`
        });
        if (!result.success) {
            showToast(result.error || 'Vehicle add failed.', 'warning');
            return;
        }

        const activeBaseFilter = document.getElementById('vehicleBaseFilter').value;
        if (isSuperAdmin() && activeBaseFilter && activeBaseFilter !== vehicleData.baseId) {
            showToast(`Vehicle ${vehicleData.plateNo} added. Change Base filter to view it.`, 'warning');
        } else {
            showToast(`Vehicle ${vehicleData.plateNo} added successfully.`, 'success');
        }
    }

    closeModal('vehicleModal');
    await loadVehicles({ force: true });
    await loadDashboard();
}

async function deleteVehicle(id) {
    const vehicle = currentVehicles.find(v => v.id === id);
    if (!vehicle) {
        showToast('Vehicle not found.', 'warning');
        return;
    }
    if (!canEditVehicle(vehicle)) {
        showToast('You cannot reduce vehicles in this base.', 'warning');
        return;
    }
    if (vehicle.status === 'Decommissioned') {
        showToast('Vehicle is already decommissioned.', 'warning');
        return;
    }

    if (confirm(`Decommission vehicle ${vehicle.plateNo}? This action is logged on blockchain.`)) {
        const result = await AppData.deleteVehicleById(id, {
            reason: `Decommissioned from dashboard by ${currentUser.username}`
        });
        if (!result.success) {
            showToast(result.error || 'Vehicle decommission failed.', 'warning');
            return;
        }
        showToast(`Vehicle ${vehicle.plateNo} decommissioned successfully.`, 'success');
        await loadVehicles({ force: true });
        await loadDashboard();
    }
}

/* ========================================
   Maintenance
   ======================================== */
function getMaintenanceTypeClass(type) {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized.includes('preventive')) {
        return 'preventive';
    }
    if (normalized.includes('corrective')) {
        return 'corrective';
    }
    if (normalized.includes('repair')) {
        return 'repair';
    }
    if (normalized.includes('inspection')) {
        return 'inspection';
    }
    return 'scheduled';
}

async function loadMaintenance() {
    const baseFilter = document.getElementById('maintenanceBaseFilter').value;
    const maintenanceOptions = {};
    if (baseFilter) {
        maintenanceOptions.baseId = baseFilter;
    }

    const [maintenanceResult, vehicleResult] = await Promise.all([
        AppData.fetchMaintenanceFromBackend(maintenanceOptions),
        AppData.fetchVehiclesFromBackend()
    ]);

    let logs = maintenanceResult.success ? maintenanceResult.data.slice() : AppData.getData(AppData.STORAGE_KEYS.MAINTENANCE);
    if (maintenanceResult.success) {
        currentMaintenanceLogs = logs.slice();
    } else if (maintenanceResult.error) {
        showToast(maintenanceResult.error, 'warning');
    }

    const vehicles = vehicleResult.success ? vehicleResult.data.slice() : currentVehicles.slice();
    if (vehicleResult.success) {
        currentVehicles = vehicles.slice();
    }
    const vehiclesById = new Map(vehicles.map(v => [v.id, v]));

    // Apply filters
    const search = document.getElementById('maintenanceSearch').value.toLowerCase();
    refreshMaintenanceTypeFilterOptions(logs);
    const typeFilter = document.getElementById('maintenanceTypeFilter').value;

    if (search) {
        logs = logs.filter(l => {
            const vehicleNo = l.vehicleNo || ((vehicles.find(v => v.id === l.vehicleId) || {}).plateNo || '');
            return vehicleNo.toLowerCase().includes(search) ||
                (l.technician || '').toLowerCase().includes(search);
        });
    }
    if (typeFilter) {
        logs = logs.filter(l => l.type === typeFilter);
    }
    if (baseFilter) {
        logs = logs.filter(l => {
            const vehicle = vehiclesById.get(l.vehicleId);
            return vehicle && vehicle.baseId === baseFilter;
        });
    }

    // Sort by date descending
    logs.sort((a, b) => new Date(b.date) - new Date(a.date));

    const tbody = document.getElementById('maintenanceTableBody');

    if (logs.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">
          No maintenance records found
        </td>
      </tr>
    `;
        return;
    }

    tbody.innerHTML = logs.map(l => {
        const vehicle = vehicles.find(v => v.id === l.vehicleId || v.plateNo === l.vehicleNo);
        const vehicleNo = l.vehicleNo || (vehicle ? vehicle.plateNo : 'Unknown');
        const cost = Number(l.cost || 0);
        const actionCell = canEditMaintenance(l, vehiclesById)
            ? `
                    <button class="action-btn" onclick="editMaintenance('${l.id}')">Edit</button>
                    <button class="action-btn delete" onclick="deleteMaintenance('${l.id}')">Delete</button>
                `
            : '<span style="color: var(--text-secondary); font-size: 12px;">View only</span>';

        return `
      <tr>
        <td>${l.date}</td>
                <td>${vehicleNo}</td>
        <td><span class="service-tag ${getMaintenanceTypeClass(l.type)}">${l.type}</span></td>
        <td>${l.description}</td>
        <td>${l.technician}</td>
        <td>₹${cost.toLocaleString()}</td>
        <td>${l.downtime} days</td>
        <td class="action-btns">
                    ${actionCell}
        </td>
      </tr>
    `;
    }).join('');
}

async function openMaintenanceModal(log = null) {
    const modal = document.getElementById('maintenanceModal');
    const title = document.getElementById('maintenanceModalTitle');
    const vehicleSelect = document.getElementById('maintenanceVehicle');

    if (currentVehicles.length === 0) {
        const vehicleResult = await AppData.fetchVehiclesFromBackend({ force: true });
        if (vehicleResult.success) {
            currentVehicles = vehicleResult.data.slice();
        }
    }

    // Populate vehicle dropdown
    let vehicles = currentVehicles.length > 0 ? currentVehicles.slice() : AppData.getData(AppData.STORAGE_KEYS.VEHICLES);
    if (!isSuperAdmin()) {
        vehicles = vehicles.filter(v => v.baseId === currentUser.baseId);
    }

    if (vehicles.length === 0) {
        showToast('No vehicles available for this base.', 'warning');
        return;
    }

    vehicleSelect.innerHTML = vehicles.map(v =>
        `<option value="${v.id}">${v.plateNo} - ${v.type}</option>`
    ).join('');

    if (log) {
        title.textContent = 'Edit Maintenance Entry';
        document.getElementById('maintenanceId').value = log.id;
        document.getElementById('maintenanceVehicle').value = log.vehicleId;
        document.getElementById('maintenanceDate').value = log.date;
        document.getElementById('maintenanceType').value = log.type;
        document.getElementById('maintenanceDesc').value = log.description;
        document.getElementById('maintenanceTech').value = log.technician;
        document.getElementById('maintenanceCost').value = log.cost;
        document.getElementById('maintenanceDowntime').value = log.downtime;
    } else {
        title.textContent = 'Add Maintenance Entry';
        document.getElementById('maintenanceForm').reset();
        document.getElementById('maintenanceId').value = '';
        document.getElementById('maintenanceDate').value = new Date().toISOString().split('T')[0];
    }

    modal.classList.add('active');
}

function editMaintenance(id) {
    const log = currentMaintenanceLogs.find(l => l.id === id);
    if (log) {
        openMaintenanceModal(log);
    }
}

async function saveMaintenance() {
    const id = document.getElementById('maintenanceId').value;
    const logData = {
        vehicleId: document.getElementById('maintenanceVehicle').value,
        date: document.getElementById('maintenanceDate').value,
        type: document.getElementById('maintenanceType').value,
        description: document.getElementById('maintenanceDesc').value,
        technician: document.getElementById('maintenanceTech').value,
        cost: parseInt(document.getElementById('maintenanceCost').value) || 0,
        downtime: parseInt(document.getElementById('maintenanceDowntime').value) || 0
    };

    const selectedVehicle = currentVehicles.find(v => v.id === logData.vehicleId);
    if (!selectedVehicle || !canEditVehicle(selectedVehicle)) {
        showToast('You can only edit maintenance for your own base.', 'warning');
        return;
    }

    if (id) {
        const result = await AppData.updateMaintenance(id, logData);
        if (!result.success) {
            showToast(result.error || 'Maintenance update failed.', 'warning');
            return;
        }
        showToast('Maintenance record updated.', 'success');
    } else {
        const result = await AppData.createMaintenance(logData);
        if (!result.success) {
            showToast(result.error || 'Maintenance create failed.', 'warning');
            return;
        }
        showToast('Maintenance record added.', 'success');
    }

    closeModal('maintenanceModal');
    await loadMaintenance();
}

async function deleteMaintenance(id) {
    if (confirm('Are you sure you want to delete this record?')) {
        const log = currentMaintenanceLogs.find(item => item.id === id);
        const selectedVehicle = log ? currentVehicles.find(v => v.id === log.vehicleId) : null;
        if (!selectedVehicle || !canEditVehicle(selectedVehicle)) {
            showToast('You cannot delete maintenance outside your base.', 'warning');
            return;
        }

        const result = await AppData.deleteMaintenance(id);
        if (!result.success) {
            showToast(result.error || 'Deletion failed.', 'warning');
            return;
        }

        showToast('Record deleted.', 'success');
        await loadMaintenance();
    }
}

/* ========================================
   Inventory
   ======================================== */
async function loadInventory() {
    const baseFilter = document.getElementById('inventoryBaseFilter').value;
    const inventoryOptions = {};
    if (baseFilter) {
        inventoryOptions.baseId = baseFilter;
    }

    const [inventoryResult, vehicleResult] = await Promise.all([
        AppData.fetchInventoryFromBackend(inventoryOptions),
        AppData.fetchVehiclesFromBackend()
    ]);

    let inventory = inventoryResult.success ? inventoryResult.data.slice() : AppData.getData(AppData.STORAGE_KEYS.INVENTORY);
    if (inventoryResult.success) {
        currentInventoryParts = inventory.slice();
    } else if (inventoryResult.error) {
        showToast(inventoryResult.error, 'warning');
    }

    if (vehicleResult.success) {
        currentVehicles = vehicleResult.data.slice();
    }
    const vehiclesById = new Map(currentVehicles.map(v => [v.id, v]));

    // Apply filters
    const search = document.getElementById('inventorySearch').value.toLowerCase();
    refreshInventoryCategoryFilterOptions(inventory);
    const categoryFilter = document.getElementById('inventoryCategoryFilter').value;

    if (search) {
        inventory = inventory.filter(p => (p.name || '').toLowerCase().includes(search));
    }
    if (categoryFilter) {
        inventory = inventory.filter(p => (p.category || '') === categoryFilter);
    }
    if (baseFilter) {
        inventory = inventory.filter(p => {
            const partBaseId = p.baseId || ((vehiclesById.get(p.vehicleId) || {}).baseId || '');
            return partBaseId === baseFilter;
        });
    }

    const tbody = document.getElementById('inventoryTableBody');

    if (inventory.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
          No parts found
        </td>
      </tr>
    `;
        return;
    }

    tbody.innerHTML = inventory.map(p => {
        const isLow = p.quantity < p.minStock;
        const actionCell = canEditInventory(p, vehiclesById)
            ? `
              <button class="action-btn" onclick="editInventory('${p.id}')">Edit</button>
              <button class="action-btn delete" onclick="deleteInventory('${p.id}')">Delete</button>
            `
            : '<span style="color: var(--text-secondary); font-size: 12px;">View only</span>';
        return `
      <tr class="${isLow ? 'alert-row' : ''}">
        <td><strong>${p.name}</strong></td>
        <td>${p.category}</td>
        <td class="${isLow ? 'stock-low' : ''}">${p.quantity} ${isLow ? '⚠️' : ''}</td>
        <td>${p.minStock}</td>
        <td>${p.depot}</td>
        <td>${p.lastRestocked}</td>
        <td class="action-btns">
          ${actionCell}
        </td>
      </tr>
    `;
    }).join('');
}

async function openInventoryModal(part = null) {
    const modal = document.getElementById('inventoryModal');
    const title = document.getElementById('inventoryModalTitle');
    const vehicleSelect = document.getElementById('inventoryVehicle');

    if (currentVehicles.length === 0) {
        const vehicleResult = await AppData.fetchVehiclesFromBackend({ force: true });
        if (vehicleResult.success) {
            currentVehicles = vehicleResult.data.slice();
        }
    }

    let vehicles = currentVehicles.length > 0 ? currentVehicles.slice() : [];
    if (!isSuperAdmin()) {
        vehicles = vehicles.filter(v => v.baseId === currentUser.baseId);
    }

    if (vehicles.length === 0) {
        showToast('No vehicles available for inventory assignment.', 'warning');
        return;
    }
    vehicleSelect.innerHTML = vehicles.map(v => `<option value="${v.id}">${v.plateNo} - ${v.type}</option>`).join('');

    if (part) {
        title.textContent = 'Edit Spare Part';
        document.getElementById('inventoryId').value = part.id;
        document.getElementById('inventoryName').value = part.name;
        document.getElementById('inventoryVehicle').value = part.vehicleId;
        document.getElementById('inventoryQty').value = part.quantity;
        document.getElementById('inventoryUnitCost').value = part.unitCost || 0;
        document.getElementById('inventorySupplier').value = part.supplier || part.category || '';
        document.getElementById('inventoryRecordId').value = part.recordId || '';
    } else {
        title.textContent = 'Add Spare Part';
        document.getElementById('inventoryForm').reset();
        document.getElementById('inventoryId').value = '';
        document.getElementById('inventoryRecordId').value = '';
    }

    modal.classList.add('active');
}

function editInventory(id) {
    const part = currentInventoryParts.find(p => p.id === id);
    if (part && !canEditInventory(part, new Map(currentVehicles.map(v => [v.id, v])))) {
        showToast('You cannot edit inventory outside your base.', 'warning');
        return;
    }
    if (part) {
        openInventoryModal(part);
    }
}

async function saveInventory() {
    const id = document.getElementById('inventoryId').value;
    const partData = {
        name: document.getElementById('inventoryName').value,
        vehicleId: document.getElementById('inventoryVehicle').value,
        quantity: parseInt(document.getElementById('inventoryQty').value) || 0,
        unitCost: parseFloat(document.getElementById('inventoryUnitCost').value) || 0,
        supplier: document.getElementById('inventorySupplier').value,
        recordId: document.getElementById('inventoryRecordId').value
    };

    const selectedVehicle = currentVehicles.find(v => v.id === partData.vehicleId);
    if (!selectedVehicle || !canEditVehicle(selectedVehicle)) {
        showToast('You can only edit inventory for your own base.', 'warning');
        return;
    }

    if (id) {
        const result = await AppData.updateInventory(id, partData);
        if (!result.success) {
            showToast(result.error || 'Part update failed.', 'warning');
            return;
        }
        showToast('Part updated successfully.', 'success');
    } else {
        const result = await AppData.createInventory(partData);
        if (!result.success) {
            showToast(result.error || 'Part create failed.', 'warning');
            return;
        }
        showToast('Part added successfully.', 'success');
    }

    closeModal('inventoryModal');
    await loadInventory();
    await loadDashboard();
}

async function deleteInventory(id) {
    if (confirm('Are you sure you want to delete this part?')) {
        const part = currentInventoryParts.find(p => p.id === id);
        const selectedVehicle = part ? currentVehicles.find(v => v.id === part.vehicleId) : null;
        if (!selectedVehicle || !canEditVehicle(selectedVehicle)) {
            showToast('You cannot delete inventory outside your base.', 'warning');
            return;
        }

        const result = await AppData.deleteInventory(id);
        if (!result.success) {
            showToast(result.error || 'Part deletion failed.', 'warning');
            return;
        }

        showToast('Part deleted.', 'success');
        await loadInventory();
        await loadDashboard();
    }
}

function buildMlRunOutput(payload, fallbackMessage) {
    const lines = [];
    if (payload && payload.message) {
        lines.push(`Message: ${payload.message}`);
    } else {
        lines.push(`Message: ${fallbackMessage}`);
    }
    if (payload && payload.returncode !== undefined) {
        lines.push(`Return Code: ${payload.returncode}`);
    }

    const stderrTail = payload && payload.stderr_tail ? String(payload.stderr_tail).trim() : '';
    const stdoutTail = payload && payload.stdout_tail ? String(payload.stdout_tail).trim() : '';

    if (stderrTail) {
        lines.push('');
        lines.push('[stderr]');
        lines.push(stderrTail);
    }
    if (stdoutTail) {
        lines.push('');
        lines.push('[stdout]');
        lines.push(stdoutTail);
    }
    return lines.join('\n').trim();
}

async function handleTriggerMlInference() {
    if (!isSuperAdmin()) {
        showToast('Only Super Admin can trigger ML inference.', 'warning');
        return;
    }

    const button = document.getElementById('triggerMlBtn');
    if (button) {
        button.disabled = true;
        button.textContent = 'Running...';
    }

    const result = await AppData.triggerMlInference(1200);

    if (button) {
        button.disabled = false;
        button.textContent = 'Run ML Inference';
    }

    if (!result.success) {
        const failureOutput = buildMlRunOutput(result.details || {}, result.error || 'Inference failed.');
        lastMlRunDetails = {
            text: failureOutput,
            isError: true
        };
        setMlRunOutput(failureOutput, true);
        showToast(`${result.error || 'Inference failed.'}\nOpen "Latest ML Run Output" for details.`, 'error');
        await loadDashboard();
        return;
    }

    const successOutput = buildMlRunOutput(result.data || {}, 'ML inference completed.');
    lastMlRunDetails = {
        text: successOutput,
        isError: false
    };
    setMlRunOutput(successOutput, false);
    showToast('ML inference completed. Dashboard predictions refreshed.', 'success');
    await loadDashboard();
}

/* ========================================
   Utilities
   ======================================== */
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function (e) {
        if (e.target === this) {
            this.classList.remove('active');
        }
    });
});

// Close modal on Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});
