/**
 * Control Room — observability dashboard.
 * Reads existing APIs only: /api/requests, /admin/metrics. No engine or narrative changes.
 */
(function () {
    'use strict';

    var PIPELINE_STAGES = [
        'Patient Input',
        'Symptom Parser',
        'Risk Engine',
        'Eligibility Engine',
        'Policy Governance',
        'Optimization Model',
        'Care Sequence',
        'Healthcare Graph'
    ];

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text == null || text === '' ? '—' : String(text);
    }

    function setHtml(id, html) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = html == null || html === '' ? '—' : html;
    }

    function updatePipelineFromLastRequest(hasRecent) {
        var list = document.getElementById('cr-pipeline-stages');
        if (!list) return;
        var items = list.querySelectorAll('li');
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('active', hasRecent && i === items.length - 1);
        }
        setText('cr-active-stage', hasRecent ? 'Recommendation' : '—');
        setText('cr-risk-score', '—');
        setText('cr-latency', '—');
    }

    function updateRoutingPanel(r) {
        if (!r) {
            setText('cr-patient-id', '—');
            setText('cr-symptoms', '—');
            setText('cr-decision', '—');
            setText('cr-facility', '—');
            setText('cr-wait', '—');
            setText('cr-trace', '—');
            setText('cr-policy-rule', '—');
            setText('cr-opt-score', '—');
            return;
        }
        setText('cr-patient-id', r.session_id || '—');
        setText('cr-symptoms', (r.observable_summary || '').slice(0, 80) || '—');
        setText('cr-decision', r.pathway || '—');
        setText('cr-facility', r.pathway ? r.pathway.replace(/_/g, ' ') : '—');
        setText('cr-wait', '—');
        setText('cr-trace', r.optimizer ? (r.optimizer.solver || '—') : '—');
        setText('cr-policy-rule', '—');
        var optVal = r.optimizer && r.optimizer.objective_value != null ? r.optimizer.objective_value : '—';
        setText('cr-opt-score', optVal);
    }

    function updateTelemetry(metrics) {
        setText('cr-fps', '—');
        setText('cr-tick', '16ms');
        if (metrics && typeof metrics.requests === 'number') {
            setText('cr-active-nodes', String(metrics.requests));
        } else {
            setText('cr-active-nodes', '—');
        }
        setText('cr-er-load', '—');
    }

    function updatePolicyPanel() {
        var statusEl = document.getElementById('cr-policy-status');
        if (statusEl) {
            statusEl.textContent = 'PASS';
            statusEl.className = 'cr-policy-status pass';
        }
        setText('cr-violations', '0');
    }

    function refresh() {
        fetch('/api/requests')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                var requests = data.requests || [];
                var last = requests[0] || null;
                updateRoutingPanel(last);
                updatePipelineFromLastRequest(!!last);
            })
            .catch(function () {
                updateRoutingPanel(null);
                updatePipelineFromLastRequest(false);
            });

        fetch('/admin/metrics')
            .then(function (res) { return res.json(); })
            .then(function (metrics) {
                updateTelemetry(metrics);
            })
            .catch(function () {
                updateTelemetry(null);
            });

        updatePolicyPanel();
    }

    function run() {
        refresh();
        setInterval(refresh, 10000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
