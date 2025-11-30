// Background service worker - Fixed Version

// Initialize on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      greyscaleSites: {},
      intensity: 100
    });
    console.log('Greyscale Web extension installed');
  }
});

// Get settings from storage (always fresh, never rely on cache)
async function getSettings() {
  const data = await chrome.storage.sync.get(['greyscaleSites', 'intensity']);
  return {
    sites: data.greyscaleSites || {},
    intensity: data.intensity ?? 100
  };
}

// Check if domain matches any saved site
function isDomainEnabled(hostname, sites) {
  const domain = hostname.replace(/^www\./, '');
  
  for (const savedDomain of Object.keys(sites)) {
    if (sites[savedDomain]?.enabled) {
      if (domain === savedDomain || domain.endsWith('.' + savedDomain)) {
        return true;
      }
    }
  }
  return false;
}

// Generate CSS for greyscale
function getGreyscaleCSS(intensity) {
  return `
    html {
      filter: grayscale(${intensity}%) !important;
      -webkit-filter: grayscale(${intensity}%) !important;
    }
  `;
}

// Apply greyscale to a tab using executeScript (more reliable than insertCSS)
async function applyGreyscale(tabId, intensity) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (intensity) => {
        // Remove existing style if any
        const existingStyle = document.getElementById('greyscale-web-extension');
        if (existingStyle) {
          existingStyle.remove();
        }
        
        // Create and inject new style
        const style = document.createElement('style');
        style.id = 'greyscale-web-extension';
        style.textContent = `
          html {
            filter: grayscale(${intensity}%) !important;
            -webkit-filter: grayscale(${intensity}%) !important;
          }
        `;
        document.documentElement.appendChild(style);
      },
      args: [intensity]
    });
    return true;
  } catch (error) {
    // Tab might be a chrome:// page or other restricted page
    return false;
  }
}

// Remove greyscale from a tab
async function removeGreyscale(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const existingStyle = document.getElementById('greyscale-web-extension');
        if (existingStyle) {
          existingStyle.remove();
        }
      }
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Update a specific tab
async function updateTab(tabId, url) {
  if (!url || !url.startsWith('http')) return;
  
  try {
    const hostname = new URL(url).hostname;
    const settings = await getSettings();
    const shouldApply = isDomainEnabled(hostname, settings.sites);
    
    if (shouldApply) {
      await applyGreyscale(tabId, settings.intensity);
    } else {
      await removeGreyscale(tabId);
    }
  } catch (error) {
    console.log('Could not update tab:', error);
  }
}

// Update all open tabs
async function updateAllTabs() {
  const tabs = await chrome.tabs.query({});
  
  for (const tab of tabs) {
    if (tab.id && tab.url) {
      await updateTab(tab.id, tab.url);
    }
  }
}

// Listen for tab updates - this is the main trigger
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Apply on multiple stages to ensure it works
  if (changeInfo.status === 'loading' && tab.url) {
    // First attempt when loading starts
    setTimeout(() => updateTab(tabId, tab.url), 100);
  }
  
  if (changeInfo.status === 'complete' && tab.url) {
    // Second attempt when loading completes
    updateTab(tabId, tab.url);
  }
});

// Listen for navigation (catches SPA navigations)
chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0) { // Main frame only
    updateTab(details.tabId, details.url);
  }
});

// Also listen for history state changes (for SPAs like Twitter/X)
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) {
    updateTab(details.tabId, details.url);
  }
});

// Listen for storage changes to update all tabs
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    if (changes.greyscaleSites || changes.intensity) {
      updateAllTabs();
    }
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateTab') {
    updateTab(message.tabId, message.url).then(() => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }
  
  if (message.action === 'updateAllTabs') {
    updateAllTabs().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.action === 'getSettings') {
    getSettings().then((settings) => {
      sendResponse(settings);
    });
    return true;
  }
});
