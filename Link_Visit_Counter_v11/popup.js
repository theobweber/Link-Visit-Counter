document.addEventListener("DOMContentLoaded", () => {
  const dailyTab = document.getElementById("dailyTab");
  const totalVisitsTab = document.getElementById("totalVisitsTab");
  const totalTimeTab = document.getElementById("totalTimeTab");
  const content = document.getElementById("content");

  const tabs = [dailyTab, totalVisitsTab, totalTimeTab];

  setActiveTab(dailyTab);
  loadDailyStats();
  loadDailyCounts();

  dailyTab.addEventListener("click", () => {
    setActiveTab(dailyTab);
    loadDailyStats();
  });

  totalVisitsTab.addEventListener("click", () => {
    setActiveTab(totalVisitsTab);
    loadTotalStats("visits");
  });

  totalTimeTab.addEventListener("click", () => {
    setActiveTab(totalTimeTab);
    loadTotalStats("time");
  totalTab.addEventListener("click", () => {
    totalTab.classList.add("active");
    dailyTab.classList.remove("active");
    loadTotalCounts();
  });

  function setActiveTab(activeTab) {
    tabs.forEach((tab) => tab.classList.remove("active"));
    activeTab.classList.add("active");
  }

  function loadDailyStats() {
    chrome.storage.local.get("dailyCounts", (result) => {
      const today = new Date().toLocaleDateString();
      const dailyCounts = result.dailyCounts?.[today] || {};
      displayCounts(dailyCounts, "daily");
      displayCounts(dailyCounts);
    });
  }

  function loadTotalStats(sortBy) {
    chrome.storage.local.get("totalCounts", (result) => {
      const totalCounts = result.totalCounts || {};
      displayCounts(totalCounts, sortBy === "time" ? "totalTime" : "totalVisits");
    });
  }

  function normalizeStats(stats) {
    if (typeof stats === "number") {
      return { visits: stats, timeMs: 0 };
    }

    return {
      visits: stats?.visits || 0,
      timeMs: stats?.timeMs || 0
    };
  }

  function formatDuration(timeMs) {
    const totalSeconds = Math.floor(timeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours}h ${minutes}m ${seconds}s`;
  }

  function displayCounts(counts, mode) {
    content.innerHTML = "";

    const entries = Object.entries(counts);
    if (!entries.length) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";
      emptyState.textContent = "No data yet.";
      content.appendChild(emptyState);
      return;
    }

    const sortedEntries = entries.sort((a, b) => {
      const statsA = normalizeStats(a[1]);
      const statsB = normalizeStats(b[1]);

      if (mode === "totalTime") {
        return statsB.timeMs - statsA.timeMs;
      }

      return statsB.visits - statsA.visits;
    });

  function displayCounts(counts) {
    content.innerHTML = "";

    const sortedEntries = Object.entries(counts).sort((a, b) => {
      const statsA = normalizeStats(a[1]);
      const statsB = normalizeStats(b[1]);
      return statsB.visits - statsA.visits;
    });

    sortedEntries.forEach(([hostname, rawStats]) => {
      const stats = normalizeStats(rawStats);
      const div = document.createElement("div");
      div.className = "site-entry";

      const favicon = document.createElement("img");
      favicon.src = `https://www.google.com/s2/favicons?domain=${hostname}`;

      const text = document.createElement("span");
      if (mode === "daily") {
        text.textContent = `${hostname}: ${stats.visits} visits • ${formatDuration(stats.timeMs)}`;
      } else if (mode === "totalTime") {
        text.textContent = `${hostname}: ${formatDuration(stats.timeMs)}`;
      } else {
        text.textContent = `${hostname}: ${stats.visits} visits`;
      }
      text.textContent = `${hostname}: ${stats.visits} visits • ${formatDuration(stats.timeMs)}`;

      div.appendChild(favicon);
      div.appendChild(text);
      content.appendChild(div);
    });
  }
});
