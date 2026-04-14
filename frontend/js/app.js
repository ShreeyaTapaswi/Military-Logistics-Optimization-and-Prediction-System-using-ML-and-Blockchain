/* ========================================
   Army Vehicle Management System - App Logic
   ======================================== */

// Global State
let currentUser = null;
let selectedBaseFilter = null;
let map = null;
let statusChart = null;
let baseChart = null;
let backendApiConnected = false;
let backendReadOnlyNotified = false;
let backendFallbackNotified = false;

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

/* ========================================
   User Info & Logout
   ======================================== */
function setupUserInfo() {
    const initials = currentUser.username.substring(0, 2).toUpperCase();
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userName').textContent = currentUser.username;
    document.getElementById('userRole').textContent = currentUser.role;

    // If base admin, set filter
    if (currentUser.role === 'Base Admin' && currentUser.baseId) {
        selectedBaseFilter = currentUser.baseId;
        const base = AppData.MOCK_BASES.find(b => b.id === currentUser.baseId);
        document.getElementById('currentBase').textContent = base ? base.name : 'Your Base';
    }

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
    AppData.MOCK_BASES.forEach(base => {
        baseFilter.innerHTML += `<option value="${base.id}">${base.name}</option>`;
        baseSelect.innerHTML += `<option value="${base.id}">${base.name}</option>`;
    });

    // If base admin, lock the base filter
    if (currentUser.role === 'Base Admin') {
        baseFilter.value = currentUser.baseId;
        baseFilter.disabled = true;
        baseSelect.value = currentUser.baseId;
        baseSelect.disabled = true;
    }
}

/* ========================================
   Event Listeners
   ======================================== */
