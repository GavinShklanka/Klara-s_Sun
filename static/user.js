/* ═══════════════════════════════════════════════════════════
   KLARA OS — Conversational Patient Intake & Care Navigation
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatInputArea = document.getElementById('chat-input-area');
    const sendBtn = document.getElementById('send-btn');
    const voiceBtn = document.getElementById('voice-btn');
    const joinModal = document.getElementById('join-modal');
    const healthCardInput = document.getElementById('health-card-input');
    const joinCancel = document.getElementById('join-cancel');
    const joinSubmit = document.getElementById('join-submit');
    const chatView = document.getElementById('chat-view');
    const resultsView = document.getElementById('results-view');
    const backBtn = document.getElementById('back-btn');
    const submitRequestBtn = document.getElementById('submit-request-btn');

    const REGIONS = ['Halifax', 'Cape Breton', 'South Shore', 'Annapolis Valley', 'Truro / Colchester', 'Northern (Rural)'];

    // Intake state
    let state = {
        step: 'greeting',
        inSystem: null,
        messages: [],
        intake: { chiefComplaint: '', symptoms: '', duration: '', region: '', town: '', medications: '', allergies: '', done: false },
        sessionId: null,
        assessData: null,
        chosenPathway: null,
    };

    // ── Conversation script (Klara-inspired: calm, observant, precise, professional) ──
    const SCRIPT = {
        greeting: { from: 'klara', text: 'What brings you here today?' },
        afterComplaint: { from: 'klara', text: 'Thank you. I will examine the available routes and determine the most efficient option for you. Are you already in our system?' },
        joinPrompt: { from: 'klara', text: 'You will need to connect with your health card to continue. Click Join below.' },
        afterJoin: { from: 'klara', text: 'I have noted your concerns.' },
        afterSymptoms: { from: 'klara', text: 'How long have you had these symptoms?' },
        afterDuration: { from: 'klara', text: 'Select your region:' },
        afterRegion: { from: 'klara', text: 'Are you on any medications we should know about?' },
        afterMeds: { from: 'klara', text: 'Any allergies to medications or other?' },
        afterAllergies: { from: 'klara', text: 'That information is useful. Click Submit below when you are ready, or add anything else.' },
        submitConfirm: { from: 'klara', text: 'I am submitting your intake now.' },
    };

    function esc(str) {
        const el = document.createElement('span');
        el.textContent = str || '';
        return el.innerHTML;
    }

    function appendBubble(from, text) {
        const div = document.createElement('div');
        div.className = `chat-bubble ${from}`;
        div.innerHTML = `<p>${esc(text)}</p>`;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function setStep(step) {
        state.step = step;
    }

    function enableInput() {
        chatInput.disabled = false;
        chatInput.placeholder = 'Type your message…';
        sendBtn.disabled = false;
        voiceBtn.disabled = false;
        chatInput.focus();
    }

    function disableInput() {
        chatInput.disabled = true;
        sendBtn.disabled = true;
        voiceBtn.disabled = true;
    }

    function showJoinModal() {
        joinModal.classList.remove('view-hidden');
        healthCardInput.value = '';
        healthCardInput.focus();
    }

    function hideJoinModal() {
        joinModal.classList.add('view-hidden');
    }

    function showSubmitButtonInChat() {
        const existing = document.getElementById('chat-submit-btn-wrap');
        if (existing) return;
        const wrap = document.createElement('div');
        wrap.id = 'chat-submit-btn-wrap';
        wrap.className = 'chat-bubble klara chat-submit-wrap';
        wrap.innerHTML = '<button type="button" class="btn-submit-inline" id="chat-submit-inline">Submit Intake</button>';
        chatMessages.appendChild(wrap);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        wrap.querySelector('#chat-submit-inline').addEventListener('click', () => {
            if (state.step === 'done' && state.intake.chiefComplaint) {
                appendBubble('user', 'Submit');
                submitIntake();
            }
        });
    }

    function startChat() {
        chatMessages.innerHTML = '';
        appendBubble('klara', SCRIPT.greeting.text);
        setStep('complaint');
        enableInput();
    }

    function handleComplaint(text) {
        state.intake.chiefComplaint = text;
        state.intake.symptoms = text;
        appendBubble('user', text);
        appendBubble('klara', SCRIPT.afterComplaint.text);
        appendBubble('klara', "Please indicate whether you are in our system by typing 'yes' or 'no'.");
        setStep('in_system');
        enableInput();
    }

    var DEFAULT_SYMPTOMS = ['Pain or discomfort', 'Swelling', 'Headache', 'Fatigue', 'Fever', 'Cough', 'Nausea', 'Difficulty moving', 'Other'];

    async function showSymptomDropdown() {
        const complaint = state.intake.chiefComplaint || state.intake.symptoms || '';
        appendBubble('klara', "What are your symptoms? You may name them or select from the dropdown below.");
        var opts = [];
        try {
            const res = await fetch('/api/symptoms?complaint=' + encodeURIComponent(complaint));
            if (res.ok) {
                const data = await res.json();
                opts = data.symptoms || [];
            }
        } catch (_) { /* fallback to defaults */ }
        if (opts.length === 0) opts = DEFAULT_SYMPTOMS;
        var bubble = document.createElement('div');
        bubble.className = 'chat-bubble klara';
        bubble.innerHTML = '<p>Select any that apply based on your concern.</p><div class="symptom-checkboxes" id="symptom-checkboxes"></div><button type="button" class="btn-symptom-continue" id="symptom-continue">Continue</button>';
        chatMessages.appendChild(bubble);
        var container = bubble.querySelector('#symptom-checkboxes');
        opts.forEach(function (s) {
            var label = document.createElement('label');
            label.className = 'symptom-check-item';
            label.innerHTML = '<input type="checkbox" value="' + esc(s) + '"> <span>' + esc(s) + '</span>';
            container.appendChild(label);
        });
        bubble.querySelector('#symptom-continue').addEventListener('click', function () {
            var selected = Array.from(bubble.querySelectorAll('input:checked')).map(function (cb) { return cb.value; });
            state.intake.symptomOptions = selected;
            if (selected.length) state.intake.symptoms = [complaint].concat(selected).join('. ');
            bubble.remove();
            appendBubble('klara', SCRIPT.afterSymptoms.text);
            setStep('duration');
            enableInput();
        });
        setStep('symptom_select');
        chatMessages.scrollTop = chatMessages.scrollHeight;
        enableInput();
    }

    function handleInSystem(text) {
        const t = text.trim().toLowerCase();
        appendBubble('user', text);
        if (t === 'yes' || t === 'y') {
            state.inSystem = true;
            appendBubble('klara', SCRIPT.afterJoin.text);
            setStep('symptom_select');
            showSymptomDropdown();
        } else if (t === 'no' || t === 'n') {
            state.inSystem = false;
            appendBubble('klara', SCRIPT.joinPrompt.text);
            const joinBubble = document.createElement('div');
            joinBubble.className = 'chat-bubble klara';
            joinBubble.innerHTML = '<p>Click to connect with your health card:</p><button type="button" class="btn-join-inline">Join</button>';
            chatMessages.appendChild(joinBubble);
            joinBubble.querySelector('.btn-join-inline').addEventListener('click', showJoinModal);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            appendBubble('klara', "Please type 'yes' or 'no'.");
            enableInput();
        }
    }

    function handleJoined() {
        hideJoinModal();
        appendBubble('klara', "You are connected.");
        appendBubble('klara', SCRIPT.afterJoin.text);
        state.inSystem = true;
        setStep('symptom_select');
        showSymptomDropdown();
    }

    function handleDuration(text) {
        state.intake.duration = text;
        appendBubble('user', text);
        appendBubble('klara', SCRIPT.afterRegion.text);
        const regionBubble = document.createElement('div');
        regionBubble.className = 'chat-bubble klara';
        const select = document.createElement('select');
        select.id = 'region-select-chat';
        select.className = 'chat-select';
        select.innerHTML = '<option value="" disabled selected>Choose region…</option>' +
            REGIONS.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-region-select';
        btn.textContent = 'Select';
        regionBubble.appendChild(select);
        regionBubble.appendChild(btn);
        chatMessages.appendChild(regionBubble);
        btn.addEventListener('click', () => {
            const val = select.value;
            if (!val) return;
            state.intake.region = val;
            appendBubble('user', val);
            regionBubble.remove();
            appendBubble('klara', 'What town or municipality are you in?');
            setStep('town');
            enableInput();
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
        setStep('region_select');
    }

    function handleRegionSelect(text) {
        // fallback if user types instead of using dropdown
        const t = text.trim().toLowerCase();
        const match = REGIONS.find(r => r.toLowerCase().includes(t) || t.includes(r.toLowerCase()));
        if (match) {
            state.intake.region = match;
            const remainder = text.replace(new RegExp(match, 'gi'), '').trim().replace(/^[,.\s]+|[,.\s]+$/g, '');
            appendBubble('user', text);
            if (remainder.length >= 2) {
                state.intake.town = remainder;
                appendBubble('klara', SCRIPT.afterMeds.text);
                setStep('medications');
            } else {
                appendBubble('klara', 'What town or municipality are you in?');
                setStep('town');
            }
            enableInput();
        } else {
            appendBubble('user', text);
            appendBubble('klara', 'Please select your region from the dropdown above.');
            enableInput();
        }
    }

    function handleTown(text) {
        state.intake.town = text.trim();
        appendBubble('user', text);
        appendBubble('klara', SCRIPT.afterMeds.text);
        setStep('medications');
        enableInput();
    }

    function handleMedications(text) {
        state.intake.medications = text;
        appendBubble('user', text);
        appendBubble('klara', SCRIPT.afterAllergies.text);
        setStep('allergies');
        enableInput();
    }

    function handleAllergies(text) {
        state.intake.allergies = text;
        appendBubble('user', text);
        appendBubble('klara', SCRIPT.afterAllergies.text);
        setStep('done');
        showSubmitButtonInChat();
        enableInput();
    }

    function handleDone(text) {
        appendBubble('user', text);
        if (isDoneCommand(text)) {
            submitIntake();
            return;
        }
        state.intake.extra = (state.intake.extra || '') + ' ' + text;
            appendBubble('klara', "I have added that. Click Submit below when ready.");
        showSubmitButtonInChat();
        enableInput();
    }

    function buildIntakeText() {
        const i = state.intake;
        const symptomPart = i.chiefComplaint || i.symptoms;
        return [symptomPart, i.duration ? `Duration: ${i.duration}` : '', i.region ? `Region: ${i.region}` : '', i.town ? `Town: ${i.town}` : '', i.medications ? `Medications: ${i.medications}` : '', i.allergies ? `Allergies: ${i.allergies}` : '', i.extra || ''].filter(Boolean).join('. ');
    }

    function buildObservableSummary(data) {
        const s = data?.structured_summary;
        const p = data?.patient_input;
        if (!s && !p) return '';
        return [
            s?.symptoms && `Symptoms: ${s.symptoms}`,
            s?.duration && `Duration: ${s.duration}`,
            s?.risk && `Risk Level: ${s.risk}`,
            p?.symptoms?.length && `Parsed: ${p.symptoms.join(', ')}`,
        ].filter(Boolean).join('. ');
    }

    async function submitIntake() {
        disableInput();
        appendBubble('klara', SCRIPT.submitConfirm.text);

        const text = buildIntakeText();
        const region = state.intake.region || 'Halifax';

        try {
            const symptom_selections = state.intake.symptomOptions || [];
            const res = await fetch('/assess', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, region, symptom_selections }),
            });
            if (!res.ok) throw new Error('Server error');
            const data = await res.json();
            state.sessionId = data.session_id;
            state.assessData = data;

            chatView.classList.add('view-hidden');
            resultsView.classList.remove('view-hidden');

            renderResults(data);
        } catch (e) {
            appendBubble('klara', "I could not process that. Please try again.");
            enableInput();
        }
    }

    function renderResults(data) {
        document.getElementById('result-pathway').textContent = (data.pathway_urls?.[data.routing_recommendation.primary_pathway]?.name || data.routing_recommendation.primary_pathway);
        document.getElementById('result-reason').textContent = data.routing_recommendation.reason;

        const optionsList = document.getElementById('options-list');
        optionsList.innerHTML = '';
        const pathwayUrls = data.pathway_urls || {};
        for (const opt of data.routing_recommendation.options) {
            const info = pathwayUrls[opt] || { name: opt, url: '#' };
            const wrap = document.createElement('div');
            wrap.className = 'option-card-wrap';
            const a = document.createElement('a');
            a.href = info.url || '#';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'option-link';
            a.dataset.pathway = opt;
            a.innerHTML = `<span class="option-arrow">→</span> ${esc(info.name || opt)}`;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                state.chosenPathway = opt;
                document.querySelectorAll('.option-link').forEach(el => el.classList.remove('selected'));
                a.classList.add('selected');
                submitRequestBtn.disabled = false;
            });
            wrap.appendChild(a);
            const locDisplay = safeLocationDisplay();
            const gisUrlFallback = buildMapsSearchUrl(opt, locDisplay);
            const dirs = document.createElement('a');
            dirs.href = gisUrlFallback;
            dirs.className = 'option-directions';
            dirs.textContent = 'Get directions';
            dirs.title = 'Open map: find locations near you (real-time)';
            dirs.target = '_blank';
            dirs.rel = 'noopener noreferrer';
            dirs.addEventListener('click', (e) => {
                e.preventDefault();
                const u = `/api/nearby?pathway=${encodeURIComponent(opt)}&region=${encodeURIComponent(state.intake.region || '')}&town=${encodeURIComponent(state.intake.town || '')}`;
                fetch(u).then(r => r.json()).then(d => {
                    window.open(d.maps_search_url || gisUrlFallback, '_blank', 'noopener,noreferrer');
                }).catch(function () {
                    window.open(gisUrlFallback, '_blank', 'noopener,noreferrer');
                });
            });
            wrap.appendChild(dirs);
            optionsList.appendChild(wrap);
        }

        document.getElementById('summary-body').innerHTML = `
            <p><strong>Symptoms:</strong> ${esc(data.structured_summary?.symptoms || '—')}</p>
            <p><strong>Duration:</strong> ${esc(data.structured_summary?.duration || '—')}</p>
            <p><strong>Risk Level:</strong> ${esc(data.structured_summary?.risk || '—')}</p>
        `;

        // LP / Optimization panel — user-facing, non-technical
        const optData = data.navigation_context?.routing_result?.optimizer || data.optimizer || {};
        const solver = optData.solver || 'rule';
        const status = optData.status || 'unknown';
        const objVal = optData.objective_value;
        const ranking = optData.pathway_ranking || data.routing_recommendation?.options || [];
        const lpSolver = document.getElementById('lp-solver');
        const lpStatus = document.getElementById('lp-status');
        const lpObjective = document.getElementById('lp-objective');
        if (lpSolver) lpSolver.textContent = 'Solver: ' + solver;
        if (lpStatus) lpStatus.textContent = 'status=' + status;
        if (lpObjective) lpObjective.textContent = objVal != null ? objVal.toFixed(2) : '—';
        const rankHtml = ranking.map(function (p, i) {
            const names = data.pathway_urls?.[p]?.name || p;
            return '<span class="lp-pathway"><span class="lp-rank">' + (i + 1) + '.</span> ' + esc(names) + '</span>';
        }).join('');
        const lpRankEl = document.getElementById('lp-ranking');
        if (lpRankEl) lpRankEl.innerHTML = rankHtml || '—';

        const banner = document.getElementById('emergency-banner');
        if (data.risk_assessment?.level === 'emergency' || data.risk_assessment?.level === 'high') {
            banner.hidden = false;
            document.getElementById('emergency-text').textContent = 'Call 811 for nurse triage. Do not go directly to ED—811 will direct you if needed.';
        } else {
            banner.hidden = true;
        }

        document.getElementById('dashboard-view').classList.add('view-hidden');
        document.getElementById('lp-content').hidden = true;
        document.getElementById('lp-toggle').setAttribute('aria-expanded', 'false');
        document.getElementById('lp-toggle').querySelector('.lp-toggle-icon').textContent = '▸';
        submitRequestBtn.disabled = true;
        submitRequestBtn.textContent = 'Submit Request';
        state.chosenPathway = null;
    }

    function initLPToggle() {
        const toggle = document.getElementById('lp-toggle');
        const content = document.getElementById('lp-content');
        if (!toggle || !content) return;
        toggle.addEventListener('click', () => {
            const open = !content.hidden;
            content.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            toggle.querySelector('.lp-toggle-icon').textContent = open ? '▾' : '▸';
        });
    }

    function safeLocationDisplay() {
        const town = (state.intake.town || '').trim().toLowerCase();
        const region = (state.intake.region || '').trim();
        const block = ['no', 'none', 'n/a', 'no medication', 'no medications', 'no allergies', 'nope', 'nothing', 'skip', '-'];
        if (town && !block.some(b => town.includes(b)) && town.length >= 2) return state.intake.town.trim();
        if (region && !block.some(b => region.toLowerCase().includes(b))) return region;
        return 'Nova Scotia';
    }

    function buildMapsSearchUrl(pathway, locationDisplay) {
        const search = { pharmacy: 'pharmacy', primarycare: 'family doctor clinic', urgent: 'urgent treatment centre', community_health: 'community health centre', 811: '811', virtualcarens: 'virtual care', mental_health: 'mental health services' }[pathway] || pathway;
        const q = search + ' near ' + (locationDisplay || 'Nova Scotia') + ', Nova Scotia';
        return 'https://www.google.com/maps/search/' + encodeURIComponent(q);
    }

    function showDashboard(pathway) {
        const dv = document.getElementById('dashboard-view');
        const statusEl = document.getElementById('dashboard-status');
        const stepsEl = document.getElementById('dashboard-next-steps');
        const dirsEl = document.getElementById('dashboard-directions');
        const reportEl = document.getElementById('dashboard-intake-report');
        if (!dv) return;
        dv.classList.remove('view-hidden');

        const info = state.assessData?.pathway_urls?.[pathway] || { name: pathway, url: '#' };
        statusEl.innerHTML = `<p><strong>Status:</strong> Submitted</p><p><strong>Pathway:</strong> ${esc(info.name || pathway)}</p>`;
        stepsEl.innerHTML = '<h4>Next steps</h4><ul><li>Your request has been received.</li><li>Use the links below to get to your care location.</li><li>Prepare your health card and medication list.</li></ul>';
        const locationDisplay = safeLocationDisplay();
        const fallbackMapsUrl = buildMapsSearchUrl(pathway, locationDisplay);
        const mapsApiUrl = `/api/nearby?pathway=${encodeURIComponent(pathway)}&region=${encodeURIComponent(state.intake.region || '')}&town=${encodeURIComponent(state.intake.town || '')}`;
        fetch(mapsApiUrl).then(r => r.json()).then(d => {
            const mapsUrl = d.maps_search_url || fallbackMapsUrl;
            const locLabel = d.location_display || locationDisplay;
            let html = '<h4>How to get there</h4><p><a href="' + esc(mapsUrl) + '" target="_blank" rel="noopener noreferrer" class="btn-directions">Find ' + esc(info.name || pathway) + ' near ' + esc(locLabel) + '</a></p>';
            if ((d.locations || []).length) {
                html += '<p class="dashboard-locations-title">Official Nova Scotia links:</p><ul class="dashboard-locations">';
                d.locations.forEach(function (loc) {
                    html += '<li><a href="' + esc(loc.url) + '" target="_blank" rel="noopener noreferrer">' + esc(loc.name) + '</a></li>';
                });
                html += '</ul>';
            }
            if (info.url && info.url !== '#') html += '<p><a href="' + esc(info.url) + '" target="_blank" rel="noopener">Visit ' + esc(info.name || pathway) + ' (NS Health)</a></p>';
            dirsEl.innerHTML = html;
        }).catch(function () {
            dirsEl.innerHTML = '<h4>How to get there</h4><p><a href="' + esc(fallbackMapsUrl) + '" target="_blank" rel="noopener noreferrer" class="btn-directions">Find ' + esc(info.name || pathway) + ' near ' + esc(locationDisplay) + '</a></p>' +
                (info.url && info.url !== '#' ? '<p><a href="' + esc(info.url) + '" target="_blank" rel="noopener">Visit ' + esc(info.name || pathway) + '</a></p>' : '');
        });
        const s = state.assessData?.structured_summary;
        reportEl.innerHTML = '<h4>Intake Report Summary</h4><ul>' +
            (s?.symptoms ? '<li><strong>Symptoms:</strong> ' + esc(s.symptoms) + '</li>' : '') +
            (s?.duration ? '<li><strong>Duration:</strong> ' + esc(s.duration) + '</li>' : '') +
            (s?.risk ? '<li><strong>Risk:</strong> ' + esc(s.risk) + '</li>' : '') +
            '</ul>';
    }

    async function doSubmitRequest() {
        if (!state.chosenPathway || !state.assessData) return;
        const observable = buildObservableSummary(state.assessData);
        try {
            await fetch('/api/requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: state.sessionId,
                    pathway: state.chosenPathway,
                    observable_summary: observable,
                }),
            });
            submitRequestBtn.textContent = 'Request Submitted ✓';
            submitRequestBtn.disabled = true;
            showDashboard(state.chosenPathway);
        } catch (e) {
            alert('Could not submit request.');
        }
    }

    function isDoneCommand(text) {
        const n = (text || '').trim().toLowerCase().replace(/[.,!?]/g, '').trim();
        return n === 'done';
    }

    function onSend() {
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';

        // "done" or Submit = submit once only when at done step — no second prompt
        if ((isDoneCommand(text) || text.trim().toLowerCase() === 'submit') && state.step === 'done' && state.intake.chiefComplaint) {
            appendBubble('user', isDoneCommand(text) ? text : 'Submit');
            submitIntake();
            return;
        }

        switch (state.step) {
            case 'complaint':
                handleComplaint(text);
                break;
            case 'symptom_select':
                if (/^(skip|continue|next|none)$/i.test(text.trim())) {
                    const bubble = document.getElementById('symptom-checkboxes')?.closest('.chat-bubble.klara');
                    if (bubble) bubble.remove();
                    state.intake.symptomOptions = [];
                    appendBubble('user', text);
                    appendBubble('klara', SCRIPT.afterSymptoms.text);
                    setStep('duration');
                }
                enableInput();
                break;
            case 'in_system':
                handleInSystem(text);
                break;
            case 'duration':
                handleDuration(text);
                break;
            case 'region_select':
                handleRegionSelect(text);
                break;
            case 'town':
                handleTown(text);
                break;
            case 'medications':
                handleMedications(text);
                break;
            case 'allergies':
                handleAllergies(text);
                break;
            case 'done':
                handleDone(text);
                break;
            default:
                enableInput();
        }
    }

    function initVoice() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            voiceBtn.title = 'Voice input not supported';
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-CA';
        voiceBtn.addEventListener('click', () => {
            if (chatInput.disabled) return;
            voiceBtn.classList.add('recording');
            rec.start();
        });
        rec.onresult = (e) => {
            const t = e.results[0][0].transcript;
            chatInput.value = (chatInput.value + ' ' + t).trim();
            voiceBtn.classList.remove('recording');
        };
        rec.onerror = () => voiceBtn.classList.remove('recording');
        rec.onend = () => voiceBtn.classList.remove('recording');
    }

    sendBtn.addEventListener('click', onSend);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    });

    joinCancel.addEventListener('click', () => {
        hideJoinModal();
        appendBubble('klara', "When you are ready, type 'no' again to join.");
        setStep('in_system');
        enableInput();
    });

    joinModal.querySelector('.modal-backdrop').addEventListener('click', () => {
        hideJoinModal();
        setStep('in_system');
        enableInput();
    });
    joinSubmit.addEventListener('click', () => {
        const card = healthCardInput.value.trim();
        if (!card) {
            appendBubble('klara', "Please enter your health card number. For this demo, any value will suffice.");
            return;
        }
        handleJoined();
    });

    backBtn.addEventListener('click', () => {
        resultsView.classList.add('view-hidden');
        chatView.classList.remove('view-hidden');
        state = { step: 'greeting', inSystem: null, messages: [], intake: { chiefComplaint: '', symptoms: '', duration: '', region: '', town: '', medications: '', allergies: '', done: false }, sessionId: null, assessData: null, chosenPathway: null };
        startChat();
    });

    submitRequestBtn.addEventListener('click', doSubmitRequest);

    initVoice();
    initLPToggle();
    startChat();
})();
