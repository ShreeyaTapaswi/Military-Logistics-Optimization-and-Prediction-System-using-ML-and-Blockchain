/* ========================================
   Mock Data & LocalStorage Manager
   ======================================== */

// Users
const MOCK_USERS = [
  { id: 1, username: "superadmin", password: "admin123", role: "Super Admin", baseId: null },
  { id: 2, username: "delhi_admin", password: "delhi123", role: "Base Admin", baseId: "base_delhi" },
  { id: 3, username: "leh_admin", password: "leh123", role: "Base Admin", baseId: "base_leh" },
  { id: 4, username: "pune_admin", password: "pune123", role: "Base Admin", baseId: "base_pune" }
];

// Military Bases
const MOCK_BASES = [
  { id: "base_delhi", name: "Delhi Cantonment", lat: 28.6139, lng: 77.2090, region: "North" },
  { id: "base_leh", name: "Leh Military Base", lat: 34.1526, lng: 77.5771, region: "North" },
  { id: "base_pune", name: "Pune Cantonment", lat: 18.5204, lng: 73.8567, region: "West" },
  { id: "base_jaisalmer", name: "Jaisalmer Military Station", lat: 26.9157, lng: 70.9083, region: "West" },
  { id: "base_kolkata", name: "Fort William, Kolkata", lat: 22.5559, lng: 88.3422, region: "East" }
];

// Vehicle Types
const VEHICLE_TYPES = ["T-90 Tank", "BMP-2 IFV", "Tata LPTA Truck", "Mahindra Marksman", "Ambulance", "Fuel Tanker"];

// Initial Vehicles
const MOCK_VEHICLES = [
  { id: "veh_001", plateNo: "IA-01-A-1001", type: "T-90 Tank", unit: "56th Armored Reg.", baseId: "base_delhi", status: "Active", lastService: "2025-11-15", nextService: "2026-02-15" },
  { id: "veh_002", plateNo: "IA-01-A-1002", type: "BMP-2 IFV", unit: "56th Armored Reg.", baseId: "base_delhi", status: "Active", lastService: "2025-10-20", nextService: "2026-01-20" },
  { id: "veh_003", plateNo: "IA-01-A-1003", type: "Tata LPTA Truck", unit: "Logistics Division", baseId: "base_delhi", status: "Under Maintenance", lastService: "2025-09-10", nextService: "2025-12-10" },
  { id: "veh_004", plateNo: "IA-02-B-2001", type: "T-90 Tank", unit: "14th Corps", baseId: "base_leh", status: "Active", lastService: "2025-12-01", nextService: "2026-03-01" },
  { id: "veh_005", plateNo: "IA-02-B-2002", type: "Mahindra Marksman", unit: "14th Corps", baseId: "base_leh", status: "Service Due", lastService: "2025-07-15", nextService: "2025-10-15" },
  { id: "veh_006", plateNo: "IA-03-C-3001", type: "BMP-2 IFV", unit: "Southern Command", baseId: "base_pune", status: "Active", lastService: "2025-11-25", nextService: "2026-02-25" },
  { id: "veh_007", plateNo: "IA-03-C-3002", type: "Ambulance", unit: "Medical Corps", baseId: "base_pune", status: "Active", lastService: "2025-12-10", nextService: "2026-03-10" },
  { id: "veh_008", plateNo: "IA-04-D-4001", type: "T-90 Tank", unit: "Desert Corps", baseId: "base_jaisalmer", status: "Under Maintenance", lastService: "2025-08-20", nextService: "2025-11-20" },
  { id: "veh_009", plateNo: "IA-04-D-4002", type: "Fuel Tanker", unit: "Logistics", baseId: "base_jaisalmer", status: "Active", lastService: "2025-10-05", nextService: "2026-01-05" },
  { id: "veh_010", plateNo: "IA-05-E-5001", type: "Tata LPTA Truck", unit: "Eastern Command", baseId: "base_kolkata", status: "Service Due", lastService: "2025-06-30", nextService: "2025-09-30" },
  { id: "veh_011", plateNo: "IA-05-E-5002", type: "Mahindra Marksman", unit: "Eastern Command", baseId: "base_kolkata", status: "Active", lastService: "2025-11-18", nextService: "2026-02-18" },
  { id: "veh_012", plateNo: "IA-01-A-1004", type: "Fuel Tanker", unit: "Logistics Division", baseId: "base_delhi", status: "Active", lastService: "2025-12-05", nextService: "2026-03-05" }
];

