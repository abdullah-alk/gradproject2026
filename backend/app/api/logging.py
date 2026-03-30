# app/api/logging.py
from fastapi import Request
from ..database import get_db
from ..models.audit_log import AuditLog
from datetime import datetime

async def log_action(
    request: Request,
    user_id: int,
    action: str,
    resource_type: str = None,
    resource_id: int = None
):
    """
    تسجيل الإجراءات للأمان
    """
    db = next(get_db())
    
    log_entry = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
        timestamp=datetime.utcnow()
    )
    
    db.add(log_entry)
    db.commit()