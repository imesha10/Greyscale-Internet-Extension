// Content script - runs on all pages

let styleElement = null;

// Initialize
init();

async function init() {
  // Get stored settings
  const data = await chrome.storage.sync.get(['greyscaleSites', 'intensity']);
  const sites = data.greyscaleSites || {};
  const intensity = data.intensity !== undefined ? data.intensity : 100;
  
  applyGreyscale(sites, intensity);
}

// Apply greyscale filter
function applyGreyscale(sites, intensity) {
  const currentDomain = window.location.hostname.replace('www.', '');
  
  // Check if current site should be greyscale
  let shouldApply = false;
  
  for (const domain of Object.keys(sites)) {
    if (currentDomain === domain || currentDomain.endsWith('.' + domain)) {
      if (sites[domain]?.enabled) {
        shouldApply = true;
        break;
      }
    }
  }
  
  if (shouldApply) {
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'greyscale-extension-style';
      document.documentElement.appendChild(styleElement);
    }
    
    styleElement.textContent = `
      html {
        filter: grayscale(${intensity}%) !important;
        -webkit-filter: grayscale(${intensity}%) !important;
      }
    `;
  } else {
    if (styleElement) {
      styleElement.remove();
      styleElement = null;
    }
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateGreyscale') {
    applyGreyscale(message.sites, message.intensity);
    sendResponse({ success: true });
  }
  return true;
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    chrome.storage.sync.get(['greyscaleSites', 'intensity'], (data) => {
      const sites = data.greyscaleSites || {};
      const intensity = data.intensity !== undefined ? data.intensity : 100;
      applyGreyscale(sites, intensity);
    });
  }
});
