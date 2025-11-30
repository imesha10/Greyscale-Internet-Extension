// Cache for quick domain lookups
let settingsCache = {
  sites: {},
  intensity: 100,
  lastUpdate: 0
};

// Initialize on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      greyscaleSites: {},
      intensity: 100
    });
  }
  loadSettings();
});

// Load settings on startup
chrome.runtime.onStartup.addListener(loadSettings);

// Load settings into cache
async function loadSettings() {
  const data = await chrome.storage.sync.get(['greyscaleSites', 'intensity']);
  settingsCache.sites = data.greyscaleSites || {};
  settingsCache.intensity = data.intensity ?? 100;
  settingsCache.lastUpdate = Date.now();
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.greyscaleSites) {
      settingsCache.sites = changes.greyscaleSites.newValue || {};
    }
    if (changes.intensity) {
      settingsCache.intensity = changes.intensity.newValue ?? 100;
    }
    settingsCache.lastUpdate = Date.now();
    
    // Update all matching tabs
    updateAllTabs();
  }
});

// Check if domain matches any saved site
function isDomainEnabled(hostname) {
  const domain = hostname.replace(/^www\./, '');
  
  for (const savedDomain of Object.keys(settingsCache.sites)) {
    if (settingsCache.sites[savedDomain]?.enabled) {
      if (domain === savedDomain || domain.endsWith('.' + savedDomain)) {
        return true;
      }
    }
  }
  return false;
}

// Apply or remove greyscale for a specific tab
async function updateTab(tabId, url) {
  if (!url || !url.startsWith('http')) return;
  
  try {
    const hostname = new URL(url).hostname;
    const shouldApply = isDomainEnabled(hostname);
    
    if (shouldApply) {
      // Inject greyscale CSS
      await chrome.scripting.insertCSS({
        target: { tabId },
        css: `html { filter: grayscale(${settingsCache.intensity}%) !important; -webkit-filter: grayscale(${settingsCache.intensity}%) !important; }`
      });
    } else {
      // Try to remove (will fail silently if not applied)
      try {
        await chrome.scripting.removeCSS({
          target: { tabId },
          css: `html { filter: grayscale(${settingsCache.intensity}%) !important; -webkit-filter: grayscale(${settingsCache.intensity}%) !important; }`
        });
      } catch (e) {
        // CSS wasn't applied, ignore
      }
    }
  } catch (error) {
    // Tab might be a system page, ignore
  }
}

// Update all open tabs
async function updateAllTabs() {
  const tabs = await chrome.tabs.query({});
  
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      updateTab(tab.id, tab.url);
    }
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    updateTab(tabId, tab.url);
  }
});

// Listen for navigation
chrome.webNavigation?.onCommitted?.addListener((details) => {
  if (details.frameId === 0) { // Main frame only
    updateTab(details.tabId, details.url);
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSettings') {
    sendResponse(settingsCache);
  } else if (message.action === 'refreshTab') {
    updateTab(message.tabId, message.url);
    sendResponse({ success: true });
  }
  return true;
});