// Maintenance Logs
const MOCK_MAINTENANCE = [
  { id: "maint_001", vehicleId: "veh_001", date: "2025-11-15", type: "Scheduled Service", description: "Engine oil change, filter replacement", technician: "Sgt. Sharma", cost: 15000, downtime: 2 },
  { id: "maint_002", vehicleId: "veh_003", date: "2025-12-20", type: "Repair", description: "Transmission repair - gearbox issue", technician: "Hav. Singh", cost: 45000, downtime: 7 },
  { id: "maint_003", vehicleId: "veh_004", date: "2025-12-01", type: "Scheduled Service", description: "Track replacement and lubrication", technician: "Sgt. Verma", cost: 80000, downtime: 3 },
  { id: "maint_004", vehicleId: "veh_006", date: "2025-11-25", type: "Inspection", description: "Bi-annual inspection completed", technician: "Hav. Pillai", cost: 5000, downtime: 1 },
  { id: "maint_005", vehicleId: "veh_008", date: "2026-01-10", type: "Repair", description: "Engine overhaul - awaiting parts", technician: "Sgt. Khan", cost: 120000, downtime: 14 }
];

// Spare Parts Inventory
const MOCK_INVENTORY = [
  { id: "part_001", name: "Engine Oil Filter", category: "Engine", quantity: 45, minStock: 20, depot: "Delhi Main Depot", lastRestocked: "2025-12-01" },
  { id: "part_002", name: "T-90 Track Pads", category: "Tracks", quantity: 8, minStock: 10, depot: "Delhi Main Depot", lastRestocked: "2025-11-15" },
  { id: "part_003", name: "Diesel Fuel Pump", category: "Engine", quantity: 12, minStock: 5, depot: "Pune Depot", lastRestocked: "2025-12-10" },
  { id: "part_004", name: "Brake Pads (Heavy)", category: "Brakes", quantity: 30, minStock: 15, depot: "Jaisalmer Depot", lastRestocked: "2025-10-20" },
  { id: "part_005", name: "Transmission Fluid (20L)", category: "Transmission", quantity: 5, minStock: 10, depot: "Leh Depot", lastRestocked: "2025-09-05" },
  { id: "part_006", name: "Headlight Assembly", category: "Electrical", quantity: 22, minStock: 10, depot: "Kolkata Depot", lastRestocked: "2025-11-28" },
  { id: "part_007", name: "Alternator", category: "Electrical", quantity: 7, minStock: 8, depot: "Delhi Main Depot", lastRestocked: "2025-10-10" },
  { id: "part_008", name: "Tire (All-Terrain)", category: "Tires", quantity: 40, minStock: 20, depot: "Pune Depot", lastRestocked: "2025-12-15" }
];

/* ========================================
   LocalStorage Manager
   ======================================== */

const STORAGE_KEYS = {
  VEHICLES: "avms_vehicles",
  MAINTENANCE: "avms_maintenance",
  INVENTORY: "avms_inventory",
  SESSION: "avms_session"
};

// Initialize data if not present
function initializeData() {
  if (!localStorage.getItem(STORAGE_KEYS.VEHICLES)) {
    localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(MOCK_VEHICLES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.MAINTENANCE)) {
    localStorage.setItem(STORAGE_KEYS.MAINTENANCE, JSON.stringify(MOCK_MAINTENANCE));
  }
  if (!localStorage.getItem(STORAGE_KEYS.INVENTORY)) {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(MOCK_INVENTORY));
  }
}

// Generic CRUD operations
function getData(key) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function addItem(key, item) {
  const data = getData(key);
  data.push(item);
  saveData(key, data);
  return item;
}

function updateItem(key, id, updates) {
  const data = getData(key);
  const index = data.findIndex(item => item.id === id);
  if (index !== -1) {
    data[index] = { ...data[index], ...updates };
    saveData(key, data);
    return data[index];
  }
  return null;
}

function deleteItem(key, id) {
  const data = getData(key);
  const filtered = data.filter(item => item.id !== id);
  saveData(key, filtered);
  return filtered;
}

// Generate unique ID
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Session Management
function setSession(user) {
  sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
}

function getSession() {
  const session = sessionStorage.getItem(STORAGE_KEYS.SESSION);
  return session ? JSON.parse(session) : null;
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEYS.SESSION);
}

// Authenticate user
function authenticateUser(username, password) {
  const user = MOCK_USERS.find(u => u.username === username && u.password === password);
  return user || null;
}

// Export for use
window.AppData = {
  STORAGE_KEYS,
  MOCK_BASES,
  VEHICLE_TYPES,
  initializeData,
  getData,
  saveData,
  addItem,
  updateItem,
  deleteItem,
  generateId,
  setSession,
  getSession,
  clearSession,
  authenticateUser
};
