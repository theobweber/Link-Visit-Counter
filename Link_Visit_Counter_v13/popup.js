const DEFAULT_CATEGORIES = ["Work", "Learning", "Social Media", "Entertainment", "News", "Other"];
const LANGUAGE_OPTIONS = [
  ["auto", "languageAuto"],
  ["en", "English"],
  ["es", "Español"],
  ["pt", "Português"]
];

const t = (key, subs = []) => (globalThis.I18n ? I18n.t(key, subs) : key);

document.addEventListener("DOMContentLoaded", async () => {
  const dailyTab = document.getElementById("dailyTab");
  const weeklyTab = document.getElementById("weeklyTab");
  const totalTab = document.getElementById("totalTab");
  const settingsTab = document.getElementById("settingsTab");
  const commandCenter = document.getElementById("commandCenter");
  const content = document.getElementById("content");
  const tabs = [dailyTab, weeklyTab, totalTab, settingsTab];

  await I18n.init();
  I18n.apply(document);

  let appData = await fetchData();

  async function loadAndRender(tabName) {
    appData = await fetchData(tabName === "weekly");
    await I18n.init();
    I18n.apply(document);
    renderCommandCenter(appData, commandCenter);

    if (tabName === "daily") renderDaily(appData, content);
    if (tabName === "weekly") renderWeekly(appData, content);
    if (tabName === "total") renderTotal(appData, content);
    if (tabName === "settings") renderSettings(appData, content, saveSettings);
  }

  dailyTab.addEventListener("click", async () => { setActiveTab(dailyTab, tabs); await loadAndRender("daily"); });
  weeklyTab.addEventListener("click", async () => { setActiveTab(weeklyTab, tabs); await loadAndRender("weekly"); });
  totalTab.addEventListener("click", async () => { setActiveTab(totalTab, tabs); await loadAndRender("total"); });
  settingsTab.addEventListener("click", async () => { setActiveTab(settingsTab, tabs); await loadAndRender("settings"); });

  setActiveTab(dailyTab, tabs);
  renderCommandCenter(appData, commandCenter);
  renderDaily(appData, content);

  setInterval(() => {
    const stateEl = document.getElementById("focusState");
    if (!stateEl || !stateEl.dataset.endTime) return;
    const remainingMs = Math.max(0, Number(stateEl.dataset.endTime) - Date.now());
    stateEl.textContent = t("stateActive", [formatDuration(remainingMs)]);
    if (remainingMs <= 0) {
      stateEl.textContent = t("stateInactive");
      delete stateEl.dataset.endTime;
    }
  }, 1000);
});

function fetchData(forceWeekly = false) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: "GET_APP_DATA", forceWeekly }, (response) => resolve(response?.data || { daily: {}, settings: {} })));
}
function saveSettings(settings) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings }, () => resolve()));
}

