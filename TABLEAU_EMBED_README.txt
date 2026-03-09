KLARA OS — Tableau embed (Dashboard B / Gurobi)

To show your classmate's "Gurobi solution enhanced" Tableau in the narrative:

1. Get the Tableau *embed* URL from your classmate.
   - In Tableau Public: Share → Embed → copy the iframe src (starts with https://public.tableau.com/views/...?:embed=yes).

2. In klara-os-narrative.html, find this line (search for "KLARA Routing / Gurobi Dashboard"):
   <iframe src="https://public.tableau.com/views/SystemPressureVisuals/Dashboard1?:embed=yes&:toolbar=no&:showVizHome=no" ... title="KLARA Routing / Gurobi Dashboard">

3. Replace the src="..." value with the classmate's embed URL. Leave the rest of the iframe unchanged.

Dashboard A (System Pressure) already uses your Tableau view. Dashboard B will then show the Gurobi-enhanced view when you paste the embed URL.
