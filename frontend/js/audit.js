// ===================================
// Audit Session Logic (Standalone)
// ===================================

let auditSessionId = null;
let auditQuestions = [];
let currentAuditQuestionIndex = 0;
let auditControlId = null;

// ===================================
// Initialize Audit from URL or Direct Call
// ===================================

function initializeAuditFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const controlId = urlParams.get('control_id');
    
    if (controlId) {
        startQuickAudit(controlId);
    }
}

// Quick start audit function (can be called from anywhere)
async function startQuickAudit(controlId) {
    if (!checkAuth()) return;

    try {
        showLoader();

        auditControlId = controlId;

        // Start audit session
        const session = await startAuditSession(controlId, 'audit');
        auditSessionId = session.id;

        // Get questions
        auditQuestions = await getAuditQuestions(session.id);
        currentAuditQuestionIndex = 0;

        // Display first question
        displayAuditQuestion();

        hideLoader();

    } catch (error) {
        console.error('Error starting audit:', error);
        showError('Failed to start audit');
        hideLoader();
    }
}

// ===================================
// Display Audit Question
// ===================================

function displayAuditQuestion() {
    if (currentAuditQuestionIndex >= auditQuestions.length) {
        showAuditCompletion();
        return;
    }

    const question = auditQuestions[currentAuditQuestionIndex];

    // Update question number
    const questionNumberEl = document.getElementById('question-number');
    if (questionNumberEl) {
        questionNumberEl.textContent = `Question ${currentAuditQuestionIndex + 1} of ${auditQuestions.length}`;
    }

    // Update question category/control
    const questionCategoryEl = document.getElementById('question-category');
    if (questionCategoryEl) {
        questionCategoryEl.textContent = auditControlId || 'Audit';
    }

    // Update question text
    const questionTextEl = document.getElementById('question-text');
    if (questionTextEl) {
        questionTextEl.textContent = question.question || 'Loading...';
    }

    // Update evidence hint
    const evidenceHintEl = document.getElementById('evidence-hint');
    if (evidenceHintEl) {
        evidenceHintEl.textContent = question.expected_evidence 
            ? `Expected evidence: ${question.expected_evidence}` 
            : '';
    }

    // Update progress bar
    const progress = ((currentAuditQuestionIndex + 1) / auditQuestions.length) * 100;
    const progressBar = document.getElementById('audit-progress');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
}

// ===================================
// Submit Answer
// ===================================

async function submitAnswer(answer) {
    const question = auditQuestions[currentAuditQuestionIndex];

    try {
        // Show loading state on buttons
        disableAnswerButtons();

        // Submit to API
        await submitAuditAnswer(auditSessionId, question.id, answer.toLowerCase());

        // Move to next question
        currentAuditQuestionIndex++;

        // Small delay for UX
        setTimeout(() => {
            displayAuditQuestion();
            enableAnswerButtons();
        }, 300);

    } catch (error) {
        console.error('Error submitting answer:', error);
        showError('Failed to submit answer');
        enableAnswerButtons();
    }
}

// ===================================
// Button State Management
// ===================================

function disableAnswerButtons() {
    const buttons = document.querySelectorAll('.answer-buttons button, .btn-answer');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    });
}

function enableAnswerButtons() {
    const buttons = document.querySelectorAll('.answer-buttons button, .btn-answer');
    buttons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    });
}

// ===================================
// Show Audit Completion
// ===================================

function showAuditCompletion() {
    // Hide question section
    const questionSection = document.getElementById('audit-session');
    if (questionSection) {
        questionSection.innerHTML = `
            <div class="glass-card p-8" style="text-align: center;">
                <div style="margin-bottom: 32px;">
                    <i class="fas fa-check-circle" style="font-size: 80px; color: #10b981;"></i>
                </div>
                <h2 style="font-size: 32px; font-weight: 700; margin-bottom: 16px; color: #10b981;">
                    Audit Complete!
                </h2>
                <p style="font-size: 18px; color: var(--text-muted); margin-bottom: 32px;">
                    Your responses have been recorded successfully.<br>
                    The compliance score is being calculated.
                </p>
                <div style="display: flex; gap: 16px; justify-content: center;">
                    <a href="dashboard.html" class="btn btn-primary" style="text-decoration: none;">
                        <i class="fas fa-chart-line"></i>
                        View Dashboard
                    </a>
                    <a href="chatbot.html" class="btn btn-secondary" style="text-decoration: none;">
                        <i class="fas fa-redo"></i>
                        Start Another Audit
                    </a>
                </div>
            </div>
        `;
    }

    showSuccess('Audit completed successfully!');
}

// ===================================
// Keyboard Navigation
// ===================================

document.addEventListener('keydown', (event) => {
    // Only if audit is active
    if (!auditSessionId || currentAuditQuestionIndex >= auditQuestions.length) {
        return;
    }

    switch(event.key) {
        case '1':
            submitAnswer('Compliant');
            break;
        case '2':
            submitAnswer('Non-Compliant');
            break;
        case '3':
            submitAnswer('Partial');
            break;
        case '4':
            submitAnswer('N/A');
            break;
    }
});

// ===================================
// Auto-initialize if on audit page
// ===================================

if (document.getElementById('audit-session')) {
    document.addEventListener('DOMContentLoaded', () => {
        initializeAuditFromURL();
    });
}