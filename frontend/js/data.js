/* ========================================
   Backend Data + Session Manager
   ======================================== */

const MOCK_BASES = [
  { id: "base_delhi", name: "Delhi Cantonment", lat: 28.6139, lng: 77.2090, region: "North" },
  { id: "base_leh", name: "Leh Military Base", lat: 34.1526, lng: 77.5771, region: "North" },
  { id: "base_pune", name: "Pune Cantonment", lat: 18.5204, lng: 73.8567, region: "West" },
  { id: "base_jaisalmer", name: "Jaisalmer Military Station", lat: 26.9157, lng: 70.9083, region: "West" },
  { id: "base_kolkata", name: "Fort William, Kolkata", lat: 22.5559, lng: 88.3422, region: "East" }
];

const VEHICLE_TYPES = ["T-90 Tank", "BMP-2 IFV", "Tata LPTA Truck", "Mahindra Marksman", "Ambulance", "Fuel Tanker"];

const FALLBACK_VEHICLES = [];
const FALLBACK_MAINTENANCE = [];
const FALLBACK_INVENTORY = [];

const STORAGE_KEYS = {
  VEHICLES: "avms_vehicles",
  MAINTENANCE: "avms_maintenance",
  INVENTORY: "avms_inventory",
  SESSION: "avms_session"
};

const API_DEFAULT_BASE_URL = "http://127.0.0.1:8000/api";
const API_TIMEOUT_MS = 10000;
const BACKEND_CACHE_TTL_MS = 30000;

const BACKEND_STATUS_TO_UI_STATUS = {
  available: "Active",
  mission_deployed: "Active",
  in_maintenance: "Under Maintenance",
  unavailable: "Service Due",
  decommissioned: "Decommissioned",
  excellent: "Active",
  good: "Active",
  fair: "Service Due",
  poor: "Under Maintenance",
  critical: "Under Maintenance"
};

const UI_STATUS_TO_BACKEND_STATUS = {
  Active: "available",
  "Under Maintenance": "in_maintenance",
  "Service Due": "unavailable",
  Decommissioned: "decommissioned"
};

const STATE_TO_BASE_ID = {
  delhi: "base_delhi",
  ladakh: "base_leh",
  "jammu and kashmir": "base_leh",
  maharashtra: "base_pune",
  rajasthan: "base_jaisalmer",
  "west bengal": "base_kolkata"
};

let backendVehicleCache = { fetchedAt: 0, data: [] };
let backendMaintenanceCache = { fetchedAt: 0, data: [] };
let backendInventoryCache = { fetchedAt: 0, data: [] };