function setActiveTab(activeTab, tabs) { tabs.forEach((tab) => tab.classList.remove("active")); activeTab.classList.add("active"); }
function getTodayKey() { return new Date().toISOString().slice(0, 10); }
function formatDuration(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}
function getDateRange(days, shiftDays = 0) {
  const arr = [];
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now); d.setDate(now.getDate() - shiftDays - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
}
function pctChange(now, prev) {
  if (!prev && !now) return "0%";
  if (!prev) return "+100%";
  const v = Math.round(((now - prev) / prev) * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
}

function categoryType(category, settings) {
  const productive = settings?.scoreConfig?.productiveCategories || ["Work", "Learning"];
  const distracting = settings?.scoreConfig?.distractingCategories || ["Social Media", "Entertainment"];
  if (productive.includes(category)) return "productive";
  if (distracting.includes(category)) return "distracting";
  return "neutral";
}

function aggregateCategories(domains) {
  const grouped = {};
  Object.entries(domains).forEach(([hostname, stats]) => {
    const category = stats.category || "Other";
    if (!grouped[category]) grouped[category] = { visits: 0, time: 0, domains: [] };
    grouped[category].visits += stats.visits || 0;
    grouped[category].time += stats.time || 0;
    grouped[category].domains.push([hostname, stats]);
  });
  Object.values(grouped).forEach((group) => group.domains.sort((a, b) => (b[1].time || 0) - (a[1].time || 0)));
  return Object.entries(grouped).sort((a, b) => b[1].time - a[1].time);
}

function buildTotalsByRange(appData, dateKeys) {
  const domainTotals = {};
  const categoryTotals = {};
  let totalTime = 0;
  let productiveTime = 0;
  let contextSwitches = 0;
  let longestFocusSessionMs = 0;
  const productiveCategories = appData.settings?.scoreConfig?.productiveCategories || ["Work", "Learning"];

  dateKeys.forEach((key) => {
    const day = appData.daily?.[key]; if (!day) return;
    contextSwitches += day.tabSwitches || 0;
    longestFocusSessionMs = Math.max(longestFocusSessionMs, day.longestFocusSessionMs || 0);
    Object.entries(day.domains || {}).forEach(([hostname, stats]) => {
      if (!domainTotals[hostname]) domainTotals[hostname] = { visits: 0, time: 0, category: stats.category || "Other" };
      domainTotals[hostname].visits += stats.visits || 0;
      domainTotals[hostname].time += stats.time || 0;
      domainTotals[hostname].category = stats.category || domainTotals[hostname].category;
      const cat = domainTotals[hostname].category;
      if (!categoryTotals[cat]) categoryTotals[cat] = { visits: 0, time: 0 };
      categoryTotals[cat].visits += stats.visits || 0;
      categoryTotals[cat].time += stats.time || 0;
      totalTime += stats.time || 0;
      if (productiveCategories.includes(cat)) productiveTime += stats.time || 0;
    });
  });

  const focusScore = totalTime > 0 ? Math.max(0, Math.min(100, Math.round((productiveTime / totalTime) * 100))) : 0;
  return { domainTotals, categoryTotals, focusScore, contextSwitches, longestFocusSessionMs, totalTime };
}

function renderCommandCenter(appData, root) {
  const today = getTodayKey();
  const day = appData.daily?.[today] || { dailyScores: {} };
  const focusScore = day.dailyScores?.focusScore || 0;
  const balance = day.dailyScores?.browserBalance || 0;
  const streak = appData.streaks?.current || 0;
  const focus = appData.focusSession || {};
  const active = Boolean(focus.active && focus.endTime);
  const remaining = active ? Math.max(0, focus.endTime - Date.now()) : 0;

  root.classList.toggle("active-focus", active);
  root.innerHTML = `
    <div class="metric-top">
      <div class="metric-main">${focusScore}%</div>
      <div class="metric-sub">${t("focusScore")}</div>
    </div>
    <div class="metric-row">${t("browserBalance", [balance])}</div>
    <div class="metric-row">${t("focusStreak", [streak])}</div>
    <div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, focusScore))}%"></div></div>
    <div class="thin-divider"></div>
    <div class="metric-row">${t("focusMode")}: <span id="focusState" ${active ? `data-end-time="${focus.endTime}"` : ""}>${active ? t("stateActive", [formatDuration(remaining)]) : t("stateInactive")}</span></div>
  `;
}

function card(title, lines = [], extraClass = "") {
  const el = document.createElement("div");
  el.className = `card ${extraClass}`.trim();
  el.innerHTML = `<div class="card-title">${title}</div>`;
  lines.forEach((line) => {
    const row = document.createElement("div");
    row.className = "small";
    row.textContent = line;
    el.appendChild(row);
  });
  return el;
}

function renderTopDomainsBar(domains, content) {
  const c = card(t("topDomainsToday"));
  const sorted = Object.entries(domains).sort((a, b) => (b[1].time || 0) - (a[1].time || 0)).slice(0, 5);
  const max = sorted[0]?.[1]?.time || 1;
  sorted.forEach(([domain, stats]) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `<span>${domain}</span><div class="bar"><div class="fill" style="width:${Math.max(4, Math.round((stats.time / max) * 100))}%"></div></div><span>${formatDuration(stats.time)}</span>`;
    c.appendChild(row);
  });
  content.appendChild(c);
}

