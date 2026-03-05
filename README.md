# Link Visit Tracker 

Link Visit Tracker is a Chrome extension that tracks website visits, time spent per domain, and long-term browsing patterns. All data is stored locally using `chrome.storage.local`.

Each domain remains individually visible (e.g., `youtube.com`, `github.com`, `reddit.com`) and can also be grouped into categories for analysis.

---

# Features

## Domain and Category Tracking

* Tracks time and visits per domain.
* Default local categories:

  * Work
  * Learning
  * Social Media
  * Entertainment
  * News
  * Other
* Manual domain reassignment.
* Custom category creation.
* Domain-level transparency is preserved at all times.

---

## Time Views

### Daily

* Today’s visits and time per domain.
* Category grouping.
* Short-term comparison.
* Behavioral momentum ticker (domain or category mode).

### Weekly

* Last 7 days summary.
* Domain and category totals.
* Period comparison.
* Weekly reflection.
* Time reclaimed calculation.

### Total (Lifetime)

* Cumulative totals from all stored history.
* Lifetime metrics and trend analysis.
* Domain and category changes over time.
* Top domains (expandable up to 100).
* Category time distribution.

All historical daily data is stored indefinitely.

---

# Behavioral Analysis (Local Computation)

All insights are generated locally using rule-based analysis.

* Distraction pattern detection (category transitions).
* Rapid short-visit detection.
* 24-hour context-switch heatmap.
* Recovery speed after distractions.
* Energy drift detection by hour.
* Weekly and lifetime reflection summaries.

---

# Metrics and Focus Tools

* Focus Score (productive vs distracting time).
* Browser Balance score (focus, recovery, goal completion, stability).
* Deep Work streak tracking (current, longest, total productive days).
* Focus session mode (25 / 45 / 60 minutes).
* Session quality rating (1–5).
* Time reclaimed tracking.

---

# Behavioral Momentum Ticker

A compact ticker above the main tabs displays usage changes.

* Adapts to Daily, Weekly, or Total view.
* Percentage-based change calculation.
* Switchable between Domain mode and Category mode.
* Slow horizontal auto-scroll.
* Fully local calculations.

---

# Accuracy and Goals

* Automatic per-tab session tracking.
* Idle detection pauses inactive time.
* Daily goals for domains or categories.
* Optional notifications.
* Visual indicators when goals are exceeded.

---

# Theme System

* Dark and Light mode.
* Three built-in presets.
* Manual color customization.
* Save and reuse custom named presets.
* Settings persist across sessions.

---

# Internationalization

* Native Chrome `_locales` support.
* Manual language override.
* Automatic browser language detection.
* RTL support.

---

# Data Management

* Export all data as JSON.
* Import JSON backups.
* Clear local data.

All data is stored locally using `chrome.storage.local`.

---

# Installation

1. Download or clone this repository.
2. Go to `chrome://extensions/`.
3. Enable Developer Mode.
4. Click “Load unpacked”.
5. Select the extension folder.

The extension will appear in the Chrome toolbar.
