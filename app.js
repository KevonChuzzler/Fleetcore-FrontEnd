/**
 * FleetCore Management - Frontend Application Controller
 * Handles Google Identity Services (GIS) auth, API calls with JWT Bearer tokens,
 * Live Fleet Tracking view, and Vehicle-Driver Assignments management.
 */

// Application State & Configuration
const AppState = {
  // Backend API Base URL (matches Jakarta EE deployment context)
  apiBaseUrl: localStorage.getItem('fleetcore_api_url') || 'http://localhost:8080/fleetcore-1.0.0-SNAPSHOT/api',
  // Google OAuth Client ID (can be customized by user or configured via settings)
  googleClientId: localStorage.getItem('fleetcore_google_client_id') || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
  // Active Tab: 'tracking' | 'assignments'
  currentTab: 'tracking',
  // Tracking Data cache
  trackingData: [],
  // Assignments Data cache
  assignmentsData: [],
  // Filter query for tracking
  trackingFilter: '',
  // Status filter for tracking
  statusFilter: 'ALL',
  // Data Source Mode: 'live' (strictly local backend) | 'mock' (built-in demo dataset) | 'auto' (try live, fallback to mock)
  dataSourceMode: localStorage.getItem('fleetcore_data_mode') || 'auto',
  // Current active data source: 'LIVE_BACKEND' | 'MOCK_DEMO'
  activeSource: 'MOCK_DEMO',
  // Auto-refresh interval ID & interval seconds
  autoRefreshIntervalId: null,
  autoRefreshSeconds: 0,
  lastUpdatedTime: null,
  // Google Maps & Live Tracking Map State
  googleMapsApiKey: (() => {
    try {
      const stored = localStorage.getItem('fleetcore_gmaps_key');
      if (stored && stored !== 'AIzaSyAq7msUY19gHJw2WURKeThNDyttS19HPl8' && stored.trim().length > 15) {
        return stored.trim();
      }
      const envKey = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY : '';
      if (envKey && envKey !== 'AIzaSyAq7msUY19gHJw2WURKeThNDyttS19HPl8' && envKey.trim().length > 15) {
        return envKey.trim();
      }
    } catch (e) {}
    return '';
  })(),
  mapEngine: null,
  googleMap: null,
  leafletMap: null,
  googleInfoWindow: null,
  mapMarkers: {},
  mapCountdown: 5,
  mapCountdownIntervalId: null,
  activeFocusedVehicleId: null,
};

// Clean up invalid placeholder key from localStorage
try {
  if (localStorage.getItem('fleetcore_gmaps_key') === 'AIzaSyAq7msUY19gHJw2WURKeThNDyttS19HPl8') {
    localStorage.removeItem('fleetcore_gmaps_key');
  }
} catch (e) {}

/**
 * Completely purges and unmounts all markers regardless of map engine
 */
export function clearAllMapMarkers() {
  if (AppState.mapMarkers) {
    Object.keys(AppState.mapMarkers).forEach(vId => {
      const marker = AppState.mapMarkers[vId];
      try {
        if (marker && typeof marker.setMap === 'function') {
          marker.setMap(null);
        } else if (marker && typeof marker.remove === 'function') {
          marker.remove();
        }
      } catch (err) {
        console.warn('Error removing marker:', err);
      }
    });
  }
  AppState.mapMarkers = {};
}

// ==========================================
// Road Corridors & Real-World Address Resolution
// ==========================================

/**
 * Precision road coordinates sampled strictly along real highways, 
 * arterials, and streets in Mbombela (Nelspruit), Mpumalanga.
 */
export const DEMO_ROAD_ROUTES = {
  // Route 1: N4 Toll Route (Trans-Kalahari / Maputo Corridor Freeway)
  N4_CORRIDOR: [
    { lat: -25.4518, lng: 30.9232, street: 'N4 Toll Route (KM 41), Mataffin' },
    { lat: -25.4532, lng: 30.9315, street: 'N4 Toll Route, near Mbombela Stadium' },
    { lat: -25.4548, lng: 30.9392, street: 'N4 Toll Route, Stadium Flyover' },
    { lat: -25.4575, lng: 30.9472, street: 'N4 Toll Route, West Acres Interchange' },
    { lat: -25.4608, lng: 30.9545, street: 'N4 Toll Route, Mataffin Junction' },
    { lat: -25.4632, lng: 30.9630, street: 'N4 Toll Route, Crossing Flyover' },
    { lat: -25.4658, lng: 30.9735, street: 'N4 Toll Route, Central Bypass' },
    { lat: -25.4682, lng: 30.9852, street: 'N4 Toll Route, Valencia Cut' },
    { lat: -25.4705, lng: 30.9985, street: 'N4 Toll Route (KM 49), Orchards' },
    { lat: -25.4728, lng: 31.0145, street: 'N4 Toll Route, Karino Interchange' },
    { lat: -25.4755, lng: 31.0320, street: 'N4 Toll Route, Karino East' },
    { lat: -25.4782, lng: 31.0515, street: 'N4 Toll Route, Crocodile Valley' }
  ],

  // Route 2: R40 (Madiba Drive) North-South Arterial
  R40_MADIBA_DR: [
    { lat: -25.4378, lng: 30.9632, street: 'R40 (Madiba Dr), near Riverside Mall' },
    { lat: -25.4435, lng: 30.9648, street: 'R40 (Madiba Dr), Emnotweni Corridor' },
    { lat: -25.4512, lng: 30.9668, street: 'R40 (Madiba Dr), Riverside Park South' },
    { lat: -25.4602, lng: 30.9682, street: 'R40 (Madiba Dr), Crossing Junction' },
    { lat: -25.4688, lng: 30.9692, street: 'R40 (Madiba Dr), Sonpark Intersection' },
    { lat: -25.4775, lng: 30.9702, street: 'R40 (Madiba Dr), West Acres Crossing' },
    { lat: -25.4885, lng: 30.9712, street: 'R40 (Madiba Dr), Lowveld High Corridor' },
    { lat: -25.5015, lng: 30.9725, street: 'R40 (Madiba Dr), Nelindia South' },
    { lat: -25.5135, lng: 30.9738, street: 'R40 (Madiba Dr), Barberton Road Link' }
  ],

  // Route 3: Samora Machel Drive (R104) CBD Main Arterial
  SAMORA_MACHEL_R104: [
    { lat: -25.4705, lng: 30.9422, street: 'Samora Machel Dr (R104), near Ilanga Mall' },
    { lat: -25.4715, lng: 30.9518, street: 'Samora Machel Dr (R104), West Acres Gateway' },
    { lat: -25.4722, lng: 30.9615, street: 'Samora Machel Dr (R104), Henshall St Crossing' },
    { lat: -25.4732, lng: 30.9718, street: 'Samora Machel Dr (R104), Bester St (CBD)' },
    { lat: -25.4740, lng: 30.9825, street: 'Samora Machel Dr (R104), Railway Plaza' },
    { lat: -25.4746, lng: 30.9935, street: 'Samora Machel Dr (R104), Valencia Park Link' }
  ],

  // Route 4: N4 Eastern Bypass to Karino / Kanyamazane Link
  N4_EASTERN_BYPASS: [
    { lat: -25.4672, lng: 30.9845, street: 'N4 Eastern Bypass, Valencia Link' },
    { lat: -25.4698, lng: 30.9980, street: 'N4 Eastern Bypass (KM 50), Orchards' },
    { lat: -25.4728, lng: 31.0165, street: 'N4 Eastern Bypass, Karino Interchange' },
    { lat: -25.4755, lng: 31.0345, street: 'N4 Eastern Corridor, Plaston Junction' },
    { lat: -25.4782, lng: 31.0535, street: 'N4 Toll Route, Crocodile Valley Bridge' }
  ]
};

// Internal address cache to prevent repeated reverse-geocoding requests
const addressCache = new Map();
let lastGeocodeRequestTime = 0;

/**
 * Known regional road corridors for instant coordinate snapping
 */
const KNOWN_ROAD_ZONES = [
  { street: 'N4 Toll Route, Mbombela', latMin: -25.485, latMax: -25.448, lngMin: 30.915, lngMax: 31.065 },
  { street: 'R40 (Madiba Dr), Mbombela', latMin: -25.520, latMax: -25.430, lngMin: 30.960, lngMax: 30.976 },
  { street: 'Samora Machel Dr (R104), Mbombela', latMin: -25.476, latMax: -25.468, lngMin: 30.940, lngMax: 30.998 },
  { street: 'Ferreira St, Mbombela CBD', latMin: -25.486, latMax: -25.473, lngMin: 30.976, lngMax: 30.982 },
  { street: 'Kaapschehoop Rd, West Acres', latMin: -25.510, latMax: -25.480, lngMin: 30.930, lngMax: 30.960 },
  { street: 'Government Blvd, Riverside Park', latMin: -25.442, latMax: -25.430, lngMin: 30.968, lngMax: 30.978 },
  { street: 'Rapid St, Riverside Industrial', latMin: -25.443, latMax: -25.435, lngMin: 30.964, lngMax: 30.972 }
];

/**
 * Returns a human-readable street address for any vehicle record.
 * Handles both mock simulation data and live Jakarta EE backend responses.
 */
