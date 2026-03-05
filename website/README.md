# Website (Static, Vercel Ready)

This folder contains a static product landing site for Link Visit Counter.

## Deploy on Vercel

1. Import this repository in Vercel.
2. In project settings, set **Root Directory** to `/website`.
3. Build command: **none** (leave empty).
4. Output directory: **/**.
5. Deploy.

## Replace screenshots

1. Capture extension screenshots from the popup UI.
2. Replace files in `website/assets/screenshots/` using the same names:
   - `popup-overview.svg`
   - `ticker.svg`
   - `weekly.svg`
   - `settings-theme.svg`
3. Keep filenames unchanged so no HTML edits are needed.

## Change accent color

Edit `--accent` in `website/styles.css` under the `:root` variables.
