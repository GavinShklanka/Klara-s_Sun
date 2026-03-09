# Upload dashboards so they load on GitHub Pages

Your narrative lives at **https://gavinshklanka.github.io/klara-os-narrative/** (repo: `klara-os-narrative`). For the Evidence section dashboards to load there, the dashboard files must be in **the same repo and the same folder** as the main page.

## 1. What to upload

Put these three files in the **root** of your **klara-os-narrative** repo (same folder as `index.html`):

| File | Purpose |
|------|--------|
| `index.html` | Your narrative page (copy from `klara-os-narrative.html` if the repo currently has different content) |
| `simple_routing_dashboard(1)W.html` | Dashboard A — Patient Care Pathway / System Pressure |
| `klara_charts_dashboardW.html` | Dashboard B — KLARA Routing / Gurobi |

The narrative already uses **relative** paths (`simple_routing_dashboard.html`, `klara_charts_dashboard.html`), so once these files are in the repo root they will work on GitHub Pages with no code changes.

## 2. Where to upload (GitHub)

1. Open **https://github.com/GavinShklanka/klara-os-narrative** (or gavinshklanka/klara-os-narrative).
2. Make sure the repo has an `index.html` that is your full narrative (rename or replace with your local `klara-os-narrative.html` if needed).
3. In the **repo root**, add the two dashboard files:
   - **Add file → Upload files**
   - Upload `simple_routing_dashboard(1)W.html` and `klara_charts_dashboardW.html` from:
     - `c:\Users\gshk0\Downloads\Klara_Final\cgi klara\`
4. Commit (e.g. message: "Add dashboard HTMLs for Evidence section").
5. If you use GitHub Pages from the same repo, the next publish will serve:
   - https://gavinshklanka.github.io/klara-os-narrative/
   - https://gavinshklanka.github.io/klara-os-narrative/simple_routing_dashboard(1)W.html
   - https://gavinshklanka.github.io/klara-os-narrative/klara_charts_dashboardW.html

## 3. Using Git from this laptop

From the folder that has your narrative and dashboards:

```powershell
cd "c:\Users\gshk0\Downloads\Klara_Final\cgi klara"

# If you have a clone of klara-os-narrative elsewhere, copy files into it then push:
# copy klara-os-narrative.html C:\path\to\klara-os-narrative\index.html
# copy simple_routing_dashboard(1)W.html C:\path\to\klara-os-narrative\
# copy klara_charts_dashboardW.html C:\path\to\klara-os-narrative\
# cd C:\path\to\klara-os-narrative
# git add index.html simple_routing_dashboard(1)W.html klara_charts_dashboardW.html
# git commit -m "Add dashboards for Evidence section"
# git push origin main
```

Or clone the repo here, copy the three files in, then push:

```powershell
cd "c:\Users\gshk0\Downloads\Klara_Final\cgi klara"
git clone https://github.com/GavinShklanka/klara-os-narrative.git klara-os-narrative-repo
Copy-Item klara-os-narrative.html klara-os-narrative-repo\index.html -Force
Copy-Item simple_routing_dashboard(1)W.html klara_charts_dashboardW.html klara-os-narrative-repo\
cd klara-os-narrative-repo
git add index.html simple_routing_dashboard(1)W.html klara_charts_dashboardW.html
git status
git commit -m "Add narrative and Evidence section dashboards"
git push origin main
```

## 4. Paths in the narrative (no change needed)

The iframes in your narrative already use:

- `src="simple_routing_dashboard(1)W.html"`
- `src="klara_charts_dashboardW.html"`

Those are **relative** URLs, so they work on any host (this laptop or GitHub Pages) as long as the two dashboard files sit **next to** the page that contains the iframes (e.g. next to `index.html`). No need to switch to full GitHub URLs unless you later put the dashboards in a different repo or path.

After push, open **https://gavinshklanka.github.io/klara-os-narrative/#evidence** and the Evidence section should load both dashboards.
