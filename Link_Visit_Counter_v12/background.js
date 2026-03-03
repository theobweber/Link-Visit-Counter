const STORAGE_KEY = "appData";
const DEFAULT_CATEGORIES = ["Work", "Learning", "Social Media", "Entertainment", "News", "Other"];
const DOMAIN_CATEGORY_MAP = {
  "github.com": "Work", "gitlab.com": "Work", "stackoverflow.com": "Work", "docs.google.com": "Work", "notion.so": "Work",
  "coursera.org": "Learning", "udemy.com": "Learning", "wikipedia.org": "Learning", "khanacademy.org": "Learning",
  "youtube.com": "Entertainment", "netflix.com": "Entertainment", "twitch.tv": "Entertainment",
  "reddit.com": "Social Media", "x.com": "Social Media", "twitter.com": "Social Media", "instagram.com": "Social Media", "facebook.com": "Social Media",
  "news.ycombinator.com": "News", "bbc.com": "News", "cnn.com": "News"
};

let activeSessions = {};
let focusTracker = { hostname: null, startedAt: null };
let isIdle = false;

function getDateKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function buildDefaultData() {
  return {
    daily: {},
    settings: {
      categories: [...DEFAULT_CATEGORIES],
      domainCategories: {},
      goals: { domains: {}, categories: {} },
      notificationsEnabled: true,
      scoreConfig: { productiveCategories: ["Work", "Learning"], distractingCategories: ["Social Media", "Entertainment"] }
    },
    focusSession: { active: false, startedAt: null, endTime: null, durationMinutes: 25, tabSwitches: 0, distractingSwitches: 0 }
  };
}
function normalizeDomainEntry(entry = {}) {
  if (typeof entry === "number") return { time: 0, visits: entry, category: "Other" };
  return { time: entry.time || entry.timeMs || 0, visits: entry.visits || 0, category: entry.category || "Other" };
}
function ensureDay(data, dayKey) {
  if (!data.daily[dayKey]) data.daily[dayKey] = { domains: {}, tabSwitches: 0, longestFocusSessionMs: 0, warningsSent: { domains: {}, categories: {} } };
  if (!data.daily[dayKey].domains) data.daily[dayKey].domains = {};
  if (!data.daily[dayKey].tabSwitches) data.daily[dayKey].tabSwitches = 0;
  if (!data.daily[dayKey].longestFocusSessionMs) data.daily[dayKey].longestFocusSessionMs = 0;
  if (!data.daily[dayKey].warningsSent) data.daily[dayKey].warningsSent = { domains: {}, categories: {} };
}
function getMappedCategory(hostname, settings) { return settings.domainCategories[hostname] || DOMAIN_CATEGORY_MAP[hostname] || "Other"; }

function migrateLegacy(result) {
  if (result[STORAGE_KEY]) {
    const data = result[STORAGE_KEY];
    data.settings = data.settings || buildDefaultData().settings;
    data.settings.categories = Array.from(new Set([...(data.settings.categories || []), ...DEFAULT_CATEGORIES]));
    data.settings.domainCategories = data.settings.domainCategories || {};
    data.settings.goals = data.settings.goals || { domains: {}, categories: {} };
    data.focusSession = data.focusSession || buildDefaultData().focusSession;
    return data;
  }
  const data = buildDefaultData();
  const legacyDaily = result.dailyCounts || {};
  Object.entries(legacyDaily).forEach(([day, domains]) => {
    ensureDay(data, day);
    Object.entries(domains || {}).forEach(([hostname, raw]) => {
      const entry = normalizeDomainEntry(raw);
      entry.category = getMappedCategory(hostname, data.settings);
      data.daily[day].domains[hostname] = entry;
    });
  });
  ensureDay(data, getDateKey());
  return data;
}

function withData(callback) { chrome.storage.local.get([STORAGE_KEY, "dailyCounts", "totalCounts"], (r) => callback(migrateLegacy(r))); }
function saveData(data, callback) { chrome.storage.local.set({ [STORAGE_KEY]: data }, callback); }
function getHostname(urlString) {
  try { const url = new URL(urlString); if (!["http:", "https:"].includes(url.protocol)) return null; return url.hostname; }
  catch { return null; }
}

function maybeNotify(id, title, message, enabled) {
  if (!enabled) return;
  chrome.notifications.create(id, { type: "basic", iconUrl: "icon48.png", title, message });
}

function checkGoals(data, dayKey, hostname, category) {
  const day = data.daily[dayKey];
  const domainTime = day.domains[hostname]?.time || 0;
  const domainGoal = Number(data.settings.goals?.domains?.[hostname] || 0) * 60 * 1000;

  if (domainGoal > 0 && domainTime >= domainGoal && !day.warningsSent.domains[hostname]) {
    day.warningsSent.domains[hostname] = true;
    maybeNotify(`goal-domain-${hostname}`, "Domain goal reached", `${hostname} reached its daily limit.`, data.settings.notificationsEnabled);
  }

  const categoryTime = Object.values(day.domains).filter((d) => d.category === category).reduce((sum, d) => sum + (d.time || 0), 0);
  const categoryGoal = Number(data.settings.goals?.categories?.[category] || 0) * 60 * 1000;
  if (categoryGoal > 0 && categoryTime >= categoryGoal && !day.warningsSent.categories[category]) {
    day.warningsSent.categories[category] = true;
    maybeNotify(`goal-category-${category}`, "Category goal reached", `${category} reached its daily limit.`, data.settings.notificationsEnabled);
  }
}

