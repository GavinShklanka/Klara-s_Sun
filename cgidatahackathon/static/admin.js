/* ═══════════════════════════════════════════════════════════
   KLARA OS — Admin / Clinician Dashboard Logic
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    // ── DOM refs ──
    const form = document.getElementById('intake-form');
    const symptomInput = document.getElementById('symptom-input');
    const regionSelect = document.getElementById('region-select');
    const submitBtn = document.getElementById('submit-btn');
    const btnLabel = submitBtn.querySelector('.btn-label');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    const resultsPanel = document.getElementById('results-panel');
    const placeholder = document.getElementById('results-placeholder');
    const resultsContent = document.getElementById('results-content');

    // Pipeline
    const stages = document.querySelectorAll('.pipeline-stage');
    const connectors = document.querySelectorAll('.stage-connector');

    // Result elements
    const riskBanner = document.getElementById('risk-banner');
    const riskBadge = document.getElementById('risk-badge');
    const riskSubtitle = document.getElementById('risk-subtitle');
    const riskBar = document.getElementById('risk-bar');
    const cardPatient = document.getElementById('card-patient-body');
    const cardRouting = document.getElementById('card-routing-body');
    const cardContext = document.getElementById('card-context-body');
    const cardSummary = document.getElementById('card-summary-body');
    const cardFlags = document.getElementById('card-flags');
    const cardFlagsBody = document.getElementById('card-flags-body');
    const cardGov = document.getElementById('card-governance-body');
    const sessionIdEl = document.getElementById('session-id');

    // OPOR inputs
    const oporConditions = document.getElementById('opor-conditions');
    const oporMeds = document.getElementById('opor-meds');
    const oporEdVisits = document.getElementById('opor-ed-visits');

    // ── Guard against double-submit ──
    let isProcessing = false;

    // ── Demo Scenario Buttons ──
    // Buttons have type="button" so they do NOT trigger form submit.
    // We manually call runAssessment() after filling the fields.
    document.querySelectorAll('.demo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isProcessing) return;
            symptomInput.value = btn.dataset.text;
            regionSelect.value = btn.dataset.region;
            runAssessment();
        });
    });

    // ── Form Submission ──
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (isProcessing) return;
        runAssessment();
    });

    async function runAssessment() {
        const text = symptomInput.value.trim();
        const region = regionSelect.value;
        if (!text || !region || isProcessing) return;

        isProcessing = true;
        setLoading(true);
        resetPipeline();

        // Animate stage 1 immediately
        activateStage(1);

        // Build request body
        const body = { text, region };

        // Include OPOR context if any fields are filled
        const conditions = oporConditions.value.trim();
        const meds = oporMeds.value.trim();
        const edVisits = parseInt(oporEdVisits.value, 10) || 0;
        if (conditions || meds || edVisits > 0) {
            body.opor_context = {
                active_conditions: conditions ? conditions.split(',').map(s => s.trim()) : null,
                current_medications: meds ? meds.split(',').map(s => s.trim()) : null,
                prior_ed_visits: edVisits || null,
            };
        }

        try {
            // Staged pipeline simulation (800ms per stage — production demo feel)
            await sleep(800); activateStage(2);
            await sleep(800); activateStage(3);

            const res = await fetch('/assess', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) throw new Error(`Server responded ${res.status}`);
            const data = await res.json();

            // Finish pipeline animation
            activateStage(4);
            await sleep(800); activateStage(5);
            await sleep(800); activateStage(6);
            await sleep(800); activateStage(7);
            await sleep(400);

            renderResults(data);
        } catch (err) {
            console.error(err);
            alert('Assessment failed. Is the backend running?\n\n' + err.message);
        } finally {
            isProcessing = false;
            setLoading(false);
        }
    }

    // ── Pipeline Animation ──
    function resetPipeline() {
        stages.forEach(s => s.classList.remove('active'));
        connectors.forEach(c => c.classList.remove('filled'));
    }

    function activateStage(n) {
        const stage = document.querySelector(`.pipeline-stage[data-stage="${n}"]`);
        if (stage) stage.classList.add('active');
        if (n > 1) {
            const connIdx = n - 2;
            if (connectors[connIdx]) connectors[connIdx].classList.add('filled');
        }
    }

    // ── Render Results ──
    function renderResults(data) {
        placeholder.hidden = true;
        resultsContent.hidden = false;

        // Re-trigger animations
        resultsContent.style.animation = 'none';
        resultsContent.offsetHeight;
        resultsContent.style.animation = '';
        document.querySelectorAll('.result-card').forEach(card => {
            card.style.animation = 'none';
            card.offsetHeight;
            card.style.animation = '';
        });

        // Risk Banner
        const level = data.risk_assessment.level;
        const score = data.risk_assessment.score;
        riskBanner.dataset.level = level;
        riskBadge.textContent = formatLevel(level);
        riskSubtitle.textContent = `Score: ${score} / 100`;
        riskBar.style.width = `${score}%`;

        // Emergency Flags
        if (data.risk_assessment.emergency_flags.length > 0) {
            cardFlags.hidden = false;
            cardFlagsBody.innerHTML = data.risk_assessment.emergency_flags
                .map(f => `<div style="color:var(--risk-high);font-weight:600;">⚠ ${esc(f)}</div>`)
                .join('');
        } else {
            cardFlags.hidden = true;
        }

        // Patient Input Card
        cardPatient.innerHTML = `
            <p><strong>Symptoms:</strong> ${data.patient_input.symptoms.map(s => `<span class="option-tag">${esc(s)}</span>`).join(' ')}</p>
            <p style="margin-top:.5rem"><strong>Duration:</strong> ${data.patient_input.duration_hours} hours</p>
        `;

        // Routing Card
        const pillClass = level === 'high' ? 'emergency' : (level === 'mental_health' ? 'mental' : '');
        cardRouting.innerHTML = `
            <div class="pathway-pill ${pillClass}">${esc(data.routing_recommendation.primary_pathway)}</div>
            <p style="margin:.4rem 0">${esc(data.routing_recommendation.reason)}</p>
            <div>${data.routing_recommendation.options.map(o => `<span class="option-tag">${esc(o)}</span>`).join(' ')}</div>
        `;

        // Provincial Context Card
        if (data.provincial_context && data.provincial_context.capacity_snapshot) {
            const snap = data.provincial_context.capacity_snapshot;
            cardContext.innerHTML = `
                <div class="cap-grid">
                    <div class="cap-item"><span class="cap-label">ED Wait</span><span class="cap-value">${esc(snap.ed_wait || '—')}</span></div>
                    <div class="cap-item"><span class="cap-label">UTC Wait</span><span class="cap-value">${esc(snap.utc_wait || '—')}</span></div>
                    <div class="cap-item"><span class="cap-label">VirtualCare</span><span class="cap-value">${esc(snap.virtualcarens_wait || '—')}</span></div>
                    <div class="cap-item"><span class="cap-label">Pharmacy</span><span class="cap-value">${snap.pharmacy_available ? '✅ Available' : '❌ Unavailable'}</span></div>
                    <div class="cap-item"><span class="cap-label">Mental Health</span><span class="cap-value">${snap.mental_health_available ? '✅ Available' : '❌ Unavailable'}</span></div>
                    <div class="cap-item"><span class="cap-label">Community Health</span><span class="cap-value">${snap.community_health_available ? '✅ Available' : '❌ Unavailable'}</span></div>
                </div>
                ${data.provincial_context.policy_flags && data.provincial_context.policy_flags.length
                    ? `<p style="margin-top:.6rem;font-size:.72rem;color:var(--risk-moderate);">⚑ Policy flags: ${data.provincial_context.policy_flags.join(', ')}</p>`
                    : ''}
            `;
        } else {
            cardContext.innerHTML = '<p>No provincial context available.</p>';
        }

        // Clinician Summary Card
        cardSummary.innerHTML = `
            <p><strong>Symptoms:</strong> ${esc(data.structured_summary.symptoms)}</p>
            <p><strong>Duration:</strong> ${esc(data.structured_summary.duration)}</p>
            <p><strong>Risk:</strong> ${esc(data.structured_summary.risk)}</p>
            <p><strong>Recommended Pathway:</strong> ${esc(data.structured_summary.recommended_pathway)}</p>
        `;

        // Governance Card
        cardGov.innerHTML = `
            <p style="margin-bottom:.5rem"><strong>Confidence:</strong> ${(data.governance.confidence_score * 100).toFixed(0)}%</p>
            <ul class="audit-list">
                ${data.governance.audit_events.map(ev => `<li>${esc(ev)}</li>`).join('')}
            </ul>
        `;

        // Session ID
        sessionIdEl.textContent = `Session ID: ${data.session_id}`;

        // Clinician map: update care sequence route from existing API response (no backend change)
        if (typeof KlaraMap !== 'undefined') {
            const careSeq = data.routing_recommendation && data.routing_recommendation.care_sequence;
            KlaraMap.updateCareSequence(careSeq || []);
            KlaraMap.setDemandClusters([]); // placeholder: future demand clusters
        }

        // Command Center: store last optimizer for optimization insight panel (existing API fields only)
        const opt = data.navigation_context && data.navigation_context.routing_result && data.navigation_context.routing_result.optimizer;
        if (opt && typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('klara_last_optimizer', JSON.stringify({
                    solver: opt.solver,
                    solve_time_ms: opt.solve_time_ms,
                    objective_value: opt.objective_value,
                    pathway_ranking: opt.pathway_ranking
                }));
                const seq = data.routing_recommendation && data.routing_recommendation.care_sequence;
                if (seq && seq.length) localStorage.setItem('klara_last_care_sequence', JSON.stringify(seq));
            } catch (_) {}
        }

        // Scroll results into view on mobile
        if (window.innerWidth < 960) {
            resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ── Helpers ──
    function setLoading(on) {
        submitBtn.disabled = on;
        btnLabel.hidden = on;
        btnLoader.hidden = !on;
    }

    function formatLevel(level) {
        return level.replace(/_/g, ' ').toUpperCase();
    }

    function esc(str) {
        const el = document.createElement('span');
        el.textContent = str;
        return el.innerHTML;
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ── Patient Care Requests ──
    const requestsList = document.getElementById('requests-list');

    function formatPathwayName(id) {
        return (PATHWAY_NAMES[id] || (id && id.replace(/_/g, ' ')) || '—');
    }

    async function loadRequests() {
        try {
            const res = await fetch('/api/requests');
            const data = await res.json();
            const reqs = data.requests || [];
            if (reqs.length === 0) {
                requestsList.innerHTML = '<p class="requests-empty">No requests yet. Patients submit from the results screen.</p>';
            } else {
                requestsList.innerHTML = reqs.map((r, idx) => {
                    const seq = r.care_sequence && Array.isArray(r.care_sequence) ? r.care_sequence : [];
                    const opt = r.optimizer && typeof r.optimizer === 'object' ? r.optimizer : null;
                    const hasExpand = seq.length > 0 || opt;
                    const seqHtml = seq.length ? '<div class="request-expanded-section"><strong>Care sequence</strong><ol class="request-care-sequence">' +
                        seq.map(s => '<li>' + esc(formatPathwayName(s)) + '</li>').join('') + '</ol></div>' : '';
                    const optHtml = opt ? '<div class="request-expanded-section"><strong>Optimizer</strong><ul class="request-optimizer">' +
                        (opt.solver ? '<li>Solver: ' + esc(opt.solver) + '</li>' : '') +
                        (opt.status ? '<li>Status: ' + esc(opt.status) + '</li>' : '') +
                        (opt.objective_value != null ? '<li>Objective: ' + Number(opt.objective_value).toFixed(2) + '</li>' : '') +
                        (opt.solve_time != null ? '<li>Solve time: ' + esc(String(opt.solve_time)) + '</li>' : '') +
                        '</ul></div>' : '';
                    return `
                    <div class="request-item ${hasExpand ? 'request-item-expandable' : ''}" data-idx="${idx}">
                        <div class="request-item-header" ${hasExpand ? 'role="button" tabindex="0" aria-expanded="false"' : ''}>
                            <div class="request-meta">
                                <strong>${esc(formatPathwayName(r.pathway))}</strong> · ${new Date(r.timestamp).toLocaleString()}
                            </div>
                            <div class="request-session">Session: ${esc(r.session_id || '—')}${r.region ? ' · Region: ' + esc(r.region) : ''}</div>
                            ${r.observable_summary ? `<div class="request-summary">${esc(r.observable_summary)}</div>` : ''}
                            ${hasExpand ? '<span class="request-expand-icon" aria-hidden="true">▸</span>' : ''}
                        </div>
                        ${hasExpand ? `<div class="request-item-expanded" hidden>${seqHtml}${optHtml}</div>` : ''}
                    </div>
                `;
                }).join('');
                requestsList.querySelectorAll('.request-item-expandable .request-item-header').forEach(el => {
                    el.addEventListener('click', () => {
                        const item = el.closest('.request-item');
                        const expanded = item.querySelector('.request-item-expanded');
                        const icon = item.querySelector('.request-expand-icon');
                        if (!expanded) return;
                        const isOpen = !expanded.hidden;
                        expanded.hidden = isOpen;
                        el.setAttribute('aria-expanded', String(!isOpen));
                        if (icon) icon.textContent = isOpen ? '▸' : '▾';
                    });
                });
            }
        } catch (e) {
            requestsList.innerHTML = '<p class="requests-empty">Could not load requests.</p>';
        }
    }

    loadRequests();
    setInterval(loadRequests, 10000);

    // ── Governance Dashboard (poll /admin/metrics every 5 seconds) ──
    const PATHWAY_NAMES = {
        virtualcarens: 'VirtualCareNS',
        pharmacy: 'Pharmacy',
        primarycare: 'Walk-in',
        urgent: 'Urgent',
        '811': '811',
        emergency: 'Emergency',
        mental_health: 'Mental Health',
        community_health: 'Community Health',
    };

    async function loadMetrics() {
        try {
            const res = await fetch('/admin/metrics');
            const data = await res.json();
            const sessionCount = document.getElementById('session-count');
            const requestCount = document.getElementById('request-count');
            const routingTbody = document.getElementById('routing-tbody');
            const usageBars = document.getElementById('usage-bars');
            const scribeCount = document.getElementById('scribe-count');
            const erDiversionRate = document.getElementById('er-diversion-rate');

            if (sessionCount) sessionCount.textContent = String(data.sessions || 0);
            if (requestCount) requestCount.textContent = String(data.requests || 0);
            if (scribeCount) scribeCount.textContent = String(data.scribe_enrollments || 0);

            const routing = data.routing || {};
            const services = data.services || {};
            const total = Math.max(1, Object.values(routing).reduce((a, b) => a + b, 0));
            const emergencyCount = routing.emergency || 0;
            const ed811Count = (routing.emergency || 0) + (routing['811'] || 0);
            const diversion = total > 0 ? ((total - ed811Count) / total * 100).toFixed(1) : 0;
            if (erDiversionRate) erDiversionRate.textContent = diversion + '% diverted from ED/811';

            const routingEntries = Object.entries(routing).sort((a, b) => b[1] - a[1]);
            if (routingTbody) {
                routingTbody.innerHTML = routingEntries.length === 0
                    ? '<tr><td colspan="2">No routing data yet</td></tr>'
                    : routingEntries.map(([k, v]) => '<tr><td>' + esc(PATHWAY_NAMES[k] || k) + '</td><td>' + v + '</td></tr>').join('');
            }

            const maxUsage = Math.max(1, ...Object.values(services));
            const usageEntries = Object.entries(services).sort((a, b) => b[1] - a[1]);
            if (usageBars) {
                usageBars.innerHTML = usageEntries.length === 0
                    ? '<p style="color:#64748b;font-size:.9rem">No usage data yet</p>'
                    : usageEntries.map(([k, v]) =>
                        '<div class="usage-bar-row">' +
                        '<span class="usage-bar-label">' + esc(PATHWAY_NAMES[k] || k) + '</span>' +
                        '<div class="usage-bar-track"><div class="usage-bar-fill" style="width:' + (v / maxUsage * 100) + '%"></div></div>' +
                        '<span class="usage-bar-value">' + v + '</span></div>'
                    ).join('');
            }
        } catch (e) {
            console.warn('Metrics fetch failed:', e);
        }
    }

    loadMetrics();
    setInterval(loadMetrics, 5000);

    // Clinician map: infrastructure nodes, care sequence routes, future demand clusters (placeholder)
    const adminMapEl = document.getElementById('admin-map');
    if (adminMapEl && typeof KlaraMap !== 'undefined') {
        KlaraMap.init('admin-map', {}).then(function () {
            KlaraMap.setDemandClusters([]);
        }).catch(function () {});
    }

    // Safari iframe fix — force layout refresh so embedded content height is correct
    function refreshIframeHeights() {
        document.querySelectorAll('iframe').forEach(function (iframe) {
            try {
                if (iframe.contentWindow && iframe.contentWindow.document && iframe.contentWindow.document.body) {
                    iframe.style.height = iframe.contentWindow.document.body.scrollHeight + 'px';
                }
            } catch (e) { /* cross-origin or unavailable */ }
        });
    }
    window.addEventListener('load', refreshIframeHeights);
})();