function renderCategoryPie(categoryTotals, content) {
  const c = card(t("categoryTimeDistribution"));
  const total = Object.values(categoryTotals).reduce((sum, n) => sum + (n.time || 0), 0) || 1;
  const colors = ["#6ea8fe", "#5cc98c", "#ffb86c", "#ff8f8f", "#7aa2ff", "#9ea4b0", "#c38fff"];
  const entries = Object.entries(categoryTotals).sort((a, b) => b[1].time - a[1].time);
  const pie = document.createElement("div"); pie.className = "pie";
  let start = 0;
  const segments = entries.map(([name, stats], idx) => {
    const pct = (stats.time / total) * 100;
    const color = colors[idx % colors.length];
    const seg = `${color} ${start}% ${start + pct}%`;
    start += pct;
    return { name, pct, color, seg };
  });
  pie.style.background = `conic-gradient(${segments.map((s) => s.seg).join(",")})`;
  c.appendChild(pie);
  segments.forEach((s) => {
    const row = document.createElement("div"); row.className = "small";
    row.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};margin-right:6px;"></span>${s.name}: ${Math.round(s.pct)}%`;
    c.appendChild(row);
  });
  content.appendChild(c);
}

function renderHeatmap(day, content) {
  const c = card(t("heatmapTitle"));
  const grid = document.createElement("div");
  grid.className = "heatmap";

  let bestHour = "0"; let worstHour = "0"; let bestScore = -1; let worstScore = 999;
  for (let h = 0; h < 24; h += 1) {
    const b = day.hourly?.[String(h)] || { focusScore: 0, switches: 0 };
    if ((b.focusScore || 0) > bestScore) { bestScore = b.focusScore || 0; bestHour = String(h); }
    if ((b.focusScore || 0) < worstScore) { worstScore = b.focusScore || 0; worstHour = String(h); }

    const p = Math.max(0, Math.min(100, b.focusScore || 0));
    const red = Math.round(225 - p * 1.1);
    const green = Math.round(100 + p * 1.2);
    const cell = document.createElement("div");
    cell.className = "heat-cell";
    cell.style.background = `rgb(${red}, ${green}, 120)`;
    cell.title = t("heatTooltip", [String(h), String(b.focusScore || 0), String(b.switches || 0)]);
    grid.appendChild(cell);
  }

  c.appendChild(grid);
  const summary = document.createElement("div"); summary.className = "small";
  summary.textContent = `${t("mostProductiveHour", [bestHour])} • ${t("mostDistractingHour", [worstHour])}`;
  c.appendChild(summary);
  content.appendChild(c);
}

