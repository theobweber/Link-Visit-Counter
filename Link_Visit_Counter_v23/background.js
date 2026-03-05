importScripts("i18n.js");
const STORAGE_KEY = "appData";

const DEFAULT_CATEGORIES = ["Work", "Learning", "Social Media", "Entertainment", "News", "Other"];
const DOMAIN_CATEGORY_MAP = {
  "github.com": "Work",
  "gitlab.com": "Work",
  "stackoverflow.com": "Work",
  "docs.google.com": "Work",
  "notion.so": "Work",
  "coursera.org": "Learning",
  "udemy.com": "Learning",
  "wikipedia.org": "Learning",
  "khanacademy.org": "Learning",
  "youtube.com": "Entertainment",
  "netflix.com": "Entertainment",
  "twitch.tv": "Entertainment",
  "reddit.com": "Social Media",
  "x.com": "Social Media",
  "twitter.com": "Social Media",
  "instagram.com": "Social Media",
  "facebook.com": "Social Media",
  "news.ycombinator.com": "News",
  "bbc.com": "News",
  "cnn.com": "News"
};

const RAPID_VISIT_MAX_MS = 2 * 60 * 1000;
const RAPID_VISIT_THRESHOLD = 8;
const DISTRACTION_TO_WORK_WINDOW_MS = 3 * 60 * 1000;
const DISTRACTION_INTERVENTION_MS = 30 * 60 * 1000;
const PRODUCTIVE_INTERVENTION_MS = 60 * 60 * 1000;
const INTERVENTION_COOLDOWN_MS = 20 * 60 * 1000;

const DEFAULT_FOCUS_SESSION_PRESETS = [
  { id: "default_25", name: "25 min", minutes: 25, isDefault: true },
  { id: "default_45", name: "45 min", minutes: 45, isDefault: true },
  { id: "default_60", name: "60 min", minutes: 60, isDefault: true }
];

function normalizeFocusSessionPresets(input) {
  const source = Array.isArray(input) ? input : [];
  const byId = new Map();

  source.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const id = String(item.id || "").trim();
    const minutes = Math.round(Number(item.minutes || 0));
    if (!id || minutes < 1 || minutes > 480) return;
    byId.set(id, {
      id,
      name: String(item.name || `${minutes} min`).trim() || `${minutes} min`,
      minutes,
      isDefault: Boolean(item.isDefault)
    });
  });

  DEFAULT_FOCUS_SESSION_PRESETS.forEach((preset) => {
    byId.set(preset.id, { ...preset });
  });

  return Array.from(byId.values()).sort((a, b) => a.minutes - b.minutes);
}
const BUILT_IN_THEME_PRESETS = {
  calmBlue: { name: "Calm Blue", accent: "#4f9cff", productive: "#67b86f", distracting: "#d9787a", neutral: "#80858f", background: "#101113" },
  emeraldFocus: { name: "Emerald Focus", accent: "#20b486", productive: "#3ccf91", distracting: "#ff7a6b", neutral: "#7e8b98", background: "#0e1413" },
  sunsetContrast: { name: "Sunset Contrast", accent: "#ff8c4d", productive: "#e4b83f", distracting: "#f15d77", neutral: "#8c8699", background: "#171217" }
};

let activeSessions = {};
let focusTracker = { hostname: null, startedAt: null };
let isIdle = false;
let lastKnownDate = null;
let pendingRecoveryStart = null;
let continuousCategoryStart = { categoryType: null, startedAt: null };
let lastInterventionAt = { productive: 0, distracting: 0 };

function getLanguageFromData(data) {
  const override = data?.settings?.languageOverride;
  if (override && override !== "auto") return I18n.normalizeLanguage(override);
  return I18n.normalizeLanguage(chrome.i18n.getUILanguage());
}

function tr(data, key, substitutions = []) {
  const lang = getLanguageFromData(data);
  I18n.loadMessages("en");
  I18n.loadMessages(lang);
  return I18n.getMessage(lang, key, substitutions);
}

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getHourKey(ts = Date.now()) {
  return String(new Date(ts).getHours());
}

function buildEmptyHourly() {
  const hourly = {};
  for (let h = 0; h < 24; h += 1) {
    hourly[String(h)] = { switches: 0, productiveTime: 0, distractingTime: 0, neutralTime: 0, focusScore: 0, balanceScore: 0 };
  }
  return hourly;
}

function buildDefaultData() {
  return {
    daily: {},
    settings: {
      categories: [...DEFAULT_CATEGORIES],
      domainCategories: {},
      goals: { domains: {}, categories: {} },
      notificationsEnabled: true,
      microInterventionsEnabled: true,
      focusScoreProductiveThreshold: 70,
      tickerMode: "domains",
      themeMode: "dark",
      activePreset: "calmBlue",
      builtInPresets: BUILT_IN_THEME_PRESETS,
      userPresets: {},
      customDraft: {
        accent: BUILT_IN_THEME_PRESETS.calmBlue.accent,
        productive: BUILT_IN_THEME_PRESETS.calmBlue.productive,
        distracting: BUILT_IN_THEME_PRESETS.calmBlue.distracting,
        neutral: BUILT_IN_THEME_PRESETS.calmBlue.neutral,
        background: BUILT_IN_THEME_PRESETS.calmBlue.background
      },
      scoreConfig: {
        productiveCategories: ["Work", "Learning"],
        distractingCategories: ["Social Media", "Entertainment"]
      }
    },
    focusSession: {
      active: false,
      startedAt: null,
      endTime: null,
      durationMinutes: 25,
      selectedPresetId: "default_25",
      tabSwitches: 0,
      distractingSwitches: 0,
      pendingRating: null
    },
    focusSessionPresets: normalizeFocusSessionPresets(DEFAULT_FOCUS_SESSION_PRESETS),
    streaks: {
      current: 0,
      longest: 0,
      totalProductiveDays: 0,
      lastUpdatedDate: ""
    },
    analyticsCache: {
      weeklySummary: {},
      lifetimeSummary: {},
      energyDrift: "",
      lastAnalysisDate: "",
      lastWeeklyAnalysisDate: "",
      mutationCounter: 0,
      lastLifetimeMutationCounter: -1,
      lastLifetimeComputationDate: ""
    }
  };
}

