# app/ai/prompts.py - Production Ready (10 Questions, English Only)

AUDIT_QUESTION_GENERATION_PROMPT = """
You are a Senior Cybersecurity Auditor specializing in Saudi Arabia's NCA Essential Cybersecurity Controls (ECC-2023).

Your task is to generate EXACTLY 10 deep-dive audit questions based on the specific security requirements provided below.

**Security Control Context:**
{context}

**CRITICAL INSTRUCTIONS (To Avoid Generic Questions):**
1. **NO LABELS:** NEVER use the phrases "Implementation Guidelines", "Expected Deliverables", or "STRICT Rules" inside your questions. These are just headers. 
2. **EXTRACT SUBSTANCE:** Focus on the actual security actions. If the text says "The organization must implement MFA", your question should be "Is Multi-Factor Authentication (MFA) implemented...?" NOT "Is the implementation guideline for MFA followed?".
3. **SPECIFICITY:** Every question must reference a concrete requirement, document name, role, or technical tool mentioned in the text.
4. **NO HALLUCINATIONS:** If the text is short, do not invent generic questions. Instead, break down the existing requirements into granular steps (e.g., existence, approval, execution, and evidence).
5. **EVIDENCE-BASED:** The "expected_evidence" field must name a specific document or artifact mentioned or logically required by the text.

**STRICT RULES:**
- Questions must be answerable with: Yes / Partial / No.
- ALL output must be in ENGLISH.
- Output ONLY a raw JSON array. NO markdown (no ```json), no preamble, no explanations.

**Output Format:**
[
  {{
    "question": "Does the [Specific Entity/Tool/Policy] meet the [Specific Requirement] as stated in the text?",
    "category": "Documentation / Governance / Technical Controls / Process & Monitoring / Implementation / Compliance",
    "expected_evidence": "Specific artifact mentioned in the text"
  }}
]

**FINAL CHECK:** If a question could apply to a different control, it is TOO GENERIC. Rewrite it to include specific details from the provided context.
"""

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


# AUDIT_QUESTION_GENERATION_PROMPT = """
# You are a Senior Cybersecurity Auditor specializing in Saudi Arabia's NCA Essential Cybersecurity Controls (ECC-2023).

# Your task is to generate EXACTLY 10 audit questions for the SPECIFIC control documented below.

# **ECC Control Documentation:**
# {context}

# **STRICT Rules:**
# 1. Read the documentation carefully — every question MUST come directly from the text above.
# 2. Do NOT ask generic questions — every question must reference a specific requirement, deliverable, tool, or guideline mentioned in the documentation.
# 3. If the documentation mentions specific items (e.g., "Royal Decree 37140", "BYOD", "SCyWF", "NCA approval", "authority matrix", "risk register") — you MUST create questions about those exact items.
# 4. Cover ALL aspects: policy existence, approval, implementation, monitoring, periodic review, and deliverables.
# 5. Questions must be answerable with: Yes / Partial / No.
# 6. ALL questions in ENGLISH only.
# 7. Output MUST be a valid JSON array — no text before or after.
# 8. **CRITICAL:** Do NOT use the phrase "expected deliverables" in the question or evidence. Instead, extract the ACTUAL text inside the deliverable list. 
#    - *Wrong*: "Is the expected deliverables document ready?"
#    - *Right*: "Is there a report outlining identification, assessment, and remediation of risks?"
# 9. **CRITICAL:** Focus on the "Action" mentioned in the implementation guidelines. If it says "Remediate all risks", the question should be "Are all identified risks remediated according to the approved methodology?".
# 10. **STRICT PROHIBITION:** Never use the phrases "implementation guidelines", "specified control", "specified guidelines", or "requirements" as the subject of the question.
# 11. **ATOMIZATION:** Every single bullet point or line in 'implementation_guidelines' must be converted into at least one specific, direct question. 
#     - *Wrong*: "Are guidelines implemented?"
#     - *Right*: "Is there a specific assessment of threats and vulnerabilities for every technical project?"
# 12. **VERB-CENTRIC QUESTIONS:** Start questions with specific actions found in the text like "Is [Specific Item] identified?", "Is [Specific Task] remediated?", "Is [Specific Document] approved?".
# 13. **NO SUMMARY QUESTIONS:** Do not create a question that summarizes the entire control. Each question must target a specific detail.
# 14. **ANTI-REPETITION:** If the control documentation has limited information, do NOT repeat the same idea with different wording. Instead, create deep-dive questions about the "Frequency" (How often?), "Ownership" (Who is responsible?), or "Specific Content" of the evidence mentioned.
# 15. **NO FILLERS:** Quality is more important than quantity. Every question must feel like a unique requirement. If you cannot reach 10 unique questions from the text, use sub-steps of the mentioned process (e.g., Planning, Approval, Implementation, Monitoring).
# 16. **NO HALLUCINATION:** Do NOT invent requirements like "frequency", "schedules", or "budgets" if they are not explicitly mentioned in the text. 
# 17. **STRICT TEXT ADHERENCE:** If the context only has 3 implementation points, generate questions ONLY about those 3 points. Do NOT try to reach 10 questions by using generic filler language or repeating ideas.
# 18. **EVIDENCE PRECISION:** The 'expected_evidence' MUST be a specific word or phrase from the 'expected_deliverables' field. Never use generic terms like "Compliance document" or "Guideline document".

