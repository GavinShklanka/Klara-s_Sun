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
            // Animate stages while waiting
            await sleep(300); activateStage(2);
            await sleep(300); activateStage(3);

            const res = await fetch('/assess', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) throw new Error(`Server responded ${res.status}`);
            const data = await res.json();

            // Finish pipeline animation
            activateStage(4);
            await sleep(250); activateStage(5);
            await sleep(250); activateStage(6);
            await sleep(250); activateStage(7);
            await sleep(200);

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
        const pillClass = (level === 'emergency' || level === 'high') ? 'emergency' : (level === 'mental_health' ? 'mental' : '');
        let emergencyContactBtn = '';
        if (level === 'emergency' || level === 'high') {
            emergencyContactBtn = `
            <button type="button" class="btn-emergency-contact" onclick="openEmergencyContactModal()">
                📞 Emergency Contact Patient
            </button>`;
        }

        cardRouting.innerHTML = `
            <div class="pathway-pill ${pillClass}">${esc(data.routing_recommendation.primary_pathway)}</div>
            <p style="margin:.4rem 0">${esc(data.routing_recommendation.reason)}</p>
            <div>${data.routing_recommendation.options.map(o => `<span class="option-tag">${esc(o)}</span>`).join(' ')}</div>
            ${emergencyContactBtn}
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
        const optData = data.navigation_context?.routing_result?.optimizer || data.optimizer || {};
        const zValue = optData.objective_value;
        const zDisplay = zValue != null ? zValue.toFixed(2) : 'N/A';

        cardGov.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom:.5rem">
                <p style="margin: 0"><strong>Confidence:</strong> ${(data.governance.confidence_score * 100).toFixed(0)}%</p>
                <p style="margin: 0; color: var(--risk-moderate); font-weight: 600" title="Optimization objective value (Z)">Z-Score: ${zDisplay}</p>
            </div>
            <ul class="audit-list">
                ${data.governance.audit_events.map(ev => `<li>${esc(ev)}</li>`).join('')}
            </ul>
        `;

        // Session ID
        sessionIdEl.textContent = `Session ID: ${data.session_id}`;

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

    async function loadRequests() {
        try {
            const res = await fetch('/api/requests');
            const data = await res.json();
            const reqs = data.requests || [];
            if (reqs.length === 0) {
                requestsList.innerHTML = '<p class="requests-empty">No requests yet. Patients submit from the results screen.</p>';
            } else {
                requestsList.innerHTML = reqs.map(r => `
                    <div class="request-item">
                        <div class="request-meta">
                            <strong>${esc(r.pathway)}</strong> · ${new Date(r.timestamp).toLocaleString()}
                        </div>
                        <div class="request-session">Session: ${esc(r.session_id || '—')}</div>
                        ${r.observable_summary ? `<div class="request-summary">${esc(r.observable_summary)}</div>` : ''}
                    </div>
                `).join('');
            }
        } catch (e) {
            requestsList.innerHTML = '<p class="requests-empty">Could not load requests.</p>';
        }
    }

    // ── Emergency Contact Modal ──
    const emergencyModal = document.getElementById('emergency-modal');
    window.openEmergencyContactModal = function () {
        if (emergencyModal) {
            emergencyModal.classList.add('visible');
            const callSim = document.getElementById('call-simulation');
            if (callSim) callSim.hidden = true;
            const actionsEnv = document.getElementById('modal-actions-container');
            if (actionsEnv) actionsEnv.hidden = false;
        }
    };
    window.closeEmergencyContactModal = function () {
        if (emergencyModal) emergencyModal.classList.remove('visible');
    };
    window.simulatePatientCall = function () {
        document.getElementById('modal-actions-container').hidden = true;
        const callSim = document.getElementById('call-simulation');
        callSim.hidden = false;
        callSim.innerHTML = '📞 Dialing (902) 555-0198... Connecting to patient.';
        callSim.style.animation = 'pulse 2s infinite';
        setTimeout(() => {
            callSim.innerHTML = '✅ Connected! Call duration: 00:01';
            callSim.style.animation = 'none';
        }, 1500);
    };

    loadRequests();
    setInterval(loadRequests, 10000);
})();