function normalizeDomainEntry(entry = {}) {
  if (typeof entry === "number") return { time: 0, visits: entry, category: "Other", shortVisitCount: 0 };
  return {
    time: entry.time || entry.timeMs || 0,
    visits: entry.visits || 0,
    category: entry.category || "Other",
    shortVisitCount: entry.shortVisitCount || 0
  };
}

function ensureDay(data, dayKey) {
  if (!data.daily[dayKey]) {
    data.daily[dayKey] = {
      domains: {},
      tabSwitches: 0,
      longestFocusSessionMs: 0,
      warningsSent: { domains: {}, categories: {} },
      transitions: [],
      hourly: buildEmptyHourly(),
      recoveryTimes: [],
      shortVisits: {},
      sessionRatings: [],
      insights: {},
      dailyScores: {}
    };
  }

  const day = data.daily[dayKey];
  if (!day.domains) day.domains = {};
  if (!day.tabSwitches) day.tabSwitches = 0;
  if (!day.longestFocusSessionMs) day.longestFocusSessionMs = 0;
  if (!day.warningsSent) day.warningsSent = { domains: {}, categories: {} };
  if (!day.transitions) day.transitions = [];
  if (!day.hourly) day.hourly = buildEmptyHourly();
  if (!day.recoveryTimes) day.recoveryTimes = [];
  if (!day.shortVisits) day.shortVisits = {};
  if (!day.sessionRatings) day.sessionRatings = [];
  if (!day.insights) day.insights = {};
  if (!day.dailyScores) day.dailyScores = {};
}

function getMappedCategory(hostname, settings) {
  return settings.domainCategories?.[hostname] || DOMAIN_CATEGORY_MAP[hostname] || "Other";
}

function getCategoryType(category, settings) {
  const productive = settings.scoreConfig?.productiveCategories || ["Work", "Learning"];
  const distracting = settings.scoreConfig?.distractingCategories || ["Social Media", "Entertainment"];
  if (productive.includes(category)) return "productive";
  if (distracting.includes(category)) return "distracting";
  return "neutral";
}

function maybeNotify(id, title, message, enabled) {
  if (!enabled) return;
  chrome.notifications.create(id, { type: "basic", iconUrl: "icon48.png", title, message });
}

