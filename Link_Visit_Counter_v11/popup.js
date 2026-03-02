document.addEventListener("DOMContentLoaded", () => {
  const dailyTab = document.getElementById("dailyTab");
  const totalTab = document.getElementById("totalTab");
  const content = document.getElementById("content");

  // Load daily counts by default
  loadDailyCounts();

  // Switch to daily counts
  dailyTab.addEventListener("click", () => {
    dailyTab.classList.add("active");
    totalTab.classList.remove("active");
    loadDailyCounts();
  });

  // Switch to total counts
  totalTab.addEventListener("click", () => {
    totalTab.classList.add("active");
    dailyTab.classList.remove("active");
    loadTotalCounts();
  });

  function loadDailyCounts() {
    chrome.storage.local.get("dailyCounts", (result) => {
      const today = new Date().toLocaleDateString();
      const dailyCounts = result.dailyCounts[today] || {};
      displayCounts(dailyCounts);
    });
  }

  function loadTotalCounts() {
    chrome.storage.local.get("totalCounts", (result) => {
      const totalCounts = result.totalCounts || {};
      displayCounts(totalCounts);
    });
  }

  function displayCounts(counts) {
    content.innerHTML = "";

    // Convert counts object to an array and sort by count (descending)
    const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    // Display sorted counts with favicons
    sortedEntries.forEach(([hostname, count]) => {
      const div = document.createElement("div");
      div.className = "site-entry"; // Add the class for styling

      // Create favicon image element
      const favicon = document.createElement("img");
      favicon.src = `https://www.google.com/s2/favicons?domain=${hostname}`;

      // Create text element for hostname and count
      const text = document.createElement("span");
      text.textContent = `${hostname}: ${count}`;

      // Append favicon and text to the div
      div.appendChild(favicon);
      div.appendChild(text);

      // Append the div to the content container
      content.appendChild(div);
    });
  }
});