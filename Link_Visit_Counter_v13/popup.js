const DEFAULT_CATEGORIES = ["Work", "Learning", "Social Media", "Entertainment", "News", "Other"];

document.addEventListener("DOMContentLoaded", async () => {
  const dailyTab = document.getElementById("dailyTab");
  const weeklyTab = document.getElementById("weeklyTab");
  const totalTab = document.getElementById("totalTab");
  const settingsTab = document.getElementById("settingsTab");
  const content = document.getElementById("content");
  const tabs = [dailyTab, weeklyTab, totalTab, settingsTab];

  let appData = await fetchData();

  async function loadAndRender(tabName) {
    appData = await fetchData(tabName === "weekly");
    if (tabName === "daily") renderDaily(appData, content);
    if (tabName === "weekly") renderWeekly(appData, content);
    if (tabName === "total") renderTotal(appData, content);
    if (tabName === "settings") renderSettings(appData, content, saveSettings);
  }

  dailyTab.addEventListener("click", async () => {
    setActiveTab(dailyTab, tabs);
    await loadAndRender("daily");
  });
  weeklyTab.addEventListener("click", async () => {
    setActiveTab(weeklyTab, tabs);
    await loadAndRender("weekly");
  });
  totalTab.addEventListener("click", async () => {
    setActiveTab(totalTab, tabs);
    await loadAndRender("total");
  });
  settingsTab.addEventListener("click", async () => {
    setActiveTab(settingsTab, tabs);
    await loadAndRender("settings");
  });

  setActiveTab(dailyTab, tabs);
  renderDaily(appData, content);

  setInterval(() => {
    const stateEl = document.getElementById("focusState");
    if (!stateEl || !stateEl.dataset.endTime) return;
    const remainingMs = Math.max(0, Number(stateEl.dataset.endTime) - Date.now());
    stateEl.textContent = `Active • ${formatDuration(remainingMs)} left`;
    if (remainingMs <= 0) {
      stateEl.textContent = "Inactive";
      delete stateEl.dataset.endTime;
    }
  }, 1000);
});

function fetchData(forceWeekly = false) {
  return new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: "GET_APP_DATA", forceWeekly }, (response) => resolve(response?.data || { daily: {}, settings: {} }))
  );
}
function saveSettings(settings) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings }, () => resolve()));
}

function setActiveTab(activeTab, tabs) {
  tabs.forEach((tab) => tab.classList.remove("active"));
  activeTab.classList.add("active");
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

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
    const d = new Date(now);
    d.setDate(now.getDate() - shiftDays - i);
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
  let tabSwitches = 0;
  let longestFocusSessionMs = 0;
  const productiveCategories = appData.settings?.scoreConfig?.productiveCategories || ["Work", "Learning"];

  dateKeys.forEach((key) => {
    const day = appData.daily?.[key];
    if (!day) return;
    tabSwitches += day.tabSwitches || 0;
    longestFocusSessionMs = Math.max(longestFocusSessionMs, day.longestFocusSessionMs || 0);

    Object.entries(day.domains || {}).forEach(([hostname, stats]) => {
      if (!domainTotals[hostname]) domainTotals[hostname] = { visits: 0, time: 0, category: stats.category || "Other" };
      domainTotals[hostname].visits += stats.visits || 0;
      domainTotals[hostname].time += stats.time || 0;
      domainTotals[hostname].category = stats.category || domainTotals[hostname].category;

      const cat = domainTotals[hostname].category;
      if (!categoryTotals[cat]) categoryTotals[cat] = { time: 0, visits: 0 };
      categoryTotals[cat].time += stats.time || 0;
      categoryTotals[cat].visits += stats.visits || 0;

      totalTime += stats.time || 0;
      if (productiveCategories.includes(cat)) productiveTime += stats.time || 0;
    });
  });

  const focusScore = totalTime > 0 ? Math.max(0, Math.min(100, Math.round((productiveTime / totalTime) * 100))) : 0;
  return { domainTotals, categoryTotals, focusScore, longestFocusSessionMs, tabSwitches, totalTime };
}