export function getVehicleAddress(item) {
  if (!item) return 'Unknown Location';

  // 1. Direct explicit address supplied by backend API or demo model
  const explicit = item.address || item.street || item.streetName || item.location || item.locationName || item.formattedAddress;
  if (explicit && typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const lat = parseFloat(item.latitude);
  const lng = parseFloat(item.longitude);
  if (isNaN(lat) || isNaN(lng)) {
    return 'No GPS Fix';
  }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (addressCache.has(cacheKey)) {
    return addressCache.get(cacheKey);
  }

  // 2. Check if coordinates sit inside a known road corridor
  for (const zone of KNOWN_ROAD_ZONES) {
    if (lat >= zone.latMin && lat <= zone.latMax && lng >= zone.lngMin && lng <= zone.lngMax) {
      addressCache.set(cacheKey, zone.street);
      return zone.street;
    }
  }

  // 3. Fallback descriptor with coordinates
  const fallback = `Road Corridor (${lat.toFixed(4)}, ${lng.toFixed(4)}), Mbombela`;
  addressCache.set(cacheKey, fallback);

  // 4. Trigger asynchronous reverse-geocoding for precise live street names
  triggerAsyncReverseGeocode(lat, lng, cacheKey);

  return fallback;
}

/**
 * Asynchronously looks up real street name using Google Geocoder or OpenStreetMap Nominatim
 */
function triggerAsyncReverseGeocode(lat, lng, cacheKey) {
  // If Google Maps API is loaded and available
  if (window.google?.maps?.Geocoder) {
    try {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const formatted = results[0].formatted_address;
          if (formatted) {
            const shortStreet = formatted.split(',').slice(0, 2).join(',').trim();
            addressCache.set(cacheKey, shortStreet);
            updateResolvedAddressInUI(cacheKey, shortStreet);
          }
        }
      });
      return;
    } catch (e) {}
  }

  // Rate-limited OpenStreetMap Nominatim reverse geocode fallback
  const now = Date.now();
  if (now - lastGeocodeRequestTime > 1200) {
    lastGeocodeRequestTime = now;
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.address) {
          const road = data.address.road || data.address.street || data.address.pedestrian || data.address.suburb;
          const suburb = data.address.suburb || data.address.city || data.address.town || 'Mbombela';
          const resolved = road ? `${road}, ${suburb}` : data.display_name?.split(',').slice(0, 2).join(',').trim();
          if (resolved) {
            addressCache.set(cacheKey, resolved);
            updateResolvedAddressInUI(cacheKey, resolved);
          }
        }
      })
      .catch(() => {});
  }
}

/**
 * Dynamically updates DOM elements when an address has resolved
 */
function updateResolvedAddressInUI(cacheKey, resolvedAddress) {
  const elements = document.querySelectorAll(`[data-addr-key="${cacheKey}"]`);
  elements.forEach(el => {
    el.textContent = resolvedAddress;
    el.title = resolvedAddress;
  });
}

// ==========================================
// 1. Google Identity Services (Auth Module)
// ==========================================

/**
 * Parses JWT token payload without external libraries
 */
export function parseJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to parse JWT token payload:', e);
    return null;
  }
}

/**
 * Returns the stored Google ID Token from sessionStorage
 */
export function getStoredToken() {
  return sessionStorage.getItem('google_jwt');
}

/**
 * Saves the Google ID Token to sessionStorage
 */
export function setStoredToken(token) {
  if (token) {
    sessionStorage.setItem('google_jwt', token);
  } else {
    sessionStorage.removeItem('google_jwt');
  }
  updateAuthUI();
}

/**
 * Clears authentication state (Sign Out)
 */
export function signOut() {
  sessionStorage.removeItem('google_jwt');
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  updateAuthUI();
  showNotification('Signed out successfully', 'info');
}

/**
 * Handles callback from Google Identity Services
 */
function handleGoogleCredentialResponse(response) {
  if (response && response.credential) {
    setStoredToken(response.credential);
    const payload = parseJwt(response.credential);
    const userName = payload?.name || payload?.email || 'User';
    showNotification(`Welcome back, ${userName}! Signed in via Google.`, 'success');
  } else {
    showNotification('Google Sign-In failed or was cancelled.', 'error');
  }
}

/**
 * Initialize Google Identity Services (GIS)
 */