function updateLongestFocusSession(hostname) {
  const now = Date.now();
  withData((data) => {
    const dayKey = getDateKey();
    ensureDay(data, dayKey);
    if (focusTracker.hostname && focusTracker.startedAt) {
      const duration = Math.max(0, now - focusTracker.startedAt);
      data.daily[dayKey].longestFocusSessionMs = Math.max(data.daily[dayKey].longestFocusSessionMs || 0, duration);
    }
    focusTracker = { hostname, startedAt: now };
    saveData(data);
  });
}

function startSession(tabId, hostname) {
  if (isIdle) return;
  withData((data) => {
    const dayKey = getDateKey();
    ensureDay(data, dayKey);
    const category = getMappedCategory(hostname, data.settings);
    const currentEntry = normalizeDomainEntry(data.daily[dayKey].domains[hostname]);
    currentEntry.visits += 1;
    currentEntry.category = category;
    data.daily[dayKey].domains[hostname] = currentEntry;
    activeSessions[tabId] = { hostname, startedAt: Date.now() };
    saveData(data);
    updateLongestFocusSession(hostname);
  });
}

function stopSession(tabId) {
  const session = activeSessions[tabId];
  if (!session) return;
  const elapsed = Math.max(0, Date.now() - session.startedAt);
  delete activeSessions[tabId];

  withData((data) => {
    const dayKey = getDateKey();
    ensureDay(data, dayKey);
    const category = getMappedCategory(session.hostname, data.settings);
    const entry = normalizeDomainEntry(data.daily[dayKey].domains[session.hostname]);
    entry.time += elapsed;
    entry.category = category;
    data.daily[dayKey].domains[session.hostname] = entry;

    checkGoals(data, dayKey, session.hostname, category);
    saveData(data);
  });
}

function pauseAllSessions() {
  Object.keys(activeSessions).forEach((tabId) => stopSession(Number(tabId)));
}

function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
  setTimeout(() => { pauseAllSessions(); focusTracker = { hostname: null, startedAt: null }; scheduleMidnightReset(); }, midnight - now);
}

function handleFocusSwitch(hostname) {
  withData((data) => {
    if (!data.focusSession.active || !hostname) return;
    data.focusSession.tabSwitches += 1;
    const category = getMappedCategory(hostname, data.settings);
    const distracting = data.settings.scoreConfig?.distractingCategories || ["Social Media", "Entertainment"];
    if (distracting.includes(category)) {
      data.focusSession.distractingSwitches += 1;
      maybeNotify("focus-distracting", "Focus session alert", `You switched to ${hostname} (${category}).`, data.settings.notificationsEnabled);
    }

    if (data.focusSession.endTime && Date.now() >= data.focusSession.endTime) {
      data.focusSession.active = false;
      maybeNotify("focus-complete", "Focus session complete", "Great work! Focus session finished.", data.settings.notificationsEnabled);
    }

    saveData(data);
  });
}

setInterval(() => {
  if (isIdle) return;
  Object.keys(activeSessions).forEach((tabId) => {
    const session = activeSessions[tabId];
    if (!session) return;
    const now = Date.now();
    const elapsed = now - session.startedAt;
    if (elapsed >= 15000) {
      stopSession(Number(tabId));
      activeSessions[tabId] = { hostname: session.hostname, startedAt: now };
    }
  });
}, 15000);

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === "idle" || state === "locked") {
    isIdle = true;
    pauseAllSessions();
  } else if (state === "active") {
    isIdle = false;
  }
});

chrome.runtime.onInstalled.addListener(() => { withData((data) => saveData(data)); scheduleMidnightReset(); });
chrome.runtime.onStartup.addListener(() => { withData((data) => saveData(data)); scheduleMidnightReset(); });

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  const hostname = getHostname(tab.url);
  stopSession(tabId);
  if (hostname) {
    startSession(tabId, hostname);
    handleFocusSwitch(hostname);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => stopSession(tabId));
chrome.tabs.onActivated.addListener((activeInfo) => {
  withData((data) => { const day = getDateKey(); ensureDay(data, day); data.daily[day].tabSwitches += 1; saveData(data); });
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    const hostname = tab?.url ? getHostname(tab.url) : null;
    if (hostname) {
      updateLongestFocusSession(hostname);
      handleFocusSwitch(hostname);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_APP_DATA") { withData((data) => sendResponse({ ok: true, data })); return true; }
  if (message.type === "SAVE_SETTINGS") {
    withData((data) => {
      data.settings = { ...data.settings, ...message.settings };
      data.settings.categories = Array.from(new Set([...(data.settings.categories || []), ...DEFAULT_CATEGORIES]));
      Object.values(data.daily).forEach((dayData) => {
        Object.entries(dayData.domains || {}).forEach(([hostname, stats]) => {
          const entry = normalizeDomainEntry(stats);
          entry.category = getMappedCategory(hostname, data.settings);
          dayData.domains[hostname] = entry;
        });
      });
      saveData(data, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message.type === "START_FOCUS_SESSION") {
    withData((data) => {
      const mins = Number(message.durationMinutes || 25);
      data.focusSession = { active: true, startedAt: Date.now(), endTime: Date.now() + mins * 60 * 1000, durationMinutes: mins, tabSwitches: 0, distractingSwitches: 0 };
      saveData(data, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message.type === "STOP_FOCUS_SESSION") {
    withData((data) => {
      data.focusSession.active = false;
      saveData(data, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message.type === "REPLACE_APP_DATA") {
    const payload = message.data || buildDefaultData();
    saveData(payload, () => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "CLEAR_ALL_DATA") {
    saveData(buildDefaultData(), () => sendResponse({ ok: true }));
    return true;
  }
});
