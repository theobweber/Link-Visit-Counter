# Website (Static, Vercel Ready)

This folder contains a static product landing site for Link Visit Tracker.

## Deploy on Vercel

1. Import this repository in Vercel.
2. In project settings, set **Root Directory** to `/website`.
3. Build command: **none** (leave empty).
4. Output directory: **/**.
5. Deploy.

## Replace screenshots

1. Capture extension screenshots from the popup UI.
2. Replace files in `website/assets/screenshots/` using the same names:
   - `popup-overview-top` (hero preview)
   - `popup-overview` (screenshots section)
   - `ticker`
   - `weekly`
   - `settings-theme`
3. Keep filenames unchanged so no HTML edits are needed.

## Change accent color

Edit `--accent` in `website/styles.css` under the `:root` variables.


You can replace placeholders in two ways:

- **Auto GIF override (recommended):** add a GIF with the same base filename, e.g. `popup-overview-top.gif`. The page auto-detects it and uses it for that exact slot.
- **Direct file replacement:** replace the default `.svg` file with another file using the same filename/path if you prefer static images.