function migrateLegacy(result) {
  if (result[STORAGE_KEY]) {
    const data = result[STORAGE_KEY];
    const defaults = buildDefaultData();
    data.settings = { ...defaults.settings, ...(data.settings || {}) };
    data.settings.categories = Array.from(new Set([...(data.settings.categories || []), ...DEFAULT_CATEGORIES]));
    data.settings.domainCategories = data.settings.domainCategories || {};
    data.settings.goals = data.settings.goals || { domains: {}, categories: {} };
    data.settings.themeMode = data.settings.themeMode === "light" ? "light" : "dark";
    data.settings.activePreset = data.settings.activePreset || "calmBlue";
    data.settings.builtInPresets = BUILT_IN_THEME_PRESETS;
    data.settings.userPresets = data.settings.userPresets || {};
    data.settings.customDraft = { ...defaults.settings.customDraft, ...(data.settings.customDraft || {}) };
    data.settings.tickerMode = data.settings.tickerMode === "categories" ? "categories" : "domains";
    data.focusSession = { ...defaults.focusSession, ...(data.focusSession || {}) };
    data.focusSessionPresets = normalizeFocusSessionPresets(data.focusSessionPresets || defaults.focusSessionPresets);
    if (!data.focusSessionPresets.find((preset) => preset.id === data.focusSession.selectedPresetId)) {
      data.focusSession.selectedPresetId = data.focusSessionPresets[0]?.id || "default_25";
    }
    data.streaks = { ...defaults.streaks, ...(data.streaks || {}) };
    data.analyticsCache = { ...defaults.analyticsCache, ...(data.analyticsCache || {}) };
    data.daily = data.daily || {};
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

function withData(callback) {
  chrome.storage.local.get([STORAGE_KEY, "dailyCounts", "totalCounts"], (result) => callback(migrateLegacy(result)));
}

function saveData(data, callback, options = {}) {
  if (options.markChanged !== false) {
    data.analyticsCache = data.analyticsCache || {};
    data.analyticsCache.mutationCounter = Number(data.analyticsCache.mutationCounter || 0) + 1;
  }
  chrome.storage.local.set({ [STORAGE_KEY]: data }, callback);
}

function getHostname(urlString) {
  try {
    const url = new URL(urlString);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.hostname;
  } catch {
    return null;
  }
}

function updateDailyScores(day, settings) {
  if (!day || typeof day !== "object") return;

  day.domains = day.domains || {};
  day.recoveryTimes = Array.isArray(day.recoveryTimes) ? day.recoveryTimes : [];
  day.hourly = day.hourly || buildEmptyHourly();
  day.tabSwitches = Number(day.tabSwitches || 0);

  let totalTime = 0;
  let productiveTime = 0;
  let distractingTime = 0;
  let goalsMet = true;

  Object.entries(day.domains).forEach(([hostname, stats]) => {
    const category = stats.category || "Other";
    const type = getCategoryType(category, settings);
    const t = stats.time || 0;
    totalTime += t;
    if (type === "productive") productiveTime += t;
    if (type === "distracting") distractingTime += t;

    const dg = Number(settings.goals?.domains?.[hostname] || 0) * 60 * 1000;
    if (dg > 0 && t > dg) goalsMet = false;
  });

  const categoryTotals = {};
  Object.values(day.domains).forEach((stats) => {
    const cat = stats.category || "Other";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (stats.time || 0);
  });

  Object.entries(settings.goals?.categories || {}).forEach(([cat, mins]) => {
    const goalMs = Number(mins || 0) * 60 * 1000;
    if (goalMs > 0 && (categoryTotals[cat] || 0) > goalMs) goalsMet = false;
  });

  const focusScore = totalTime > 0 ? Math.max(0, Math.min(100, Math.round((productiveTime / totalTime) * 100))) : 0;
  const avgRecovery = day.recoveryTimes.length
    ? Math.round(day.recoveryTimes.reduce((a, b) => a + b, 0) / day.recoveryTimes.length)
    : 0;

  const goalCompletion = goalsMet ? 100 : 50;
  const recoveryScore = avgRecovery ? Math.max(0, Math.min(100, 100 - Math.round(avgRecovery / 60000) * 5)) : 70;
  const stabilityBase = Math.max(0, 100 - Math.min(100, day.tabSwitches * 2));
  const sessionStability = Math.round((stabilityBase + focusScore) / 2);
  const balanceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(focusScore * 0.4 + goalCompletion * 0.2 + recoveryScore * 0.2 + sessionStability * 0.2)
    )
  );

  day.dailyScores = {
    focusScore,
    averageRecoveryMs: avgRecovery,
    browserBalance: balanceScore,
    distractingTime,
    goalsMet
  };
}

function updateHourlyScoreBucket(day, hour, settings) {
  const bucket = day.hourly[hour];
  const total = bucket.productiveTime + bucket.distractingTime + bucket.neutralTime;
  const focus = total > 0 ? Math.round((bucket.productiveTime / total) * 100) : 0;
  const stability = Math.max(0, 100 - Math.min(80, bucket.switches * 8));
  bucket.focusScore = focus;
  bucket.balanceScore = Math.max(0, Math.min(100, Math.round(focus * 0.7 + stability * 0.3)));
}

function analyzeTransitionsForDay(day) {
  if (!day || typeof day !== "object") return;
  day.transitions = Array.isArray(day.transitions) ? day.transitions : [];

  const insights = [];
  const toDistracting = day.transitions.filter(
    (t) => t.fromType === "productive" && t.toType === "distracting" && t.deltaMs <= DISTRACTION_TO_WORK_WINDOW_MS
  );

  if (toDistracting.length >= 3) {
    const afternoonHits = toDistracting.filter((t) => {
      const h = new Date(t.timestamp).getHours();
      return h >= 12 && h <= 18;
    }).length;
    if (afternoonHits >= Math.max(2, Math.floor(toDistracting.length / 2))) {
      insights.push(tr({ settings: buildDefaultData().settings }, "insightAfternoonSwitch"));
    } else {
      insights.push(tr({ settings: buildDefaultData().settings }, "insightQuickSwitch"));
    }
  }

  const longFocusToDistracting = day.transitions.filter(
    (t) => t.fromType === "productive" && t.toType === "distracting" && t.fromDurationMs >= 40 * 60 * 1000
  );
  if (longFocusToDistracting.length >= 2) {
    insights.push(tr({ settings: buildDefaultData().settings }, "insightPostFocusDistraction"));
  }

  day.insights.transitionInsights = insights;
}

function applyMicroIntervention(categoryType, settings) {
  if (!settings.microInterventionsEnabled) return;
  const now = Date.now();

  if (categoryType === "distracting" && continuousCategoryStart.categoryType === "distracting") {
    const elapsed = now - continuousCategoryStart.startedAt;
    if (elapsed >= DISTRACTION_INTERVENTION_MS && now - lastInterventionAt.distracting >= INTERVENTION_COOLDOWN_MS) {
      lastInterventionAt.distracting = now;
      maybeNotify("micro-distracting", tr({ settings }, "notifMicroDistractingTitle"), tr({ settings }, "notifMicroDistractingBody"), settings.notificationsEnabled);
    }
  }

  if (categoryType === "productive" && continuousCategoryStart.categoryType === "productive") {
    const elapsed = now - continuousCategoryStart.startedAt;
    if (elapsed >= PRODUCTIVE_INTERVENTION_MS && now - lastInterventionAt.productive >= INTERVENTION_COOLDOWN_MS) {
      lastInterventionAt.productive = now;
      maybeNotify("micro-productive", tr({ settings }, "notifMicroProductiveTitle"), tr({ settings }, "notifMicroProductiveBody"), settings.notificationsEnabled);
    }
  }
}

