# 3️⃣ Optimization Model — Gurobi Routing Problem

**Purpose:** Formally define the care pathway routing problem so it can be implemented in Gurobi (or another MIP solver). Once this model exists, the “routing” node in the agent graph simply fills parameters from NavigationContext and capacity data, then calls the solver.

---

## Design principles

- **Patient-centric objective:** Minimize “inappropriate” use (e.g. ED when virtual/primary would suffice) and wait/time-to-care, subject to safety and capacity.
- **Safety as hard constraints:** Emergency cases are not routed by this model; they are handled by the EMERGENCY node. For non-emergency cases, acuity and pathway eligibility are hard constraints.
- **Capacity-aware:** Use observed or forecast capacity (e.g. virtual slots, UTC wait, ED congestion) so the recommendation is feasible.
- **Interpretable:** Decision variables and constraints map to clear clinical and operational concepts; duals or sensitivity can support explanations.

---

## Notation

**Sets**

| Symbol | Description |
|--------|--------------|
| \( P \) | Set of pathways (e.g. virtualcarens, pharmacy, primarycare, urgent, emergency). |
| \( P_{\text{eligible}} \) | Subset of \( P \) that are eligible for this case (from NavigationContext). |

**Parameters (per session / from NavigationContext and system data)**

| Symbol | Type | Description |
|--------|------|-------------|
| \( r \) | risk level | Encoded e.g. low=1, moderate=2, urgent=3 (emergency not in this model). |
| \( w_p \) | \( \mathbb{R}_+ \) | Weight or “cost” of recommending pathway \( p \) (e.g. ED cost higher than virtual). |
| \( t_p \) | \( \mathbb{R}_+ \) | Expected wait or time-to-care for pathway \( p \) (minutes or ordinal). |
| \( c_p \) | \( \mathbb{R}_+ \) | Capacity “price” or slack (e.g. how constrained pathway \( p \) is). |
| \( e_p \) | \( \{0,1\} \) | 1 if pathway \( p \) is eligible for this case, 0 otherwise (from pathway_eligibility). |

**Decision variables**

| Symbol | Type | Description |
|--------|------|-------------|
| \( x_p \) | \( \{0,1\} \) | 1 if pathway \( p \) is recommended, 0 otherwise. |
| \( y_p \) | \( \mathbb{R}_+ \) | Optional: “strength” or rank of pathway \( p \) for alternatives (e.g. 0–1). |

**Constraints**

- **Single recommendation:** \( \sum_{p \in P} x_p = 1 \) (exactly one pathway recommended).
- **Eligibility:** \( x_p \leq e_p \) for all \( p \) (only eligible pathways can be recommended).
- **Optional — capacity:** If capacity limits are modeled, e.g. \( \sum_{\text{sessions}} x_p \leq C_p \) in a batch setting; in a single-session setting, capacity can be folded into \( w_p \) or \( t_p \) (e.g. higher cost when pathway is saturated).

**Objective (minimize)**

\[
\min \quad \sum_{p \in P} \left( w_p \, x_p + \alpha \, t_p \, x_p + \beta \, c_p \, x_p \right)
\]

- \( w_p \): preference or “inappropriateness” cost (e.g. ED has high \( w_p \) when case is low acuity).
- \( \alpha \, t_p \): wait/time-to-care term.
- \( \beta \, c_p \): capacity pressure term (optional).

So we minimize a weighted sum of inappropriateness, wait, and capacity pressure over the chosen pathway.

---

## Example parameterization (conceptual)

- **Weights \( w_p \):**  
  - virtualcarens: 1, pharmacy: 1.2, primarycare: 1.5, urgent: 2, emergency: 3 (only if ever in set; usually excluded for non-emergency).

- **Wait \( t_p \) and capacity \( c_p \):**  
  - Sourced from the **Healthcare System Integration Layer** (Layer 3), e.g. NS Health Capacity API, VirtualCareNS availability, UTC wait times. From real-time or cached data (e.g. VirtualCareNS ~12 min, UTC ~35 min, primary care “next available” from registry).

- **Eligibility \( e_p \):**  
  - From NavigationContext.pathway_eligibility (1 if eligible, 0 otherwise).

- **Risk:**  
  - Can adjust \( w_p \) by risk (e.g. for moderate risk, increase weight on urgent/ED so the model prefers safer options when appropriate).

---

## Output

- **Recommended pathway:** \( p^* = \arg\min_p \{ x_p = 1 \} \) → `routing_result.recommended_pathway_id`.
- **Alternatives:** Order pathways by increasing objective value (or by \( y_p \) if rank variables are used) → `routing_result.alternatives`.
- **Confidence:** E.g. 1 minus (gap between best and second-best objective) normalized, or from a separate classifier.
- **Optimizer metadata:** Objective value, solve time, MIP gap → `routing_result.optimizer_metadata`.

---

## Implementation notes

1. **Single-session vs batch:** The above is single-session. For batch (e.g. many patients and capacity shared across pathways), add indices for patients and capacity constraints \( \sum_i x_{i,p} \leq C_p \) and optionally coupling constraints.
2. **Fallback:** If Gurobi is unavailable or fails, use a rule-based fallback: e.g. choose lowest-acuity eligible pathway, then by smallest \( t_p \).
3. **Integration with agent:** ROUTING_OPT node takes NavigationContext (and capacity feed), builds \( P \), \( e_p \), \( w_p \), \( t_p \), \( c_p \), runs the model, and writes `routing_result` into NavigationContext.

---

## Status

- **Version:** 1.0  
- **Next:** Implement in Gurobi (Python or preferred language); expose as a function called by the routing node with parameters from NavigationContext and capacity service.