function createInfoCard(title, lines = []) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<strong>${title}</strong>`;
  lines.forEach((line) => {
    const row = document.createElement("div");
    row.className = "small";
    row.textContent = line;
    card.appendChild(row);
  });
  return card;
}

function renderTopDomainsBar(domains, content) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = "<strong>Top 5 Domains Today</strong>";
  const sorted = Object.entries(domains)
    .sort((a, b) => (b[1].time || 0) - (a[1].time || 0))
    .slice(0, 5);
  const max = sorted[0]?.[1]?.time || 1;
  sorted.forEach(([domain, stats]) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `<span>${domain}</span><div class="bar"><div class="fill" style="width:${Math.max(
      4,
      Math.round((stats.time / max) * 100)
    )}%"></div></div><span>${formatDuration(stats.time)}</span>`;
    card.appendChild(row);
  });
  content.appendChild(card);
}

function renderCategoryPie(categoryTotals, content) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = "<strong>Category Time Split</strong>";
  const total = Object.values(categoryTotals).reduce((sum, c) => sum + (c.time || 0), 0) || 1;
  const colors = ["#7289da", "#43b581", "#faa61a", "#f04747", "#00b0f4", "#b9bbbe", "#9b59b6"];
  const entries = Object.entries(categoryTotals).sort((a, b) => b[1].time - a[1].time);

  const pie = document.createElement("div");
  pie.className = "pie";
  let start = 0;
  const segments = entries.map(([category, stats], idx) => {
    const pct = (stats.time / total) * 100;
    const color = colors[idx % colors.length];
    const seg = `${color} ${start}% ${start + pct}%`;
    start += pct;
    return { category, pct, color, seg };
  });
  pie.style.background = `conic-gradient(${segments.map((s) => s.seg).join(",")})`;
  card.appendChild(pie);

  segments.forEach((seg) => {
    const row = document.createElement("div");
    row.className = "small";
    row.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:${seg.color};margin-right:6px;"></span>${seg.category}: ${Math.round(
      seg.pct
    )}%`;
    card.appendChild(row);
  });

  content.appendChild(card);
}

function renderHeatmap(day, content) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = "<strong>Context Switching Heatmap</strong>";

  const container = document.createElement("div");
  container.className = "heatmap";

  let maxSwitch = 1;
  let bestHour = "0";
  let worstHour = "0";
  let bestScore = -1;
  let worstScore = 999;

  Object.entries(day.hourly || {}).forEach(([h, bucket]) => {
    if ((bucket.switches || 0) > maxSwitch) maxSwitch = bucket.switches;
    if ((bucket.focusScore || 0) > bestScore) {
      bestScore = bucket.focusScore || 0;
      bestHour = h;
    }
    if ((bucket.focusScore || 0) < worstScore) {
      worstScore = bucket.focusScore || 0;
      worstHour = h;
    }
  });

  for (let h = 0; h < 24; h += 1) {
    const b = day.hourly?.[String(h)] || { switches: 0, focusScore: 0, balanceScore: 0 };
    const intensity = Math.round(((b.switches || 0) / maxSwitch) * 100);
    const cell = document.createElement("div");
    cell.className = "heat-cell";
    cell.style.background = `linear-gradient(to top, rgba(240,71,71,${Math.min(0.85, intensity / 100)}), rgba(67,181,129,${Math.max(
      0.12,
      (b.focusScore || 0) / 100
    )}))`;
    cell.title = `${h}:00 | switches=${b.switches || 0} | focus=${b.focusScore || 0}`;
    container.appendChild(cell);
  }

  card.appendChild(container);
  const summary = document.createElement("div");
  summary.className = "small";
  summary.textContent = `Most productive hour: ${bestHour}:00 • Most distraction-heavy hour: ${worstHour}:00`;
  card.appendChild(summary);
  content.appendChild(card);
}

function renderGrouped(domains, content, showVisits = true, settings = {}, dayData = null) {
  const grouped = aggregateCategories(domains);
  if (!grouped.length) {
    content.innerHTML += '<div class="empty-state">No data yet.</div>';
    return;
  }

  grouped.forEach(([category, group]) => {
    const card = document.createElement("div");
    card.className = "card";
    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `<span>${category}</span><span>${showVisits ? `${group.visits} visits • ` : ""}${formatDuration(group.time)}</span>`;
    card.appendChild(header);

    group.domains.forEach(([hostname, stats]) => {
      const row = document.createElement("div");
      const domainGoalMin = Number(settings.goals?.domains?.[hostname] || 0);
      const categoryGoalMin = Number(settings.goals?.categories?.[category] || 0);
      const warnDomain = dayData && domainGoalMin > 0 && (stats.time || 0) >= domainGoalMin * 60 * 1000;
      const warnCategory = dayData && categoryGoalMin > 0 && (group.time || 0) >= categoryGoalMin * 60 * 1000;
      row.className = `site-entry ${(warnDomain || warnCategory) ? "danger" : ""}`;
      row.innerHTML = `<div class="site-left"><img src="https://www.google.com/s2/favicons?domain=${hostname}" alt="icon"><span class="site-name">${hostname}</span></div><span class="site-stats">${showVisits ? `${
        stats.visits || 0
      } visits • ` : ""}${formatDuration(stats.time || 0)}</span>`;
      card.appendChild(row);
    });

    content.appendChild(card);
  });
}

function renderFocusWidget(appData, content) {
  const focus = appData.focusSession || {};
  const card = document.createElement("div");
  card.className = "card";
  const remainingMs = focus.active && focus.endTime ? Math.max(0, focus.endTime - Date.now()) : 0;
  const state = focus.active ? `Active • ${formatDuration(remainingMs)} left` : "Inactive";

  card.innerHTML = `
    <div><strong>Focus Session:</strong> <span id="focusState" ${focus.active && focus.endTime ? `data-end-time="${focus.endTime}"` : ""}>${state}</span></div>
    <div class="small">Switches: ${focus.tabSwitches || 0} • Distracting: ${focus.distractingSwitches || 0}</div>
    <div class="setting-row" style="margin-top:6px;">
      <select id="focusDuration" style="flex:1;"><option value="25">25 min</option><option value="45">45 min</option><option value="60">60 min</option></select>
      <button id="startFocusBtn" class="action">Start</button>
      <button id="stopFocusBtn" class="ghost">Stop</button>
    </div>
  `;

  card
    .querySelector("#startFocusBtn")
    .addEventListener("click", () => chrome.runtime.sendMessage({ type: "START_FOCUS_SESSION", durationMinutes: Number(card.querySelector("#focusDuration").value) }));
  card.querySelector("#stopFocusBtn").addEventListener("click", () => chrome.runtime.sendMessage({ type: "STOP_FOCUS_SESSION" }));
  content.appendChild(card);
}

function renderRatingPrompt(appData, content) {
  const pending = appData.focusSession?.pendingRating;
  if (!pending) return;

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <strong>Session Quality Rating</strong>
    <div class="small">How focused were you? (1–5)</div>
    <div class="setting-row" style="margin-top:8px;">
      <select id="sessionRating" style="flex:1;">
        <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
      </select>
      <button id="submitRatingBtn" class="action">Save</button>
    </div>
  `;

  card.querySelector("#submitRatingBtn").addEventListener("click", () => {
    const rating = Number(card.querySelector("#sessionRating").value);
    chrome.runtime.sendMessage({ type: "SUBMIT_SESSION_RATING", rating }, async () => {
      const refreshed = await fetchData();
      renderDaily(refreshed, content);
    });
  });

  content.appendChild(card);
}