function checkGoals(data, dayKey, hostname, category) {
  const day = data.daily[dayKey];
  const domainTime = day.domains[hostname]?.time || 0;
  const domainGoal = Number(data.settings.goals?.domains?.[hostname] || 0) * 60 * 1000;

  if (domainGoal > 0 && domainTime >= domainGoal && !day.warningsSent.domains[hostname]) {
    day.warningsSent.domains[hostname] = true;
    maybeNotify(`goal-domain-${hostname}`, tr(data, "notifDomainGoalReachedTitle"), tr(data, "notifDomainGoalReachedBody", [hostname]), data.settings.notificationsEnabled);
  }

  const categoryTime = Object.values(day.domains)
    .filter((d) => d.category === category)
    .reduce((sum, d) => sum + (d.time || 0), 0);
  const categoryGoal = Number(data.settings.goals?.categories?.[category] || 0) * 60 * 1000;

  if (categoryGoal > 0 && categoryTime >= categoryGoal && !day.warningsSent.categories[category]) {
    day.warningsSent.categories[category] = true;
    maybeNotify(`goal-category-${category}`, tr(data, "notifCategoryGoalReachedTitle"), tr(data, "notifCategoryGoalReachedBody", [category]), data.settings.notificationsEnabled);
  }
}

function updateStreakForDay(data, dayKey) {
  if (!dayKey || data.streaks.lastUpdatedDate === dayKey) return;
  const day = data.daily[dayKey];
  if (!day) return;

  updateDailyScores(day, data.settings);
  analyzeTransitionsForDay(day);

  const productive =
    day.dailyScores.focusScore >= Number(data.settings.focusScoreProductiveThreshold || 70) || day.dailyScores.goalsMet;

  if (productive) {
    data.streaks.current += 1;
    data.streaks.totalProductiveDays += 1;
    data.streaks.longest = Math.max(data.streaks.longest, data.streaks.current);
  } else {
    data.streaks.current = 0;
  }
  data.streaks.lastUpdatedDate = dayKey;
}

function runWeeklyAnalysis(data) {
  const now = new Date();
  const current = [];
  const prev = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    current.push(getDateKey(d));
  }
  for (let i = 7; i < 14; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    prev.push(getDateKey(d));
  }

  const weekly = {
    mostVisitedDomain: "",
    mostVisitedCount: 0,
    mostProductiveDay: "",
    mostProductiveScore: 0,
    mostDistractedHour: "",
    focusScoreTrend: "0%",
    timeReclaimedMs: 0,
    distractingIncreaseMs: 0,
    avgRecoveryMs: 0
  };

  const domainVisits = {};
  const hourlyDistracting = {};
  let currentFocusTotal = 0;
  let currentFocusDays = 0;
  let prevFocusTotal = 0;
  let prevFocusDays = 0;
  let currentDistracting = 0;
  let prevDistracting = 0;
  const recoverySamples = [];

  current.forEach((key) => {
    const day = data.daily[key];
    if (!day) return;
    updateDailyScores(day, data.settings);

    Object.entries(day.domains).forEach(([host, stats]) => {
      domainVisits[host] = (domainVisits[host] || 0) + (stats.visits || 0);
      if (getCategoryType(stats.category || "Other", data.settings) === "distracting") {
        currentDistracting += stats.time || 0;
      }
    });

    Object.entries(day.hourly || {}).forEach(([h, bucket]) => {
      hourlyDistracting[h] = (hourlyDistracting[h] || 0) + (bucket.distractingTime || 0);
    });

    currentFocusTotal += day.dailyScores.focusScore || 0;
    currentFocusDays += 1;
    recoverySamples.push(...(day.recoveryTimes || []));

    if ((day.dailyScores.focusScore || 0) > weekly.mostProductiveScore) {
      weekly.mostProductiveScore = day.dailyScores.focusScore || 0;
      weekly.mostProductiveDay = key;
    }
  });

  prev.forEach((key) => {
    const day = data.daily[key];
    if (!day) return;
    updateDailyScores(day, data.settings);
    prevFocusTotal += day.dailyScores.focusScore || 0;
    prevFocusDays += 1;

    Object.values(day.domains).forEach((stats) => {
      if (getCategoryType(stats.category || "Other", data.settings) === "distracting") {
        prevDistracting += stats.time || 0;
      }
    });
  });

  Object.entries(domainVisits).forEach(([host, count]) => {
    if (count > weekly.mostVisitedCount) {
      weekly.mostVisitedCount = count;
      weekly.mostVisitedDomain = host;
    }
  });

  Object.entries(hourlyDistracting).forEach(([h, value]) => {
    if (!weekly.mostDistractedHour || value > hourlyDistracting[weekly.mostDistractedHour]) {
      weekly.mostDistractedHour = h;
    }
  });

  const currentAvgFocus = currentFocusDays ? currentFocusTotal / currentFocusDays : 0;
  const prevAvgFocus = prevFocusDays ? prevFocusTotal / prevFocusDays : 0;
  weekly.focusScoreTrend = prevAvgFocus ? `${Math.round(((currentAvgFocus - prevAvgFocus) / prevAvgFocus) * 100)}%` : "0%";

  if (currentDistracting < prevDistracting) {
    weekly.timeReclaimedMs = prevDistracting - currentDistracting;
  } else {
    weekly.distractingIncreaseMs = currentDistracting - prevDistracting;
  }

  weekly.avgRecoveryMs = recoverySamples.length
    ? Math.round(recoverySamples.reduce((a, b) => a + b, 0) / recoverySamples.length)
    : 0;

  data.analyticsCache.weeklySummary = weekly;
  data.analyticsCache.lastWeeklyAnalysisDate = getDateKey();

  // Energy drift once/week: identify hour with persistent low focus
  const hourlyFocusSamples = {};
  Object.values(data.daily).forEach((day) => {
    Object.entries(day.hourly || {}).forEach(([h, bucket]) => {
      if (!hourlyFocusSamples[h]) hourlyFocusSamples[h] = [];
      if ((bucket.productiveTime || 0) + (bucket.distractingTime || 0) + (bucket.neutralTime || 0) > 0) {
        hourlyFocusSamples[h].push(bucket.focusScore || 0);
      }
    });
  });

  let driftHour = null;
  let driftScore = 101;
  Object.entries(hourlyFocusSamples).forEach(([h, arr]) => {
    if (arr.length < 3) return;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (avg < driftScore) {
      driftScore = avg;
      driftHour = Number(h);
    }
  });

  if (driftHour !== null) {
    const ampm = driftHour >= 12 ? "PM" : "AM";
    const h12 = driftHour % 12 || 12;
    data.analyticsCache.energyDrift = tr(data, "insightEnergyDrift", [String(h12), ampm]);
  }
}


