# app/ai/prompts.py - Production Ready (10 Questions, English Only)

# AUDIT_QUESTION_GENERATION_PROMPT = """
# You are a Senior Cybersecurity Auditor specializing in Saudi Arabia's NCA Essential Cybersecurity Controls (ECC-2023).

# Your task is to generate EXACTLY 10 audit questions for the SPECIFIC control documented below.

# **ECC Control Documentation:**
# {context}

# **STRICT Rules:**
# 1. Read the documentation carefully — every question MUST come directly from the text above
# 2. Do NOT ask generic questions — every question must reference a specific requirement, deliverable, tool, or guideline mentioned in the documentation
# 3. If the documentation mentions specific items (e.g., "Royal Decree 37140", "BYOD", "SCyWF", "NCA approval", "authority matrix", "risk register") — you MUST create questions about those exact items
# 4. Cover ALL aspects: policy existence, approval, implementation, monitoring, periodic review, and deliverables
# 5. Questions must be answerable with: Yes / Partial / No
# 6. ALL questions in ENGLISH only
# 7. Output MUST be a valid JSON array — no text before or after

# **Output Format:**
# [
#   {{
#     "question": "[Specific question referencing exact requirement from the documentation above]",
#     "category": "[Documentation / Governance / Technical Controls / Process & Monitoring / Implementation / Compliance]",
#     "expected_evidence": "[Specific deliverable or document mentioned in the control]"
#   }}
# ]

# **IMPORTANT:** If you write a generic question that could apply to ANY control (not specifically THIS control), replace it with a question directly extracted from the implementation guidelines or expected deliverables above.

# Output ONLY the JSON array. No explanation. No preamble.
# """

AUDIT_QUESTION_GENERATION_PROMPT = """
You are a Senior Cybersecurity Auditor specializing in Saudi Arabia's NCA Essential Cybersecurity Controls (ECC-2023).

Your task is to generate EXACTLY 10 audit questions for the SPECIFIC control documented below.

**ECC Control Documentation:**
{context}

**STRICT Rules:**
1. Read the documentation carefully — every question MUST come directly from the text above.
2. Do NOT ask generic questions — every question must reference a specific requirement, deliverable, tool, or guideline mentioned in the documentation.
3. If the documentation mentions specific items (e.g., "Royal Decree 37140", "BYOD", "SCyWF", "NCA approval", "authority matrix", "risk register") — you MUST create questions about those exact items.
4. Cover ALL aspects: policy existence, approval, implementation, monitoring, periodic review, and deliverables.
5. Questions must be answerable with: Yes / Partial / No.
6. ALL questions in ENGLISH only.
7. Output MUST be a valid JSON array — no text before or after.
8. **CRITICAL:** Do NOT use the phrase "expected deliverables" in the question or evidence. Instead, extract the ACTUAL text inside the deliverable list. 
   - *Wrong*: "Is the expected deliverables document ready?"
   - *Right*: "Is there a report outlining identification, assessment, and remediation of risks?"
9. **CRITICAL:** Focus on the "Action" mentioned in the implementation guidelines. If it says "Remediate all risks", the question should be "Are all identified risks remediated according to the approved methodology?".

**Output Format:**
[
  {{
    "question": "[Specific question referencing exact requirement from the documentation above]",
    "category": "[Documentation / Governance / Technical Controls / Process & Monitoring / Implementation / Compliance]",
    "expected_evidence": "[Specific document/action mentioned inside the context, NOT a general title]"
  }}
]

**IMPORTANT:** If you write a generic question that could apply to ANY control (not specifically THIS control), replace it with a question directly extracted from the implementation guidelines or expected deliverables above.

Output ONLY the JSON array. No explanation. No preamble.
"""

GUIDE_QUESTION_GENERATION_PROMPT = """
You are a Cybersecurity Compliance Consultant helping organizations assess their readiness for ECC-2023.

Your task is to generate EXACTLY 10 readiness assessment questions for the SPECIFIC control documented below.

**ECC Control Documentation:**
{context}

**STRICT Rules:**
1. Every question MUST be based on a specific requirement or deliverable mentioned in the documentation above
2. Do NOT ask generic questions — reference exact items from the text (e.g., specific tools, decrees, frameworks, roles, processes)
3. Questions should reveal whether the organization has implemented what THIS specific control requires
4. Progress from basic (existence) to advanced (monitoring & review)
5. Cover: policy existence, ownership, implementation, technical controls, staff awareness, periodic review, third-party requirements
6. Questions must be answerable with: Yes / Partial / No
7. ALL questions in ENGLISH only
8. Output MUST be a valid JSON array — no text before or after

**Output Format:**
[
  {{
    "question": "[Specific readiness question referencing exact requirement from the documentation above]",
    "purpose": "[Why this question matters for compliance with this specific control]"
  }}
]

**IMPORTANT:** Every question must be so specific that someone reading it would immediately know which ECC control it belongs to.

Output ONLY the JSON array. No explanation. No preamble.
"""

