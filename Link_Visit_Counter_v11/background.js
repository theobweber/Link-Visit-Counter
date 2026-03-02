// Initialize storage if empty
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["dailyCounts", "totalCounts"], (result) => {
    if (!result.dailyCounts) {
      chrome.storage.local.set({ dailyCounts: {}, totalCounts: {} });
    }
  });
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const url = new URL(tab.url);
    const hostname = url.hostname;

    // Get current date
    const today = new Date().toLocaleDateString();

    // Update daily and total counts
    chrome.storage.local.get(["dailyCounts", "totalCounts"], (result) => {
      const dailyCounts = result.dailyCounts || {};
      const totalCounts = result.totalCounts || {};

      // Update daily count
      if (!dailyCounts[today]) {
        dailyCounts[today] = {};
      }
      dailyCounts[today][hostname] = (dailyCounts[today][hostname] || 0) + 1;

      // Update total count
      totalCounts[hostname] = (totalCounts[hostname] || 0) + 1;

      // Save back to storage
      chrome.storage.local.set({ dailyCounts, totalCounts });
    });
  }
});

// Reset daily counts at midnight
function resetDailyCounts() {
  chrome.storage.local.set({ dailyCounts: {} });
}

// Schedule reset at midnight
const now = new Date();
const midnight = new Date(now);
midnight.setHours(24, 0, 0, 0);
const timeUntilMidnight = midnight - now;

setTimeout(() => {
  resetDailyCounts();
  setInterval(resetDailyCounts, 24 * 60 * 60 * 1000); // Reset every 24 hours
}, timeUntilMidnight);