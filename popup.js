// State management
let state = {
  sites: {},
  intensity: 100,
  currentDomain: '',
  currentTabId: null
};

// Debounce utility - prevents rapid-fire saves
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Debounced save function
const debouncedSaveIntensity = debounce(async () => {
  await chrome.storage.sync.set({ intensity: state.intensity });
  showToast('Intensity updated', 'success');
}, 300);

// DOM Elements - cache them once
const elements = {};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  await loadState();
  await getCurrentTab();
  renderSitesList();
  setupEventListeners();
});

// Cache DOM elements (faster than querying each time)
function cacheElements() {
  elements.currentDomain = document.getElementById('currentDomain');
  elements.currentSiteToggle = document.getElementById('currentSiteToggle');
  elements.intensitySlider = document.getElementById('intensitySlider');
  elements.intensityValue = document.getElementById('intensityValue');
  elements.newSiteInput = document.getElementById('newSiteInput');
  elements.addSiteBtn = document.getElementById('addSiteBtn');
  elements.sitesList = document.getElementById('sitesList');
  elements.siteCount = document.getElementById('siteCount');
  elements.emptyState = document.getElementById('emptyState');
  elements.enableAllBtn = document.getElementById('enableAllBtn');
  elements.disableAllBtn = document.getElementById('disableAllBtn');
}

// Load state from storage
async function loadState() {
  const data = await chrome.storage.sync.get(['greyscaleSites', 'intensity']);
  state.sites = data.greyscaleSites || {};
  state.intensity = data.intensity ?? 100;
  elements.intensitySlider.value = state.intensity;
  elements.intensityValue.textContent = `${state.intensity}%`;
}

// Get current tab info
async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.startsWith('http')) {
      const url = new URL(tab.url);
      state.currentDomain = url.hostname.replace(/^www\./, '');
      state.currentTabId = tab.id;
      elements.currentDomain.textContent = state.currentDomain;
      elements.currentSiteToggle.checked = state.sites[state.currentDomain]?.enabled || false;
    } else {
      setCurrentSiteUnavailable();
    }
  } catch (error) {
    setCurrentSiteUnavailable();
  }
}

function setCurrentSiteUnavailable() {
  elements.currentDomain.textContent = 'Not available';
  elements.currentSiteToggle.disabled = true;
}

// Setup event listeners
function setupEventListeners() {
  // Current site toggle
  elements.currentSiteToggle.addEventListener('change', async (e) => {
    if (state.currentDomain && state.currentDomain !== 'Not available') {
      await toggleSite(state.currentDomain, e.target.checked);
      renderSitesList();
    }
  });

  // Intensity slider - update display immediately, save with debounce
  elements.intensitySlider.addEventListener('input', (e) => {
    state.intensity = parseInt(e.target.value);
    elements.intensityValue.textContent = `${state.intensity}%`;
  });

  elements.intensitySlider.addEventListener('change', () => {
    debouncedSaveIntensity();
  });

  // Add site
  elements.addSiteBtn.addEventListener('click', addNewSite);
  elements.newSiteInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addNewSite();
  });

  // Bulk actions
  elements.enableAllBtn.addEventListener('click', () => bulkToggle(true));
  elements.disableAllBtn.addEventListener('click', () => bulkToggle(false));
}

// Bulk toggle all sites
async function bulkToggle(enabled) {
  const domains = Object.keys(state.sites);
  if (domains.length === 0) return;
  
  for (const domain of domains) {
    state.sites[domain].enabled = enabled;
  }
  
  await saveState();
  elements.currentSiteToggle.checked = state.sites[state.currentDomain]?.enabled || false;
  renderSitesList();
  showToast(`All sites ${enabled ? 'enabled' : 'disabled'}`, 'success');
}

// Add new site
async function addNewSite() {
  let domain = elements.newSiteInput.value.trim().toLowerCase();
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
  
  if (!domain) {
    showToast('Please enter a domain', 'error');
    return;
  }

  if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i.test(domain)) {
    showToast('Invalid domain format', 'error');
    return;
  }

  if (state.sites[domain]) {
    showToast('Site already exists', 'error');
    return;
  }

  state.sites[domain] = { enabled: true };
  await saveState();
  
  elements.newSiteInput.value = '';
  
  if (state.currentDomain === domain) {
    elements.currentSiteToggle.checked = true;
  }
  
  renderSitesList();
  showToast(`${domain} added`, 'success');
}

// Toggle site
async function toggleSite(domain, enabled) {
  if (!state.sites[domain]) {
    state.sites[domain] = { enabled };
  } else {
    state.sites[domain].enabled = enabled;
  }
  await saveState();
}

// Delete site
async function deleteSite(domain) {
  delete state.sites[domain];
  await saveState();
  
  if (state.currentDomain === domain) {
    elements.currentSiteToggle.checked = false;
  }
  
  renderSitesList();
  showToast(`${domain} removed`, 'success');
}

// Save state to storage (this triggers background.js update)
async function saveState() {
  await chrome.storage.sync.set({ greyscaleSites: state.sites });
}

// Render sites list using DocumentFragment (faster)
function renderSitesList() {
  const domains = Object.keys(state.sites);
  
  elements.siteCount.textContent = `${domains.length} site${domains.length !== 1 ? 's' : ''}`;
  
  if (domains.length === 0) {
    elements.sitesList.innerHTML = '';
    elements.emptyState.classList.add('show');
    return;
  }
  
  elements.emptyState.classList.remove('show');
  
  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  
  domains.forEach(domain => {
    const item = createSiteItem(domain);
    fragment.appendChild(item);
  });
  
  elements.sitesList.innerHTML = '';
  elements.sitesList.appendChild(fragment);
}

// Create site item element
function createSiteItem(domain) {
  const div = document.createElement('div');
  div.className = 'site-item';
  div.dataset.domain = domain;
  
  const isEnabled = state.sites[domain]?.enabled;
  
  div.innerHTML = `
    <div class="site-info">
      <div class="site-favicon">
        <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" 
             alt="" width="16" height="16"
             onerror="this.style.display='none'; this.parentElement.innerHTML='🌐';">
      </div>
      <span class="site-domain">${domain}</span>
    </div>
    <div class="site-actions">
      <label class="toggle">
        <input type="checkbox" class="site-toggle" ${isEnabled ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
      <button class="delete-btn" title="Remove site">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>
  `;
  
  // Add event listeners
  div.querySelector('.site-toggle').addEventListener('change', async (e) => {
    await toggleSite(domain, e.target.checked);
    if (domain === state.currentDomain) {
      elements.currentSiteToggle.checked = e.target.checked;
    }
  });
  
  div.querySelector('.delete-btn').addEventListener('click', () => deleteSite(domain));
  
  return div;
}

// Toast notification
let toastTimeout;
function showToast(message, type = 'success') {
  let toast = document.querySelector('.toast');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.className = `toast ${type}`;
  
  // Force reflow for animation
  toast.offsetHeight;
  toast.classList.add('show');
  
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
