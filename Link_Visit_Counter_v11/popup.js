document.addEventListener("DOMContentLoaded", () => {
  const dailyTab = document.getElementById("dailyTab");
  const totalTab = document.getElementById("totalTab");
  const content = document.getElementById("content");

  loadDailyCounts();

  dailyTab.addEventListener("click", () => {
    dailyTab.classList.add("active");
    totalTab.classList.remove("active");
    loadDailyCounts();
  });

  totalTab.addEventListener("click", () => {
    totalTab.classList.add("active");
    dailyTab.classList.remove("active");
    loadTotalCounts();
  });

  function loadDailyCounts() {
    chrome.storage.local.get("dailyCounts", (result) => {
      const today = new Date().toLocaleDateString();
      const dailyCounts = result.dailyCounts?.[today] || {};
      displayCounts(dailyCounts);
    });
  }

  function loadTotalCounts() {
    chrome.storage.local.get("totalCounts", (result) => {
      const totalCounts = result.totalCounts || {};
      displayCounts(totalCounts);
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
      text.textContent = `${hostname}: ${stats.visits} visits • ${formatDuration(stats.timeMs)}`;

      div.appendChild(favicon);
      div.appendChild(text);
      content.appendChild(div);
    });
  }
});
