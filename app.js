/* ═══════════════════════════════════════════════════════════
   GEOFENCE — Application Logic
   Haversine-based Virtual Boundary Verification System
   ═══════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────
const ADMIN_PASSWORD = 'admin123'; // Default admin password

const state = {
  boundary: {
    lat: null,
    lng: null,
    accuracy: 0,
    radius: 15,       // meters
    passcode: '',
    locked: false,
  },
  adminLoggedIn: false,
  userLoggedIn: false,
};

// ─── Screen Navigation ───────────────────────────────────
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    // Update verify screen info when entering
    if (screenId === 'user-verify-screen') {
      document.getElementById('verify-radius-display').textContent = state.boundary.radius + ' m';
    }
  }
}

// ─── Toast Notifications ─────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Haversine Distance (meters) ─────────────────────────
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in meters
}

// ═══════════════════════════════════════════════════════════
// ADMIN LOGIC
// ═══════════════════════════════════════════════════════════

function handleAdminLogin(e) {
  e.preventDefault();
  const pw = document.getElementById('admin-password').value;
  const errorEl = document.getElementById('admin-login-error');

  if (pw === ADMIN_PASSWORD) {
    state.adminLoggedIn = true;
    errorEl.classList.add('hidden');
    showScreen('admin-dashboard');
    showToast('Welcome, Admin!', 'success');
    loadBoundaryFromStorage();
    updateAdminUI();
  } else {
    errorEl.textContent = 'Incorrect password. Please try again.';
    errorEl.classList.remove('hidden');
  }
}

function adminLogout() {
  state.adminLoggedIn = false;
  document.getElementById('admin-password').value = '';
  showScreen('splash-screen');
  showToast('Logged out successfully', 'info');
}

function captureAdminLocation() {
  const statusEl = document.getElementById('location-status');
  statusEl.classList.remove('hidden', 'success');
  statusEl.classList.add('loading');
  statusEl.textContent = 'Acquiring GPS signal... Please wait.';
  statusEl.style.background = '';
  statusEl.style.borderColor = '';
  statusEl.style.color = '';

  if (!navigator.geolocation) {
    showLocationError(statusEl, 'Geolocation is not supported by your browser.');
    return;
  }

  getReliablePosition(
    (position) => {
      state.boundary.lat = position.coords.latitude;
      state.boundary.lng = position.coords.longitude;
      state.boundary.accuracy = position.coords.accuracy || 0;

      document.getElementById('admin-lat').textContent = position.coords.latitude.toFixed(7);
      document.getElementById('admin-lng').textContent = position.coords.longitude.toFixed(7);
      document.getElementById('admin-acc').textContent = state.boundary.accuracy.toFixed(1) + ' m';

      statusEl.classList.remove('loading');
      statusEl.classList.add('success');
      statusEl.textContent = 'Location captured successfully!';
      statusEl.style.background = '';
      statusEl.style.borderColor = '';
      statusEl.style.color = '';

      updateSummary();
      showToast('GPS coordinates captured!', 'success');
    },
    (errorMsg) => {
      showLocationError(statusEl, errorMsg);
    },
    (progressMsg) => {
      statusEl.textContent = progressMsg;
    }
  );
}

function showLocationError(statusEl, message) {
  statusEl.classList.remove('loading');
  statusEl.style.background = 'rgba(244,63,94,0.1)';
  statusEl.style.borderColor = 'rgba(244,63,94,0.25)';
  statusEl.style.color = '#f43f5e';
  statusEl.textContent = message;
}

/**
 * Reliable GPS acquisition using watchPosition with automatic fallback.
 * Strategy:
 *   1. Start watchPosition (streams positions as GPS warms up)
 *   2. Accept the first position received
 *   3. If high-accuracy times out, fallback to low-accuracy
 *   4. Overall timeout of 45 seconds
 */
