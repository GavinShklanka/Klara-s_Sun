/**
 * Command Center — Provincial Operations Dashboard.
 * Reads existing API data only. No changes to klara_core (routing, optimization, decision_graph, schemas).
 */

(function () {
    'use strict';

    function esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function loadDemandPressure() {
        if (typeof KlaraMap === 'undefined') return;
        try {
            const res = await fetch('/api/demand-pressure');
            const data = await res.json();
            const pressure = data.pressure || {};
            const nodes = KlaraMap.getNodesById && KlaraMap.getNodesById();
            if (!nodes) return;
            const arr = [];
            for (const id in pressure) {
                const n = nodes[id];
                if (n && n.lon != null && n.lat != null) {
                    arr.push({
                        position: [n.lon, n.lat],
                        weight: pressure[id]
                    });
                }
            }
            if (KlaraMap.setPressureData) KlaraMap.setPressureData(arr);
        } catch (e) {
            console.warn('Demand pressure load failed:', e);
        }
    }

    async function loadPathwayStats() {
        const canvas = document.getElementById('cc-pathways-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        try {
            const res = await fetch('/api/requests');
            const data = await res.json();
            const requests = data.requests || [];
            const counts = {};
            requests.forEach(function (r) {
                const p = r.pathway || 'unknown';
                counts[p] = (counts[p] || 0) + 1;
            });
            const labels = Object.keys(counts);
            const values = Object.values(counts);
            if (labels.length === 0) {
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                return;
            }
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: '#3a78b4'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        } catch (e) {
            console.warn('Pathway stats load failed:', e);
        }
    }

    async function loadCongestion() {
        const canvas = document.getElementById('cc-congestion-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        try {
            const res = await fetch('/admin/metrics');
            const data = await res.json();
            const routing = data.routing || {};
            const labels = Object.keys(routing);
            const values = Object.values(routing);
            if (labels.length === 0) {
                return;
            }
            new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: ['#1f4f82', '#3a78b4', '#79aee6', '#b3d4f0', '#6b7c8f']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right' } }
                }
            });
        } catch (e) {
            console.warn('Congestion load failed:', e);
        }
    }

    async function loadRoutingTable() {
        const table = document.getElementById('cc-routing-table');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        try {
            const res = await fetch('/api/requests');
            const data = await res.json();
            const rows = data.requests || [];
            const slice = rows.slice(-20).reverse();
            if (slice.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3">No recent requests. Data from /api/requests.</td></tr>';
                return;
            }
            tbody.innerHTML = slice.map(function (r) {
                return '<tr><td>' + esc(r.session_id || '—') + '</td><td>' + esc(r.pathway || '—') + '</td><td>' + esc(r.region || '—') + '</td></tr>';
            }).join('');
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="3">Could not load requests.</td></tr>';
        }
    }

    function renderScenarioResult(data) {
        const el = document.getElementById('cc-scenario-result');
        if (!el) return;
        if (!data || typeof data !== 'object') {
            el.innerHTML = '<p class="cc-scenario-error">No result.</p>';
            return;
        }
        const parts = [];
        if (data.scenario) parts.push('<strong>' + esc(data.scenario) + '</strong>');
        if (data.region) parts.push('Region: ' + esc(data.region));
        if (data.estimated_patients_served != null) parts.push('Patients served (est.): ' + data.estimated_patients_served);
        if (data.system_strain_change != null) parts.push('System strain change: ' + data.system_strain_change);
        if (data.er_overflow_reduction_pct != null) parts.push('ER overflow reduction: ' + data.er_overflow_reduction_pct + '%');
        if (data.estimated_overflow_change != null) parts.push('Overflow change: ' + data.estimated_overflow_change);
        if (data.estimated_rural_access_improvement != null) parts.push('Rural access improvement: ' + (data.estimated_rural_access_improvement * 100) + '%');
        if (data.notes && data.notes.length) parts.push('<ul>' + data.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>');
        el.innerHTML = '<div class="cc-scenario-output">' + parts.join('<br>') + '</div>';
    }

    function runScenario(endpoint, params) {
        const qs = (params || []).map(function (p) { return p.key + '=' + encodeURIComponent(p.val); }).join('&');
        const url = qs ? endpoint + '?' + qs : endpoint;
        fetch(url).then(function (r) { return r.json(); }).then(renderScenarioResult).catch(function (e) {
            var el = document.getElementById('cc-scenario-result');
            if (el) el.innerHTML = '<p class="cc-scenario-error">Request failed: ' + esc(String(e)) + '</p>';
        });
    }

    function initScenarioControls() {
        var regionInput = document.getElementById('cc-scenario-region');
        function getRegion() { return (regionInput && regionInput.value) || 'Cape Breton'; }
        document.getElementById('cc-scenario-physicians') && document.getElementById('cc-scenario-physicians').addEventListener('click', function () {
            runScenario('/api/scenario/physicians', [{ key: 'region', val: getRegion() }, { key: 'additional_physicians', val: '10' }]);
        });
        document.getElementById('cc-scenario-er') && document.getElementById('cc-scenario-er').addEventListener('click', function () {
            runScenario('/api/scenario/er_capacity', [{ key: 'region', val: getRegion() }, { key: 'capacity_change_pct', val: '-10' }]);
        });
        document.getElementById('cc-scenario-demand') && document.getElementById('cc-scenario-demand').addEventListener('click', function () {
            runScenario('/api/scenario/demand_spike', [{ key: 'region', val: getRegion() }, { key: 'demand_increase_pct', val: '20' }]);
        });
        document.getElementById('cc-scenario-transport') && document.getElementById('cc-scenario-transport').addEventListener('click', function () {
            runScenario('/api/scenario/transport', [{ key: 'region', val: getRegion() }, { key: 'enable', val: 'true' }]);
        });
    }

    function run() {
        const mapEl = document.getElementById('cc-pressure-map');
        if (mapEl && typeof KlaraMap !== 'undefined' && KlaraMap.init) {
            KlaraMap.init('cc-pressure-map', {}).then(loadDemandPressure).catch(function () {});
        } else {
            loadDemandPressure();
        }
        loadPathwayStats();
        loadCongestion();
        loadRoutingTable();
        initScenarioControls();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
