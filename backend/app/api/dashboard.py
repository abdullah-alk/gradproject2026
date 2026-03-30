@router.get("/domain-scores")
async def get_domain_scores(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    الحصول على Compliance Scores حسب الـ Domains
    """
    # الحصول على جميع الـ Domains
    domains = db.query(ECCControl.domain).distinct().all()
    
    results = []
    
    for (domain,) in domains:
        # الحصول على Controls الخاصة بهذا الـ Domain
        controls = db.query(ECCControl).filter(ECCControl.domain == domain).all()
        control_ids = [c.id for c in controls]
        
        # حساب متوسط الـ Score
        avg_score = db.query(func.avg(ComplianceScore.score)).filter(
            ComplianceScore.user_id == current_user.id,
            ComplianceScore.control_id.in_(control_ids)
        ).scalar() or 0
        
        results.append({
            "domain": domain,
            "score": round(avg_score, 1)
        })
    
    return results

@router.get("/stats")
async def get_enhanced_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    إحصائيات محسّنة
    """
    # ... الكود الموجود ...
    
    # إضافة معلومات جديدة
    stats["critical_gaps"] = db.query(GapsRecommendations).filter(
        GapsRecommendations.priority == "high"
    ).count()
    
    stats["medium_gaps"] = db.query(GapsRecommendations).filter(
        GapsRecommendations.priority == "medium"
    ).count()
    
    stats["low_gaps"] = db.query(GapsRecommendations).filter(
        GapsRecommendations.priority == "low"
    ).count()
    
    # معلومات عن التدقيق القادم
    next_audit = db.query(AuditSession).filter(
        AuditSession.user_id == current_user.id,
        AuditSession.status == "scheduled",
        AuditSession.scheduled_next_audit > datetime.utcnow()
    ).order_by(AuditSession.scheduled_next_audit).first()
    
    if next_audit:
        stats["next_audit_date"] = next_audit.scheduled_next_audit.isoformat()
    
    return stats