function splitTimelineKeys(keys) {
  if (!keys.length) return [[], []];
  const half = Math.max(1, Math.floor(keys.length / 2));
  return [keys.slice(0, half), keys.slice(half)];
}

function collectTotalsForKeys(data, keys) {
  const domainTotals = {};
  const categoryTotals = {};
  keys.forEach((key) => {
    const day = data.daily[key];
    if (!day) return;
    Object.entries(day.domains || {}).forEach(([domain, stats]) => {
      const time = Number(stats.time || 0);
      const visits = Number(stats.visits || 0);
      if (!domainTotals[domain]) domainTotals[domain] = { time: 0, visits: 0 };
      domainTotals[domain].time += time;
      domainTotals[domain].visits += visits;

      const category = stats.category || "Other";
      if (!categoryTotals[category]) categoryTotals[category] = { time: 0, visits: 0 };
      categoryTotals[category].time += time;
      categoryTotals[category].visits += visits;
    });
  });
  return { domainTotals, categoryTotals };
}

function summarizeChanges(firstTotals, secondTotals, limit = 8) {
  const keys = new Set([...Object.keys(firstTotals || {}), ...Object.keys(secondTotals || {})]);
  const rows = [];
  keys.forEach((key) => {
    const before = Number(firstTotals?.[key]?.time || 0);
    const after = Number(secondTotals?.[key]?.time || 0);
    const delta = after - before;
    if (!before && !after) return;
    const growthPct = before ? Math.round(((after - before) / before) * 100) : (after > 0 ? 100 : 0);
    rows.push({ key, before, after, delta, growthPct });
  });
  rows.sort((a, b) => b.delta - a.delta);
  return {
    increasing: rows.filter((r) => r.delta > 0).slice(0, limit),
    decreasing: rows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit)
  };
}

