# Link Visit Counter

The Link Visit Counter is a Chrome extension that tracks how often you visit websites, how long you stay on them, and gives you offline productivity insights while keeping domain-level transparency.

**Features:**

**Domain + Category Tracking:**

- Keeps each domain individually visible (for example: youtube.com, github.com, reddit.com).

- Groups domains by category with local default mapping:

  - Work

  - Learning

  - Social Media

  - Entertainment

  - News

  - Other

- Allows manual domain reassignment and custom category creation.

**Daily, Weekly, and Total Views:**

- Daily Tab: Shows today’s domain activity with visits/time and category grouping.

- Weekly Tab: Shows the last 7 days, category/domain totals, and period comparison.

- Total Tab: Shows cumulative totals from local stored records.

**Productivity Insights (Local Only):**

- Focus score calculation based on productive vs distracting categories.

- Longest focus session and total tab switches.

- Optional focus session mode (25/45/60 minutes) with gentle notifications.

**Time Accuracy + Goals:**

- Automatic session timing per tab and domain.

- Idle detection (60s) pauses tracking to avoid counting inactive time.

- Daily goals for domains/categories with optional notifications and popup highlighting.

**Data Tools (Offline):**

- Export all data as JSON.

- Import JSON backup.

- Clear all local data.

**Privacy and Cost:**

- 100% free.

- No server, no accounts, no cloud database, no paid APIs.

- Data is stored locally using `chrome.storage.local`.

**Installation:**

- Download or clone this repository.

- Open Chrome and go to chrome://extensions/.

- Enable Developer mode (toggle in the top-right corner).

- Click Load unpacked and select the extension folder.

**The extension will appear in your Chrome toolbar.**