function renderRapidVisitInsights(day, domains, content) {
  const lines = [];
  Object.entries(day.shortVisits || {}).forEach(([domain, count]) => {
    if (count >= 8) {
      lines.push(`Frequent short visits detected on ${domain} (${count} short sessions today).`);
    }
  });

  if (!lines.length) return;
  content.appendChild(createInfoCard("Rapid Visit (Dopamine Loop) Detection", lines));
}

function renderStreakAndBalance(appData, day, content) {
  const streaks = appData.streaks || {};
  const dailyScores = day.dailyScores || {};
  const lines = [
    `🔥 ${streaks.current || 0}-Day Focus Streak`,
    `Longest Streak: ${streaks.longest || 0} Days`,
    `Total Productive Days: ${streaks.totalProductiveDays || 0}`,
    `Browser Balance: ${dailyScores.browserBalance || 0}/100`,
    `Average recovery time after distraction: ${formatDuration(dailyScores.averageRecoveryMs || 0)}`
  ];
  content.appendChild(createInfoCard("Streak & Balance", lines));
}

function renderTransitionInsights(day, content) {
  const lines = day.insights?.transitionInsights || [];
  if (!lines.length) return;
  content.appendChild(createInfoCard("Distraction Pattern Detection", lines));
}

function renderDaily(appData, content) {
  const today = getTodayKey();
  const day = appData.daily?.[today] || { domains: {}, hourly: {}, dailyScores: {}, shortVisits: {}, insights: {} };
  const domains = day.domains || {};
  const stats = buildTotalsByRange(appData, [today]);

  content.innerHTML = "";
  content.appendChild(
    createInfoCard("Today's Focus", [
      `Focus Score: ${stats.focusScore}/100`,
      `Longest focus session: ${formatDuration(stats.longestFocusSessionMs)}`,
      `Tab switches: ${stats.tabSwitches}`
    ])
  );

  renderFocusWidget(appData, content);
  renderRatingPrompt(appData, content);
  renderStreakAndBalance(appData, day, content);
  renderTransitionInsights(day, content);
  renderRapidVisitInsights(day, domains, content);
  renderHeatmap(day, content);
  renderTopDomainsBar(domains, content);
  renderCategoryPie(stats.categoryTotals, content);
  renderGrouped(domains, content, true, appData.settings || {}, day);
}