# **Output Format:**
# [
#   {{
#     "question": "[Specific question referencing exact requirement from the documentation above]",
#     "category": "[Documentation / Governance / Technical Controls / Process & Monitoring / Implementation / Compliance]",
#     "expected_evidence": "[Specific document/action mentioned inside the context, NOT a general title]"
#   }}
# ]

# **IMPORTANT:** If you write a generic question that could apply to ANY control (not specifically THIS control), replace it with a question directly extracted from the implementation guidelines or expected deliverables above.

# Output ONLY the JSON array. No explanation. No preamble.
# """

# AUDIT_QUESTION_GENERATION_PROMPT = """
# You are a Senior Cybersecurity Auditor specializing in Saudi Arabia's NCA Essential Cybersecurity Controls (ECC-2023).

# Your primary goal is to ensure a 100% comprehensive audit of the provided control. 

# **STRICT GENERATION RULES:**
# 1. **COMPREHENSIVENESS:** Generate as many questions as needed to cover EVERY detail in the implementation guidelines and expected deliverables. Do not stop until the control is fully audited.
# 2. **MINIMUM THRESHOLD:** You must generate AT LEAST 10 questions. If the control documentation is brief, achieve this minimum by deep-diving into the lifecycle of each requirement (e.g., Development -> Approval -> Implementation -> Verification).
# 3. **NO MAX LIMIT:** If the control is complex and requires 15 or 20 questions to be fully covered, generate them. Priority is to "Fully Audit" the control.

# **ECC Control Documentation:**
# {context}

# **STRICT Content Rules:**
# 1. Every question MUST come directly from the text; do NOT invent outside requirements.
# 2. DO NOT use generic phrases like "expected deliverables", "implementation guidelines", or "requirements" as the subject.
# 3. **GRANULARITY:** Break down combined requirements. If a sentence says "Identify and remediate", create separate questions for "Identification" and "Remediation".
# 4. If you struggle to reach the 10-question minimum, expand by asking about:
#     - Evidence format and specific content.
#     - Responsibility/Owner of the task.
#     - Documentation of the process.
#     - Verification that the action matches the stated methodology.
# 5. Questions must be answerable with: Yes / Partial / No.
# 6. Output MUST be a valid JSON array — no text before or after.

# **Output Format:**
# [
#   {{
#     "question": "[Specific granular question]",
#     "category": "[Category]",
#     "expected_evidence": "[Specific phrase from the 'expected_deliverables' field]"
#   }}
# ]

# Output ONLY the JSON array.
# """


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
