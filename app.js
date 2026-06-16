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
  statusEl.textContent = 'Acquiring GPS signal...';

  if (!navigator.geolocation) {
    statusEl.classList.remove('loading');
    statusEl.classList.add('error');
    statusEl.textContent = 'Geolocation is not supported by your browser.';
    statusEl.style.background = 'rgba(244,63,94,0.1)';
    statusEl.style.borderColor = 'rgba(244,63,94,0.25)';
    statusEl.style.color = '#f43f5e';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.boundary.lat = position.coords.latitude;
      state.boundary.lng = position.coords.longitude;

      document.getElementById('admin-lat').textContent = position.coords.latitude.toFixed(7);
      document.getElementById('admin-lng').textContent = position.coords.longitude.toFixed(7);
      document.getElementById('admin-acc').textContent = (position.coords.accuracy || 0).toFixed(1) + ' m';

      statusEl.classList.remove('loading');
      statusEl.classList.add('success');
      statusEl.textContent = 'Location captured successfully!';
      statusEl.style.background = '';
      statusEl.style.borderColor = '';
      statusEl.style.color = '';

      updateSummary();
      showToast('GPS coordinates captured!', 'success');
    },
    (error) => {
      statusEl.classList.remove('loading');
      statusEl.style.background = 'rgba(244,63,94,0.1)';
      statusEl.style.borderColor = 'rgba(244,63,94,0.25)';
      statusEl.style.color = '#f43f5e';

      switch (error.code) {
        case error.PERMISSION_DENIED:
          statusEl.textContent = 'Location permission denied. Please allow location access in your browser settings.';
          break;
        case error.POSITION_UNAVAILABLE:
          statusEl.textContent = 'Location information unavailable. Try again.';
          break;
        case error.TIMEOUT:
          statusEl.textContent = 'Location request timed out. Try again.';
          break;
        default:
          statusEl.textContent = 'An unknown error occurred.';
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    }
  );
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

function toggleLock() {
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
    saveBoundaryToStorage();
    showToast('Boundary locked and active!', 'success');
  } else {
    state.boundary.locked = false;
    saveBoundaryToStorage();
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

// ─── Local Storage Persistence ───────────────────────────
function saveBoundaryToStorage() {
  try {
    localStorage.setItem('geofence_boundary', JSON.stringify(state.boundary));
  } catch (e) {
    // Storage not available
  }
}

function loadBoundaryFromStorage() {
  try {
    const saved = localStorage.getItem('geofence_boundary');
    if (saved) {
      const data = JSON.parse(saved);
      state.boundary = { ...state.boundary, ...data };
    }
  } catch (e) {
    // Storage not available
  }
}

// ═══════════════════════════════════════════════════════════
// USER LOGIC
// ═══════════════════════════════════════════════════════════

function handleUserLogin(e) {
  e.preventDefault();
  const passcode = document.getElementById('user-passcode').value.trim();
  const errorEl = document.getElementById('user-login-error');

  // Load boundary from storage
  loadBoundaryFromStorage();

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
    showVerifyError('Geolocation is not supported by your device.');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Verify Your Presence';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      const distance = haversineDistance(
        state.boundary.lat,
        state.boundary.lng,
        userLat,
        userLng
      );

      const isInside = distance <= state.boundary.radius;

      showVerifyResult(isInside, distance, accuracy, userLat, userLng);

      btn.disabled = false;
      btn.querySelector('span').textContent = 'Verify Your Presence';
    },
    (error) => {
      let msg = 'Unable to determine your location. ';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          msg += 'Please allow location access in your browser settings.';
          break;
        case error.POSITION_UNAVAILABLE:
          msg += 'Location information unavailable.';
          break;
        case error.TIMEOUT:
          msg += 'Request timed out. Please try again.';
          break;
        default:
          msg += 'An unknown error occurred.';
      }
      showToast(msg, 'error', 4000);
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Verify Your Presence';
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    }
  );
}

function showVerifyResult(isInside, distance, accuracy, userLat, userLng) {
  const resultEl = document.getElementById('verify-result');
  const iconEl = document.getElementById('result-icon');
  const titleEl = document.getElementById('result-title');
  const msgEl = document.getElementById('result-message');
  const detailsEl = document.getElementById('result-details');

  // Move radar dot based on relative position
  const radarDot = document.getElementById('radar-dot');
  const maxVisualDist = 100; // px from center (radar is 200x200)
  const ratio = Math.min(distance / (state.boundary.radius * 2), 1);
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

    const diff = (distance - state.boundary.radius).toFixed(1);
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    titleEl.textContent = '✗ Not In Boundary';
    msgEl.textContent = `You are NOT within the virtual boundary. Please move approximately ${diff} meters closer to the boundary center to verify your presence.`;
  }

  detailsEl.innerHTML = `
    <span class="detail-chip">Distance: ${distance.toFixed(1)} m</span>
    <span class="detail-chip">Radius: ${state.boundary.radius} m</span>
    <span class="detail-chip">GPS Accuracy: ±${(accuracy || 0).toFixed(1)} m</span>
    <span class="detail-chip">Your GPS: ${userLat.toFixed(5)}, ${userLng.toFixed(5)}</span>
  `;

  resultEl.classList.remove('hidden');
}

// ─── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadBoundaryFromStorage();
  showScreen('splash-screen');
});
