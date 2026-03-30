from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class Evidence(Base):
    __tablename__ = "evidence"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("audit_sessions.id", ondelete="CASCADE"))
    control_id = Column(Integer, ForeignKey("ecc_controls.id", ondelete="CASCADE"))
    evidence_type = Column(String(100))
    title = Column(String(500), nullable=False)
    description = Column(Text)
    file_path = Column(String(500))
    status = Column(String(50), default="pending")
    responsible_person = Column(String(255))
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    session = relationship("AuditSession", back_populates="evidence")