function normalizeApiBaseUrl(url) {
  return String(url || API_DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

function getApiBaseUrl() {
  const configuredBase = (window.AVMS_CONFIG && window.AVMS_CONFIG.apiBaseUrl)
    || localStorage.getItem("avms_api_base")
    || API_DEFAULT_BASE_URL;
  return normalizeApiBaseUrl(configuredBase);
}

function isBackendApiConfigured() {
  return Boolean(getApiBaseUrl());
}

function getSession() {
  const session = sessionStorage.getItem(STORAGE_KEYS.SESSION);
  return session ? JSON.parse(session) : null;
}

function setSession(user) {
  sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEYS.SESSION);
}

function getCurrentActorUserId() {
  const session = getSession();
  return session && session.actorUserId ? session.actorUserId : "";
}

function getCurrentRole() {
  const session = getSession();
  return session && session.role ? session.role : "";
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateString(date) {
  return date.toISOString().split("T")[0];
}

function resolveBaseId(state, city) {
  const normalizedState = String(state || "").trim().toLowerCase();
  if (STATE_TO_BASE_ID[normalizedState]) {
    return STATE_TO_BASE_ID[normalizedState];
  }

  const normalizedCity = String(city || "").trim().toLowerCase();
  const cityMatch = MOCK_BASES.find(base => base.name.toLowerCase().includes(normalizedCity));
  return cityMatch ? cityMatch.id : "base_delhi";
}

function resolveBaseName(baseId) {
  const match = MOCK_BASES.find(base => base.id === baseId);
  return match ? match.name : "Unknown Base";
}

function mapBackendStatus(status) {
  const key = String(status || "").trim().toLowerCase();
  return BACKEND_STATUS_TO_UI_STATUS[key] || "Service Due";
}

function mapUiStatusToBackend(status) {
  return UI_STATUS_TO_BACKEND_STATUS[status] || "available";
}

function mapBackendVehicleToUi(vehicle) {
  const today = new Date();
  return {
    id: vehicle.vehicle_id,
    plateNo: vehicle.vehicle_no || vehicle.vehicle_id,
    type: vehicle.type || "Unknown",
    unit: vehicle.model || "Unassigned Unit",
    baseId: resolveBaseId(vehicle.state, vehicle.city),
    status: mapBackendStatus(vehicle.operational_status),
    operationalStatus: vehicle.operational_status,
    city: vehicle.city || "",
    state: vehicle.state || "",
    pincode: vehicle.pincode || "",
    lastService: toDateString(today),
    nextService: toDateString(addDays(today, 90))
  };
}

function mapBackendMaintenanceToUi(record) {
  return {
    id: record.record_id,
    vehicleId: record.vehicle_id,
    vehicleNo: record.vehicle_no,
    date: record.service_date,
    type: record.service_type || "Maintenance",
    description: record.outcome || "-",
    technician: record.technician_name || record.technician_id || "Unknown",
    cost: Number(record.cost || 0),
    downtime: Number(record.duration_hours || 0)
  };
}

function mapBackendInventoryToUi(part) {
  const baseId = resolveBaseId(part.state, part.city || "");
  return {
    id: part.part_id,
    name: part.part_name,
    category: part.supplier || "General",
    quantity: Number(part.quantity || 0),
    minStock: 10,
    baseId,
    depot: resolveBaseName(baseId),
    lastRestocked: String(part.last_updated || "").slice(0, 10),
    vehicleId: part.vehicle_id,
    vehicleNo: part.vehicle_no,
    unitCost: Number(part.unit_cost || 0),
    supplier: part.supplier || "",
    recordId: part.record_id || part.record || ""
  };
}

function extractApiError(error, fallbackMessage) {
  return {
    message: (error && error.message) ? error.message : fallbackMessage,
    details: (error && error.details) ? error.details : null
  };
}

async function requestApi(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || API_TIMEOUT_MS);
  const timeoutHandle = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    let response;
    try {
      response = await fetch(`${getApiBaseUrl()}${path}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw error;
    }

    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      payload = { message: text || "Unexpected response from server." };
    }

    if (!response.ok) {
      const apiError = new Error(payload.message || `HTTP ${response.status}`);
      apiError.details = payload;
      apiError.status = response.status;
      throw apiError;
    }
    if (payload && payload.success === false) {
      const apiError = new Error(payload.message || "Backend request failed.");
      apiError.details = payload;
      apiError.status = response.status;
      throw apiError;
    }
    return payload;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function clearVehicleApiCache() {
  backendVehicleCache = { fetchedAt: 0, data: [] };
}

function clearMaintenanceApiCache() {
  backendMaintenanceCache = { fetchedAt: 0, data: [] };
}

function clearInventoryApiCache() {
  backendInventoryCache = { fetchedAt: 0, data: [] };
}

function getCachedBackendVehicles() {
  return backendVehicleCache.data.slice();
}

function getCachedBackendMaintenance() {
  return backendMaintenanceCache.data.slice();
}

function getCachedBackendInventory() {
  return backendInventoryCache.data.slice();
}

async function loginWithBackend(username, password) {
  try {
    const payload = await requestApi("/auth/login/", {
      method: "POST",
      body: { username, password }
    });

    const data = payload.data || {};
    const user = {
      username: data.username,
      role: data.role,
      roleKey: data.role_key,
      baseId: data.base_id,
      actorUserId: data.actor_user_id,
      wallet: data.wallet,
      permissions: data.permissions || {}
    };

    return { success: true, user };
  } catch (error) {
    return { success: false, user: null, error: error.message || "Login failed." };
  }
}

async function fetchVehiclesFromBackend(options = {}) {
  if (!isBackendApiConfigured()) {
    return { success: false, data: [], error: "Backend API URL is not configured." };
  }

  const now = Date.now();
  const hasScopedQuery = Boolean(options.status || options.state || options.baseId);
  const cacheIsValid = (now - backendVehicleCache.fetchedAt) < BACKEND_CACHE_TTL_MS;
  if (!options.force && !hasScopedQuery && cacheIsValid && backendVehicleCache.data.length > 0) {
    return { success: true, data: backendVehicleCache.data.slice(), source: "cache" };
  }

  try {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit || 500));
    if (options.status) {
      params.set("status", options.status);
    }
    if (options.state) {
      params.set("state", options.state);
    }
    if (options.baseId) {
      params.set("base_id", options.baseId);
    }

    const payload = await requestApi(`/vehicles/?${params.toString()}`);
    const vehicles = Array.isArray(payload.data) ? payload.data.map(mapBackendVehicleToUi) : [];
    if (!hasScopedQuery) {
      backendVehicleCache = { fetchedAt: now, data: vehicles };
    }
    return { success: true, data: vehicles, source: "backend" };
  } catch (error) {
    return { success: false, data: [], error: error.message || "Vehicle API request failed." };
  }
}

async function performVehicleOperation(options) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    const payload = await requestApi("/vehicles/operate/", {
      method: "POST",
      body: {
        actor_user_id: actorUserId,
        base_id: options.baseId,
        operation: options.operation,
        vehicle_type: options.vehicleType,
        model: options.model || "",
        quantity: Number(options.quantity || 1),
        reason: options.reason || "Vehicle operation from dashboard"
      }
    });
    clearVehicleApiCache();
    return { success: true, data: payload.data || {} };
  } catch (error) {
    return { success: false, error: error.message || "Vehicle operation failed." };
  }
}

async function createVehicle(options) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    const body = {
      actor_user_id: actorUserId,
      base_id: options.baseId,
      vehicle_no: options.plateNo,
      vehicle_type: options.vehicleType,
      model: options.model || "",
      operational_status: mapUiStatusToBackend(options.status || "Active"),
      reason: options.reason || "Vehicle created from dashboard"
    };
    if (options.manufactureDate) {
      body.manufacture_date = options.manufactureDate;
    }

    const payload = await requestApi("/vehicles/create/", {
      method: "POST",
      body
    });
    clearVehicleApiCache();
    return { success: true, data: payload.data || {} };
  } catch (error) {
    const parsed = extractApiError(error, "Vehicle create failed.");
    return { success: false, error: parsed.message, details: parsed.details };
  }
}

async function updateVehicleDetails(vehicleId, updates) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    const payload = await requestApi(`/vehicles/${encodeURIComponent(vehicleId)}/`, {
      method: "PUT",
      body: {
        actor_user_id: actorUserId,
        type: updates.type,
        model: updates.model,
        city: updates.city,
        state: updates.state,
        pincode: updates.pincode,
        operational_status: mapUiStatusToBackend(updates.status),
        reason: updates.reason || "Vehicle details updated from dashboard"
      }
    });
    clearVehicleApiCache();
    return { success: true, data: payload.data || {} };
  } catch (error) {
    return { success: false, error: error.message || "Vehicle update failed." };
  }
}

async function deleteVehicleById(vehicleId, options = {}) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    const params = new URLSearchParams();
    params.set("actor_user_id", actorUserId);
    if (options.reason) {
      params.set("reason", options.reason);
    }

    const payload = await requestApi(`/vehicles/${encodeURIComponent(vehicleId)}/?${params.toString()}`, {
      method: "DELETE",
      body: options.reason ? { reason: options.reason } : undefined
    });
    clearVehicleApiCache();
    return { success: true, data: payload.data || {} };
  } catch (error) {
    const parsed = extractApiError(error, "Vehicle decommission failed.");
    return { success: false, error: parsed.message, details: parsed.details };
  }
}

async function fetchMaintenanceFromBackend(options = {}) {
  if (!isBackendApiConfigured()) {
    return { success: false, data: [], error: "Backend API URL is not configured." };
  }

  const now = Date.now();
  const hasScopedQuery = Boolean(options.serviceType || options.vehicleNo || options.baseId);
  const cacheIsValid = (now - backendMaintenanceCache.fetchedAt) < BACKEND_CACHE_TTL_MS;
  if (!options.force && !hasScopedQuery && cacheIsValid && backendMaintenanceCache.data.length > 0) {
    return { success: true, data: backendMaintenanceCache.data.slice(), source: "cache" };
  }

  try {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit || 500));
    params.set("actor_user_id", getCurrentActorUserId());
    if (options.serviceType) {
      params.set("service_type", options.serviceType);
    }
    if (options.vehicleNo) {
      params.set("vehicle_no", options.vehicleNo);
    }
    if (options.baseId) {
      params.set("base_id", options.baseId);
    }

    const payload = await requestApi(`/maintenance/?${params.toString()}`);
    const rows = Array.isArray(payload.data) ? payload.data.map(mapBackendMaintenanceToUi) : [];
    if (!hasScopedQuery) {
      backendMaintenanceCache = { fetchedAt: now, data: rows };
    }
    return { success: true, data: rows, source: "backend" };
  } catch (error) {
    return { success: false, data: [], error: error.message || "Maintenance API request failed." };
  }
}

async function createMaintenance(entry) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    const payload = await requestApi("/maintenance/", {
      method: "POST",
      body: {
        actor_user_id: actorUserId,
        vehicle_id: entry.vehicleId,
        service_date: entry.date,
        service_type: entry.type,
        outcome: entry.description,
        duration_hours: Number(entry.downtime || 0),
        cost: Number(entry.cost || 0),
        reason: entry.reason || "Maintenance added from dashboard"
      }
    });
    clearMaintenanceApiCache();
    return { success: true, data: mapBackendMaintenanceToUi(payload.data || {}) };
  } catch (error) {
    return { success: false, error: error.message || "Failed to add maintenance record." };
  }
}

async function updateMaintenance(recordId, entry) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    const payload = await requestApi(`/maintenance/${encodeURIComponent(recordId)}/`, {
      method: "PUT",
      body: {
        actor_user_id: actorUserId,
        vehicle_id: entry.vehicleId,
        service_date: entry.date,
        service_type: entry.type,
        outcome: entry.description,
        duration_hours: Number(entry.downtime || 0),
        cost: Number(entry.cost || 0),
        reason: entry.reason || "Maintenance updated from dashboard"
      }
    });
    clearMaintenanceApiCache();
    return { success: true, data: mapBackendMaintenanceToUi(payload.data || {}) };
  } catch (error) {
    return { success: false, error: error.message || "Failed to update maintenance record." };
  }
}

async function deleteMaintenance(recordId) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    await requestApi(`/maintenance/${encodeURIComponent(recordId)}/?actor_user_id=${encodeURIComponent(actorUserId)}`, {
      method: "DELETE"
    });
    clearMaintenanceApiCache();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || "Failed to delete maintenance record." };
  }
}

async function fetchInventoryFromBackend(options = {}) {
  if (!isBackendApiConfigured()) {
    return { success: false, data: [], error: "Backend API URL is not configured." };
  }

  const now = Date.now();
  const hasScopedQuery = Boolean(options.vehicleNo || options.partName || options.baseId);
  const cacheIsValid = (now - backendInventoryCache.fetchedAt) < BACKEND_CACHE_TTL_MS;
  if (!options.force && !hasScopedQuery && cacheIsValid && backendInventoryCache.data.length > 0) {
    return { success: true, data: backendInventoryCache.data.slice(), source: "cache" };
  }

  try {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit || 500));
    params.set("actor_user_id", getCurrentActorUserId());
    if (options.vehicleNo) {
      params.set("vehicle_no", options.vehicleNo);
    }
    if (options.partName) {
      params.set("part_name", options.partName);
    }
    if (options.baseId) {
      params.set("base_id", options.baseId);
    }

    const payload = await requestApi(`/inventory/?${params.toString()}`);
    const rows = Array.isArray(payload.data) ? payload.data.map(mapBackendInventoryToUi) : [];
    if (!hasScopedQuery) {
      backendInventoryCache = { fetchedAt: now, data: rows };
    }
    return { success: true, data: rows, source: "backend" };
  } catch (error) {
    return { success: false, data: [], error: error.message || "Inventory API request failed." };
  }
}

async function createInventory(entry) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    const payload = await requestApi("/inventory/", {
      method: "POST",
      body: {
        actor_user_id: actorUserId,
        vehicle_id: entry.vehicleId,
        part_name: entry.name,
        quantity: Number(entry.quantity || 0),
        unit_cost: Number(entry.unitCost || 0),
        supplier: entry.supplier || "",
        record_id: entry.recordId || "",
        reason: entry.reason || "Inventory part added from dashboard"
      }
    });
    clearInventoryApiCache();
    return { success: true, data: mapBackendInventoryToUi(payload.data || {}) };
  } catch (error) {
    return { success: false, error: error.message || "Failed to add inventory part." };
  }
}

async function updateInventory(partId, entry) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    const payload = await requestApi(`/inventory/${encodeURIComponent(partId)}/`, {
      method: "PUT",
      body: {
        actor_user_id: actorUserId,
        vehicle_id: entry.vehicleId,
        part_name: entry.name,
        quantity: Number(entry.quantity || 0),
        unit_cost: Number(entry.unitCost || 0),
        supplier: entry.supplier || "",
        record_id: entry.recordId || "",
        reason: entry.reason || "Inventory part updated from dashboard"
      }
    });
    clearInventoryApiCache();
    return { success: true, data: mapBackendInventoryToUi(payload.data || {}) };
  } catch (error) {
    return { success: false, error: error.message || "Failed to update inventory part." };
  }
}

async function deleteInventory(partId) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    await requestApi(`/inventory/${encodeURIComponent(partId)}/?actor_user_id=${encodeURIComponent(actorUserId)}`, {
      method: "DELETE"
    });
    clearInventoryApiCache();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || "Failed to delete inventory part." };
  }
}

async function fetchLatestMlStatus(limit = 200) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session.", data: null };
  }

  try {
    const payload = await requestApi(`/ml/latest/?actor_user_id=${encodeURIComponent(actorUserId)}&limit=${encodeURIComponent(String(limit))}`);
    return { success: true, data: payload.data || null };
  } catch (error) {
    const parsed = extractApiError(error, "Failed to load ML status.");
    return { success: false, data: null, error: parsed.message, details: parsed.details };
  }
}

async function triggerMlInference(timeoutSeconds = 1200) {
  const actorUserId = getCurrentActorUserId();
  if (!actorUserId) {
    return { success: false, error: "No active user session." };
  }

  try {
    const payload = await requestApi("/ml/run-inference/", {
      method: "POST",
      timeoutMs: (Number(timeoutSeconds) * 1000) + 15000,
      body: {
        actor_user_id: actorUserId,
        timeout_seconds: timeoutSeconds
      }
    });
    return { success: true, data: payload };
  } catch (error) {
    const parsed = extractApiError(error, "Failed to trigger inference.");
    return { success: false, error: parsed.message, details: parsed.details };
  }
}

async function fetchFleetSummary() {
  try {
    const payload = await requestApi("/fleet/summary/");
    return { success: true, data: payload.data };
  } catch (error) {
    return { success: false, data: null, error: error.message || "Fleet summary API request failed." };
  }
}

async function fetchSystemHealth() {
  try {
    const payload = await requestApi("/health/");
    return { success: true, data: payload.services };
  } catch (error) {
    return { success: false, data: null, error: error.message || "System health API request failed." };
  }
}

function initializeData() {
  if (!localStorage.getItem(STORAGE_KEYS.VEHICLES)) {
    localStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(FALLBACK_VEHICLES));
  }
  if (!localStorage.getItem(STORAGE_KEYS.MAINTENANCE)) {
    localStorage.setItem(STORAGE_KEYS.MAINTENANCE, JSON.stringify(FALLBACK_MAINTENANCE));
  }
  if (!localStorage.getItem(STORAGE_KEYS.INVENTORY)) {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(FALLBACK_INVENTORY));
  }
}

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

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

window.AppData = {
  STORAGE_KEYS,
  MOCK_BASES,
  VEHICLE_TYPES,
  getApiBaseUrl,
  isBackendApiConfigured,
  getCurrentRole,
  getCurrentActorUserId,
  loginWithBackend,
  fetchSystemHealth,
  fetchFleetSummary,
  fetchVehiclesFromBackend,
  createVehicle,
  performVehicleOperation,
  updateVehicleDetails,
  deleteVehicleById,
  fetchMaintenanceFromBackend,
  createMaintenance,
  updateMaintenance,
  deleteMaintenance,
  fetchInventoryFromBackend,
  createInventory,
  updateInventory,
  deleteInventory,
  fetchLatestMlStatus,
  triggerMlInference,
  getCachedBackendVehicles,
  getCachedBackendMaintenance,
  getCachedBackendInventory,
  clearVehicleApiCache,
  clearMaintenanceApiCache,
  clearInventoryApiCache,
  mapUiStatusToBackend,
  initializeData,
  getData,
  saveData,
  addItem,
  updateItem,
  deleteItem,
  generateId,
  setSession,
  getSession,
  clearSession
};
