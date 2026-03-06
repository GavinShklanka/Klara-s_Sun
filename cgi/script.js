/**
 * Klara OS — Agentic RAG demo (static, no backend)
 * When user clicks "Agentic RAG" on a pathway, we build a payload, (optionally) call an LLM endpoint,
 * and render the response in the panel under the pathway list.
 *
 * LATER: Replace getHardcodedResponse with fetch(AGENTIC_RAG_URL, { body: JSON.stringify(payload) })
 *        and replace buildMockPayload with real intake_summary / risk_assessment from the page DOM.
 */

(function () {
  'use strict';

  // Placeholder URL for when you wire a real serverless function. Not used while using hardcoded responses.
  const AGENTIC_RAG_URL = 'https://example.com/agentic-rag';

  /**
   * Builds the JSON payload that would be sent to the Agentic RAG endpoint.
   * Currently uses mocked intake and risk; later, read from page (e.g. symptom input, risk gauge).
   */
  function buildMockPayload(pathwayId) {
    const pathwayNames = {
      virtualcarens: 'VirtualCareNS',
      pharmacy: 'Pharmacy Prescribing',
      primarycare: 'Primary Care Clinic',
      urgent: 'Urgent Treatment Centre',
      emergency: 'Emergency Department'
    };
    return {
      pathway: pathwayId,
      pathway_name: pathwayNames[pathwayId] || pathwayId,
      intake_summary: {
        chief_complaint: 'Patient-reported symptoms (demo): mild fever, fatigue.',
        duration: '2–3 days',
        relevant_history: 'No recent travel; no known allergies (demo data).'
      },
      risk_assessment: {
        level: 'moderate',
        score: 0.45,
        indicators: ['No emergency indicators', 'Suitable for virtual or primary care (demo).']
      }
    };
  }

  /**
   * Returns a hardcoded sample response for the given pathway, matching the shared output schema.
   * Replace this with a real fetch to AGENTIC_RAG_URL when backend is ready.
   */
  function getHardcodedResponse(pathwayId) {
    const base = {
      pathway: pathwayId,
      navigation_summary: '',
      next_steps_for_patient: [],
      questions_for_clinician: [],
      information_to_prepare: [],
      safety_reminders: [],
      escalation_conditions: '',
      alternative_pathways_to_consider: [],
      confidence: { numeric_score: 0, rationale: '' },
      sources: []
    };

    const samples = {
      virtualcarens: {
        ...base,
        pathway: 'virtualcarens',
        navigation_summary: 'VirtualCareNS is appropriate for this presentation. Patient can be seen via video or phone province-wide with typical wait ~12 minutes. No emergency red flags.',
        next_steps_for_patient: [
          'Ensure stable internet and a quiet, private space for the call.',
          'Have your health card and list of current medications ready.',
          'Log in to the VirtualCareNS platform at the scheduled time.'
        ],
        questions_for_clinician: [
          'Duration and severity of fever; any associated rash or breathing difficulty?',
          'Any recent travel or exposure to infectious illness?',
          'Current medications and allergies.'
        ],
        information_to_prepare: [
          'List of symptoms and when they started.',
          'Recent vital signs if available (e.g. home thermometer reading).',
          'Current medications and allergies.'
        ],
        safety_reminders: [
          'If fever rises above 39°C or you develop difficulty breathing, seek urgent care or call 811.'
        ],
        escalation_conditions: 'Escalate to Urgent Treatment Centre or ED if fever >39°C, rash spreading, or any signs of sepsis or respiratory distress.',
        alternative_pathways_to_consider: [
          { pathway: 'Pharmacy Prescribing', reason: 'If symptoms align with a pharmacy-eligible condition and patient prefers in-person.' },
          { pathway: 'Primary Care Clinic', reason: 'If patient prefers in-person assessment and can get a timely appointment.' }
        ],
        confidence: { numeric_score: 0.88, rationale: 'Presentation fits virtual care; no emergency indicators in intake.' },
        sources: [
          { title: 'VirtualCareNS — Nova Scotia Health', url: 'https://www.nshealth.ca/virtualcarens', excerpt: 'Province-wide virtual care for non-emergency conditions.' },
          { title: 'NS Pharmacy Prescribing', url: 'https://www.nspharmacists.ca', excerpt: '19+ conditions eligible for pharmacist prescribing.' }
        ]
      },
      pharmacy: {
        ...base,
        pathway: 'pharmacy',
        navigation_summary: 'Pharmacy prescribing may be suitable if the condition is among the 19+ eligible conditions (e.g. uncomplicated UTI, minor skin conditions). Confirm eligibility with pharmacist.',
        next_steps_for_patient: [
          'Call or visit a participating Nova Scotia pharmacy.',
          'Describe symptoms; pharmacist will confirm if condition is within scope.',
          'Bring health card and medication list.'
        ],
        questions_for_clinician: [],
        information_to_prepare: [
          'List of symptoms and duration.',
          'Current medications and allergies.',
          'Whether condition has been treated before (e.g. recurring UTI).'
        ],
        safety_reminders: [
          'Pharmacist will refer to primary care or urgent care if condition is outside prescribing scope.'
        ],
        escalation_conditions: 'Escalate to primary care or virtual care if condition is not pharmacy-eligible or if symptoms worsen.',
        alternative_pathways_to_consider: [
          { pathway: 'VirtualCareNS', reason: 'If condition is not pharmacy-eligible or patient prefers a clinician assessment.' },
          { pathway: 'Primary Care Clinic', reason: 'If ongoing follow-up or in-person exam is needed.' }
        ],
        confidence: { numeric_score: 0.72, rationale: 'Eligibility depends on specific condition; intake does not yet confirm a pharmacy-eligible diagnosis.' },
        sources: [
          { title: 'NS Pharmacy Association — Prescribing', url: 'https://www.nspharmacists.ca/prescribing', excerpt: 'Conditions and scope for pharmacist prescribing in NS.' }
        ]
      },
      primarycare: {
        ...base,
        pathway: 'primarycare',
        navigation_summary: 'Primary care is appropriate for follow-up and in-person assessment. Collaborative Health Centres and family practices can provide continuity; check wait times and booking options.',
        next_steps_for_patient: [
          'Call your family practice or a Collaborative Health Centre to book an appointment.',
          'Use the intake summary prepared by Klara to speed up registration.',
          'Bring health card, medication list, and any recent test results.'
        ],
        questions_for_clinician: [
          'Full symptom timeline and any prior treatments tried.',
          'Social determinants that may affect follow-up (transport, work schedule).'
        ],
        information_to_prepare: [
          'Intake summary from Klara (symptoms, duration, risk assessment).',
          'Current medications and allergies.',
          'Relevant past medical history.'
        ],
        safety_reminders: [
          'If symptoms worsen while waiting for appointment, use VirtualCareNS or 811 for same-day guidance.'
        ],
        escalation_conditions: 'Escalate to UTC or ED if condition deteriorates or emergency indicators appear before the appointment.',
        alternative_pathways_to_consider: [
          { pathway: 'VirtualCareNS', reason: 'If appointment wait is long and condition is suitable for virtual assessment.' },
          { pathway: 'Urgent Treatment Centre', reason: 'If same-day assessment is needed and primary care cannot accommodate.' }
        ],
        confidence: { numeric_score: 0.85, rationale: 'Good fit for non-urgent, ongoing care; distance and wait times may vary.' },
        sources: [
          { title: 'Nova Scotia Health — Find a primary care provider', url: 'https://www.nshealth.ca/primarycare', excerpt: 'Options for connecting to primary care in NS.' }
        ]
      },
      urgent: {
        ...base,
        pathway: 'urgent',
        navigation_summary: 'Urgent Treatment Centre (e.g. Dartmouth UTC) is for conditions that need same-day care but are not life-threatening. Est. wait ~35 min; suitable when virtual or primary care cannot meet acuity or timing.',
        next_steps_for_patient: [
          'Go to the UTC during opening hours; no appointment needed in many cases.',
          'Bring health card, ID, and list of current medications.',
          'Use the prepared intake summary to help triage.'
        ],
        questions_for_clinician: [
          'Exact onset and progression of symptoms.',
          'Any red flags (e.g. chest pain, shortness of breath) that might require ED.'
        ],
        information_to_prepare: [
          'Intake summary and risk assessment from Klara.',
          'Current medications and allergies.',
          'Recent vital signs if available.'
        ],
        safety_reminders: [
          'If you have chest pain, severe difficulty breathing, or signs of stroke, go to Emergency or call 911.'
        ],
        escalation_conditions: 'Redirect to Emergency Department if triage identifies emergency indicators (e.g. cardiac, respiratory, neurological).',
        alternative_pathways_to_consider: [
          { pathway: 'Emergency Department', reason: 'If symptoms suggest life-threatening condition.' },
          { pathway: 'VirtualCareNS', reason: 'If condition is stable and can wait for virtual assessment.' }
        ],
        confidence: { numeric_score: 0.78, rationale: 'UTC is appropriate when acuity is above virtual/primary but below emergency; intake suggests moderate urgency.' },
        sources: [
          { title: 'Nova Scotia Health — Urgent Treatment Centres', url: 'https://www.nshealth.ca/utc', excerpt: 'UTC locations, hours, and what to expect.' }
        ]
      },
      emergency: {
        ...base,
        pathway: 'emergency',
        navigation_summary: 'Emergency Department is for life-threatening or severe acute conditions only. This pathway should be used only when emergency indicators are present or triage directs the patient to ED.',
        next_steps_for_patient: [
          'If in immediate danger, call 911.',
          'Otherwise, go to the nearest ED; bring health card and medication list.',
          'Use Klara intake summary to support triage; do not delay care for paperwork.'
        ],
        questions_for_clinician: [
          'Time of onset of emergency indicators.',
          'Vital signs and stability; any interventions already attempted.'
        ],
        information_to_prepare: [
          'Intake summary and risk assessment from Klara.',
          'Current medications, allergies, and relevant history.',
          'Contact information for family or substitute decision-maker.'
        ],
        safety_reminders: [
          'Never delay calling 911 for suspected heart attack, stroke, severe bleeding, or inability to breathe.'
        ],
        escalation_conditions: 'ED is the top of escalation; ensure appropriate handover and follow-up plans on discharge.',
        alternative_pathways_to_consider: [
          { pathway: 'Urgent Treatment Centre', reason: 'If triage determines condition is urgent but not emergency.' },
          { pathway: 'VirtualCareNS', reason: 'If after assessment the condition is stable and can be managed virtually.' }
        ],
        confidence: { numeric_score: 0.95, rationale: 'Reserve for true emergencies; current demo intake does not show emergency indicators—pathway shown for completeness.' },
        sources: [
          { title: 'Nova Scotia Health — Emergency departments', url: 'https://www.nshealth.ca/emergency', excerpt: 'ED locations and when to go.' }
        ]
      }
    };

    return samples[pathwayId] || { ...base, pathway: pathwayId, navigation_summary: 'No sample for this pathway.' };
  }

  /**
   * Renders the Agentic RAG response into the panel for the given pathway.
   * @param {string} pathwayId - e.g. 'virtualcarens', 'pharmacy'
   * @param {object} data - Response object matching the shared schema
   */
  function renderAgenticResponse(pathwayId, data) {
    const panel = document.getElementById('rag-panel-' + pathwayId);
    if (!panel) return;

    // Hide all panels, then show this one
    document.querySelectorAll('.rag-panel').forEach(function (p) {
      p.classList.remove('show');
      p.setAttribute('aria-hidden', 'true');
    });
    panel.classList.add('show');
    panel.setAttribute('aria-hidden', 'false');

    function esc(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function listItems(arr) {
      if (!Array.isArray(arr) || arr.length === 0) return '<span class="rag-section-content">—</span>';
      return '<ul class="rag-list">' + arr.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>';
    }

    var altHtml = '';
    if (Array.isArray(data.alternative_pathways_to_consider) && data.alternative_pathways_to_consider.length > 0) {
      altHtml = data.alternative_pathways_to_consider.map(function (a) {
        return '<div class="rag-alt-item"><strong>' + esc(a.pathway) + '</strong>: ' + esc(a.reason) + '</div>';
      }).join('');
    } else {
      altHtml = '<span class="rag-section-content">—</span>';
    }

    var sourcesHtml = '';
    if (Array.isArray(data.sources) && data.sources.length > 0) {
      sourcesHtml = '<ul class="rag-list">' + data.sources.map(function (s) {
        return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>' +
          (s.excerpt ? ' — ' + esc(s.excerpt) : '') + '</li>';
      }).join('') + '</ul>';
    } else {
      sourcesHtml = '<span class="rag-section-content">—</span>';
    }

    var conf = data.confidence || {};
    var score = conf.numeric_score != null ? (Math.round(Number(conf.numeric_score) * 100) + '%') : '—';
    var rationale = conf.rationale ? esc(conf.rationale) : '';

    panel.innerHTML =
      '<h3>Agentic RAG — ' + esc(pathwayId) + '</h3>' +
      '<div class="rag-section"><div class="rag-section-title">Navigation summary</div><div class="rag-section-content">' + esc(data.navigation_summary || '') + '</div></div>' +
      '<div class="rag-section"><div class="rag-section-title">Next steps for patient</div>' + listItems(data.next_steps_for_patient) + '</div>' +
      '<div class="rag-section"><div class="rag-section-title">Questions for clinician</div>' + listItems(data.questions_for_clinician) + '</div>' +
      '<div class="rag-section"><div class="rag-section-title">Information to prepare</div>' + listItems(data.information_to_prepare) + '</div>' +
      '<div class="rag-section"><div class="rag-section-title">Safety reminders</div>' + listItems(data.safety_reminders) + '</div>' +
      '<div class="rag-section"><div class="rag-section-title">Escalation conditions</div><div class="rag-section-content">' + esc(data.escalation_conditions || '') + '</div></div>' +
      '<div class="rag-section rag-alternatives"><div class="rag-section-title">Alternative pathways to consider</div>' + altHtml + '</div>' +
      '<div class="rag-section"><div class="rag-section-title">Confidence</div><div class="rag-section-content rag-confidence">' + score + (rationale ? ' — ' + rationale : '') + '</div></div>' +
      '<div class="rag-section rag-sources"><div class="rag-section-title">Sources</div>' + sourcesHtml + '</div>';

    // Optional: scroll the panel into view
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Handles a click on "Agentic RAG" for a pathway.
   * Builds payload (for future API), then uses hardcoded response and renders.
   * LATER: Replace the hardcoded call with fetch(AGENTIC_RAG_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
   *        and use the response body instead of getHardcodedResponse(pathwayId).
   */
  function handlePathwayClick(pathwayId) {
    var payload = buildMockPayload(pathwayId);

    // LATER: Uncomment and use real API; remove or bypass getHardcodedResponse.
    // fetch(AGENTIC_RAG_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload)
    // })
    //   .then(function (res) { return res.json(); })
    //   .then(function (data) { renderAgenticResponse(pathwayId, data); })
    //   .catch(function (err) { console.error('Agentic RAG error', err); });

    var data = getHardcodedResponse(pathwayId);
    renderAgenticResponse(pathwayId, data);
  }

  // Expose for inline onclick (and optional debugging)
  window.handlePathwayClick = handlePathwayClick;
  window.renderAgenticResponse = renderAgenticResponse;
  window.buildMockPayload = buildMockPayload;
})();
