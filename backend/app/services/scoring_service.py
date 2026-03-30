from sqlalchemy.orm import Session
from ..models.audit import AuditSession, AuditQA
from ..models.evidence import ComplianceScore
from datetime import datetime

class ScoringService:
    async def calculate_compliance_score(self, session_id: int, db: Session) -> float:
        """
        حساب Compliance Score بناءً على الإجابات
        
        Scoring Logic:
        - Yes = 100%
        - Partial = 50%
        - No = 0%
        - N/A = excluded from calculation
        """
        questions = db.query(AuditQA).filter(AuditQA.session_id == session_id).all()
        
        total_score = 0
        counted_questions = 0
        
        yes_count = 0
        no_count = 0
        partial_count = 0
        
        for q in questions:
            if q.answer == "yes":
                total_score += 100
                counted_questions += 1
                yes_count += 1
            elif q.answer == "partial":
                total_score += 50
                counted_questions += 1
                partial_count += 1
            elif q.answer == "no":
                total_score += 0
                counted_questions += 1
                no_count += 1
            # N/A is not counted
        
        if counted_questions == 0:
            return 0.0
        
        final_score = total_score / counted_questions
        
        # حفظ النتيجة في جدول Compliance Scores
        session = db.query(AuditSession).filter(AuditSession.id == session_id).first()
        
        compliance_score = ComplianceScore(
            user_id=session.user_id,
            control_id=session.control_id,
            score=final_score,
            total_questions=counted_questions,
            answered_yes=yes_count,
            answered_no=no_count,
            answered_partial=partial_count,
            calculated_at=datetime.utcnow()
        )
        
        db.add(compliance_score)
        db.commit()
        
        return round(final_score, 2)