function renderWeekly(appData, content) {
  const currentPeriod = getDateRange(7);
  const previousPeriod = getDateRange(7, 7);
  const currentStats = buildTotalsByRange(appData, currentPeriod);
  const previousStats = buildTotalsByRange(appData, previousPeriod);
  const weeklySummary = appData.analyticsCache?.weeklySummary || {};

  content.innerHTML = "";
  content.appendChild(
    createInfoCard("Weekly Focus", [
      `Focus Score: ${currentStats.focusScore}/100 (${pctChange(currentStats.focusScore, previousStats.focusScore)})`,
      `Longest focus session: ${formatDuration(currentStats.longestFocusSessionMs)}`,
      `Tab switches: ${currentStats.tabSwitches}`
    ])
  );

  const reflectionLines = [];
  if (weeklySummary.mostVisitedDomain) reflectionLines.push(`Most visited domain: ${weeklySummary.mostVisitedDomain} (${weeklySummary.mostVisitedCount || 0} visits)`);
  if (weeklySummary.mostProductiveDay) reflectionLines.push(`Most productive day: ${weeklySummary.mostProductiveDay}`);
  if (weeklySummary.mostDistractedHour !== undefined && weeklySummary.mostDistractedHour !== "") {
    reflectionLines.push(`Most distracted hour: ${weeklySummary.mostDistractedHour}:00`);
  }
  if (weeklySummary.focusScoreTrend) reflectionLines.push(`Focus score trend vs previous week: ${weeklySummary.focusScoreTrend}`);
  if (weeklySummary.timeReclaimedMs > 0) reflectionLines.push(`You reclaimed ${formatDuration(weeklySummary.timeReclaimedMs)} compared to last week.`);
  if (weeklySummary.distractingIncreaseMs > 0) reflectionLines.push(`Distracting time increased by ${formatDuration(weeklySummary.distractingIncreaseMs)} compared to last week.`);
  if (weeklySummary.avgRecoveryMs > 0) reflectionLines.push(`Average recovery time after distraction: ${formatDuration(weeklySummary.avgRecoveryMs)}.`);
  if (appData.analyticsCache?.energyDrift) reflectionLines.push(appData.analyticsCache.energyDrift);
  if (reflectionLines.length) content.appendChild(createInfoCard("Weekly Reflection Summary", reflectionLines));

  const domainsCard = document.createElement("div");
  domainsCard.className = "card";
  domainsCard.innerHTML = "<strong>Domain changes (7-day)</strong>";
  Object.entries(currentStats.domainTotals)
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, 12)
    .forEach(([hostname, current]) => {
      const prev = previousStats.domainTotals[hostname] || { time: 0, visits: 0 };
      const row = document.createElement("div");
      row.className = "site-entry";
      row.innerHTML = `<span class="site-name">${hostname}</span><span class="site-stats">${current.visits} visits (${pctChange(
        current.visits,
        prev.visits
      )}) • ${formatDuration(current.time)} (${pctChange(current.time, prev.time)})</span>`;
      domainsCard.appendChild(row);
    });
  content.appendChild(domainsCard);

  const categoriesCard = document.createElement("div");
  categoriesCard.className = "card";
  categoriesCard.innerHTML = "<strong>Category changes (7-day)</strong>";
  Object.entries(currentStats.categoryTotals)
    .sort((a, b) => b[1].time - a[1].time)
    .forEach(([category, current]) => {
      const prev = previousStats.categoryTotals[category] || { time: 0, visits: 0 };
      const row = document.createElement("div");
      row.className = "site-entry";
      row.innerHTML = `<span class="site-name">${category}</span><span class="site-stats">${current.visits} visits (${pctChange(
        current.visits,
        prev.visits
      )}) • ${formatDuration(current.time)} (${pctChange(current.time, prev.time)})</span>`;
      categoriesCard.appendChild(row);
    });
  content.appendChild(categoriesCard);

  renderTopDomainsBar(currentStats.domainTotals, content);
  renderCategoryPie(currentStats.categoryTotals, content);
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
      <div class="setting-row"><input id="newCategoryInput" placeholder="New category" style="flex:1;" /><button id="addCategoryBtn" class="action">Add</button></div>
      <div id="categoryList" class="small"></div>
    </div>
    <div class="card">
      <div class="setting-row"><select id="domainSelect" style="flex:1;"></select><select id="domainCategorySelect" style="flex:1;"></select><button id="assignDomainBtn" class="action">Assign</button></div>
      <div class="small">Domain assignment overrides default mapping.</div>
    </div>
    <div class="card">
      <div class="setting-row"><input id="goalDomainInput" placeholder="domain.com" style="flex:1;"/><input id="goalDomainMinutes" type="number" min="1" placeholder="min/day" style="width:90px;"/><button id="setDomainGoalBtn" class="action">Set</button></div>
      <div class="setting-row"><select id="goalCategorySelect" style="flex:1;"></select><input id="goalCategoryMinutes" type="number" min="1" placeholder="min/day" style="width:90px;"/><button id="setCategoryGoalBtn" class="action">Set</button></div>
      <div class="setting-row"><label class="small" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="notifToggle" ${
        settings.notificationsEnabled === false ? "" : "checked"
      }/> Enable notifications</label></div>
      <div class="setting-row"><label class="small" style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="microToggle" ${
        settings.microInterventionsEnabled === false ? "" : "checked"
      }/> Enable micro interventions</label></div>
      <div class="setting-row"><input id="focusThresholdInput" type="number" min="1" max="100" placeholder="Productive day threshold" value="${
        Number(settings.focusScoreProductiveThreshold || 70)
      }" style="flex:1;"/><button id="saveThresholdBtn" class="action">Save</button></div>
    </div>
    <div class="card">
      <div class="setting-row"><button id="exportBtn" class="ghost" style="flex:1;">Export JSON</button><label for="importInput" class="ghost" style="text-align:center;flex:1;padding:6px 8px;border-radius:5px;cursor:pointer;">Import JSON</label><input id="importInput" type="file" accept="application/json" style="display:none;"/></div>
      <div class="setting-row"><button id="clearBtn" class="ghost" style="width:100%;">Clear all data</button></div>
    </div>
  `;

  content.querySelector("#categoryList").textContent = `Categories: ${settings.categories.join(", ")}`;
  const domainSelect = content.querySelector("#domainSelect");
  const categorySelect = content.querySelector("#domainCategorySelect");
  const goalCategorySelect = content.querySelector("#goalCategorySelect");
  const domains = new Set(Object.keys(settings.domainCategories || {}));
  Object.values(appData.daily || {}).forEach((day) => Object.keys(day.domains || {}).forEach((d) => domains.add(d)));

  Array.from(domains)
    .sort()
    .forEach((domain) => {
      const option = document.createElement("option");
      option.value = domain;
      option.textContent = domain;
      domainSelect.appendChild(option);
    });

  settings.categories.forEach((category) => {
    const a = document.createElement("option");
    a.value = category;
    a.textContent = category;
    categorySelect.appendChild(a);
    const b = document.createElement("option");
    b.value = category;
    b.textContent = category;
    goalCategorySelect.appendChild(b);
  });

  content.querySelector("#addCategoryBtn").addEventListener("click", async () => {
    const name = content.querySelector("#newCategoryInput").value.trim();
    if (!name) return;
    await onSave({ ...settings, categories: Array.from(new Set([...(settings.categories || []), name])) });
    renderSettings(await fetchData(), content, onSave);
  });

  content.querySelector("#assignDomainBtn").addEventListener("click", async () => {
    const domain = domainSelect.value;
    const category = categorySelect.value;
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

  content.querySelector("#exportBtn").addEventListener("click", async () => {
    const data = await fetchData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `link-visit-counter-backup-${new Date().toISOString().slice(0, 10)}.json`, saveAs: true }, () =>
      URL.revokeObjectURL(url)
    );
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
        alert("Invalid JSON backup file.");
      }
    };
    reader.readAsText(file);
  });

  content.querySelector("#clearBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_ALL_DATA" }, async () => renderSettings(await fetchData(), content, onSave));
  });
}