function renderGrouped(domains, content, showVisits = true, settings = {}, day = null) {
  const grouped = aggregateCategories(domains);
  if (!grouped.length) { content.innerHTML += `<div class=\"empty-state\">${t("emptyState")}</div>`; return; }

  grouped.forEach(([category, group]) => {
    const section = document.createElement("div");
    section.className = "card";
    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `<span>${category}</span><span>${showVisits ? `${group.visits} visits • ` : ""}${formatDuration(group.time)}</span>`;
    section.appendChild(header);

    group.domains.forEach(([hostname, stats]) => {
      const goalDomainMin = Number(settings.goals?.domains?.[hostname] || 0);
      const goalCategoryMin = Number(settings.goals?.categories?.[category] || 0);
      const exceededDomain = day && goalDomainMin > 0 && (stats.time || 0) >= goalDomainMin * 60 * 1000;
      const exceededCategory = day && goalCategoryMin > 0 && (group.time || 0) >= goalCategoryMin * 60 * 1000;
      const catType = categoryType(category, settings);
      const goalMax = goalDomainMin > 0 ? goalDomainMin * 60 * 1000 : 0;
      const goalPct = goalMax > 0 ? Math.max(0, Math.min(100, Math.round(((stats.time || 0) / goalMax) * 100))) : 0;

      const row = document.createElement("div");
      row.className = `site-entry ${(exceededDomain || exceededCategory) ? "danger" : ""}`;
      row.innerHTML = `
        <div class="site-top">
          <div class="site-left">
            <img src="https://www.google.com/s2/favicons?domain=${hostname}" alt="icon">
            <span class="dot ${catType}"></span>
            <span class="site-name">${hostname}</span>
          </div>
          <span class="site-stats">${showVisits ? `${stats.visits || 0} visits • ` : ""}${formatDuration(stats.time || 0)}</span>
        </div>
        <div class="site-secondary">${category}</div>
        ${goalMax > 0 ? `<div class=\"goal-track\"><div class=\"goal-fill\" style=\"width:${goalPct}%\"></div></div>` : ""}
      `;
      section.appendChild(row);
    });

    content.appendChild(section);
  });
}

function renderFocusWidget(appData, content) {
  const focus = appData.focusSession || {};
  const remainingMs = focus.active && focus.endTime ? Math.max(0, focus.endTime - Date.now()) : 0;
  const state = focus.active ? t("stateActive", [formatDuration(remainingMs)]) : t("stateInactive");

  const c = card(t("focusSession"), [t("contextSwitches", [focus.tabSwitches || 0]), t("distractingSwitches", [focus.distractingSwitches || 0])]);
  const row = document.createElement("div");
  row.className = "setting-row";
  row.innerHTML = `<div class=\"small\" style=\"flex:1\">${t("focusSessionState", [state])}</div><select id=\"focusDuration\" style=\"flex:1\"><option value=\"25\">25 min</option><option value=\"45\">45 min</option><option value=\"60\">60 min</option></select><button id=\"startFocusBtn\" class=\"action\">${t("start")}</button><button id=\"stopFocusBtn\" class=\"ghost\">${t("stop")}</button>`;
  c.appendChild(row);

  c.querySelector("#startFocusBtn").addEventListener("click", () => chrome.runtime.sendMessage({ type: "START_FOCUS_SESSION", durationMinutes: Number(c.querySelector("#focusDuration").value) }));
  c.querySelector("#stopFocusBtn").addEventListener("click", () => chrome.runtime.sendMessage({ type: "STOP_FOCUS_SESSION" }));
  content.appendChild(c);
}

function renderRatingPrompt(appData, content) {
  if (!appData.focusSession?.pendingRating) return;
  const c = card(t("sessionQualityRating"), [t("sessionQualityPrompt")]);
  const row = document.createElement("div"); row.className = "setting-row";
  row.innerHTML = `<select id=\"sessionRating\" style=\"flex:1\"><option value=\"1\">1</option><option value=\"2\">2</option><option value=\"3\">3</option><option value=\"4\">4</option><option value=\"5\">5</option></select><button id=\"saveRatingBtn\" class=\"action\">${t("save")}</button>`;
  c.appendChild(row);
  c.querySelector("#saveRatingBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "SUBMIT_SESSION_RATING", rating: Number(c.querySelector("#sessionRating").value) }, async () => {
      const refreshed = await fetchData();
      renderDaily(refreshed, content);
    });
  });
  content.appendChild(c);
}

function renderDaily(appData, content) {
  const today = getTodayKey();
  const day = appData.daily?.[today] || { domains: {}, insights: {}, shortVisits: {}, dailyScores: {}, hourly: {} };
  const stats = buildTotalsByRange(appData, [today]);

  content.innerHTML = "";
  content.appendChild(card(t("dailyMetrics"), [
    `${t("focusScore")}: ${stats.focusScore}/100`,
    t("browserBalance", [day.dailyScores?.browserBalance || 0]),
    t("longestFocusSession", [formatDuration(stats.longestFocusSessionMs)]),
    t("contextSwitches", [stats.contextSwitches]),
    t("averageRecovery", [formatDuration(day.dailyScores?.averageRecoveryMs || 0)])
  ]));

  renderFocusWidget(appData, content);
  renderRatingPrompt(appData, content);

  const streaks = appData.streaks || {};
  content.appendChild(card(t("deepWorkStreak"), [t("focusStreak", [streaks.current || 0]), t("longestStreak", [streaks.longest || 0]), t("totalProductiveDays", [streaks.totalProductiveDays || 0])]));

  const insightLines = day.insights?.transitionInsights || [];
  if (insightLines.length) content.appendChild(card(t("insightToday"), insightLines, "insight-card"));

  const shortSessionInsights = [];
  Object.entries(day.shortVisits || {}).forEach(([domain, count]) => {
    if (count >= 8) shortSessionInsights.push(t("frequentShortDetected", [domain, String(count)]));
  });
  if (shortSessionInsights.length) content.appendChild(card(t("frequentShortSessions"), shortSessionInsights));

  renderHeatmap(day, content);
  renderTopDomainsBar(day.domains || {}, content);
  renderCategoryPie(stats.categoryTotals, content);
  renderGrouped(day.domains || {}, content, true, appData.settings || {}, day);
}

function renderWeekly(appData, content) {
  const current = getDateRange(7);
  const previous = getDateRange(7, 7);
  const nowStats = buildTotalsByRange(appData, current);
  const prevStats = buildTotalsByRange(appData, previous);
  const summary = appData.analyticsCache?.weeklySummary || {};

  content.innerHTML = "";
  content.appendChild(card(t("weeklyMetrics"), [
    `${t("focusScore")}: ${nowStats.focusScore}/100 (${pctChange(nowStats.focusScore, prevStats.focusScore)})`,
    t("longestFocusSession", [formatDuration(nowStats.longestFocusSessionMs)]),
    t("contextSwitches", [nowStats.contextSwitches])
  ]));

  const reflection = [];
  if (summary.mostVisitedDomain) reflection.push(t("mostVisitedDomain", [summary.mostVisitedDomain, String(summary.mostVisitedCount || 0)]));
  if (summary.mostProductiveDay) reflection.push(t("mostProductiveDay", [summary.mostProductiveDay]));
  if (summary.mostDistractedHour !== undefined && summary.mostDistractedHour !== "") reflection.push(t("mostDistractingHour", [summary.mostDistractedHour]));
  if (summary.focusScoreTrend) reflection.push(t("focusTrend", [summary.focusScoreTrend]));
  if (summary.timeReclaimedMs > 0) reflection.push(t("timeReclaimed", [formatDuration(summary.timeReclaimedMs)]));
  if (summary.distractingIncreaseMs > 0) reflection.push(t("distractingIncrease", [formatDuration(summary.distractingIncreaseMs)]));
  if (summary.avgRecoveryMs > 0) reflection.push(t("avgRecoveryAfterDistraction", [formatDuration(summary.avgRecoveryMs)]));
  if (appData.analyticsCache?.energyDrift) reflection.push(appData.analyticsCache.energyDrift);
  if (reflection.length) content.appendChild(card(t("weeklyReflection"), reflection));

  const dc = card(t("domainChanges"));
  Object.entries(nowStats.domainTotals).sort((a, b) => b[1].time - a[1].time).slice(0, 12).forEach(([domain, curr]) => {
    const prev = prevStats.domainTotals[domain] || { time: 0, visits: 0 };
    const row = document.createElement("div"); row.className = "site-entry";
    row.innerHTML = `<div class=\"site-top\"><span class=\"site-name\">${domain}</span><span class=\"site-stats\">${t("visitsAndTimeWithChange", [String(curr.visits), pctChange(curr.visits, prev.visits), formatDuration(curr.time), pctChange(curr.time, prev.time)])}</span></div>`;
    dc.appendChild(row);
  });
  content.appendChild(dc);

  const cc = card(t("categoryChanges"));
  Object.entries(nowStats.categoryTotals).sort((a, b) => b[1].time - a[1].time).forEach(([category, curr]) => {
    const prev = prevStats.categoryTotals[category] || { time: 0, visits: 0 };
    const row = document.createElement("div"); row.className = "site-entry";
    row.innerHTML = `<div class=\"site-top\"><span class=\"site-name\">${category}</span><span class=\"site-stats\">${t("visitsAndTimeWithChange", [String(curr.visits), pctChange(curr.visits, prev.visits), formatDuration(curr.time), pctChange(curr.time, prev.time)])}</span></div>`;
    cc.appendChild(row);
  });
  content.appendChild(cc);

  renderTopDomainsBar(nowStats.domainTotals, content);
  renderCategoryPie(nowStats.categoryTotals, content);
}

function renderTotal(appData, content) {
  const totals = buildTotalsByRange(appData, Object.keys(appData.daily || {})).domainTotals;
  content.innerHTML = "";
  renderGrouped(totals, content, true, appData.settings || {});
}

function renderSettings(appData, content, onSave) {
  const settings = { ...appData.settings, categories: Array.from(new Set([...(appData.settings?.categories || []), ...DEFAULT_CATEGORIES])) };

  content.innerHTML = `
    <div class="card">
      <div class="card-title">${t("settingsCategories")}</div>
      <div class="setting-row"><input id="newCategoryInput" data-i18n-placeholder="newCategory" style="flex:1;" /><button id="addCategoryBtn" class="action">${t("save")}</button></div>
      <div id="categoryList" class="small"></div>
    </div>

    <div class="card">
      <div class="card-title">${t("settingsDomainAssignment")}</div>
      <div class="setting-row"><select id="domainSelect" style="flex:1;"></select><select id="domainCategorySelect" style="flex:1;"></select><button id="assignDomainBtn" class="action">${t("save")}</button></div>
      <div class="small">${t("domainOverrideHint")}</div>
    </div>

    <div class="card">
      <div class="card-title">${t("settingsGoals")}</div>
      <div class="setting-row"><input id="goalDomainInput" data-i18n-placeholder="domainPlaceholder" style="flex:1;"/><input id="goalDomainMinutes" type="number" min="1" data-i18n-placeholder="minutesPerDay" style="width:90px;"/><button id="setDomainGoalBtn" class="action">${t("save")}</button></div>
      <div class="setting-row"><select id="goalCategorySelect" style="flex:1;"></select><input id="goalCategoryMinutes" type="number" min="1" data-i18n-placeholder="minutesPerDay" style="width:90px;"/><button id="setCategoryGoalBtn" class="action">${t("save")}</button></div>
    </div>

    <div class="card">
      <div class="card-title">${t("settingsBehavior")}</div>
      <div class="setting-row"><span style="flex:1" class="small">${t("notifications")}</span><input type="checkbox" class="toggle" id="notifToggle" ${settings.notificationsEnabled === false ? "" : "checked"}/></div>
      <div class="setting-row"><span style="flex:1" class="small">${t("microInterventions")}</span><input type="checkbox" class="toggle" id="microToggle" ${settings.microInterventionsEnabled === false ? "" : "checked"}/></div>
      <div class="setting-row"><input id="focusThresholdInput" type="number" min="1" max="100" value="${Number(settings.focusScoreProductiveThreshold || 70)}" style="flex:1;"/><button id="saveThresholdBtn" class="action">${t("saveThreshold")}</button></div>
      <div class="setting-row"><span class="small" style="flex:1;">${t("language")}</span><select id="languageSelect" style="flex:1;"></select><button id="saveLanguageBtn" class="action">${t("save")}</button></div>
    </div>

    <div class="card">
      <div class="card-title">${t("settingsData")}</div>
      <div class="setting-row"><button id="exportBtn" class="ghost" style="flex:1;">${t("exportJson")}</button><label for="importInput" class="ghost" style="text-align:center;flex:1;padding:8px;border-radius:10px;cursor:pointer;">${t("importJson")}</label><input id="importInput" type="file" accept="application/json" style="display:none;"/></div>
      <div class="setting-row"><button id="clearBtn" class="ghost" style="width:100%;">${t("clearAllData")}</button></div>
    </div>
  `;
  I18n.apply(content);

  content.querySelector("#categoryList").textContent = t("categoriesList", [settings.categories.join(", ")]);

  const domainSelect = content.querySelector("#domainSelect");
  const categorySelect = content.querySelector("#domainCategorySelect");
  const goalCategorySelect = content.querySelector("#goalCategorySelect");
  const languageSelect = content.querySelector("#languageSelect");

  LANGUAGE_OPTIONS.forEach(([code, label]) => {
    const o = document.createElement("option");
    o.value = code;
    o.textContent = label.startsWith("language") ? t(label) : label;
    languageSelect.appendChild(o);
  });
  languageSelect.value = settings.languageOverride || "auto";

  const domains = new Set(Object.keys(settings.domainCategories || {}));
  Object.values(appData.daily || {}).forEach((day) => Object.keys(day.domains || {}).forEach((d) => domains.add(d)));
  Array.from(domains).sort().forEach((domain) => {
    const option = document.createElement("option");
    option.value = domain; option.textContent = domain; domainSelect.appendChild(option);
  });

  settings.categories.forEach((category) => {
    const a = document.createElement("option"); a.value = category; a.textContent = category; categorySelect.appendChild(a);
    const b = document.createElement("option"); b.value = category; b.textContent = category; goalCategorySelect.appendChild(b);
  });

  content.querySelector("#addCategoryBtn").addEventListener("click", async () => {
    const name = content.querySelector("#newCategoryInput").value.trim();
    if (!name) return;
    await onSave({ ...settings, categories: Array.from(new Set([...(settings.categories || []), name])) });
    renderSettings(await fetchData(), content, onSave);
  });

  content.querySelector("#assignDomainBtn").addEventListener("click", async () => {
    const domain = domainSelect.value; const category = categorySelect.value;
    if (!domain || !category) return;
    await onSave({ ...settings, domainCategories: { ...(settings.domainCategories || {}), [domain]: category } });
    renderSettings(await fetchData(), content, onSave);
  });

  content.querySelector("#setDomainGoalBtn").addEventListener("click", async () => {
    const domain = content.querySelector("#goalDomainInput").value.trim();
    const mins = Number(content.querySelector("#goalDomainMinutes").value);
    if (!domain || !mins) return;
    const goals = settings.goals || { domains: {}, categories: {} };
    goals.domains = { ...(goals.domains || {}), [domain]: mins };
    await onSave({ ...settings, goals });
  });

  content.querySelector("#setCategoryGoalBtn").addEventListener("click", async () => {
    const category = goalCategorySelect.value;
    const mins = Number(content.querySelector("#goalCategoryMinutes").value);
    if (!category || !mins) return;
    const goals = settings.goals || { domains: {}, categories: {} };
    goals.categories = { ...(goals.categories || {}), [category]: mins };
    await onSave({ ...settings, goals });
  });

  content.querySelector("#notifToggle").addEventListener("change", async (e) => onSave({ ...settings, notificationsEnabled: e.target.checked }));
  content.querySelector("#microToggle").addEventListener("change", async (e) => onSave({ ...settings, microInterventionsEnabled: e.target.checked }));
  content.querySelector("#saveThresholdBtn").addEventListener("click", async () => {
    const value = Number(content.querySelector("#focusThresholdInput").value || 70);
    await onSave({ ...settings, focusScoreProductiveThreshold: value });
  });
  content.querySelector("#saveLanguageBtn").addEventListener("click", async () => {
    const languageOverride = languageSelect.value;
    await onSave({ ...settings, languageOverride });
    await I18n.init();
    I18n.apply(document);
    renderSettings(await fetchData(), content, onSave);
  });

  content.querySelector("#exportBtn").addEventListener("click", async () => {
    const data = await fetchData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `link-visit-counter-backup-${new Date().toISOString().slice(0, 10)}.json`, saveAs: true }, () => URL.revokeObjectURL(url));
  });

  content.querySelector("#importInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        chrome.runtime.sendMessage({ type: "REPLACE_APP_DATA", data }, async () => renderSettings(await fetchData(), content, onSave));
      } catch {
        alert(t("invalidBackup"));
      }
    };
    reader.readAsText(file);
  });

  content.querySelector("#clearBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_ALL_DATA" }, async () => renderSettings(await fetchData(), content, onSave));
  });
}
