const STORAGE_KEYS = {
  DAILY_COUNTS: "dailyCounts",
  TOTAL_COUNTS: "totalCounts",
  ACTIVE_SESSIONS: "activeSessions"
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    [STORAGE_KEYS.DAILY_COUNTS, STORAGE_KEYS.TOTAL_COUNTS, STORAGE_KEYS.ACTIVE_SESSIONS],
    (result) => {
      chrome.storage.local.set({
        [STORAGE_KEYS.DAILY_COUNTS]: result[STORAGE_KEYS.DAILY_COUNTS] || {},
        [STORAGE_KEYS.TOTAL_COUNTS]: result[STORAGE_KEYS.TOTAL_COUNTS] || {},
        [STORAGE_KEYS.ACTIVE_SESSIONS]: result[STORAGE_KEYS.ACTIVE_SESSIONS] || {}
      });
    }
  );
});

function getTodayKey() {
  return new Date().toLocaleDateString();
}

function ensureStatsEntry(entry) {
  if (typeof entry === "number") {
    return { visits: entry, timeMs: 0 };
  }

  return {
    visits: entry?.visits || 0,
    timeMs: entry?.timeMs || 0
  };
}

function startSession(tabId, hostname) {
  chrome.storage.local.get(
    [STORAGE_KEYS.DAILY_COUNTS, STORAGE_KEYS.TOTAL_COUNTS, STORAGE_KEYS.ACTIVE_SESSIONS],
    (result) => {
      const today = getTodayKey();
      const dailyCounts = result[STORAGE_KEYS.DAILY_COUNTS] || {};
      const totalCounts = result[STORAGE_KEYS.TOTAL_COUNTS] || {};
      const activeSessions = result[STORAGE_KEYS.ACTIVE_SESSIONS] || {};

      if (!dailyCounts[today]) {
        dailyCounts[today] = {};
      }

      dailyCounts[today][hostname] = ensureStatsEntry(dailyCounts[today][hostname]);
      totalCounts[hostname] = ensureStatsEntry(totalCounts[hostname]);

      dailyCounts[today][hostname].visits += 1;
      totalCounts[hostname].visits += 1;

      activeSessions[tabId] = {
        hostname,
        startTime: Date.now()
      };

      chrome.storage.local.set({
        [STORAGE_KEYS.DAILY_COUNTS]: dailyCounts,
        [STORAGE_KEYS.TOTAL_COUNTS]: totalCounts,
        [STORAGE_KEYS.ACTIVE_SESSIONS]: activeSessions
      });
    }
  );
}

function stopSession(tabId) {
  chrome.storage.local.get(
    [STORAGE_KEYS.DAILY_COUNTS, STORAGE_KEYS.TOTAL_COUNTS, STORAGE_KEYS.ACTIVE_SESSIONS],
    (result) => {
      const activeSessions = result[STORAGE_KEYS.ACTIVE_SESSIONS] || {};
      const session = activeSessions[tabId];

      if (!session) {
        return;
      }

      const elapsedMs = Math.max(0, Date.now() - session.startTime);
      const today = getTodayKey();
      const dailyCounts = result[STORAGE_KEYS.DAILY_COUNTS] || {};
      const totalCounts = result[STORAGE_KEYS.TOTAL_COUNTS] || {};

      if (!dailyCounts[today]) {
        dailyCounts[today] = {};
      }

      dailyCounts[today][session.hostname] = ensureStatsEntry(dailyCounts[today][session.hostname]);
      totalCounts[session.hostname] = ensureStatsEntry(totalCounts[session.hostname]);

      dailyCounts[today][session.hostname].timeMs += elapsedMs;
      totalCounts[session.hostname].timeMs += elapsedMs;

      delete activeSessions[tabId];

      chrome.storage.local.set({
        [STORAGE_KEYS.DAILY_COUNTS]: dailyCounts,
        [STORAGE_KEYS.TOTAL_COUNTS]: totalCounts,
        [STORAGE_KEYS.ACTIVE_SESSIONS]: activeSessions
      });
    }
  );
}

function getHostname(urlString) {
  try {
    const url = new URL(urlString);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.hostname;
  } catch {
    return null;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) {
    return;
  }

  const hostname = getHostname(tab.url);
  if (!hostname) {
    return;
  }

  stopSession(tabId);
  startSession(tabId, hostname);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stopSession(tabId);
});

function resetDailyCounts() {
  chrome.storage.local.set({ [STORAGE_KEYS.DAILY_COUNTS]: {} });
}

const now = new Date();
const midnight = new Date(now);
midnight.setHours(24, 0, 0, 0);
const timeUntilMidnight = midnight - now;

setTimeout(() => {
  resetDailyCounts();
  setInterval(resetDailyCounts, 24 * 60 * 60 * 1000);
}, timeUntilMidnight);