export function initGoogleAuth() {
  const token = getStoredToken();
  updateAuthUI();

  // If GIS script is loaded
  if (window.google?.accounts?.id) {
    try {
      window.google.accounts.id.initialize({
        client_id: AppState.googleClientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      const btnContainer = document.getElementById('google-btn-container');
      if (btnContainer && !token) {
        btnContainer.innerHTML = '';
        window.google.accounts.id.renderButton(btnContainer, {
          theme: 'outline',
          size: 'medium',
          type: 'standard',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
        });
      }
    } catch (err) {
      console.warn('GIS initialization notice (valid Client ID required for live Google OAuth):', err);
    }
  }
}

/**
 * Updates UI based on signed-in / signed-out state
 */
function updateAuthUI() {
  const token = getStoredToken();
  const unauthView = document.getElementById('auth-unauthenticated');
  const authView = document.getElementById('auth-authenticated');
  const userAvatar = document.getElementById('auth-user-avatar');
  const userName = document.getElementById('auth-user-name');
  const userEmail = document.getElementById('auth-user-email');
  const tokenBadge = document.getElementById('token-status-badge');

  if (token) {
    const payload = parseJwt(token);
    if (unauthView) unauthView.classList.add('hidden');
    if (authView) authView.classList.remove('hidden');

    const name = payload?.name || 'Authorized User';
    const email = payload?.email || 'Authenticated via JWT';
    const picture = payload?.picture;

    if (userName) userName.textContent = name;
    if (userEmail) userEmail.textContent = email;
    if (userAvatar) {
      if (picture) {
        userAvatar.src = picture;
        userAvatar.classList.remove('hidden');
      } else {
        userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e3a8a&color=fff`;
        userAvatar.classList.remove('hidden');
      }
    }

    if (tokenBadge) {
      tokenBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer hover:bg-emerald-200 transition-colors';
      tokenBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Google JWT Injected';
      tokenBadge.title = 'Click to inspect JWT Token claims';
    }
  } else {
    if (unauthView) unauthView.classList.remove('hidden');
    if (authView) authView.classList.add('hidden');

    if (tokenBadge) {
      tokenBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer hover:bg-amber-200 transition-colors';
      tokenBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span> No Token (Unauthenticated)';
      tokenBadge.title = 'Click to configure or insert a test token';
    }

    const btnContainer = document.getElementById('google-btn-container');
    if (btnContainer && window.google?.accounts?.id) {
      btnContainer.innerHTML = '';
      try {
        window.google.accounts.id.renderButton(btnContainer, {
          theme: 'outline',
          size: 'medium',
          type: 'standard',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
        });
      } catch (e) {}
    }
  }
}

// ==========================================
// 2. Centralized Fetch API Client
// ==========================================

/**
 * Makes an HTTP request to the Jakarta EE backend.
 * Automatically injects `Authorization: Bearer <token>` when a token exists in sessionStorage.
 */
export async function apiFetch(endpoint, options = {}) {
  const url = `${AppState.apiBaseUrl.replace(/\/$/, '')}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Automatically inject Google JWT from sessionStorage
  const token = getStoredToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const fetchOptions = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, fetchOptions);

    if (response.status === 401) {
      showNotification('Unauthorized (401). Please sign in with Google or provide a valid JWT Bearer token.', 'warning');
      throw new Error('401 Unauthorized');
    }

    if (response.status === 403) {
      showNotification('Access Forbidden (403). Your role lacks permissions for this fleet resource.', 'error');
      throw new Error('403 Forbidden');
    }

    if (!response.ok) {
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = errJson.message || errJson.error || JSON.stringify(errJson);
      } catch (e) {
        errDetail = await response.text();
      }
      const message = `Server error ${response.status}: ${errDetail || response.statusText}`;
      showNotification(message, 'error');
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      console.warn(`[FleetCore] Backend connection to ${url} failed.`, error);
      throw new Error(`Cannot connect to Jakarta EE backend at "${AppState.apiBaseUrl}". Ensure backend is running and CORS is enabled.`);
    }
    throw error;
  }
}

// ==========================================
// 3. View 1: Fleet Tracking Controller
// ==========================================

/**
 * Fetches and displays tracking data from GET /api/tracking or mock dataset
 */
export async function loadTrackingData() {
  const tableBody = document.getElementById('tracking-table-body');
  const refreshBtn = document.getElementById('btn-refresh-tracking');
  const loadingIndicator = document.getElementById('tracking-loading');
  const emptyState = document.getElementById('tracking-empty');
  const errorAlert = document.getElementById('tracking-error');

  if (refreshBtn) refreshBtn.classList.add('animate-spin');
  if (loadingIndicator) loadingIndicator.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');
  if (errorAlert) errorAlert.classList.add('hidden');

  try {
    let data;

    if (AppState.dataSourceMode === 'mock') {
      // User explicitly selected Mock Demo mode
      AppState.activeSource = 'MOCK_DEMO';
      updateDataSourceUI();
      data = getSampleTrackingData();
    } else if (AppState.dataSourceMode === 'live') {
      // User explicitly selected Live Backend mode (do not fallback silently to mock)
      try {
        data = await apiFetch('/tracking', { method: 'GET' });
        AppState.activeSource = 'LIVE_BACKEND';
        updateDataSourceUI();
      } catch (apiErr) {
        AppState.activeSource = 'LIVE_BACKEND_ERROR';
        updateDataSourceUI(apiErr.message);
        throw apiErr;
      }
    } else {
      // 'auto' mode: try live backend first, fallback gracefully to mock with notification
      try {
        data = await apiFetch('/tracking', { method: 'GET' });
        AppState.activeSource = 'LIVE_BACKEND';
        updateDataSourceUI();
      } catch (apiErr) {
        console.info('Live backend unreachable, falling back to sample dataset in auto mode:', apiErr.message);
        AppState.activeSource = 'MOCK_DEMO';
        updateDataSourceUI(apiErr.message);
        data = getSampleTrackingData();
      }
    }

    AppState.trackingData = Array.isArray(data) ? data : (data.trackingList || data.items || []);
    AppState.lastUpdatedTime = new Date();
    renderTrackingTable();
    updateTrackingMetrics();
    updateMapMarkers();
  } catch (err) {
    if (errorAlert) {
      errorAlert.classList.remove('hidden');
      const errText = document.getElementById('tracking-error-message');
      if (errText) errText.textContent = err.message;
    }
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('animate-spin');
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
  }
}

/**
 * Renders tracking data into table rows
 */
function renderTrackingTable() {
  const tableBody = document.getElementById('tracking-table-body');
  const emptyState = document.getElementById('tracking-empty');
  if (!tableBody) return;

  const filterText = AppState.trackingFilter.toLowerCase().trim();
  const statusFilter = AppState.statusFilter;

  const filtered = AppState.trackingData.filter(item => {
    const vId = String(item.vehicle?.vehicleId ?? item.vehicleId ?? '').toLowerCase();
    const plate = String(item.vehicle?.licensePlate ?? item.licensePlate ?? item.vehicle?.model ?? '').toLowerCase();
    const driver = String(item.driver?.name ?? item.driverName ?? item.driver?.driverId ?? '').toLowerCase();
    const status = String(item.status ?? 'ACTIVE').toUpperCase();
    const address = getVehicleAddress(item).toLowerCase();

    const matchesSearch = !filterText || vId.includes(filterText) || plate.includes(filterText) || driver.includes(filterText) || address.includes(filterText);
    const matchesStatus = statusFilter === 'ALL' || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  tableBody.innerHTML = filtered.map(item => {
    const vId = item.vehicle?.vehicleId ?? item.vehicleId ?? '—';
    const plate = item.vehicle?.licensePlate ?? item.licensePlate ?? `FLT-${vId}`;
    const model = item.vehicle?.model ?? item.vehicle?.make ?? 'Fleet Carrier';
    const driverName = item.driver?.name ?? (item.driver?.driverId ? `Driver #${item.driver.driverId}` : 'Unassigned');
    const speed = item.speed != null ? `${Math.round(item.speed)} km/h` : '0 km/h';
    const lat = item.latitude != null ? Number(item.latitude).toFixed(4) : '—';
    const lng = item.longitude != null ? Number(item.longitude).toFixed(4) : '—';
    const fuel = item.fuelLevel != null ? Math.round(item.fuelLevel) : (item.batteryLevel ?? 85);
    const status = (item.status || 'ACTIVE').toUpperCase();
    const timestamp = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    const address = getVehicleAddress(item);
    const addrKey = lat !== '—' && lng !== '—' ? `${lat},${lng}` : '';

    let statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    let dotClass = 'bg-emerald-500';
    if (status === 'IDLE') {
      statusClass = 'bg-amber-50 text-amber-700 border-amber-200';
      dotClass = 'bg-amber-500';
    } else if (status === 'IN_TRANSIT' || status === 'MOVING') {
      statusClass = 'bg-blue-50 text-blue-700 border-blue-200';
      dotClass = 'bg-blue-500';
    } else if (status === 'MAINTENANCE' || status === 'OFFLINE') {
      statusClass = 'bg-rose-50 text-rose-700 border-rose-200';
      dotClass = 'bg-rose-500';
    }

    return `
      <tr 
        class="fleet-table-row border-b border-slate-100 hover:bg-blue-50/50 cursor-pointer transition-colors group" 
        onclick="window.focusVehicleOnMap && window.focusVehicleOnMap('${vId}')"
        title="Click to locate Vehicle #${vId} on Live Map"
      >
        <td class="py-3.5 px-4 font-mono text-xs font-semibold text-slate-800">
          <div class="flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>#${vId}</span>
          </div>
        </td>
        <td class="py-3.5 px-4">
          <div class="font-medium text-slate-900 text-sm group-hover:text-blue-700 transition-colors">${plate}</div>
          <div class="text-xs text-slate-500">${model}</div>
        </td>
        <td class="py-3.5 px-4">
          <div class="text-sm font-medium text-slate-800">${driverName}</div>
          <div class="text-xs text-slate-400">ID: ${item.driver?.driverId ?? 'N/A'}</div>
        </td>
        <td class="py-3.5 px-4">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${statusClass}">
            <span class="w-1.5 h-1.5 rounded-full ${dotClass}"></span>
            ${status}
          </span>
        </td>
        <td class="py-3.5 px-4 font-mono-tabular text-sm text-slate-700">
          ${speed}
        </td>
        <td class="py-3.5 px-4 min-w-[220px]">
          <div class="flex items-center gap-1.5 font-medium text-slate-900 text-xs">
            <svg class="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span class="truncate max-w-[210px]" data-addr-key="${addrKey}" title="${address}">${address}</span>
          </div>
          <div class="text-[11px] font-mono text-slate-400 pl-5">${lat !== '—' ? `${lat}, ${lng}` : 'No GPS Fix'}</div>
        </td>
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-2">
            <div class="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div class="h-1.5 rounded-full ${fuel < 20 ? 'bg-rose-500' : fuel < 50 ? 'bg-amber-500' : 'bg-emerald-500'}" style="width: ${fuel}%"></div>
            </div>
            <span class="text-xs font-mono text-slate-600">${fuel}%</span>
          </div>
        </td>
        <td class="py-3.5 px-4 text-xs text-slate-500 font-mono">
          ${timestamp}
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Updates summary metrics at top of Tracking View
 */
function updateTrackingMetrics() {
  const totalEl = document.getElementById('metric-total-vehicles');
  const activeEl = document.getElementById('metric-active-vehicles');
  const inTransitEl = document.getElementById('metric-in-transit');
  const idleEl = document.getElementById('metric-idle');

  const total = AppState.trackingData.length;
  const active = AppState.trackingData.filter(i => (i.status || 'ACTIVE').toUpperCase() === 'ACTIVE' || (i.status || '').toUpperCase() === 'MOVING').length;
  const inTransit = AppState.trackingData.filter(i => (i.status || '').toUpperCase() === 'IN_TRANSIT').length;
  const idle = AppState.trackingData.filter(i => (i.status || '').toUpperCase() === 'IDLE').length;

  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = active || Math.max(1, total - idle);
  if (inTransitEl) inTransitEl.textContent = inTransit;
  if (idleEl) idleEl.textContent = idle;
}

// ==========================================
// 4. Live Fleet Map Controller (Google Maps & Real-Time Telematics)
// ==========================================

/**
 * Initializes the map engine: loads Google Maps if API key exists,
 * or boots Leaflet/OpenStreetMap as an immediate live preview.
 */
let googleMapsInitAttempts = 0;

export function initFleetMap() {
  const mapCanvas = document.getElementById('fleet-map-canvas');
  if (!mapCanvas) return;

  const quickKeyInput = document.getElementById('input-quick-gmaps-key');
  const settingsKeyInput = document.getElementById('settings-gmaps-key');
  const guideKeyInput = document.getElementById('guide-input-gmaps-key');
  const banner = document.getElementById('gmaps-key-banner');

  if (AppState.googleMapsApiKey) {
    if (quickKeyInput) quickKeyInput.value = AppState.googleMapsApiKey;
    if (settingsKeyInput) settingsKeyInput.value = AppState.googleMapsApiKey;
    if (guideKeyInput) guideKeyInput.value = AppState.googleMapsApiKey;
    if (banner) banner.classList.add('hidden');

    setupGoogleMap();
  } else {
    if (banner) banner.classList.remove('hidden');
    setupLeafletMap();
  }
}

/**
 * Dynamically injects Google Maps JavaScript API script if bootstrap loader needs fallback
 */
function loadGoogleMapsScript(apiKey) {
  if (typeof window.google?.maps?.Map === 'function') {
    setupGoogleMap();
    return;
  }

  const existingScript = document.getElementById('google-maps-script');
  if (existingScript) return;

  const script = document.createElement('script');
  script.id = 'google-maps-script';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry,marker&loading=async`;
  script.async = true;
  script.defer = true;

  script.onload = () => {
    console.info('[FleetCore] Google Maps JavaScript API script loaded.');
    setupGoogleMap();
  };

  script.onerror = () => {
    console.error('[FleetCore] Failed to load Google Maps script. Check API key restrictions.');
    showNotification('Google Maps API key failed to load. Falling back to preview map.', 'error', 6000);
    setupLeafletMap();
  };

  document.head.appendChild(script);
}

/**
 * Safely resolves Google Maps Map and InfoWindow constructors
 */
async function resolveGoogleMapsConstructors() {
  // If global namespace already contains Map
  if (typeof window.google?.maps?.Map === 'function') {
    return {
      Map: window.google.maps.Map,
      InfoWindow: window.google.maps.InfoWindow,
      Marker: window.google.maps.Marker
    };
  }

  // If importLibrary is available
  if (typeof window.google?.maps?.importLibrary === 'function') {
    try {
      const mapsLib = await window.google.maps.importLibrary('maps');
      let markerLib = null;
      try {
        markerLib = await window.google.maps.importLibrary('marker');
      } catch (e) {
        // Marker library optional fallback
      }

      const MapClass = mapsLib?.Map || window.google?.maps?.Map;
      const InfoWindowClass = mapsLib?.InfoWindow || window.google?.maps?.InfoWindow;
      const MarkerClass = markerLib?.Marker || window.google?.maps?.Marker;

      if (typeof MapClass === 'function') {
        return {
          Map: MapClass,
          InfoWindow: InfoWindowClass,
          Marker: MarkerClass
        };
      }
    } catch (importErr) {
      console.warn('[FleetCore] importLibrary("maps") note:', importErr);
    }
  }

  return null;
}

/**
 * Sets up official Google Maps instance with robust fallback
 */
async function setupGoogleMap() {
  const mapCanvas = document.getElementById('fleet-map-canvas');
  if (!mapCanvas) return;

  try {
    const constructors = await resolveGoogleMapsConstructors();

    // If constructors are not ready yet, wait and retry or load script
    if (!constructors || typeof constructors.Map !== 'function') {
      if (googleMapsInitAttempts < 15) {
        googleMapsInitAttempts++;
        if (!document.getElementById('google-maps-script') && AppState.googleMapsApiKey) {
          loadGoogleMapsScript(AppState.googleMapsApiKey);
        }
        setTimeout(setupGoogleMap, 250);
        return;
      }
      console.warn('[FleetCore] Google Maps constructors not ready. Initializing preview map.');
      setupLeafletMap();
      return;
    }

    googleMapsInitAttempts = 0;
    const { Map: MapClass, InfoWindow: InfoWindowClass } = constructors;

    // Clear all previous markers and Leaflet instance if attached
    clearAllMapMarkers();

    if (AppState.leafletMap) {
      try {
        AppState.leafletMap.remove();
      } catch (e) {
        console.warn('Error clearing leaflet instance:', e);
      }
      AppState.leafletMap = null;
    }

    mapCanvas.innerHTML = '';

    const defaultCenter = { lat: -25.4753, lng: 30.9694 }; // Center of Mbombela (Nelspruit), South Africa
    AppState.googleMap = new MapClass(mapCanvas, {
      center: defaultCenter,
      zoom: 12,
      mapTypeId: 'roadmap',
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      internalUsageAttributionIds: ['gmp_git_agentskills_v1'],
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }]
        }
      ]
    });

    AppState.googleInfoWindow = typeof InfoWindowClass === 'function' 
      ? new InfoWindowClass() 
      : (typeof window.google?.maps?.InfoWindow === 'function' ? new window.google.maps.InfoWindow() : null);
      
    AppState.mapEngine = 'google';

    const badge = document.getElementById('map-engine-badge');
    if (badge) {
      badge.textContent = 'Google Maps (Official)';
      badge.className = 'px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200';
    }

    const banner = document.getElementById('gmaps-key-banner');
    if (banner) banner.classList.add('hidden');

    updateMapMarkers();
    showNotification('Official Google Maps Platform active!', 'success', 3000);
  } catch (e) {
    console.error('Failed to initialize Google Maps:', e);
    setupLeafletMap();
  }
}

/**
 * Gracefully handles Google Maps API authentication, activation, or billing failures
 * (e.g., ApiNotActivatedMapError, ExpiredKeyMapError, BillingNotEnabledMapError).
 */
export function handleGoogleMapsAuthFailure(reason = 'ApiNotActivatedMapError') {
  console.warn(`[FleetCore] Google Maps authorization / activation failure detected: ${reason}`);

  // Prevent repeated attempts with unactivated/broken key
  try {
    localStorage.removeItem('fleetcore_gmaps_key');
  } catch (e) {}
  AppState.googleMapsApiKey = '';

  const scriptTag = document.getElementById('google-maps-script');
  if (scriptTag) scriptTag.remove();

  // Display the dedicated error notification banner with one-click Google Cloud Console link
  const errorBanner = document.getElementById('gmaps-error-banner');
  if (errorBanner) {
    errorBanner.classList.remove('hidden');
  }

  // Update HUD badge to clearly notify user
  const badge = document.getElementById('map-engine-badge');
  if (badge) {
    badge.textContent = 'Preview Map (API Inactive)';
    badge.className = 'px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-300';
  }

  // Clear broken Google map references and markers cleanly
  clearAllMapMarkers();
  AppState.googleMap = null;
  AppState.mapEngine = 'leaflet';

  // Wipe broken gray canvas box and mount Leaflet preview map
  const mapCanvas = document.getElementById('fleet-map-canvas');
  if (mapCanvas) {
    mapCanvas.innerHTML = '';
  }

  setupLeafletMap();

  showNotification(
    'Google Maps Notice: Maps JavaScript API is not enabled on this Google Cloud project. Seamlessly running on Live Preview Map.',
    'warning',
    7000
  );
}

// Attach to window so external callbacks and early loaders can invoke it
if (typeof window !== 'undefined') {
  window.handleGoogleMapsAuthFailure = handleGoogleMapsAuthFailure;
  window.gm_authFailure = function() {
    handleGoogleMapsAuthFailure('ApiNotActivatedMapError');
  };

  // Intercept uncaught Google Maps script runtime errors
  window.addEventListener('error', (event) => {
    const msg = String(event?.message || '');
    if (msg.includes('ApiNotActivatedMapError') || msg.includes('Google Maps JavaScript API error')) {
      handleGoogleMapsAuthFailure('ApiNotActivatedMapError');
    }
  });

  // Intercept console.error from Google Maps API to catch ApiNotActivatedMapError instantly
  const originalConsoleError = console.error;
  console.error = function(...args) {
    originalConsoleError.apply(console, args);
    try {
      const combined = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      if (combined.includes('ApiNotActivatedMapError') || combined.includes('api-not-activated-map-error')) {
        handleGoogleMapsAuthFailure('ApiNotActivatedMapError');
      }
    } catch (ignore) {}
  };
}

/**
 * Sets up Leaflet preview map
 */
function setupLeafletMap() {
  const mapCanvas = document.getElementById('fleet-map-canvas');
  if (!mapCanvas || !window.L) return;

  try {
    // Purge any existing markers from Google Maps or previous Leaflet instances
    clearAllMapMarkers();

    if (AppState.leafletMap) {
      try {
        AppState.leafletMap.remove();
      } catch (e) {
        console.warn('Error clearing previous leaflet instance:', e);
      }
      AppState.leafletMap = null;
    }

    AppState.googleMap = null;
    AppState.mapEngine = 'leaflet';
    mapCanvas.innerHTML = '';

    AppState.leafletMap = window.L.map('fleet-map-canvas', {
      attributionControl: false
    }).setView([-25.4753, 30.9694], 12);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(AppState.leafletMap);

    const badge = document.getElementById('map-engine-badge');
    if (badge && badge.textContent !== 'Preview Map (API Inactive)') {
      badge.textContent = 'Live Map Preview';
      badge.className = 'px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200';
    }

    setTimeout(() => {
      AppState.leafletMap?.invalidateSize();
    }, 150);

    updateMapMarkers();
  } catch (e) {
    console.error('Failed to initialize Leaflet preview map:', e);
  }
}

/**
 * Returns marker colors and SVG icon based on vehicle status
 */
function getMarkerColor(status) {
  const s = (status || 'ACTIVE').toUpperCase();
  if (s === 'IN_TRANSIT' || s === 'MOVING') {
    return { bg: '#10b981', border: '#059669', name: 'In Transit' }; // Emerald Green
  }
  if (s === 'IDLE') {
    return { bg: '#f59e0b', border: '#d97706', name: 'Idle' }; // Amber
  }
  if (s === 'MAINTENANCE' || s === 'OFFLINE') {
    return { bg: '#e11d48', border: '#be123c', name: 'Maintenance' }; // Rose
  }
  return { bg: '#2563eb', border: '#1d4ed8', name: 'Active' }; // Blue
}

/**
 * Updates all vehicle markers on the active map engine
 */
export function updateMapMarkers() {
  const vehicles = AppState.trackingData || [];
  if (vehicles.length === 0) return;

  const focusSelect = document.getElementById('map-vehicle-focus');
  if (focusSelect) {
    const currentVal = focusSelect.value;
    focusSelect.innerHTML = '<option value="">Center Vehicle...</option>' + 
      vehicles.map(v => {
        const id = v.vehicle?.vehicleId ?? v.vehicleId;
        const plate = v.vehicle?.licensePlate ?? v.licensePlate ?? `FLT-${id}`;
        const driver = v.driver?.name ?? 'No Driver';
        const speed = Math.round(v.speed ?? 0);
        const street = (getVehicleAddress(v) || '').split(',')[0] || 'On Route';
        return `<option value="${id}">#${id} &bull; ${plate} &bull; ${street} (${speed} km/h)</option>`;
      }).join('');
    if (currentVal) focusSelect.value = currentVal;
  }

  // Update HUD Stats
  let totalSpeed = 0;
  let activeCount = 0;
  vehicles.forEach(v => {
    const speed = v.speed != null ? Number(v.speed) : 0;
    totalSpeed += speed;
    const status = (v.status || 'ACTIVE').toUpperCase();
    if (status === 'IN_TRANSIT' || status === 'ACTIVE' || status === 'MOVING') {
      activeCount++;
    }
  });

  const hudVehicles = document.getElementById('hud-active-vehicles');
  const hudSpeed = document.getElementById('hud-avg-speed');
  if (hudVehicles) hudVehicles.textContent = `${activeCount} / ${vehicles.length}`;
  if (hudSpeed) hudSpeed.textContent = `${vehicles.length > 0 ? Math.round(totalSpeed / vehicles.length) : 0} km/h`;

  // Update Google Maps Markers
  if (AppState.mapEngine === 'google' && AppState.googleMap && window.google) {
    vehicles.forEach(vehicle => {
      const vId = String(vehicle.vehicle?.vehicleId ?? vehicle.vehicleId);
      const lat = parseFloat(vehicle.latitude);
      const lng = parseFloat(vehicle.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const pos = { lat, lng };
      const plate = vehicle.vehicle?.licensePlate ?? vehicle.licensePlate ?? `FLT-${vId}`;
      const color = getMarkerColor(vehicle.status);

      const existingMarker = AppState.mapMarkers[vId];
      if (existingMarker && typeof existingMarker.setPosition === 'function') {
        // Move existing marker smoothly
        existingMarker.setPosition(pos);
      } else {
        if (existingMarker) {
          try {
            if (typeof existingMarker.remove === 'function') existingMarker.remove();
            else if (typeof existingMarker.setMap === 'function') existingMarker.setMap(null);
          } catch (e) {}
          delete AppState.mapMarkers[vId];
        }
        // Create new Google Maps marker
        const svgIcon = {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42">
              <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 24 18 24s18-10.5 18-24C36 8.059 27.941 0 18 0z" fill="${color.bg}" stroke="#ffffff" stroke-width="2"/>
              <circle cx="18" cy="16" r="10" fill="#ffffff"/>
              <path d="M13 13h10v4h-10z M11 16h14v3h-14z M13 20a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0 -3 0 M20 20a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0 -3 0" fill="${color.bg}"/>
            </svg>
          `)}`,
          scaledSize: new window.google.maps.Size(36, 42),
          anchor: new window.google.maps.Point(18, 42)
        };

        const MarkerConstructor = window.google?.maps?.Marker;
        if (typeof MarkerConstructor !== 'function') return;

        const marker = new MarkerConstructor({
          position: pos,
          map: AppState.googleMap,
          title: `${plate} (#${vId})`,
          icon: svgIcon
        });

        marker.addListener('click', () => {
          AppState.activeFocusedVehicleId = vId;
          const content = generateInfoWindowHtml(vehicle);
          AppState.googleInfoWindow.setContent(content);
          AppState.googleInfoWindow.open(AppState.googleMap, marker);
          if (focusSelect) focusSelect.value = vId;
        });

        AppState.mapMarkers[vId] = marker;
      }
    });
  }

  // Update Leaflet Markers
  if (AppState.mapEngine === 'leaflet' && AppState.leafletMap && window.L) {
    vehicles.forEach(vehicle => {
      const vId = String(vehicle.vehicle?.vehicleId ?? vehicle.vehicleId);
      const lat = parseFloat(vehicle.latitude);
      const lng = parseFloat(vehicle.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const plate = vehicle.vehicle?.licensePlate ?? vehicle.licensePlate ?? `FLT-${vId}`;
      const color = getMarkerColor(vehicle.status);

      const existingMarker = AppState.mapMarkers[vId];
      if (existingMarker && typeof existingMarker.setLatLng === 'function') {
        existingMarker.setLatLng([lat, lng]);
        if (typeof existingMarker.setPopupContent === 'function') {
          existingMarker.setPopupContent(generateInfoWindowHtml(vehicle));
        }
      } else {
        if (existingMarker) {
          try {
            if (typeof existingMarker.setMap === 'function') existingMarker.setMap(null);
            else if (typeof existingMarker.remove === 'function') existingMarker.remove();
          } catch (e) {}
          delete AppState.mapMarkers[vId];
        }
        const iconHtml = `
          <div class="relative flex items-center justify-center cursor-pointer">
            <div class="w-8 h-8 rounded-full shadow-lg flex items-center justify-center text-white font-bold text-xs" style="background-color: ${color.bg}; border: 2px solid #ffffff;">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
              </svg>
            </div>
          </div>
        `;

        const customIcon = window.L.divIcon({
          className: 'vehicle-marker-wrapper',
          html: iconHtml,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const marker = window.L.marker([lat, lng], { icon: customIcon }).addTo(AppState.leafletMap);
        marker.bindPopup(generateInfoWindowHtml(vehicle));

        marker.on('click', () => {
          AppState.activeFocusedVehicleId = vId;
          if (focusSelect) focusSelect.value = vId;
        });

        AppState.mapMarkers[vId] = marker;
      }
    });
  }
}

/**
 * Builds HTML template for Google Maps InfoWindow and Leaflet popups
 */
function generateInfoWindowHtml(vehicle) {
  const vId = vehicle.vehicle?.vehicleId ?? vehicle.vehicleId ?? '—';
  const plate = vehicle.vehicle?.licensePlate ?? vehicle.licensePlate ?? `FLT-${vId}`;
  const model = vehicle.vehicle?.model ?? 'Commercial Unit';
  const driver = vehicle.driver?.name ?? (vehicle.driver?.driverId ? `Driver #${vehicle.driver.driverId}` : 'Unassigned');
  const speed = vehicle.speed != null ? Math.round(vehicle.speed) : 0;
  const fuel = vehicle.fuelLevel != null ? Math.round(vehicle.fuelLevel) : 85;
  const status = (vehicle.status || 'ACTIVE').toUpperCase();
  const time = vehicle.timestamp ? new Date(vehicle.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  const lat = Number(vehicle.latitude).toFixed(4);
  const lng = Number(vehicle.longitude).toFixed(4);
  const color = getMarkerColor(status);
  const address = getVehicleAddress(vehicle);
  const addrKey = `${lat},${lng}`;

  return `
    <div class="p-3 max-w-[270px] font-sans text-slate-800">
      <div class="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
        <div>
          <span class="font-bold text-sm text-slate-900">${plate}</span>
          <span class="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-mono ml-1">#${vId}</span>
        </div>
        <span class="px-2 py-0.5 text-[10px] font-bold rounded-full text-white" style="background-color: ${color.bg};">
          ${status}
        </span>
      </div>

      <div class="space-y-2 text-xs">
        <div class="text-slate-500 font-medium">${model}</div>

        <!-- Street / Address Location Card -->
        <div class="bg-blue-50/60 border border-blue-100 rounded-lg p-2">
          <div class="flex items-start gap-1.5">
            <svg class="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div class="min-w-0">
              <div class="text-[9px] font-bold uppercase tracking-wider text-blue-700">Street / Location</div>
              <div class="text-xs font-semibold text-slate-900 leading-snug break-words" data-addr-key="${addrKey}">${address}</div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-500">Driver:</span>
          <strong class="text-slate-800">${driver}</strong>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">Speed:</span>
          <strong class="font-mono text-blue-600">${speed} km/h</strong>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">Fuel/Battery:</span>
          <div class="flex items-center gap-1.5">
            <div class="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden">
              <div class="h-full ${fuel < 20 ? 'bg-rose-500' : 'bg-emerald-500'}" style="width: ${fuel}%"></div>
            </div>
            <span class="font-mono">${fuel}%</span>
          </div>
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-100">
          <span>GPS: ${lat}, ${lng}</span>
          <span>${time}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Focuses map camera on specific vehicle
 */
export function focusVehicleOnMap(vehicleId) {
  const targetId = String(vehicleId);
  const vehicle = AppState.trackingData.find(v => String(v.vehicle?.vehicleId ?? v.vehicleId) === targetId);
  if (!vehicle) return;

  const lat = parseFloat(vehicle.latitude);
  const lng = parseFloat(vehicle.longitude);
  if (isNaN(lat) || isNaN(lng)) return;

  const focusSelect = document.getElementById('map-vehicle-focus');
  if (focusSelect) focusSelect.value = targetId;

  if (AppState.mapEngine === 'google' && AppState.googleMap && window.google) {
    const pos = { lat, lng };
    AppState.googleMap.panTo(pos);
    AppState.googleMap.setZoom(13);
    const marker = AppState.mapMarkers[targetId];
    if (marker && AppState.googleInfoWindow) {
      AppState.googleInfoWindow.setContent(generateInfoWindowHtml(vehicle));
      AppState.googleInfoWindow.open(AppState.googleMap, marker);
    }
  } else if (AppState.mapEngine === 'leaflet' && AppState.leafletMap) {
    AppState.leafletMap.setView([lat, lng], 13, { animate: true });
    const marker = AppState.mapMarkers[targetId];
    if (marker && typeof marker.openPopup === 'function') {
      marker.openPopup();
    }
  }

  // Smooth scroll up to map if user clicked from deep in table
  const mapCanvas = document.getElementById('fleet-map-canvas');
  if (mapCanvas && window.scrollY > 400) {
    mapCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Make accessible to inline row onclick
window.focusVehicleOnMap = focusVehicleOnMap;

/**
 * Fits map viewport to include all tracked vehicle locations
 */
export function fitAllMapMarkers() {
  const validCoords = (AppState.trackingData || [])
    .map(v => ({ lat: parseFloat(v.latitude), lng: parseFloat(v.longitude) }))
    .filter(c => !isNaN(c.lat) && !isNaN(c.lng));

  if (validCoords.length === 0) return;

  if (AppState.mapEngine === 'google' && AppState.googleMap && window.google) {
    const bounds = new window.google.maps.LatLngBounds();
    validCoords.forEach(c => bounds.extend(c));
    AppState.googleMap.fitBounds(bounds, 50);
  } else if (AppState.mapEngine === 'leaflet' && AppState.leafletMap && window.L) {
    const latLngs = validCoords.map(c => [c.lat, c.lng]);
    AppState.leafletMap.fitBounds(window.L.latLngBounds(latLngs), { padding: [40, 40] });
  }
}

/**
 * Saves Google Maps API Key and transitions map to official Google Maps
 */
export function saveGoogleMapsKey(apiKey) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    showNotification('Google Maps API Key cannot be empty.', 'warning');
    return;
  }

  localStorage.setItem('fleetcore_gmaps_key', cleanKey);
  AppState.googleMapsApiKey = cleanKey;

  // Sync all key input fields
  const quickKey = document.getElementById('input-quick-gmaps-key');
  const settingsKey = document.getElementById('settings-gmaps-key');
  const guideKey = document.getElementById('guide-input-gmaps-key');
  if (quickKey) quickKey.value = cleanKey;
  if (settingsKey) settingsKey.value = cleanKey;
  if (guideKey) guideKey.value = cleanKey;

  document.getElementById('gmaps-guide-modal')?.classList.add('hidden');
  document.getElementById('settings-modal')?.classList.add('hidden');
  document.getElementById('gmaps-key-banner')?.classList.add('hidden');
  document.getElementById('gmaps-error-banner')?.classList.add('hidden');

  showNotification('Google Maps API Key saved! Booting Google Maps...', 'info', 3000);
  loadGoogleMapsScript(cleanKey);
}

/**
 * Real-time 5-second interval tracking loop.
 * Updates countdown display every 1 second, and triggers live updates every 5 seconds.
 */
export function startRealtimeTrackingLoop() {
  if (AppState.mapCountdownIntervalId) {
    clearInterval(AppState.mapCountdownIntervalId);
  }

  AppState.mapCountdown = 5;

  AppState.mapCountdownIntervalId = setInterval(() => {
    AppState.mapCountdown--;

    const countdownBadge = document.getElementById('map-countdown-badge');
    if (countdownBadge) {
      countdownBadge.textContent = `Sync in: ${AppState.mapCountdown}s`;
    }

    if (AppState.mapCountdown <= 0) {
      AppState.mapCountdown = 5;
      triggerRealtimeStep();
    }
  }, 1000);
}

/**
 * Executes a 5-second interval step
 */
function triggerRealtimeStep() {
  if (AppState.currentTab !== 'tracking') return;

  if (AppState.activeSource === 'MOCK_DEMO' || AppState.dataSourceMode === 'mock') {
    // In Mock mode, simulate vehicle travel strictly along real roads and corridors
    AppState.trackingData = (AppState.trackingData || []).map(v => {
      const status = (v.status || '').toUpperCase();
      if (status === 'IN_TRANSIT' || status === 'MOVING') {
        let routeKey = v.routeKey;
        if (!routeKey || !DEMO_ROAD_ROUTES[routeKey]) {
          const vId = Number(v.vehicle?.vehicleId ?? v.vehicleId) || 1;
          const availableRoutes = Object.keys(DEMO_ROAD_ROUTES);
          routeKey = availableRoutes[(vId - 1) % availableRoutes.length];
        }

        const route = DEMO_ROAD_ROUTES[routeKey];
        let idx = typeof v.routeIndex === 'number' ? v.routeIndex : 0;
        let dir = typeof v.routeDirection === 'number' ? v.routeDirection : 1;
        let progress = typeof v.routeProgress === 'number' ? v.routeProgress : 0;

        // Advance vehicle along road segment
        progress += 0.28;
        if (progress >= 1.0) {
          progress = 0;
          idx += dir;
          if (idx >= route.length - 1) {
            idx = route.length - 1;
            dir = -1; // Reverse journey back along the corridor
          } else if (idx <= 0) {
            idx = 0;
            dir = 1; // Forward journey
          }
        }

        const nextIdx = dir === 1 ? Math.min(route.length - 1, idx + 1) : Math.max(0, idx - 1);
        const ptA = route[idx];
        const ptB = route[nextIdx];

        // Linear interpolation strictly along the road segment
        const newLat = ptA.lat + (ptB.lat - ptA.lat) * progress;
        const newLng = ptA.lng + (ptB.lng - ptA.lng) * progress;
        const activeStreet = progress >= 0.5 ? ptB.street : ptA.street;

        // Realistic corridor cruising speeds
        let baseSpeed = 74;
        if (routeKey === 'R40_MADIBA_DR') baseSpeed = 62;
        else if (routeKey === 'SAMORA_MACHEL_R104') baseSpeed = 48;
        else if (routeKey === 'N4_CORRIDOR') baseSpeed = 82;
        const speedJitter = (Math.random() - 0.5) * 3;
        const newSpeed = Math.round(Math.max(35, baseSpeed + speedJitter));

        return {
          ...v,
          routeKey,
          routeIndex: idx,
          routeDirection: dir,
          routeProgress: Number(progress.toFixed(2)),
          latitude: Number(newLat.toFixed(5)),
          longitude: Number(newLng.toFixed(5)),
          address: activeStreet,
          speed: newSpeed,
          timestamp: new Date().toISOString()
        };
      }
      return v;
    });

    renderTrackingTable();
    updateTrackingMetrics();
    updateMapMarkers();
  } else {
    // In Live mode, poll GET /api/tracking from the Jakarta EE server
    loadTrackingData();
  }
}

// ==========================================
// 5. View 2: Vehicle & Driver Assignments
// ==========================================

/**
 * Fetches and displays existing assignments from GET /api/assignments
 */
export async function loadAssignments() {
  const listContainer = document.getElementById('assignments-list');
  const refreshBtn = document.getElementById('btn-refresh-assignments');
  const loadingIndicator = document.getElementById('assignments-loading');
  const emptyState = document.getElementById('assignments-empty');
  const errorAlert = document.getElementById('assignments-error');

  if (refreshBtn) refreshBtn.classList.add('animate-spin');
  if (loadingIndicator) loadingIndicator.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');
  if (errorAlert) errorAlert.classList.add('hidden');

  try {
    let data;

    if (AppState.dataSourceMode === 'mock') {
      AppState.activeSource = 'MOCK_DEMO';
      updateDataSourceUI();
      data = getSampleAssignmentsData();
    } else if (AppState.dataSourceMode === 'live') {
      try {
        data = await apiFetch('/assignments', { method: 'GET' });
        AppState.activeSource = 'LIVE_BACKEND';
        updateDataSourceUI();
      } catch (apiErr) {
        AppState.activeSource = 'LIVE_BACKEND_ERROR';
        updateDataSourceUI(apiErr.message);
        throw apiErr;
      }
    } else {
      try {
        data = await apiFetch('/assignments', { method: 'GET' });
        AppState.activeSource = 'LIVE_BACKEND';
        updateDataSourceUI();
      } catch (apiErr) {
        AppState.activeSource = 'MOCK_DEMO';
        updateDataSourceUI(apiErr.message);
        data = getSampleAssignmentsData();
      }
    }

    AppState.assignmentsData = Array.isArray(data) ? data : (data.assignments || data.items || []);
    renderAssignmentsList();
  } catch (err) {
    if (errorAlert) {
      errorAlert.classList.remove('hidden');
      const errText = document.getElementById('assignments-error-message');
      if (errText) errText.textContent = err.message;
    }
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('animate-spin');
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
  }
}

/**
 * Renders assignments list / cards
 */
function renderAssignmentsList() {
  const container = document.getElementById('assignments-list');
  const emptyState = document.getElementById('assignments-empty');
  if (!container) return;

  if (AppState.assignmentsData.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = AppState.assignmentsData.map(item => {
    const assignId = item.assignmentId ?? item.id ?? '—';
    const vehicleId = item.vehicle?.vehicleId ?? item.vehicleId ?? '—';
    const vehiclePlate = item.vehicle?.licensePlate || `Vehicle #${vehicleId}`;
    const vehicleModel = item.vehicle?.model || 'Commercial Fleet Unit';

    const driverId = item.driver?.driverId ?? item.driverId ?? '—';
    const driverName = item.driver?.name || `Driver #${driverId}`;
    const driverLicense = item.driver?.licenseNumber || `DL-${driverId}09`;

    const status = item.status || 'ACTIVE';
    const assignedDate = item.assignmentDate || item.assignedAt || item.createdAt 
      ? new Date(item.assignmentDate || item.assignedAt || item.createdAt).toLocaleDateString()
      : 'Today';

    return `
      <div class="p-4 bg-white border border-slate-200 rounded-xl shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-start gap-3.5">
          <div class="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
            #${assignId}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-semibold text-slate-900 text-sm">${vehiclePlate}</span>
              <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">Vehicle ID: ${vehicleId}</span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">${vehicleModel}</p>
          </div>
        </div>

        <div class="flex items-center gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
          <div class="text-left md:text-right">
            <div class="text-sm font-medium text-slate-800">${driverName}</div>
            <div class="text-xs text-slate-500 font-mono">Driver ID: ${driverId} &bull; ${driverLicense}</div>
          </div>

          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 text-xs font-semibold rounded-full ${status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'}">
              ${status}
            </span>
            <span class="text-xs text-slate-400 whitespace-nowrap">${assignedDate}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Handles assignment creation via POST /api/assignments
 * Payload: {"vehicle":{"vehicleId": X}, "driver":{"driverId": Y}}
 */
export async function handleCreateAssignment(event) {
  event.preventDefault();

  const vehicleInput = document.getElementById('input-vehicle-id');
  const driverInput = document.getElementById('input-driver-id');
  const submitBtn = document.getElementById('btn-submit-assignment');

  const vehicleId = parseInt(vehicleInput.value, 10);
  const driverId = parseInt(driverInput.value, 10);

  if (isNaN(vehicleId) || vehicleId <= 0) {
    showNotification('Please enter a valid numeric Vehicle ID.', 'warning');
    vehicleInput.focus();
    return;
  }

  if (isNaN(driverId) || driverId <= 0) {
    showNotification('Please enter a valid numeric Driver ID.', 'warning');
    driverInput.focus();
    return;
  }

  const payload = {
    vehicle: { vehicleId: vehicleId },
    driver: { driverId: driverId }
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Submitting Assignment...
    `;
  }

  try {
    if (AppState.dataSourceMode === 'mock') {
      // In Mock mode, simulate saving directly into the state
      const newAssignment = {
        assignmentId: Math.floor(100 + Math.random() * 900),
        vehicle: { vehicleId: vehicleId, licensePlate: `FLT-00${vehicleId}`, model: 'Commercial Fleet Unit' },
        driver: { driverId: driverId, name: `Driver #${driverId}`, licenseNumber: `DL-${driverId}77` },
        status: 'ACTIVE',
        assignmentDate: new Date().toISOString()
      };
      AppState.assignmentsData.unshift(newAssignment);
      renderAssignmentsList();
      showNotification(`Assignment created in Demo Mode: Vehicle #${vehicleId} -> Driver #${driverId}`, 'success');
    } else {
      // Send real HTTP POST to Jakarta EE backend
      try {
        await apiFetch('/assignments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showNotification(`Success! Vehicle #${vehicleId} assigned to Driver #${driverId} on Jakarta EE backend.`, 'success');
        await loadAssignments();
      } catch (apiErr) {
        if (AppState.dataSourceMode === 'auto') {
          // If auto mode, add to local state and notify
          const newAssignment = {
            assignmentId: Math.floor(100 + Math.random() * 900),
            vehicle: { vehicleId: vehicleId, licensePlate: `FLT-00${vehicleId}`, model: 'Fleet Truck' },
            driver: { driverId: driverId, name: `Driver #${driverId}`, licenseNumber: `DL-${driverId}88` },
            status: 'ACTIVE',
            assignmentDate: new Date().toISOString()
          };
          AppState.assignmentsData.unshift(newAssignment);
          renderAssignmentsList();
          showNotification(`Backend offline. Simulated assignment locally (Vehicle #${vehicleId} -> Driver #${driverId}).`, 'warning');
        } else {
          throw apiErr;
        }
      }
    }

    vehicleInput.value = '';
    driverInput.value = '';
  } catch (err) {
    showNotification(`Failed to create assignment: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        <span>Assign Vehicle to Driver</span>
      `;
    }
  }
}

// ==========================================
// 5. Data Source Mode & Banner UI Controller
// ==========================================

export function setDataSourceMode(mode) {
  AppState.dataSourceMode = mode;
  localStorage.setItem('fleetcore_data_mode', mode);

  // Update button toggle styling
  const btnModeLive = document.getElementById('btn-mode-live');
  const btnModeMock = document.getElementById('btn-mode-mock');
  const btnModeAuto = document.getElementById('btn-mode-auto');

  [btnModeLive, btnModeMock, btnModeAuto].forEach(b => b?.classList.remove('bg-blue-700', 'text-white', 'bg-slate-200', 'text-slate-800'));

  if (mode === 'live' && btnModeLive) {
    btnModeLive.classList.add('bg-blue-700', 'text-white');
  } else if (mode === 'mock' && btnModeMock) {
    btnModeMock.classList.add('bg-blue-700', 'text-white');
  } else if (btnModeAuto) {
    btnModeAuto.classList.add('bg-blue-700', 'text-white');
  }

  showNotification(`Data Source set to: ${mode.toUpperCase()} MODE`, 'info');

  if (AppState.currentTab === 'tracking') {
    loadTrackingData();
  } else {
    loadAssignments();
  }
}

function updateDataSourceUI(errorMsg = '') {
  const badge = document.getElementById('backend-status-indicator');
  const banner = document.getElementById('data-source-banner');
  const bannerText = document.getElementById('data-source-banner-text');
  const bannerAction = document.getElementById('data-source-banner-action');
  const urlLabel = document.getElementById('current-api-url-label');

  if (urlLabel) urlLabel.textContent = AppState.apiBaseUrl;

  if (AppState.activeSource === 'LIVE_BACKEND') {
    if (badge) {
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200';
      badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Live Backend Connected';
      badge.title = `Connected to ${AppState.apiBaseUrl}`;
    }
    if (banner) {
      banner.className = 'p-3 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all';
      bannerText.innerHTML = `<strong>Data Source: Live REST API</strong> &bull; Streaming data directly from <code class="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200">${AppState.apiBaseUrl}</code>`;
      bannerAction.innerHTML = `<button id="btn-banner-switch" class="font-semibold underline text-emerald-800 hover:text-emerald-950">Switch to Mock Data</button>`;
      document.getElementById('btn-banner-switch')?.addEventListener('click', () => setDataSourceMode('mock'));
    }
  } else if (AppState.activeSource === 'LIVE_BACKEND_ERROR') {
    if (badge) {
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-rose-100 text-rose-800 border border-rose-200 cursor-pointer';
      badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-500"></span> Live Backend Error';
      badge.title = errorMsg;
    }
    if (banner) {
      banner.className = 'p-3 bg-rose-50 border-b border-rose-200 text-xs text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all';
      bannerText.innerHTML = `<strong>Data Source: Live Connection Failed</strong> &bull; Unable to reach <code class="font-mono bg-white px-1.5 py-0.5 rounded border border-rose-200">${AppState.apiBaseUrl}</code>. (${errorMsg})`;
      bannerAction.innerHTML = `<button id="btn-banner-switch" class="font-semibold underline text-rose-800 hover:text-rose-950">Use Mock Demo Data</button>`;
      document.getElementById('btn-banner-switch')?.addEventListener('click', () => setDataSourceMode('mock'));
    }
  } else {
    // MOCK_DEMO
    if (badge) {
      badge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer';
      badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span> Demo / Mock Dataset';
      badge.title = `Displaying sample data. Target is ${AppState.apiBaseUrl}`;
    }
    if (banner) {
      banner.className = 'p-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all';
      bannerText.innerHTML = `<strong>Data Source: Built-in Mock Dataset</strong> &bull; Showing sample fleet telematics so you can test without a running server.`;
      bannerAction.innerHTML = `<button id="btn-banner-switch" class="font-semibold underline text-amber-800 hover:text-amber-950">Switch to Live Backend</button>`;
      document.getElementById('btn-banner-switch')?.addEventListener('click', () => setDataSourceMode('live'));
    }
  }
}

// ==========================================
// 6. Auto-Refresh Interval Controller
// ==========================================

export function setAutoRefresh(seconds) {
  AppState.autoRefreshSeconds = parseInt(seconds, 10) || 0;

  if (AppState.autoRefreshIntervalId) {
    clearInterval(AppState.autoRefreshIntervalId);
    AppState.autoRefreshIntervalId = null;
  }

  const indicator = document.getElementById('auto-refresh-indicator');

  if (AppState.autoRefreshSeconds > 0) {
    AppState.autoRefreshIntervalId = setInterval(() => {
      if (AppState.currentTab === 'tracking') {
        loadTrackingData();
      } else {
        loadAssignments();
      }
    }, AppState.autoRefreshSeconds * 1000);

    if (indicator) {
      indicator.classList.remove('hidden');
      indicator.textContent = `Auto-refresh: ${AppState.autoRefreshSeconds}s`;
    }
    showNotification(`Auto-refresh enabled (${AppState.autoRefreshSeconds} seconds)`, 'info', 2500);
  } else {
    if (indicator) indicator.classList.add('hidden');
    showNotification('Auto-refresh disabled', 'info', 2000);
  }
}

// ==========================================
// 7. Token Inspector Modal Controller
// ==========================================

export function openTokenInspector() {
  const modal = document.getElementById('token-inspector-modal');
  const token = getStoredToken();
  const rawTokenEl = document.getElementById('token-raw-content');
  const claimsEl = document.getElementById('token-claims-content');
  const statusEl = document.getElementById('token-status-summary');

  if (!modal) return;

  if (token) {
    const payload = parseJwt(token);
    if (rawTokenEl) rawTokenEl.value = token;
    if (claimsEl) claimsEl.textContent = JSON.stringify(payload, null, 2);
    if (statusEl) {
      statusEl.className = 'text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded border border-emerald-200';
      statusEl.innerHTML = `<strong>Token Present:</strong> Google JWT captured in sessionStorage. Sent as <code>Authorization: Bearer &lt;token&gt;</code>.`;
    }
  } else {
    if (rawTokenEl) rawTokenEl.value = '';
    if (claimsEl) claimsEl.textContent = '// No token in sessionStorage';
    if (statusEl) {
      statusEl.className = 'text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200';
      statusEl.innerHTML = `<strong>No Token Stored:</strong> Requests will be dispatched without an Authorization header. Click "Generate Dev Token" or Sign In with Google.`;
    }
  }

  modal.classList.remove('hidden');
}

export function closeTokenInspector() {
  document.getElementById('token-inspector-modal')?.classList.add('hidden');
}

// ==========================================
// 8. Toast Notification System
// ==========================================

export function showNotification(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-enter flex items-start gap-3 p-4 rounded-xl shadow-lg border text-sm max-w-md w-full pointer-events-auto bg-white transition-all';

  let iconSvg = '';
  let borderClass = 'border-slate-200';

  if (type === 'success') {
    borderClass = 'border-emerald-200 bg-emerald-50/90 text-emerald-900';
    iconSvg = `<svg class="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  } else if (type === 'error') {
    borderClass = 'border-rose-200 bg-rose-50/90 text-rose-900';
    iconSvg = `<svg class="w-5 h-5 text-rose-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  } else if (type === 'warning') {
    borderClass = 'border-amber-200 bg-amber-50/90 text-amber-900';
    iconSvg = `<svg class="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
  } else {
    borderClass = 'border-blue-200 bg-blue-50/90 text-blue-900';
    iconSvg = `<svg class="w-5 h-5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
  }

  toast.className += ` ${borderClass}`;
  toast.innerHTML = `
    ${iconSvg}
    <div class="flex-1 text-xs md:text-sm font-medium leading-relaxed">${message}</div>
    <button class="text-slate-400 hover:text-slate-600 p-0.5 ml-2 transition-colors" aria-label="Close">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  `;

  const closeBtn = toast.querySelector('button');
  const dismiss = () => {
    toast.classList.replace('toast-enter', 'toast-exit');
    setTimeout(() => toast.remove(), 250);
  };

  closeBtn.addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

// ==========================================
// 9. Sample Built-in Datasets
// ==========================================

function getSampleTrackingData() {
  return [
    {
      trackingId: 101,
      vehicle: { vehicleId: 1, licensePlate: 'HZM 409 MP', model: 'Mercedes-Benz Actros 2645' },
      driver: { driverId: 12, name: 'Sipho Mthembu' },
      routeKey: 'N4_CORRIDOR',
      routeIndex: 2,
      routeDirection: 1,
      routeProgress: 0.15,
      latitude: -25.4548,
      longitude: 30.9392,
      address: 'N4 Toll Route, Stadium Flyover, Mbombela',
      speed: 76.4,
      fuelLevel: 82,
      status: 'IN_TRANSIT',
      timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString()
    },
    {
      trackingId: 102,
      vehicle: { vehicleId: 2, licensePlate: 'KLS 118 MP', model: 'Toyota Hilux 2.8 GD-6' },
      driver: { driverId: 15, name: 'Thabo Dlamini' },
      latitude: -25.4758,
      longitude: 30.9782,
      address: 'Mbombela Freight Depot, 44 Ferreira St, Mbombela CBD',
      speed: 0,
      fuelLevel: 94,
      status: 'IDLE',
      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString()
    },
    {
      trackingId: 103,
      vehicle: { vehicleId: 3, licensePlate: 'DRV 992 MP', model: 'Scania G460 Highline' },
      driver: { driverId: 18, name: 'Johan van der Merwe' },
      routeKey: 'R40_MADIBA_DR',
      routeIndex: 3,
      routeDirection: 1,
      routeProgress: 0.20,
      latitude: -25.4602,
      longitude: 30.9682,
      address: 'R40 (Madiba Dr), Crossing Junction, Mbombela',
      speed: 64.0,
      fuelLevel: 68,
      status: 'IN_TRANSIT',
      timestamp: new Date(Date.now() - 1000 * 60 * 1).toISOString()
    },
    {
      trackingId: 104,
      vehicle: { vehicleId: 4, licensePlate: 'NXW 334 MP', model: 'Isuzu FTR 850 Freight' },
      driver: { driverId: 22, name: 'Musa Khumalo' },
      latitude: -25.4722,
      longitude: 30.9510,
      address: 'Commercial Fleet Workshop, 18 Samora Machel Dr (R104), West Acres',
      speed: 0,
      fuelLevel: 18,
      status: 'MAINTENANCE',
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString()
    },
    {
      trackingId: 105,
      vehicle: { vehicleId: 5, licensePlate: 'BTT 501 MP', model: 'Volvo FH 440 Globetrotter' },
      driver: { driverId: 27, name: 'Lindiwe Nkosi' },
      routeKey: 'N4_EASTERN_BYPASS',
      routeIndex: 1,
      routeDirection: 1,
      routeProgress: 0.35,
      latitude: -25.4698,
      longitude: 30.9980,
      address: 'N4 Eastern Bypass (KM 50), Orchards, Mbombela',
      speed: 78.5,
      fuelLevel: 76,
      status: 'IN_TRANSIT',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString()
    },
    {
      trackingId: 106,
      vehicle: { vehicleId: 6, licensePlate: 'JTF 772 MP', model: 'Ford Ranger 2.0 Bi-Turbo' },
      driver: { driverId: 31, name: 'Wayne Matthews' },
      routeKey: 'SAMORA_MACHEL_R104',
      routeIndex: 2,
      routeDirection: 1,
      routeProgress: 0.10,
      latitude: -25.4722,
      longitude: 30.9615,
      address: 'Samora Machel Dr (R104), Henshall St Crossing, Mbombela',
      speed: 48.2,
      fuelLevel: 88,
      status: 'IN_TRANSIT',
      timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString()
    },
    {
      trackingId: 107,
      vehicle: { vehicleId: 7, licensePlate: 'VMR 608 MP', model: 'UD Trucks Quester 6x4' },
      driver: { driverId: 35, name: 'Bongani Sithole' },
      latitude: -25.4385,
      longitude: 30.9670,
      address: 'Riverside Industrial Terminal, 12 Rapid St, Mbombela',
      speed: 0,
      fuelLevel: 61,
      status: 'IDLE',
      timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString()
    }
  ];
}

function getSampleAssignmentsData() {
  return [
    {
      assignmentId: 501,
      vehicle: { vehicleId: 1, licensePlate: 'HZM 409 MP', model: 'Mercedes-Benz Actros 2645' },
      driver: { driverId: 12, name: 'Sipho Mthembu', licenseNumber: 'DL-ZA-9923' },
      status: 'ACTIVE',
      assignmentDate: '2026-09-12T08:30:00Z'
    },
    {
      assignmentId: 502,
      vehicle: { vehicleId: 2, licensePlate: 'KLS 118 MP', model: 'Toyota Hilux 2.8 GD-6' },
      driver: { driverId: 15, name: 'Thabo Dlamini', licenseNumber: 'DL-ZA-4401' },
      status: 'ACTIVE',
      assignmentDate: '2026-09-13T09:15:00Z'
    },
    {
      assignmentId: 503,
      vehicle: { vehicleId: 3, licensePlate: 'DRV 992 MP', model: 'Scania G460 Highline' },
      driver: { driverId: 18, name: 'Johan van der Merwe', licenseNumber: 'DL-ZA-7719' },
      status: 'ACTIVE',
      assignmentDate: '2026-09-14T07:45:00Z'
    },
    {
      assignmentId: 504,
      vehicle: { vehicleId: 4, licensePlate: 'NXW 334 MP', model: 'Isuzu FTR 850 Freight' },
      driver: { driverId: 22, name: 'Musa Khumalo', licenseNumber: 'DL-ZA-3312' },
      status: 'PENDING_INSPECTION',
      assignmentDate: '2026-09-15T06:00:00Z'
    },
    {
      assignmentId: 505,
      vehicle: { vehicleId: 5, licensePlate: 'BTT 501 MP', model: 'Volvo FH 440 Globetrotter' },
      driver: { driverId: 27, name: 'Lindiwe Nkosi', licenseNumber: 'DL-ZA-8821' },
      status: 'ACTIVE',
      assignmentDate: '2026-09-15T07:10:00Z'
    }
  ];
}

// ==========================================
// 10. Initialization & Event Listeners
// ==========================================

function switchTab(tabId) {
  AppState.currentTab = tabId;

  const tabTrackingBtn = document.getElementById('tab-btn-tracking');
  const tabAssignmentsBtn = document.getElementById('tab-btn-assignments');
  const viewTracking = document.getElementById('view-tracking');
  const viewAssignments = document.getElementById('view-assignments');

  if (tabId === 'tracking') {
    tabTrackingBtn?.classList.add('active');
    tabAssignmentsBtn?.classList.remove('active');
    viewTracking?.classList.remove('hidden');
    viewAssignments?.classList.add('hidden');
    loadTrackingData();
  } else {
    tabAssignmentsBtn?.classList.add('active');
    tabTrackingBtn?.classList.remove('active');
    viewAssignments?.classList.remove('hidden');
    viewTracking?.classList.add('hidden');
    loadAssignments();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Auth
  initGoogleAuth();

  // 2. Setup Navigation Tabs
  const tabTrackingBtn = document.getElementById('tab-btn-tracking');
  const tabAssignmentsBtn = document.getElementById('tab-btn-assignments');

  tabTrackingBtn?.addEventListener('click', () => switchTab('tracking'));
  tabAssignmentsBtn?.addEventListener('click', () => switchTab('assignments'));

  // 3. View 1 Event Listeners (Tracking)
  const refreshTrackingBtn = document.getElementById('btn-refresh-tracking');
  const searchInput = document.getElementById('tracking-search-input');
  const statusFilterSelect = document.getElementById('tracking-status-filter');
  const retryTrackingBtn = document.getElementById('btn-retry-tracking');
  const autoRefreshSelect = document.getElementById('select-auto-refresh');

  refreshTrackingBtn?.addEventListener('click', () => loadTrackingData());
  retryTrackingBtn?.addEventListener('click', () => loadTrackingData());

  searchInput?.addEventListener('input', (e) => {
    AppState.trackingFilter = e.target.value;
    renderTrackingTable();
  });

  statusFilterSelect?.addEventListener('change', (e) => {
    AppState.statusFilter = e.target.value;
    renderTrackingTable();
  });

  autoRefreshSelect?.addEventListener('change', (e) => {
    setAutoRefresh(e.target.value);
  });

  // 4. View 2 Event Listeners (Assignments)
  const assignmentForm = document.getElementById('assignment-form');
  const refreshAssignmentsBtn = document.getElementById('btn-refresh-assignments');
  const retryAssignmentsBtn = document.getElementById('btn-retry-assignments');

  assignmentForm?.addEventListener('submit', handleCreateAssignment);
  refreshAssignmentsBtn?.addEventListener('click', () => loadAssignments());
  retryAssignmentsBtn?.addEventListener('click', () => loadAssignments());

  // 5. Auth / Token Event Listeners
  const signOutBtn = document.getElementById('btn-sign-out');
  signOutBtn?.addEventListener('click', signOut);

  // Quick Developer Token Generator
  const devTokenBtn = document.getElementById('btn-dev-token');
  devTokenBtn?.addEventListener('click', () => {
    const mockPayload = {
      iss: 'https://accounts.google.com',
      sub: '109827384918293847123',
      email: 'fleet.manager@jakarta-ee.corp',
      name: 'Fleet Administrator',
      picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    const b64Payload = btoa(JSON.stringify(mockPayload));
    const dummyJwt = `eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.${b64Payload}.dummy_signature_for_testing`;
    setStoredToken(dummyJwt);
    showNotification('Test JWT stored in sessionStorage. "Authorization: Bearer <token>" is now injected into all API requests.', 'success', 5000);
  });

  // Token Inspector Modal Events
  const tokenBadge = document.getElementById('token-status-badge');
  const btnInspectToken = document.getElementById('btn-inspect-token');
  const btnCloseTokenInspector = document.getElementById('btn-close-token-inspector');
  const btnSaveCustomToken = document.getElementById('btn-save-custom-token');
  const btnClearToken = document.getElementById('btn-clear-token');

  tokenBadge?.addEventListener('click', openTokenInspector);
  btnInspectToken?.addEventListener('click', openTokenInspector);
  btnCloseTokenInspector?.addEventListener('click', closeTokenInspector);

  btnSaveCustomToken?.addEventListener('click', () => {
    const rawVal = document.getElementById('token-raw-content')?.value.trim();
    if (rawVal) {
      setStoredToken(rawVal);
      showNotification('Custom JWT saved to sessionStorage.', 'success');
      closeTokenInspector();
    } else {
      showNotification('Token cannot be empty', 'warning');
    }
  });

  btnClearToken?.addEventListener('click', () => {
    signOut();
    closeTokenInspector();
  });

  // Data Source Toggle Button Listeners
  const btnModeLive = document.getElementById('btn-mode-live');
  const btnModeMock = document.getElementById('btn-mode-mock');
  const btnModeAuto = document.getElementById('btn-mode-auto');

  btnModeLive?.addEventListener('click', () => setDataSourceMode('live'));
  btnModeMock?.addEventListener('click', () => setDataSourceMode('mock'));
  btnModeAuto?.addEventListener('click', () => setDataSourceMode('auto'));

  // Settings Modal Handlers
  const settingsBtn = document.getElementById('btn-open-settings');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsBtn = document.getElementById('btn-close-settings');
  const saveSettingsBtn = document.getElementById('btn-save-settings');
  const inputApiUrl = document.getElementById('settings-api-url');
  const inputClientId = document.getElementById('settings-client-id');
  const inputGmapsKey = document.getElementById('settings-gmaps-key');

  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener('click', () => {
      if (inputApiUrl) inputApiUrl.value = AppState.apiBaseUrl;
      if (inputClientId) inputClientId.value = AppState.googleClientId;
      if (inputGmapsKey) inputGmapsKey.value = AppState.googleMapsApiKey;
      settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn?.addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });

    saveSettingsBtn?.addEventListener('click', () => {
      if (inputApiUrl) {
        AppState.apiBaseUrl = inputApiUrl.value.trim();
        localStorage.setItem('fleetcore_api_url', AppState.apiBaseUrl);
      }
      if (inputClientId) {
        AppState.googleClientId = inputClientId.value.trim();
        localStorage.setItem('fleetcore_google_client_id', AppState.googleClientId);
      }
      if (inputGmapsKey && inputGmapsKey.value.trim() !== AppState.googleMapsApiKey) {
        saveGoogleMapsKey(inputGmapsKey.value.trim());
      }
      settingsModal.classList.add('hidden');
      updateDataSourceUI();
      showNotification('Configuration saved. Refreshing data...', 'info');
      initGoogleAuth();
      if (AppState.currentTab === 'tracking') {
        loadTrackingData();
      } else {
        loadAssignments();
      }
    });
  }

  // Live Map UI Listeners
  const mapVehicleFocusSelect = document.getElementById('map-vehicle-focus');
  const btnMapFitAll = document.getElementById('btn-map-fit-all');
  const btnActivateKey = document.getElementById('btn-activate-gmaps-key');
  const btnDismissBanner = document.getElementById('btn-dismiss-gmaps-banner');
  const btnOpenGuide = document.getElementById('btn-open-gmaps-guide');
  const btnModalOpenGuide = document.getElementById('btn-modal-open-gmaps-guide');
  const guideModal = document.getElementById('gmaps-guide-modal');
  const btnCloseGuide = document.getElementById('btn-close-gmaps-guide');
  const btnGuideCancel = document.getElementById('btn-guide-cancel');
  const btnGuideSave = document.getElementById('btn-guide-save-key');

  mapVehicleFocusSelect?.addEventListener('change', (e) => {
    if (e.target.value) focusVehicleOnMap(e.target.value);
  });

  btnMapFitAll?.addEventListener('click', () => {
    fitAllMapMarkers();
  });

  btnActivateKey?.addEventListener('click', () => {
    const key = document.getElementById('input-quick-gmaps-key')?.value;
    saveGoogleMapsKey(key);
  });

  btnDismissBanner?.addEventListener('click', () => {
    document.getElementById('gmaps-key-banner')?.classList.add('hidden');
  });

  const btnDismissError = document.getElementById('btn-dismiss-gmaps-error');
  btnDismissError?.addEventListener('click', () => {
    document.getElementById('gmaps-error-banner')?.classList.add('hidden');
  });

  btnOpenGuide?.addEventListener('click', () => {
    guideModal?.classList.remove('hidden');
  });

  btnModalOpenGuide?.addEventListener('click', () => {
    guideModal?.classList.remove('hidden');
  });

  btnCloseGuide?.addEventListener('click', () => {
    guideModal?.classList.add('hidden');
  });

  btnGuideCancel?.addEventListener('click', () => {
    guideModal?.classList.add('hidden');
  });

  btnGuideSave?.addEventListener('click', () => {
    const key = document.getElementById('guide-input-gmaps-key')?.value;
    saveGoogleMapsKey(key);
  });

  // Initialize Map Engine & Start 5-second interval tracking loop
  initFleetMap();
  startRealtimeTrackingLoop();

  // Set initial data source mode button highlight
  setDataSourceMode(AppState.dataSourceMode);
});