function runLifetimeAnalysis(data) {
  const keys = Object.keys(data.daily || {}).sort();
  const summary = {
    allTimeAverageFocusScore: 0,
    totalProductiveTime: 0,
    totalDistractingTime: 0,
    totalNeutralTime: 0,
    totalContextSwitches: 0,
    longestFocusSessionEverMs: 0,
    totalFocusDays: 0,
    longestStreakEver: data.streaks?.longest || 0,
    mostProductiveDay: "",
    mostDistractedHour: "",
    mostConsistentProductiveCategory: "",
    largestLongTermBehavioralImprovement: "",
    overallTrendDirection: "stable",
    domainChanges: { increasing: [], decreasing: [] },
    categoryChanges: { increasing: [], decreasing: [] },
    topDomainsAllTime: [],
    categoryDistributionAllTime: {}
  };

  if (!keys.length) {
    data.analyticsCache.lifetimeSummary = summary;
    data.analyticsCache.lastLifetimeComputationDate = getDateKey();
    data.analyticsCache.lastLifetimeMutationCounter = Number(data.analyticsCache.mutationCounter || 0);
    return;
  }

  const productiveCategories = data.settings?.scoreConfig?.productiveCategories || ["Work", "Learning"];
  const categoryProductiveDays = {};
  const hourlyDistracting = {};
  const hourlySamples = {};
  const domainTotals = {};
  const categoryTotals = {};
  let focusTotal = 0;
  let focusDays = 0;
  let bestFocus = -1;

  keys.forEach((key) => {
    const day = data.daily[key];
    if (!day) return;
    updateDailyScores(day, data.settings);

    const score = Number(day.dailyScores?.focusScore || 0);
    focusTotal += score;
    focusDays += 1;
    summary.totalFocusDays += 1;
    summary.totalContextSwitches += Number(day.tabSwitches || 0);
    summary.longestFocusSessionEverMs = Math.max(summary.longestFocusSessionEverMs, Number(day.longestFocusSessionMs || 0));

    if (score > bestFocus) {
      bestFocus = score;
      summary.mostProductiveDay = key;
    }

    let bestCategoryForDay = null;
    let bestCategoryTime = 0;

    Object.entries(day.domains || {}).forEach(([domain, stats]) => {
      const time = Number(stats.time || 0);
      const visits = Number(stats.visits || 0);
      const category = stats.category || "Other";
      const type = getCategoryType(category, data.settings);

      if (!domainTotals[domain]) domainTotals[domain] = { time: 0, visits: 0 };
      domainTotals[domain].time += time;
      domainTotals[domain].visits += visits;

      if (!categoryTotals[category]) categoryTotals[category] = { time: 0, visits: 0 };
      categoryTotals[category].time += time;
      categoryTotals[category].visits += visits;

      if (type === "productive") summary.totalProductiveTime += time;
      else if (type === "distracting") summary.totalDistractingTime += time;
      else summary.totalNeutralTime += time;

      if (productiveCategories.includes(category) && time > bestCategoryTime) {
        bestCategoryTime = time;
        bestCategoryForDay = category;
      }
    });

    if (bestCategoryForDay) {
      categoryProductiveDays[bestCategoryForDay] = (categoryProductiveDays[bestCategoryForDay] || 0) + 1;
    }

    Object.entries(day.hourly || {}).forEach(([h, bucket]) => {
      const distracting = Number(bucket.distractingTime || 0);
      const total = Number(bucket.productiveTime || 0) + Number(bucket.distractingTime || 0) + Number(bucket.neutralTime || 0);
      if (!hourlyDistracting[h]) hourlyDistracting[h] = 0;
      if (!hourlySamples[h]) hourlySamples[h] = 0;
      hourlyDistracting[h] += distracting;
      if (total > 0) hourlySamples[h] += 1;
    });
  });

  summary.allTimeAverageFocusScore = focusDays ? Math.round(focusTotal / focusDays) : 0;

  Object.entries(hourlyDistracting).forEach(([h, total]) => {
    const samples = hourlySamples[h] || 1;
    hourlyDistracting[h] = total / samples;
  });
  summary.mostDistractedHour = Object.keys(hourlyDistracting).sort((a, b) => (hourlyDistracting[b] || 0) - (hourlyDistracting[a] || 0))[0] || "";

  summary.mostConsistentProductiveCategory = Object.keys(categoryProductiveDays).sort((a, b) => (categoryProductiveDays[b] || 0) - (categoryProductiveDays[a] || 0))[0] || "";

  const sortedDomains = Object.entries(domainTotals).sort((a, b) => b[1].time - a[1].time);
  summary.topDomainsAllTime = sortedDomains.slice(0, 100).map(([domain, stats]) => ({ domain, time: stats.time, visits: stats.visits }));
  summary.categoryDistributionAllTime = categoryTotals;

  const [firstHalf, secondHalf] = splitTimelineKeys(keys);
  const first = collectTotalsForKeys(data, firstHalf);
  const second = collectTotalsForKeys(data, secondHalf);
  summary.domainChanges = summarizeChanges(first.domainTotals, second.domainTotals, 8);
  summary.categoryChanges = summarizeChanges(first.categoryTotals, second.categoryTotals, 8);

  const firstFocus = firstHalf.reduce((acc, k) => acc + Number(data.daily[k]?.dailyScores?.focusScore || 0), 0) / (firstHalf.length || 1);
  const secondFocus = secondHalf.reduce((acc, k) => acc + Number(data.daily[k]?.dailyScores?.focusScore || 0), 0) / (secondHalf.length || 1);
  const deltaPct = firstFocus ? Math.round(((secondFocus - firstFocus) / firstFocus) * 100) : 0;
  if (deltaPct > 5) summary.overallTrendDirection = "improving";
  else if (deltaPct < -5) summary.overallTrendDirection = "declining";
  else summary.overallTrendDirection = "stable";
  summary.largestLongTermBehavioralImprovement = deltaPct > 0
    ? `Focus score improved by ${deltaPct}% from early to recent usage.`
    : (deltaPct < 0 ? `Focus score declined by ${Math.abs(deltaPct)}% from early to recent usage.` : "Focus score has remained stable over time.");

  data.analyticsCache.lifetimeSummary = summary;
  data.analyticsCache.lastLifetimeComputationDate = getDateKey();
  data.analyticsCache.lastLifetimeMutationCounter = Number(data.analyticsCache.mutationCounter || 0);
}
function ensureDateRollover(data) {
  const today = getDateKey();
  if (!lastKnownDate) {
    lastKnownDate = today;
    ensureDay(data, today);
    return;
  }

  if (lastKnownDate !== today) {
    updateStreakForDay(data, lastKnownDate);
    runWeeklyAnalysis(data);
    lastKnownDate = today;
    ensureDay(data, today);
    pendingRecoveryStart = null;
    continuousCategoryStart = { categoryType: null, startedAt: null };
  }
}

