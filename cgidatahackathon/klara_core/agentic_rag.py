"""
KLARA OS — Agentic RAG retrieval helpers.

This module provides best-effort retrieval against configured medical APIs:
- Europe PMC (Medline literature proxy)
- MedlinePlus (NLM health topics — symptom-focused)
- OpenFDA
- RxNorm
- BioPortal

All retrieval is non-blocking for pipeline continuity:
errors are swallowed and represented as empty source lists.
"""

from __future__ import annotations

import json
import os
import re
import xml.etree.ElementTree as ET
import urllib.parse
import urllib.request
from typing import Dict, List


def _get_json(url: str, timeout: float = 4.0) -> Dict:
    req = urllib.request.Request(url, headers={"User-Agent": "klara-os/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read().decode("utf-8")
    return json.loads(data) if data else {}


def _safe_title_excerpt(text: str, max_len: int = 220) -> str:
    if not text:
        return ""
    text = " ".join(text.split())
    return text[:max_len] + ("..." if len(text) > max_len else "")


# In-memory cache for MedlinePlus (avoids repeated NLM calls)
_MEDLINEPLUS_CACHE: Dict[str, List[Dict]] = {}


def fetch_medlineplus_sources(query: str, max_topics: int = 5) -> List[Dict[str, str]]:
    """
    MedlinePlus NLM health topics search (symptom-focused).
    Uses https://wsearch.nlm.nih.gov/ws/query with db=healthTopics.
    Returns list of {title, url, excerpt}.
    """
    cache_key = f"mplus::{query}::{max_topics}"
    if cache_key in _MEDLINEPLUS_CACHE:
        return _MEDLINEPLUS_CACHE[cache_key]
    params = {
        "db": "healthTopics",
        "term": query,
        "retmax": str(max_topics),
    }
    qs = urllib.parse.urlencode(params)
    url = f"https://wsearch.nlm.nih.gov/ws/query?{qs}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "klara-os-agentic-rag/1.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return []
    out = []
    try:
        root = ET.fromstring(raw)
        ns = {"nlm": "http://www.nlm.nih.gov/medline/ws/result"} if "nlm" in raw[:500] else {}
        docs = root.findall(".//document") or root.findall(".//{*}document")
        for doc in docs[:max_topics]:
            url_el = doc.find("url") or doc.find("{*}url")
            url_val = (url_el.text or "").strip() if url_el is not None else ""
            if not url_val:
                continue
            contents = doc.findall("content") or doc.findall("{*}content")
            title = ""
            snippet = ""
            for c in contents:
                name = c.get("name") or c.get("{http://www.nlm.nih.gov/medline/ws/result}name", "")
                txt = (c.text or "").strip()
                if "title" in str(name).lower():
                    title = txt
                elif "snippet" in str(name).lower():
                    snippet = txt
            if not title and snippet:
                title = snippet[:80] + ("..." if len(snippet) > 80 else "")
            if not title:
                title = query
            out.append({
                "title": f"MedlinePlus: {title}",
                "url": url_val,
                "excerpt": _safe_title_excerpt(snippet or title, 200),
            })
    except ET.ParseError:
        # Fallback: regex extract from XML-ish response
        for m in re.finditer(r'<url[^>]*>([^<]+)</url>', raw[:8000]):
            url_val = m.group(1).strip()
            if url_val and url_val.startswith("http"):
                out.append({
                    "title": f"MedlinePlus: {query}",
                    "url": url_val,
                    "excerpt": f"Health topic match for '{query}'.",
                })
                if len(out) >= max_topics:
                    break
    _MEDLINEPLUS_CACHE[cache_key] = out
    return out


def fetch_europe_pmc_sources(query: str, page_size: int = 3) -> List[Dict[str, str]]:
    base_url = os.getenv("EUROPE_PMC_BASE_URL", "https://www.ebi.ac.uk/europepmc/webservices/rest")
    q = urllib.parse.quote(query or "primary care triage")
    url = f"{base_url}/search?query={q}&format=json&pageSize={page_size}"
    try:
        payload = _get_json(url)
        results = payload.get("resultList", {}).get("result", []) or []
        out = []
        for r in results[:page_size]:
            title = r.get("title") or "Europe PMC result"
            src_url = r.get("fullTextUrlList", {}).get("fullTextUrl", [])
            if isinstance(src_url, list) and src_url:
                src_url = src_url[0].get("url", "")
            if not src_url:
                src_url = r.get("doi", "")
                if src_url:
                    src_url = f"https://doi.org/{src_url}"
            excerpt = _safe_title_excerpt(r.get("abstractText", ""))
            out.append({"title": title, "url": src_url or "https://www.ebi.ac.uk/europepmc/", "excerpt": excerpt})
        return out
    except Exception:
        return []


def fetch_openfda_signal(query: str) -> List[Dict[str, str]]:
    key = os.getenv("OPENFDA_API_KEY", "").strip()
    if not key:
        return []
    q = urllib.parse.quote(query or "fever")
    url = f"https://api.fda.gov/drug/event.json?api_key={key}&search=patient.reaction.reactionmeddrapt:{q}&limit=1"
    try:
        payload = _get_json(url)
        if payload.get("results"):
            return [{
                "title": "OpenFDA safety signal",
                "url": "https://api.fda.gov/",
                "excerpt": f"OpenFDA returned safety signal data for query '{query}'."
            }]
        return []
    except Exception:
        return []


def fetch_rxnorm_signal(term: str) -> List[Dict[str, str]]:
    base = os.getenv("RXNORM_BASE_URL", "https://rxnav.nlm.nih.gov/REST").rstrip("/")
    q = urllib.parse.quote(term or "acetaminophen")
    url = f"{base}/drugs.json?name={q}"
    try:
        payload = _get_json(url)
        group = payload.get("drugGroup", {})
        if group.get("conceptGroup"):
            return [{
                "title": "RxNorm concept match",
                "url": "https://rxnav.nlm.nih.gov/",
                "excerpt": f"RxNorm concept groups found for term '{term}'."
            }]
        return []
    except Exception:
        return []


def fetch_bioportal_signal(term: str) -> List[Dict[str, str]]:
    key = os.getenv("BIOPORTAL_API_KEY", "").strip()
    if not key:
        return []
    q = urllib.parse.quote(term or "headache")
    url = f"https://data.bioontology.org/search?q={q}&apikey={key}"
    try:
        payload = _get_json(url)
        collection = payload.get("collection", [])
        if collection:
            first = collection[0]
            return [{
                "title": "BioPortal ontology concept",
                "url": first.get("@id", "https://data.bioontology.org/"),
                "excerpt": _safe_title_excerpt(first.get("prefLabel", "Ontology concept available."))
            }]
        return []
    except Exception:
        return []


def retrieve_rag_context(text: str, symptoms: List[str], symptom_selections: List[str] | None = None) -> List[Dict]:
    """
    Stage: ELIGIBILITY + RAG_RETRIEVE evidence fetch.
    symptom_selections: from UI dropdown — signals RAG for easy AI interpretation.
    """
    query = text or "healthcare navigation triage"
    if symptom_selections:
        query = f"{query} {' '.join(symptom_selections)}"
    term = (symptoms + (symptom_selections or []))[0] if (symptoms or symptom_selections) else "general symptom"

    sources = []
    sources.extend(fetch_medlineplus_sources(query, max_topics=3))
    sources.extend(fetch_europe_pmc_sources(query))
    sources.extend(fetch_openfda_signal(term))
    sources.extend(fetch_rxnorm_signal(term))
    sources.extend(fetch_bioportal_signal(term))

    rag_context = []
    for idx, src in enumerate(sources):
        rag_context.append({
            "source": src.get("title", f"source_{idx+1}"),
            "content": src.get("excerpt", ""),
            "relevance": max(0.5, 1.0 - idx * 0.1),
            "url": src.get("url", ""),
            "title": src.get("title", ""),
        })
    return rag_context