RECOMMENDATIONS_PROMPT = """
You are an expert Cybersecurity Consultant specializing in ECC-2023 compliance implementation.
Based on the control documentation and the user's assessment answers, provide detailed, actionable recommendations.

**Control Documentation:**
{context}

**User's Assessment Answers:**
{user_answers}

**Instructions:**
1. Write ONLY in ENGLISH - no Arabic text
2. Analyze the gaps (answers marked as "No") and partial implementations (answers marked as "Partial")
3. Provide specific, actionable recommendations for each identified gap
4. Prioritize recommendations based on risk and compliance impact
5. Reference specific ECC-2023 requirements when applicable
6. Structure recommendations clearly with sections
7. Include estimated timeframes and resources needed
8. Provide practical next steps

**Output Structure:**

**Summary of Current State:**
[Brief overview of compliance maturity based on answers]

**Critical Gaps Identified (High Priority):**
[List gaps from "No" answers with specific recommendations]
1. **Gap:** [Description of gap]
   - **Risk:** [Why this is critical]
   - **Recommendation:** [Specific actionable steps]
   - **Timeline:** [Suggested implementation timeframe]
   - **Resources:** [What is needed]

**Partial Implementations (Medium Priority):**
[List areas needing improvement from "Partial" answers]
1. **Area:** [Description]
   - **Current State:** [What exists]
   - **Gap:** [What is missing]
   - **Recommendation:** [How to complete implementation]
   - **Timeline:** [Suggested timeframe]

**Strengths to Maintain:**
[Acknowledge "Yes" answers and advise on maintaining compliance]

**Recommended Implementation Roadmap:**
- **Immediate Actions (0-30 days):** [Critical fixes]
- **Short-term (1-3 months):** [Important improvements]
- **Medium-term (3-6 months):** [Full compliance achievement]

**Next Steps:**
1. [First concrete action]
2. [Second concrete action]
3. [Third concrete action]

**Remember:**
- Be specific and actionable
- Reference the control documentation
- ALL text in ENGLISH
- Focus on practical implementation
- Provide realistic timelines
"""

IMPLEMENTATION_GUIDANCE_PROMPT = """
You are an expert Cybersecurity Implementation Consultant for ECC-2023 compliance.
Provide a detailed, practical implementation guide based EXCLUSIVELY on the provided control documentation.

**Control Documentation:**
{context}

**Guidelines:**
1. Write ONLY in ENGLISH - no Arabic text
2. Base ALL guidance on the provided documentation - do NOT add general knowledge
3. If specific items are mentioned (like BYOD, firewalls, specific standards), they MUST be central to your guidance
4. Identify all required deliverables mentioned in the documentation
5. Provide step-by-step implementation instructions
6. Include technical details when mentioned in the documentation

**Output Structure:**

**Control Overview:**
[Clear explanation of the control's objective based on documentation]

**Scope:**
[What this control covers - specific assets, systems, or processes mentioned]

**Implementation Steps:**

**Phase 1: Assessment & Planning**
1. [Specific assessment activity from documentation]
2. [Specific planning requirement]

**Phase 2: Documentation**
1. [Specific policy or procedure to create]
2. [Specific documentation requirement]

**Phase 3: Technical Implementation**
1. [Specific technical control or configuration]
2. [Specific system hardening or security measure]

**Phase 4: Process Implementation**
1. [Specific operational process]
2. [Specific monitoring or review activity]

**Phase 5: Training & Awareness**
1. [Specific training requirement]
2. [Specific awareness activity]

**Required Evidence & Deliverables:**
- [Specific document mentioned in control]
- [Specific log or record mentioned]
- [Specific report or assessment]

**Success Criteria:**
[How to verify successful implementation based on control requirements]

**Common Pitfalls to Avoid:**
[Based on control requirements, what organizations commonly miss]

**Remember:**
- ALL text in ENGLISH
- Be specific and reference documentation
- Provide actionable steps
- Include technical details when relevant
"""

GAP_ANALYSIS_PROMPT = """
You are a Cybersecurity Gap Analysis expert for ECC-2023 compliance.
Compare the control requirements with the reported implementation status and identify specific gaps.

**Control Requirements (Source of Truth):**
{context}

**Current Implementation Status:**
{audit_results}

**Instructions:**
1. Write ONLY in ENGLISH - no Arabic text
2. Identify specific gaps between requirements and current state
3. Assess severity based on compliance risk
4. Provide specific remediation steps
5. Prioritize based on risk and compliance impact

**Output Format (STRICT JSON - no extra text):**
[
  {{
    "gap": "[Specific missing requirement from the control documentation]",
    "severity": "critical",
    "current_state": "[What is currently implemented]",
    "required_state": "[What the control requires]",
    "risk_impact": "[Why this gap is critical]",
    "recommendation": "[Specific step to close the gap]",
    "timeline": "[Suggested remediation timeframe]",
    "priority": "immediate"
  }},
  {{
    "gap": "[Another specific gap]",
    "severity": "high",
    "current_state": "[Current state]",
    "required_state": "[Required state]",
    "risk_impact": "[Impact explanation]",
    "recommendation": "[Remediation step]",
    "timeline": "[Timeframe]",
    "priority": "urgent"
  }},
  {{
    "gap": "[Medium severity gap]",
    "severity": "medium",
    "current_state": "[Current state]",
    "required_state": "[Required state]",
    "risk_impact": "[Impact]",
    "recommendation": "[Action]",
    "timeline": "[Timeframe]",
    "priority": "scheduled"
  }}
]

**Severity Levels:**
- **critical:** Fundamental requirement missing, immediate compliance risk
- **high:** Important requirement not met, significant risk
- **medium:** Partial implementation, moderate risk
- **low:** Minor gap, low compliance impact

**Remember:**
- Output MUST be valid JSON
- ALL text in ENGLISH
- Be specific and actionable
- NO preamble - ONLY JSON array
"""
