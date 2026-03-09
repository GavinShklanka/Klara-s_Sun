/**
 * KLARA OS — Clinician Command Center dashboard.
 * All data from existing APIs; backend routing contract unchanged.
 * primary_pathway, options, care_sequence, optimizer metadata read as returned.
 */

(function () {
    'use strict';

    var NS_CENTER = [-63.5752, 44.6488];
    var DEFAULT_ZOOM = 6;
    var nodesById = {};
    var nodesArray = [];
    var currentCareSequence = [];
    var lastOptimizer = null;

    var NODE_COLORS = {
        hospital: [220, 53, 69],
        lab: [13, 110, 253],
        pharmacy: [25, 135, 84],
        community_health: [111, 66, 193],
        telehealth: [253, 126, 20],
        mental_health: [214, 51, 132],
        primary_care: [32, 201, 151],
        imaging: [102, 126, 234],
        specialist: [253, 151, 31],
        transport: [108, 117, 125]
    };
    function colorForType(t) { return NODE_COLORS[t] || [108, 117, 125]; }

    function loadNodes() {
        return fetch('/api/ns-healthcare-nodes')
            .then(function (r) { return r.ok ? r.json() : { nodes: [] }; })
            .then(function (data) {
                var nodes = data.nodes || [];
                nodesById = {};
                nodesArray = nodes.map(function (n) {
                    nodesById[n.id] = n;
                    return {
                        id: n.id,
                        name: n.name,
                        type: n.type || 'unknown',
                        position: [n.lon, n.lat],
                        lat: n.lat,
                        lon: n.lon,
                        region: n.region,
                        color: colorForType(n.type)
                    };
                });
                return nodesArray;
            });
    }

    function loadMetrics() {
        return fetch('/admin/metrics')
            .then(function (r) { return r.ok ? r.json() : {}; });
    }

    function careSequenceToPath(seq) {
        if (!seq || !seq.length) return null;
        var path = [];
        for (var i = 0; i < seq.length; i++) {
            var n = nodesById[seq[i]];
            if (n && n.lon != null && n.lat != null) path.push([n.lon, n.lat]);
        }
        return path.length >= 2 ? path : null;
    }

    function buildDemandHeatmapData(metrics) {
        var routing = (metrics && metrics.routing) || {};
        var total = Math.max(1, Object.keys(routing).reduce(function (s, k) { return s + (routing[k] || 0); }, 0));
        var points = [];
        nodesArray.forEach(function (n, i) {
            var weight = 0.5;
            if (n.type === 'telehealth') weight += (routing['811'] || 0) / total + (routing['virtualcarens'] || 0) / total;
            if (n.type === 'hospital') weight += (routing['urgent'] || 0) / total + (routing['emergency'] || 0) / total;
            if (n.type === 'pharmacy') weight += (routing['pharmacy'] || 0) / total;
            if (n.type === 'community_health') weight += (routing['community_health'] || 0) / total;
            if (n.region && n.region !== 'Halifax') weight += 0.3;
            points.push({ position: n.position, weight: Math.min(2, 0.3 + weight) });
        });
        return points;
    }

    function buildLayers(metrics) {
        var layers = [];
        var demandData = buildDemandHeatmapData(metrics);
        if (typeof deck !== 'undefined' && demandData.length) {
            if (deck.HeatmapLayer) {
                layers.push(new deck.HeatmapLayer({
                    id: 'demand-heatmap',
                    data: demandData,
                    getPosition: function (d) { return d.position; },
                    getWeight: function (d) { return d.weight; },
                    radiusPixels: 80,
                    intensity: 1,
                    threshold: 0.05,
                    colorRange: [[255, 255, 178, 0], [254, 204, 92, 120], [253, 141, 60, 160], [240, 59, 32, 200], [189, 0, 38, 255]]
                }));
            } else {
                layers.push(new deck.ScatterplotLayer({
                    id: 'demand-clusters',
                    data: demandData,
                    getPosition: function (d) { return d.position; },
                    getRadius: 1200,
                    getFillColor: [255, 193, 7, 80],
                    radiusMinPixels: 8,
                    radiusMaxPixels: 24,
                    pickable: false
                }));
            }
        }
        if (nodesArray.length && deck.ScatterplotLayer) {
            layers.push(new deck.ScatterplotLayer({
                id: 'ns-nodes',
                data: nodesArray,
                getPosition: function (d) { return d.position; },
                getColor: function (d) { return d.color; },
                getRadius: 450,
                radiusMinPixels: 5,
                radiusMaxPixels: 16,
                pickable: true
            }));
        }
        var path = careSequenceToPath(currentCareSequence);
        if (path && deck.PathLayer) {
            layers.push(new deck.PathLayer({
                id: 'care-sequence-route',
                data: [{ path: path }],
                getPath: function (d) { return d.path; },
                getColor: [0, 180, 216],
                getWidth: 4,
                widthMinPixels: 2,
                widthMaxPixels: 10,
                capRounded: true,
                joinRounded: true
            }));
        }
        return layers;
    }

    function initMap(metrics) {
        var container = document.getElementById('cc-map');
        if (!container || typeof deck === 'undefined' || !deck.Deck) return;
        container.innerHTML = '';
        var viewState = {
            longitude: NS_CENTER[0],
            latitude: NS_CENTER[1],
            zoom: DEFAULT_ZOOM,
            pitch: 0,
            bearing: 0
        };
        fetch('/api/config').then(function (r) { return r.ok ? r.json() : {}; }).then(function (config) {
            var token = config.mapbox_access_token || '';
            if (token && typeof mapboxgl !== 'undefined' && mapboxgl.Map) {
                mapboxgl.accessToken = token;
                var map = new mapboxgl.Map({
                    container: 'cc-map',
                    style: 'mapbox://styles/mapbox/light-v11',
                    center: NS_CENTER,
                    zoom: DEFAULT_ZOOM
                });
                map.on('load', function () {
                    if (deck.MapboxOverlay) {
                        var overlay = new deck.MapboxOverlay({
                            interleaved: true,
                            layers: buildLayers(metrics)
                        });
                        map.addControl(overlay);
                        window._ccMapOverlay = overlay;
                        window._ccMetrics = metrics;
                    }
                });
            } else {
                var deckInstance = new deck.Deck({
                    canvas: container,
                    initialViewState: viewState,
                    controller: true,
                    layers: buildLayers(metrics),
                    getTooltip: function (info) {
                        return info.object && info.object.name ? info.object.name : null;
                    }
                });
                window._ccDeck = deckInstance;
                window._ccMetrics = metrics;
            }
        });
    }

    function updatePanels(metrics) {
        metrics = metrics || {};
        var sessions = metrics.sessions != null ? metrics.sessions : 0;
        var requests = metrics.requests != null ? metrics.requests : 0;
        var routing = metrics.routing || {};
        var telehealth = (routing['811'] || 0) + (routing['virtualcarens'] || 0);

        var el = document.getElementById('cc-sessions');
        if (el) el.textContent = sessions;
        el = document.getElementById('cc-requests');
        if (el) el.textContent = requests;
        el = document.getElementById('cc-rural-demand');
        if (el) el.textContent = (routing['community_health'] || 0) + (routing['primarycare'] || 0) + ' (routing)';
        el = document.getElementById('cc-barriers-count');
        if (el) el.textContent = '0';
        el = document.getElementById('cc-telehealth-volume');
        if (el) el.textContent = telehealth;
    }

    function updateOptimizationPanel() {
        var opt = lastOptimizer || JSON.parse(localStorage.getItem('klara_last_optimizer') || 'null');
        var solverEl = document.getElementById('cc-opt-solver');
        var timeEl = document.getElementById('cc-opt-solve-time');
        var objEl = document.getElementById('cc-opt-objective');
        var rankEl = document.getElementById('cc-opt-ranking');
        if (solverEl) solverEl.textContent = opt && opt.solver ? opt.solver : '—';
        if (timeEl) timeEl.textContent = opt && opt.solve_time_ms != null ? opt.solve_time_ms.toFixed(1) : '—';
        if (objEl) objEl.textContent = opt && opt.objective_value != null ? opt.objective_value.toFixed(2) : '—';
        if (rankEl) rankEl.textContent = opt && opt.pathway_ranking && opt.pathway_ranking.length ? opt.pathway_ranking.join(' → ') : '—';
    }

    function updateBarriersTable() {
        var tbody = document.getElementById('cc-barriers-tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" class="cc-empty">No access barriers reported. Data from existing API when available.</td></tr>';
    }

    function loadRequests(query) {
        var searchQ = (query && String(query).trim()) || '';
        var url = '/api/requests';
        if (searchQ) url += '?request_id=' + encodeURIComponent(searchQ) + '&patient_id=' + encodeURIComponent(searchQ);
        return fetch(url).then(function (r) { return r.ok ? r.json() : { requests: [] }; }).then(function (data) {
            var tbody = document.getElementById('cc-requests-tbody');
            if (!tbody) return;
            var reqs = data.requests || [];
            if (reqs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="cc-empty">No requests found.' + (searchQ ? ' Try a different session or patient ID.' : '') + '</td></tr>';
            } else {
                tbody.innerHTML = reqs.map(function (r) {
                    return '<tr><td>' + esc(r.session_id || '—') + '</td><td>' + esc(r.pathway || '—') + '</td><td>' + esc(r.region || '—') + '</td><td>' + (r.timestamp ? new Date(r.timestamp).toLocaleString() : '—') + '</td></tr>';
                }).join('');
            }
        }).catch(function () {
            var tbody = document.getElementById('cc-requests-tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="cc-empty">Could not load requests.</td></tr>';
        });
    }
    function esc(s) { if (s == null) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function refreshMapLayers(metrics) {
        metrics = metrics || window._ccMetrics || {};
        var layers = buildLayers(metrics);
        if (window._ccMapOverlay && window._ccMapOverlay.setProps) {
            window._ccMapOverlay.setProps({ layers: layers });
        }
        if (window._ccDeck && window._ccDeck.setProps) {
            window._ccDeck.setProps({ layers: layers });
        }
        window._ccMetrics = metrics;
    }

    function run() {
        try {
            var saved = localStorage.getItem('klara_last_care_sequence');
            if (saved) currentCareSequence = JSON.parse(saved);
        } catch (_) {}
        loadRequests();
        var searchInput = document.getElementById('cc-request-search');
        var searchBtn = document.getElementById('cc-request-search-btn');
        if (searchInput && searchBtn) {
            function doSearch() { loadRequests(searchInput.value.trim()); }
            searchBtn.addEventListener('click', doSearch);
            searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
        }
        loadNodes().then(function () {
            return loadMetrics();
        }).then(function (metrics) {
            updatePanels(metrics);
            initMap(metrics);
            updateOptimizationPanel();
            updateBarriersTable();
            setInterval(function () {
                loadMetrics().then(function (m) {
                    updatePanels(m);
                    refreshMapLayers(m);
                });
            }, 5000);
        }).catch(function (e) {
            console.warn('Command Center init:', e);
            updatePanels({});
            updateOptimizationPanel();
            updateBarriersTable();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }

    window.KlaraCommandCenter = {
        setLastOptimizer: function (optimizer) {
            lastOptimizer = optimizer;
            if (optimizer) try { localStorage.setItem('klara_last_optimizer', JSON.stringify(optimizer)); } catch (_) {}
            updateOptimizationPanel();
        },
        setCareSequence: function (seq) {
            currentCareSequence = seq || [];
            refreshMapLayers(window._ccMetrics);
        }
    };
})();
