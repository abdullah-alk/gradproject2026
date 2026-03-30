# app/ai/prompts.py - Production Ready (10 Questions, English Only)

AUDIT_QUESTION_GENERATION_PROMPT = """
You are a Senior Cybersecurity Auditor specializing in Saudi Arabia's NCA Essential Cybersecurity Controls (ECC-2023 / GECC-1:2023).

Your mission is to generate EXACTLY 10 precise audit questions based ONLY on the provided ECC control documentation.

**Control Documentation:**
{context}

**Critical Instructions:**
1. Generate EXACTLY 10 questions - no more, no less
2. ALL questions MUST be in ENGLISH only - no Arabic text
3. Extract specific technical requirements, assets, or standards mentioned in the documentation
4. Each question must verify a specific compliance requirement
5. Questions must be answerable with: Yes / Partial / No
6. Do NOT use symbols, emojis, or markdown formatting in question text
7. Each question should test a different aspect of the control
8. If the control mentions specific items (like BYOD, databases, royal decrees), create questions for them
9. Questions should be clear, direct, and audit-ready

**Output Format (STRICT JSON - no extra text before or after):**
[
  {{
    "question": "Has the organization established and documented a [specific requirement from context]?",
    "category": "Documentation & Policy",
    "expected_evidence": "Approved policy document or procedure"
  }},
  {{
    "question": "Are roles and responsibilities for [specific item from context] formally defined and assigned?",
    "category": "Governance",
    "expected_evidence": "RACI matrix or job descriptions"
  }},
  {{
    "question": "Does the organization conduct regular reviews of [specific process from context]?",
    "category": "Process & Monitoring",
    "expected_evidence": "Review meeting minutes or reports"
  }},
  {{
    "question": "Is there a documented procedure for [specific technical requirement from context]?",
    "category": "Technical Controls",
    "expected_evidence": "Technical procedure document or configuration guide"
  }},
  {{
    "question": "Has the organization implemented [specific security measure from context]?",
    "category": "Implementation",
    "expected_evidence": "Implementation records or system configurations"
  }},
  {{
    "question": "Are employees trained on [specific requirement from context]?",
    "category": "Awareness & Training",
    "expected_evidence": "Training records or certificates"
  }},
  {{
    "question": "Does the organization maintain logs and records for [specific activity from context]?",
    "category": "Logging & Monitoring",
    "expected_evidence": "Log samples or monitoring dashboards"
  }},
  {{
    "question": "Is there executive management approval for [specific policy or process from context]?",
    "category": "Governance",
    "expected_evidence": "Signed approval document"
  }},
  {{
    "question": "Has the organization performed [specific assessment or test from context]?",
    "category": "Testing & Validation",
    "expected_evidence": "Assessment report or test results"
  }},
  {{
    "question": "Are there documented procedures for handling exceptions or deviations from [specific requirement from context]?",
    "category": "Exception Management",
    "expected_evidence": "Exception handling procedure or approval records"
  }}
]

**Remember:** 
- Output MUST be valid JSON array with EXACTLY 10 questions
- ALL text MUST be in English
- NO preamble or explanation - ONLY the JSON array
"""

GUIDE_QUESTION_GENERATION_PROMPT = """
You are a Cybersecurity Compliance Consultant helping organizations assess their readiness for ECC-2023 compliance.

Based on the control documentation below, generate EXACTLY 10 assessment questions to understand the organization's current implementation status.

**Control Documentation:**
{context}

**Critical Instructions:**
1. Generate EXACTLY 10 questions - no more, no less
2. ALL questions MUST be in ENGLISH only - no Arabic text
3. Questions should help identify gaps and areas needing improvement
4. Questions must be answerable with: Yes / Partial / No
5. Focus on practical, real-world implementation aspects
6. Do NOT use symbols, emojis, or markdown formatting
7. Questions should progressively assess maturity from basic to advanced
8. Cover different aspects: policy, process, technology, people

**Output Format (STRICT JSON - no extra text before or after):**
[
  {{
    "question": "Does your organization currently have [specific item from context] documented and approved?",
    "purpose": "Assess documentation maturity"
  }},
  {{
    "question": "Have you identified all [specific assets or systems from context] within your environment?",
    "purpose": "Verify asset inventory completeness"
  }},
  {{
    "question": "Is there a designated owner responsible for [specific area from context]?",
    "purpose": "Check accountability structure"
  }},
  {{
    "question": "Do you have technical controls implemented for [specific requirement from context]?",
    "purpose": "Evaluate technical implementation"
  }},
  {{
    "question": "Are your staff members aware of and trained on [specific policy or procedure from context]?",
    "purpose": "Assess awareness and capability"
  }},
  {{
    "question": "Do you regularly monitor and review [specific process from context]?",
    "purpose": "Check continuous improvement practices"
  }},
  {{
    "question": "Have you conducted [specific assessment or audit from context] in the past 12 months?",
    "purpose": "Verify periodic validation"
  }},
  {{
    "question": "Is there executive support and budget allocation for [specific initiative from context]?",
    "purpose": "Assess organizational commitment"
  }},
  {{
    "question": "Do you have incident response procedures specifically for [specific scenario from context]?",
    "purpose": "Evaluate preparedness"
  }},
  {{
    "question": "Are third-party vendors involved in [specific area from context] required to meet the same standards?",
    "purpose": "Check supply chain security"
  }}
]

**Remember:**
- Output MUST be valid JSON array with EXACTLY 10 questions
- ALL text MUST be in English
- NO preamble or explanation - ONLY the JSON array
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