function updateLongestFocusSession(hostname) {
  const now = Date.now();
  withData((data) => {
    ensureDateRollover(data);
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

function applyTransition(data, dayKey, fromCategory, toCategory) {
  const fromType = getCategoryType(fromCategory, data.settings);
  const toType = getCategoryType(toCategory, data.settings);
  const now = Date.now();
  const transition = {
    timestamp: now,
    fromCategory,
    toCategory,
    fromType,
    toType,
    deltaMs: focusTracker.startedAt ? Math.max(0, now - focusTracker.startedAt) : 0,
    fromDurationMs: focusTracker.startedAt ? Math.max(0, now - focusTracker.startedAt) : 0
  };
  data.daily[dayKey].transitions.push(transition);

  if (fromType === "productive" && toType === "distracting") {
    pendingRecoveryStart = now;
  }

  if (fromType === "distracting" && toType === "productive" && pendingRecoveryStart) {
    data.daily[dayKey].recoveryTimes.push(now - pendingRecoveryStart);
    pendingRecoveryStart = null;
  }

  continuousCategoryStart = {
    categoryType: toType,
    startedAt: now
  };

  applyMicroIntervention(toType, data.settings);
}

function startSession(tabId, hostname) {
  if (isIdle) return;

  withData((data) => {
    ensureDateRollover(data);
    const dayKey = getDateKey();
    ensureDay(data, dayKey);

    const category = getMappedCategory(hostname, data.settings);
    const currentEntry = normalizeDomainEntry(data.daily[dayKey].domains[hostname]);
    currentEntry.visits += 1;
    currentEntry.category = category;
    data.daily[dayKey].domains[hostname] = currentEntry;

    activeSessions[tabId] = { hostname, startedAt: Date.now(), category };

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
    ensureDateRollover(data);
    const dayKey = getDateKey();
    ensureDay(data, dayKey);

    const category = getMappedCategory(session.hostname, data.settings);
    const entry = normalizeDomainEntry(data.daily[dayKey].domains[session.hostname]);
    entry.time += elapsed;
    entry.category = category;

    if (elapsed <= RAPID_VISIT_MAX_MS) {
      entry.shortVisitCount = (entry.shortVisitCount || 0) + 1;
      data.daily[dayKey].shortVisits[session.hostname] = (data.daily[dayKey].shortVisits[session.hostname] || 0) + 1;
    }

    data.daily[dayKey].domains[session.hostname] = entry;

    const hour = getHourKey(session.startedAt);
    const bucket = data.daily[dayKey].hourly[hour] || { switches: 0, productiveTime: 0, distractingTime: 0, neutralTime: 0, focusScore: 0, balanceScore: 0 };
    const type = getCategoryType(category, data.settings);
    if (type === "productive") bucket.productiveTime += elapsed;
    else if (type === "distracting") bucket.distractingTime += elapsed;
    else bucket.neutralTime += elapsed;
    data.daily[dayKey].hourly[hour] = bucket;
    updateHourlyScoreBucket(data.daily[dayKey], hour, data.settings);

    checkGoals(data, dayKey, session.hostname, category);
    updateDailyScores(data.daily[dayKey], data.settings);

    saveData(data);
  });
}

function pauseAllSessions() {
  Object.keys(activeSessions).forEach((tabId) => stopSession(Number(tabId)));
}

function scheduleMidnightBoundaryCheck() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  setTimeout(() => {
    withData((data) => {
      pauseAllSessions();
      ensureDateRollover(data);
      saveData(data);
    });
    scheduleMidnightBoundaryCheck();
  }, midnight - now);
}

function handleFocusSwitch(hostname) {
  withData((data) => {
    ensureDateRollover(data);
    const dayKey = getDateKey();
    ensureDay(data, dayKey);

    const toCategory = getMappedCategory(hostname, data.settings);
    const fromCategory = focusTracker.hostname ? getMappedCategory(focusTracker.hostname, data.settings) : toCategory;

    data.daily[dayKey].tabSwitches += 1;
    const hour = getHourKey();
    data.daily[dayKey].hourly[hour].switches += 1;

    applyTransition(data, dayKey, fromCategory, toCategory);

    if (data.focusSession.active) {
      data.focusSession.tabSwitches += 1;
      const type = getCategoryType(toCategory, data.settings);
      if (type === "distracting") {
        data.focusSession.distractingSwitches += 1;
        maybeNotify(
          "focus-distracting",
          tr(data, "notifFocusAlertTitle"),
          tr(data, "notifFocusAlertBody", [hostname, toCategory]),
          data.settings.notificationsEnabled
        );
      }

      if (data.focusSession.endTime && Date.now() >= data.focusSession.endTime) {
        data.focusSession.active = false;
        data.focusSession.pendingRating = {
          endedAt: Date.now(),
          durationMinutes: data.focusSession.durationMinutes,
          category: toCategory
        };
        maybeNotify("focus-complete", tr(data, "notifFocusCompleteTitle"), tr(data, "notifFocusCompleteBody"), data.settings.notificationsEnabled);
      }
    }

    saveData(data);
  });
}

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === "idle" || state === "locked") {
    isIdle = true;
    pauseAllSessions();
  } else if (state === "active") {
    isIdle = false;
  }
});

setInterval(() => {
  if (isIdle) return;
  Object.keys(activeSessions).forEach((tabId) => {
    const session = activeSessions[tabId];
    if (!session) return;
    const now = Date.now();
    const elapsed = now - session.startedAt;
    if (elapsed >= 15000) {
      stopSession(Number(tabId));
      activeSessions[tabId] = {
        hostname: session.hostname,
        startedAt: now,
        category: session.category
      };
    }
  });
}, 15000);