function setupEventListeners() {
    // Add buttons
    document.getElementById('addVehicleBtn').addEventListener('click', () => openVehicleModal());
    document.getElementById('addMaintenanceBtn').addEventListener('click', () => openMaintenanceModal());
    document.getElementById('addInventoryBtn').addEventListener('click', () => openInventoryModal());

    // Search and filter listeners
    document.getElementById('vehicleSearch').addEventListener('input', loadVehicles);
    document.getElementById('vehicleTypeFilter').addEventListener('change', loadVehicles);
    document.getElementById('vehicleStatusFilter').addEventListener('change', loadVehicles);
    document.getElementById('vehicleBaseFilter').addEventListener('change', loadVehicles);

    document.getElementById('maintenanceSearch').addEventListener('input', loadMaintenance);
    document.getElementById('maintenanceTypeFilter').addEventListener('change', loadMaintenance);

    document.getElementById('inventorySearch').addEventListener('input', loadInventory);
    document.getElementById('inventoryCategoryFilter').addEventListener('change', loadInventory);
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

function setVehicleEditMode(isReadOnly) {
    const addVehicleButton = document.getElementById('addVehicleBtn');
    if (!addVehicleButton) {
        return;
    }

    addVehicleButton.disabled = isReadOnly;
    addVehicleButton.style.opacity = isReadOnly ? '0.65' : '';
    addVehicleButton.style.cursor = isReadOnly ? 'not-allowed' : '';
    addVehicleButton.title = isReadOnly
        ? 'Vehicle records are currently synced from backend API in read-only mode.'
        : '';
}

async function initializeBackendConnection() {
    const healthResult = await AppData.fetchSystemHealth();

    if (healthResult.success) {
        backendApiConnected = true;
        updateDataSourceBadge(`Data Source: Backend API (${AppData.getApiBaseUrl()})`);
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
    const vehicles = getFilteredVehicles();
    const inventory = AppData.getData(AppData.STORAGE_KEYS.INVENTORY);

    let total = vehicles.length;
    let active = vehicles.filter(v => v.status === 'Active').length;
    let maintenance = vehicles.filter(v => v.status === 'Under Maintenance').length;
    let serviceDue = vehicles.filter(v => v.status === 'Service Due').length;

    const summaryResult = await AppData.fetchFleetSummary();
    if (summaryResult.success && summaryResult.data) {
        const backendKpis = mapFleetSummaryToKpis(summaryResult.data);
        total = backendKpis.total;
        active = backendKpis.active;
        maintenance = backendKpis.maintenance;
        serviceDue = backendKpis.serviceDue;
        backendApiConnected = true;
        updateDataSourceBadge(`Data Source: Backend API (${AppData.getApiBaseUrl()})`);
    } else if (!backendApiConnected) {
        updateDataSourceBadge('Data Source: Local demo cache');
    }

    const lowStock = inventory.filter(p => p.quantity < p.minStock).length;

    document.getElementById('kpiTotal').textContent = total;
    document.getElementById('kpiActive').textContent = active;
    document.getElementById('kpiMaintenance').textContent = maintenance;
    document.getElementById('kpiServiceDue').textContent = serviceDue;
    document.getElementById('kpiLowStock').textContent = lowStock;

    let vehiclesForCharts = vehicles;
    const vehicleSyncResult = await AppData.fetchVehiclesFromBackend();
    if (vehicleSyncResult.success) {
        vehiclesForCharts = vehicleSyncResult.data;
    }

    // Charts
    renderStatusChart(active, maintenance, serviceDue);
    renderBaseChart(vehiclesForCharts);
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
function loadMap() {
    if (map) {
        map.invalidateSize();
        return;
    }

    // Initialize map centered on India
    map = L.map('india-map').setView([22.5, 82.5], 5);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add markers for each base
    const cachedVehicles = AppData.getCachedBackendVehicles();
    const vehicles = cachedVehicles.length > 0 ? cachedVehicles : AppData.getData(AppData.STORAGE_KEYS.VEHICLES);

    AppData.MOCK_BASES.forEach(base => {
        const baseVehicles = vehicles.filter(v => v.baseId === base.id);
        const activeCount = baseVehicles.filter(v => v.status === 'Active').length;
        const maintenanceCount = baseVehicles.filter(v => v.status !== 'Active').length;

        const marker = L.marker([base.lat, base.lng]).addTo(map);

        marker.bindPopup(`
      <div class="base-popup">
        <h4>${base.name}</h4>
        <p><strong>Region:</strong> ${base.region}</p>
        <p><strong>Total Vehicles:</strong> ${baseVehicles.length}</p>
        <p><strong>Active:</strong> ${activeCount}</p>
        <p><strong>Maintenance/Due:</strong> ${maintenanceCount}</p>
      </div>
    `);

        // Click to filter
        marker.on('click', function () {
            if (currentUser.role === 'Super Admin') {
                selectedBaseFilter = base.id;
                document.getElementById('currentBase').textContent = base.name;
                showToast(`Filtered to ${base.name}`, 'success');

                // Update vehicle filter dropdown
                document.getElementById('vehicleBaseFilter').value = base.id;
            }
        });
    });

    // Fix map rendering issue
    setTimeout(() => map.invalidateSize(), 100);
}

/* ========================================
   Vehicles
   ======================================== */
function getFilteredVehicles() {
    let vehicles = AppData.getData(AppData.STORAGE_KEYS.VEHICLES);

    // Base filter (for base admins or map selection)
    if (currentUser.role === 'Base Admin') {
        vehicles = vehicles.filter(v => v.baseId === currentUser.baseId);
    } else if (selectedBaseFilter) {
        vehicles = vehicles.filter(v => v.baseId === selectedBaseFilter);
    }

    return vehicles;
}

async function loadVehicles() {
    const apiVehicleResult = await AppData.fetchVehiclesFromBackend();
    const usingBackendData = apiVehicleResult.success;
    let vehicles = usingBackendData ? apiVehicleResult.data.slice() : getFilteredVehicles();

    setVehicleEditMode(usingBackendData);
    if (usingBackendData && !backendReadOnlyNotified) {
        showToast('Live backend vehicle data loaded in read-only mode.', 'success');
        backendReadOnlyNotified = true;
    }
    if (!usingBackendData && apiVehicleResult.error && !backendFallbackNotified) {
        showToast('Vehicle API unavailable. Falling back to local data.', 'warning');
        backendFallbackNotified = true;
    }

    if (currentUser.role === 'Base Admin') {
        vehicles = vehicles.filter(v => v.baseId === currentUser.baseId);
    } else if (selectedBaseFilter) {
        vehicles = vehicles.filter(v => v.baseId === selectedBaseFilter);
    }

    // Apply filters
    const search = document.getElementById('vehicleSearch').value.toLowerCase();
    const typeFilter = document.getElementById('vehicleTypeFilter').value;
    const statusFilter = document.getElementById('vehicleStatusFilter').value;
    const baseFilter = document.getElementById('vehicleBaseFilter').value;

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
    if (baseFilter && currentUser.role === 'Super Admin') {
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
                const statusClass = v.status === 'Active' ? 'active' :
            v.status === 'Under Maintenance' ? 'maintenance' : 'service-due';
                const actionCell = usingBackendData
                        ? '<span style="color: var(--text-secondary); font-size: 12px;">Read-only (API)</span>'
                        : `
                    <button class="action-btn" onclick="editVehicle('${v.id}')">Edit</button>
                    <button class="action-btn delete" onclick="deleteVehicle('${v.id}')">Delete</button>
                `;

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
        title.textContent = 'Edit Vehicle';
        document.getElementById('vehicleId').value = vehicle.id;
        document.getElementById('vehiclePlate').value = vehicle.plateNo;
        document.getElementById('vehicleType').value = vehicle.type;
        document.getElementById('vehicleUnit').value = vehicle.unit;
        document.getElementById('vehicleBase').value = vehicle.baseId;
        document.getElementById('vehicleStatus').value = vehicle.status;
        document.getElementById('vehicleLastService').value = vehicle.lastService;
        document.getElementById('vehicleNextService').value = vehicle.nextService;
    } else {
        title.textContent = 'Add Vehicle';
        document.getElementById('vehicleForm').reset();
        document.getElementById('vehicleId').value = '';

        // Set default base for base admin
        if (currentUser.role === 'Base Admin') {
            document.getElementById('vehicleBase').value = currentUser.baseId;
        }
    }

    modal.classList.add('active');
}

function editVehicle(id) {
    const vehicles = AppData.getData(AppData.STORAGE_KEYS.VEHICLES);
    const vehicle = vehicles.find(v => v.id === id);
    if (vehicle) {
        openVehicleModal(vehicle);
    }
}

function saveVehicle() {
    if (document.getElementById('addVehicleBtn').disabled) {
        showToast('Backend sync mode is read-only for vehicles. Use backend APIs to modify records.', 'warning');
        return;
    }

    const id = document.getElementById('vehicleId').value;
    const vehicleData = {
        plateNo: document.getElementById('vehiclePlate').value,
        type: document.getElementById('vehicleType').value,
        unit: document.getElementById('vehicleUnit').value,
        baseId: document.getElementById('vehicleBase').value,
        status: document.getElementById('vehicleStatus').value,
        lastService: document.getElementById('vehicleLastService').value,
        nextService: document.getElementById('vehicleNextService').value
    };

    if (id) {
        // Update
        AppData.updateItem(AppData.STORAGE_KEYS.VEHICLES, id, vehicleData);
        showToast('Vehicle updated successfully', 'success');
    } else {
        // Create
        vehicleData.id = AppData.generateId('veh');
        AppData.addItem(AppData.STORAGE_KEYS.VEHICLES, vehicleData);
        showToast('Vehicle added successfully', 'success');
    }

    closeModal('vehicleModal');
    loadVehicles();
    loadDashboard();
}

function deleteVehicle(id) {
    if (document.getElementById('addVehicleBtn').disabled) {
        showToast('Vehicle deletion is disabled in backend read-only mode.', 'warning');
        return;
    }

    if (confirm('Are you sure you want to delete this vehicle?')) {
        AppData.deleteItem(AppData.STORAGE_KEYS.VEHICLES, id);
        showToast('Vehicle deleted', 'warning');
        loadVehicles();
        loadDashboard();
    }
}

/* ========================================
   Maintenance
   ======================================== */
function loadMaintenance() {
    let logs = AppData.getData(AppData.STORAGE_KEYS.MAINTENANCE);
    const vehicles = AppData.getData(AppData.STORAGE_KEYS.VEHICLES);

    // Filter by base if needed
    if (currentUser.role === 'Base Admin') {
        const baseVehicleIds = vehicles.filter(v => v.baseId === currentUser.baseId).map(v => v.id);
        logs = logs.filter(l => baseVehicleIds.includes(l.vehicleId));
    }

    // Apply filters
    const search = document.getElementById('maintenanceSearch').value.toLowerCase();
    const typeFilter = document.getElementById('maintenanceTypeFilter').value;

    if (search) {
        logs = logs.filter(l => {
            const vehicle = vehicles.find(v => v.id === l.vehicleId);
            return (vehicle && vehicle.plateNo.toLowerCase().includes(search)) ||
                l.technician.toLowerCase().includes(search);
        });
    }
    if (typeFilter) {
        logs = logs.filter(l => l.type === typeFilter);
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
        const vehicle = vehicles.find(v => v.id === l.vehicleId);
        return `
      <tr>
        <td>${l.date}</td>
        <td>${vehicle ? vehicle.plateNo : 'Unknown'}</td>
        <td>${l.type}</td>
        <td>${l.description}</td>
        <td>${l.technician}</td>
        <td>₹${l.cost.toLocaleString()}</td>
        <td>${l.downtime} days</td>
        <td class="action-btns">
          <button class="action-btn" onclick="editMaintenance('${l.id}')">Edit</button>
          <button class="action-btn delete" onclick="deleteMaintenance('${l.id}')">Delete</button>
        </td>
      </tr>
    `;
    }).join('');
}

function openMaintenanceModal(log = null) {
    const modal = document.getElementById('maintenanceModal');
    const title = document.getElementById('maintenanceModalTitle');
    const vehicleSelect = document.getElementById('maintenanceVehicle');

    // Populate vehicle dropdown
    let vehicles = AppData.getData(AppData.STORAGE_KEYS.VEHICLES);
    if (currentUser.role === 'Base Admin') {
        vehicles = vehicles.filter(v => v.baseId === currentUser.baseId);
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
    const logs = AppData.getData(AppData.STORAGE_KEYS.MAINTENANCE);
    const log = logs.find(l => l.id === id);
    if (log) {
        openMaintenanceModal(log);
    }
}

function saveMaintenance() {
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

    if (id) {
        AppData.updateItem(AppData.STORAGE_KEYS.MAINTENANCE, id, logData);
        showToast('Maintenance record updated', 'success');
    } else {
        logData.id = AppData.generateId('maint');
        AppData.addItem(AppData.STORAGE_KEYS.MAINTENANCE, logData);
        showToast('Maintenance record added', 'success');
    }

    closeModal('maintenanceModal');
    loadMaintenance();
}

function deleteMaintenance(id) {
    if (confirm('Are you sure you want to delete this record?')) {
        AppData.deleteItem(AppData.STORAGE_KEYS.MAINTENANCE, id);
        showToast('Record deleted', 'warning');
        loadMaintenance();
    }
}

/* ========================================
   Inventory
   ======================================== */
function loadInventory() {
    let inventory = AppData.getData(AppData.STORAGE_KEYS.INVENTORY);

    // Apply filters
    const search = document.getElementById('inventorySearch').value.toLowerCase();
    const categoryFilter = document.getElementById('inventoryCategoryFilter').value;

    if (search) {
        inventory = inventory.filter(p => p.name.toLowerCase().includes(search));
    }
    if (categoryFilter) {
        inventory = inventory.filter(p => p.category === categoryFilter);
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
        return `
      <tr class="${isLow ? 'alert-row' : ''}">
        <td><strong>${p.name}</strong></td>
        <td>${p.category}</td>
        <td class="${isLow ? 'stock-low' : ''}">${p.quantity} ${isLow ? '⚠️' : ''}</td>
        <td>${p.minStock}</td>
        <td>${p.depot}</td>
        <td>${p.lastRestocked}</td>
        <td class="action-btns">
          <button class="action-btn" onclick="editInventory('${p.id}')">Edit</button>
          <button class="action-btn delete" onclick="deleteInventory('${p.id}')">Delete</button>
        </td>
      </tr>
    `;
    }).join('');
}

function openInventoryModal(part = null) {
    const modal = document.getElementById('inventoryModal');
    const title = document.getElementById('inventoryModalTitle');

    if (part) {
        title.textContent = 'Edit Spare Part';
        document.getElementById('inventoryId').value = part.id;
        document.getElementById('inventoryName').value = part.name;
        document.getElementById('inventoryCategory').value = part.category;
        document.getElementById('inventoryQty').value = part.quantity;
        document.getElementById('inventoryMinStock').value = part.minStock;
        document.getElementById('inventoryDepot').value = part.depot;
    } else {
        title.textContent = 'Add Spare Part';
        document.getElementById('inventoryForm').reset();
        document.getElementById('inventoryId').value = '';
    }

    modal.classList.add('active');
}

function editInventory(id) {
    const inventory = AppData.getData(AppData.STORAGE_KEYS.INVENTORY);
    const part = inventory.find(p => p.id === id);
    if (part) {
        openInventoryModal(part);
    }
}

function saveInventory() {
    const id = document.getElementById('inventoryId').value;
    const partData = {
        name: document.getElementById('inventoryName').value,
        category: document.getElementById('inventoryCategory').value,
        quantity: parseInt(document.getElementById('inventoryQty').value) || 0,
        minStock: parseInt(document.getElementById('inventoryMinStock').value) || 0,
        depot: document.getElementById('inventoryDepot').value,
        lastRestocked: new Date().toISOString().split('T')[0]
    };

    if (id) {
        AppData.updateItem(AppData.STORAGE_KEYS.INVENTORY, id, partData);
        showToast('Part updated successfully', 'success');
    } else {
        partData.id = AppData.generateId('part');
        AppData.addItem(AppData.STORAGE_KEYS.INVENTORY, partData);
        showToast('Part added successfully', 'success');
    }

    closeModal('inventoryModal');
    loadInventory();
    loadDashboard();
}

function deleteInventory(id) {
    if (confirm('Are you sure you want to delete this part?')) {
        AppData.deleteItem(AppData.STORAGE_KEYS.INVENTORY, id);
        showToast('Part deleted', 'warning');
        loadInventory();
        loadDashboard();
    }
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