function getReliablePosition(onSuccess, onError, onProgress) {
  let resolved = false;
  let watchId = null;
  let fallbackTimeout = null;
  let overallTimeout = null;

  function cleanup() {
    resolved = true;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (fallbackTimeout) clearTimeout(fallbackTimeout);
    if (overallTimeout) clearTimeout(overallTimeout);
  }

  function handlePosition(position) {
    if (resolved) return;
    cleanup();
    onSuccess(position);
  }

  function handleError(error) {
    // On timeout with high accuracy, try low accuracy fallback
    if (!resolved && error.code === error.TIMEOUT) {
      tryLowAccuracy();
      return;
    }
    if (resolved) return;
    cleanup();
    switch (error.code) {
      case error.PERMISSION_DENIED:
        onError('Location permission denied. Please allow location access in your browser/phone settings and reload.');
        break;
      case error.POSITION_UNAVAILABLE:
        onError('Location unavailable. Make sure Location/GPS is ON in your phone settings, then try again.');
        break;
      default:
        onError('Unable to get location. Please check GPS is ON, then try again.');
    }
  }

  function tryLowAccuracy() {
    if (resolved) return;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (onProgress) onProgress('High-accuracy timed out. Trying with network location...');

    watchId = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => {
        if (resolved) return;
        cleanup();
        onError('Location unavailable. Please ensure GPS/Location is ON in your phone settings, allow browser permission, and try again.');
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
    );
  }

  // Start with high accuracy via watchPosition (more reliable than getCurrentPosition)
  if (onProgress) onProgress('Acquiring GPS signal... Please wait.');
  watchId = navigator.geolocation.watchPosition(
    handlePosition,
    handleError,
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
  );

  // Fallback to low accuracy after 15s if still no position
  fallbackTimeout = setTimeout(() => {
    if (!resolved) {
      if (onProgress) onProgress('GPS taking longer than usual. Trying alternative...');
      tryLowAccuracy();
      
      // Also try a direct getCurrentPosition as a last resort
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        () => {},
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    }
  }, 15000);

  // Hard overall timeout at 45s
  overallTimeout = setTimeout(() => {
    if (!resolved) {
      cleanup();
      onError('Could not get location after multiple attempts. Please check: 1) GPS/Location is ON in phone settings 2) Browser has location permission 3) You are not indoors with no signal. Then try again.');
    }
  }, 45000);
}

function setRadius(value) {
  const v = Math.max(1, Math.min(5000, parseInt(value) || 15));
  state.boundary.radius = v;
  document.getElementById('radius-slider').value = Math.min(v, 500);
  document.getElementById('radius-input').value = v;
  document.getElementById('radius-circle-label').textContent = v + ' m';

  // Scale visual circle (max 160px, min 60px)
  const size = Math.max(60, Math.min(160, 60 + (v / 500) * 100));
  document.getElementById('radius-circle').style.width = size + 'px';
  document.getElementById('radius-circle').style.height = size + 'px';

  // Update preset active state
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.textContent) === v);
  });

  updateSummary();
}

function updateRadiusFromSlider(value) {
  setRadius(value);
}

async function toggleLock() {
  const errorEl = document.getElementById('lock-error');
  errorEl.classList.add('hidden');

  if (!state.boundary.locked) {
    // Validate before locking
    if (state.boundary.lat === null || state.boundary.lng === null) {
      errorEl.textContent = 'Please capture your GPS location first (Step 1).';
      errorEl.classList.remove('hidden');
      showToast('Location not set!', 'error');
      return;
    }
    const passcode = document.getElementById('user-passcode-set').value.trim();
    if (!passcode) {
      errorEl.textContent = 'Please set a user passcode (Step 3).';
      errorEl.classList.remove('hidden');
      showToast('Passcode not set!', 'error');
      return;
    }
    state.boundary.passcode = passcode;
    state.boundary.locked = true;
    
    // Disable button while saving
    const btnLockText = document.getElementById('btn-lock-text');
    const originalText = btnLockText.textContent;
    btnLockText.textContent = 'Saving to cloud...';
    
    await saveBoundaryToStorage();
    showToast('Boundary locked and synced to cloud!', 'success');
  } else {
    state.boundary.locked = false;
    
    const btnLockText = document.getElementById('btn-lock-text');
    btnLockText.textContent = 'Unlocking...';
    
    await saveBoundaryToStorage();
    showToast('Boundary unlocked for editing', 'warning');
  }
  updateLockUI();
  updateSummary();
}