chrome.runtime.onInstalled.addListener(() => {
  withData((data) => {
    ensureDateRollover(data);
    saveData(data);
  });
  scheduleMidnightBoundaryCheck();
});

chrome.runtime.onStartup.addListener(() => {
  withData((data) => {
    ensureDateRollover(data);
    saveData(data);
  });
  scheduleMidnightBoundaryCheck();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  const hostname = getHostname(tab.url);
  stopSession(tabId);
  if (hostname) {
    startSession(tabId, hostname);
    handleFocusSwitch(hostname);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stopSession(tabId);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    const hostname = tab?.url ? getHostname(tab.url) : null;
    if (hostname) {
      updateLongestFocusSession(hostname);
      handleFocusSwitch(hostname);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_APP_DATA") {
    withData((data) => {
      ensureDateRollover(data);
      const today = getDateKey();
      ensureDay(data, today);

      // daily lightweight analysis on extension open
      if (data.analyticsCache.lastAnalysisDate !== today) {
        updateDailyScores(data.daily[today], data.settings);
        analyzeTransitionsForDay(data.daily[today]);
        data.analyticsCache.lastAnalysisDate = today;
      }

      if (new Date().getDay() === 0 || !data.analyticsCache.lastWeeklyAnalysisDate || message.forceWeekly) {
        runWeeklyAnalysis(data);
      }

      if (!data.analyticsCache.lifetimeSummary || Object.keys(data.analyticsCache.lifetimeSummary).length === 0
        || Number(data.analyticsCache.lastLifetimeMutationCounter || -1) !== Number(data.analyticsCache.mutationCounter || 0)) {
        runLifetimeAnalysis(data);
      }

      saveData(data, () => sendResponse({ ok: true, data }), { markChanged: false });
    });
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    withData((data) => {
      data.settings = { ...data.settings, ...message.settings };
      data.settings.categories = Array.from(new Set([...(data.settings.categories || []), ...DEFAULT_CATEGORIES]));
      data.settings.tickerMode = data.settings.tickerMode === "categories" ? "categories" : "domains";

      Object.values(data.daily).forEach((day) => {
        Object.entries(day.domains || {}).forEach(([hostname, stats]) => {
          const entry = normalizeDomainEntry(stats);
          entry.category = getMappedCategory(hostname, data.settings);
          day.domains[hostname] = entry;
        });
      });

      saveData(data, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message.type === "START_FOCUS_SESSION") {
    withData((data) => {
      const mins = Math.max(1, Math.min(480, Math.round(Number(message.durationMinutes || 25))));
      data.focusSession = {
        active: true,
        startedAt: Date.now(),
        endTime: Date.now() + mins * 60 * 1000,
        durationMinutes: mins,
        selectedPresetId: message.presetId || data.focusSession.selectedPresetId || "default_25",
        tabSwitches: 0,
        distractingSwitches: 0,
        pendingRating: null
      };
      saveData(data, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message.type === "STOP_FOCUS_SESSION") {
    withData((data) => {
      if (data.focusSession.active) {
        data.focusSession.pendingRating = {
          endedAt: Date.now(),
          durationMinutes: data.focusSession.durationMinutes,
          category: "Unknown"
        };
      }
      data.focusSession.active = false;
      saveData(data, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message.type === "SUBMIT_SESSION_RATING") {
    withData((data) => {
      ensureDateRollover(data);
      const dayKey = getDateKey();
      ensureDay(data, dayKey);
      const pending = data.focusSession.pendingRating;
      if (pending) {
        data.daily[dayKey].sessionRatings.push({
          rating: Number(message.rating || 0),
          timeOfDayHour: new Date(pending.endedAt).getHours(),
          durationMinutes: pending.durationMinutes,
          category: pending.category
        });
      }
      data.focusSession.pendingRating = null;
      saveData(data, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message.type === "SAVE_FOCUS_SESSION_PRESETS") {
    withData((data) => {
      data.focusSessionPresets = normalizeFocusSessionPresets(message.presets);
      if (!data.focusSessionPresets.find((preset) => preset.id === data.focusSession.selectedPresetId)) {
        data.focusSession.selectedPresetId = data.focusSessionPresets[0]?.id || "default_25";
      }
      saveData(data, () => sendResponse({ ok: true, presets: data.focusSessionPresets, selectedPresetId: data.focusSession.selectedPresetId }));
    });
    return true;
  }

  if (message.type === "SET_FOCUS_SESSION_PRESET") {
    withData((data) => {
      const requested = String(message.presetId || "");
      const fallback = data.focusSessionPresets?.[0]?.id || "default_25";
      data.focusSession.selectedPresetId = data.focusSessionPresets?.find((preset) => preset.id === requested) ? requested : fallback;
      saveData(data, () => sendResponse({ ok: true, selectedPresetId: data.focusSession.selectedPresetId }));
    });
    return true;
  }

  if (message.type === "REPLACE_APP_DATA") {
    const payload = migrateLegacy({ [STORAGE_KEY]: message.data || buildDefaultData() });
    saveData(payload, () => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "CLEAR_ALL_DATA") {
    saveData(buildDefaultData(), () => sendResponse({ ok: true }));
    return true;
  }
});
