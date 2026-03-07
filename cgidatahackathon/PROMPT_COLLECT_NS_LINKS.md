# Prompt: Collect Nova Scotia healthcare location links for KLARA

Use this to gather official URLs so we can plug them into the app (dashboard “How to get there” and “Your Options” → real NS services).

## What to collect

For each **pathway** below, provide:

1. **Official finder or list page**  
   - One URL where Nova Scotians can find locations (e.g. “Find a pharmacy”, “Urgent treatment centres”, “Community health centres”).
2. **Optional: 2–3 direct location URLs**  
   - Specific facilities (e.g. a major pharmacy chain’s NS page, a specific UTC or community health centre) if useful.

## Pathways and suggested sources

| Pathway           | What to collect |
|-------------------|------------------|
| **Pharmacy**      | NS pharmacy finder or list; Pharmacists Association of NS; any regional pharmacy list. |
| **Primary care**  | NS Health “Find a physician” or family doctor finder; CPCN or other provincial primary care page. |
| **Urgent**        | NS Health list of Urgent Treatment Centres (with addresses/URLs if available). |
| **Community health** | NS Health Community Health Centres list; any page with locations and contact info. |
| **811**           | Official 811 Nova Scotia URL (already used: https://811.novascotia.ca/). |
| **VirtualCareNS** | VirtualCareNS registration and info (already used: NS Health virtualcarens page). |
| **Mental health** | NS Health Mental Health & Addictions; any official list of MH services/locations. |
| **Emergency**     | NS Health Emergency Departments list or main emergency info page. |

## Format to return

For each link, please provide:

- **Name** (short label for the UI, e.g. “Find a Pharmacy (NS)”).
- **URL** (full https link).
- **Type** (optional): `finder` | `list` | `service` | `info`.

Example:

```text
Pharmacy:
- Find a Pharmacy (NS) | https://www.novascotia.ca/dhw/pharmacies/ | finder
- Pharmacists Association of NS | https://www.pans.ns.ca/ | info
```

## Where these go in the app

- **Backend:** `main.py` → `NS_LOCATIONS` (per-pathway lists of `{ "name", "url", "type" }`).
- **Dashboard:** “How to get there” shows the main map link plus “Official Nova Scotia links” from `NS_LOCATIONS`.
- **Your Options:** “Get directions” opens a real-time Google Maps search; the option can also link to the pathway’s main NS URL from `PATHWAY_URLS` / `NS_LOCATIONS`.

Once you have the list, we can add or replace entries in `NS_LOCATIONS` and in `PATHWAY_URLS` so every pathway points to real Nova Scotia services.