function updateLockUI() {
  const lockStatus = document.getElementById('lock-status');
  const lockText = document.getElementById('lock-text');
  const btnLock = document.getElementById('btn-lock');
  const btnLockText = document.getElementById('btn-lock-text');

  if (state.boundary.locked) {
    lockStatus.className = 'lock-status locked';
    lockText.innerHTML = 'Boundary is <strong>Locked & Active</strong>';
    btnLock.className = 'btn-primary btn-wide btn-lock locked-btn';
    btnLockText.textContent = 'Unlock Boundary';

    // Disable editing
    document.getElementById('btn-capture-location').disabled = true;
    document.getElementById('btn-capture-location').style.opacity = '0.5';
    document.getElementById('radius-slider').disabled = true;
    document.getElementById('radius-input').disabled = true;
    document.getElementById('user-passcode-set').disabled = true;
    document.querySelectorAll('.preset-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
  } else {
    lockStatus.className = 'lock-status unlocked';
    lockText.innerHTML = 'Boundary is <strong>Unlocked</strong>';
    btnLock.className = 'btn-primary btn-wide btn-lock';
    btnLockText.textContent = 'Lock Boundary';

    document.getElementById('btn-capture-location').disabled = false;
    document.getElementById('btn-capture-location').style.opacity = '';
    document.getElementById('radius-slider').disabled = false;
    document.getElementById('radius-input').disabled = false;
    document.getElementById('user-passcode-set').disabled = false;
    document.querySelectorAll('.preset-btn').forEach(b => { b.disabled = false; b.style.opacity = ''; });
  }
}

function updateSummary() {
  document.getElementById('summary-center').textContent =
    state.boundary.lat !== null
      ? `${state.boundary.lat.toFixed(5)}, ${state.boundary.lng.toFixed(5)}`
      : 'Not set';
  document.getElementById('summary-radius').textContent = state.boundary.radius + ' m';
  document.getElementById('summary-passcode').textContent =
    state.boundary.passcode || document.getElementById('user-passcode-set').value.trim() || 'Not set';

  const statusEl = document.getElementById('summary-status');
  if (state.boundary.locked) {
    statusEl.textContent = 'Locked ✓';
    statusEl.className = 'summary-value status-locked';
  } else {
    statusEl.textContent = 'Unlocked';
    statusEl.className = 'summary-value status-unlocked';
  }
}

function updateAdminUI() {
  if (state.boundary.lat !== null) {
    document.getElementById('admin-lat').textContent = state.boundary.lat.toFixed(7);
    document.getElementById('admin-lng').textContent = state.boundary.lng.toFixed(7);
    document.getElementById('admin-acc').textContent = '—';
  }
  setRadius(state.boundary.radius);
  if (state.boundary.passcode) {
    document.getElementById('user-passcode-set').value = state.boundary.passcode;
  }
  updateLockUI();
  updateSummary();
}

// ─── Cloud Storage Persistence (Firestore REST API) ────────
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/geofence-app-c20e5/databases/(default)/documents/geofence/boundary';

async function saveBoundaryToStorage() {
  try {
    const payload = {
      fields: {
        lat: { doubleValue: state.boundary.lat || 0 },
        lng: { doubleValue: state.boundary.lng || 0 },
        accuracy: { doubleValue: state.boundary.accuracy || 0 },
        radius: { integerValue: state.boundary.radius || 15 },
        passcode: { stringValue: state.boundary.passcode || "" },
        locked: { booleanValue: !!state.boundary.locked }
      }
    };

    // Use PATCH to create or update the document
    const response = await fetch(FIRESTORE_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Network response was not ok');
  } catch (e) {
    console.error('Failed to save to Firestore:', e);
    showToast('Failed to sync boundary to cloud. Check internet connection.', 'error');
  }
}

async function loadBoundaryFromStorage() {
  try {
    const response = await fetch(FIRESTORE_URL);
    if (response.ok) {
      const data = await response.json();
      if (data && data.fields) {
        const getNum = (f) => f ? Number(f.doubleValue ?? f.integerValue ?? 0) : null;
        
        state.boundary.lat = getNum(data.fields.lat);
        state.boundary.lng = getNum(data.fields.lng);
        state.boundary.accuracy = getNum(data.fields.accuracy) || 0;
        state.boundary.radius = getNum(data.fields.radius) || 15;
        state.boundary.passcode = data.fields.passcode?.stringValue || '';
        state.boundary.locked = data.fields.locked?.booleanValue || false;
      }
    }
  } catch (e) {
    console.error('Failed to load from Firestore:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// USER LOGIC
// ═══════════════════════════════════════════════════════════

async function handleUserLogin(e) {
  e.preventDefault();
  const passcode = document.getElementById('user-passcode').value.trim();
  const errorEl = document.getElementById('user-login-error');
  const btn = document.getElementById('user-login-btn');
  const btnText = btn.querySelector('span');

  btn.disabled = true;
  const originalText = btnText.textContent;
  btnText.textContent = 'Checking cloud...';

  // Load boundary from Firebase
  await loadBoundaryFromStorage();

  btn.disabled = false;
  btnText.textContent = originalText;

  if (!state.boundary.locked) {
    errorEl.textContent = 'No active boundary found. The admin has not locked a boundary yet.';
    errorEl.classList.remove('hidden');
    return;
  }

  if (passcode !== state.boundary.passcode) {
    errorEl.textContent = 'Invalid passcode. Please check with your administrator.';
    errorEl.classList.remove('hidden');
    return;
  }

  state.userLoggedIn = true;
  errorEl.classList.add('hidden');
  showScreen('user-verify-screen');
  showToast('Welcome! Ready to verify.', 'success');
}

function userLogout() {
  state.userLoggedIn = false;
  document.getElementById('user-passcode').value = '';
  document.getElementById('verify-result').classList.add('hidden');
  showScreen('splash-screen');
  showToast('Session ended', 'info');
}

function verifyPresence() {
  const btn = document.getElementById('btn-verify');
  const resultEl = document.getElementById('verify-result');
  resultEl.classList.add('hidden');

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Acquiring GPS...';

  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your device.', 'error', 4000);
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Verify Your Presence';
    return;
  }

  getReliablePosition(
    (position) => {
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      const userAccuracy = position.coords.accuracy || 0;
      const adminAccuracy = state.boundary.accuracy || 0;

      // Raw distance between the two coordinates
      const rawDistance = haversineDistance(
        state.boundary.lat,
        state.boundary.lng,
        userLat,
        userLng
      );

      // Intelligent Accuracy Buffer Math:
      // Subtract the uncertainty (accuracy radius) of BOTH devices from the raw distance.
      // If the laptop says "I am within 2500m of point A" and phone says "I am within 5m of point B",
      // and A and B are 2495m apart, then the true distance could be mathematically 0m.
      let adjustedDistance = rawDistance - adminAccuracy - userAccuracy;
      adjustedDistance = Math.max(0, adjustedDistance); // Can't have negative distance

      const isInside = adjustedDistance <= state.boundary.radius;

      showVerifyResult(isInside, adjustedDistance, rawDistance, userAccuracy, adminAccuracy, userLat, userLng);

      btn.disabled = false;
      btn.querySelector('span').textContent = 'Verify Your Presence';
    },
    (errorMsg) => {
      showToast(errorMsg, 'error', 5000);
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Verify Your Presence';
    },
    (progressMsg) => {
      btn.querySelector('span').textContent = progressMsg;
    }
  );
}

function showVerifyResult(isInside, adjustedDistance, rawDistance, userAccuracy, adminAccuracy, userLat, userLng) {
  const resultEl = document.getElementById('verify-result');
  const iconEl = document.getElementById('result-icon');
  const titleEl = document.getElementById('result-title');
  const msgEl = document.getElementById('result-message');
  const detailsEl = document.getElementById('result-details');

  // Move radar dot based on relative position
  const radarDot = document.getElementById('radar-dot');
  const maxVisualDist = 100; // px from center (radar is 200x200)
  const ratio = Math.min(adjustedDistance / (state.boundary.radius * 2 || 1), 1);
  const angle = Math.random() * 2 * Math.PI;
  const dx = ratio * maxVisualDist * Math.cos(angle);
  const dy = ratio * maxVisualDist * Math.sin(angle);
  radarDot.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

  if (isInside) {
    resultEl.className = 'verify-result success';
    radarDot.style.background = 'var(--accent-emerald)';
    radarDot.style.boxShadow = '0 0 16px rgba(16,185,129,0.7)';

    iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    titleEl.textContent = '✓ Verified — Inside Boundary';
    msgEl.textContent = `You are within the virtual boundary. Your presence has been verified successfully.`;
  } else {
    resultEl.className = 'verify-result failure';
    radarDot.style.background = 'var(--accent-rose)';
    radarDot.style.boxShadow = '0 0 16px rgba(244,63,94,0.7)';

    const diff = (adjustedDistance - state.boundary.radius).toFixed(1);
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    titleEl.textContent = '✗ Not In Boundary';
    msgEl.textContent = `You are NOT within the virtual boundary. Please move approximately ${diff} meters closer to the boundary center to verify your presence.`;
  }

  detailsEl.innerHTML = `
    <span class="detail-chip">Effect. Dist: ${adjustedDistance.toFixed(1)} m</span>
    <span class="detail-chip">Raw Dist: ${rawDistance.toFixed(1)} m</span>
    <span class="detail-chip">Radius: ${state.boundary.radius} m</span>
    <span class="detail-chip">User GPS Acc: ±${userAccuracy.toFixed(1)} m</span>
    <span class="detail-chip">Admin GPS Acc: ±${adminAccuracy.toFixed(1)} m</span>
  `;

  resultEl.classList.remove('hidden');
}

// ─── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadBoundaryFromStorage();
  showScreen('splash-screen');
});
