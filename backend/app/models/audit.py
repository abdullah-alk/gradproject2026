from sqlalchemy import Column, Integer, String, Text, DECIMAL, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class AuditSession(Base):
    __tablename__ = "audit_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    control_id = Column(Integer, ForeignKey("ecc_controls.id", ondelete="CASCADE"))
    mode = Column(String(50), nullable=False)
    status = Column(String(50), default="in_progress")
    score = Column(DECIMAL(5, 2))
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    scheduled_next_audit = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    questions = relationship("AuditQA", back_populates="session", cascade="all, delete-orphan")
    evidence = relationship("Evidence", back_populates="session", cascade="all, delete-orphan")

class AuditQA(Base):
    __tablename__ = "audit_qa"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("audit_sessions.id", ondelete="CASCADE"))
    question = Column(Text, nullable=False)
    answer = Column(String(50))
    ai_generated = Column(Boolean, default=True)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    session = relationship("AuditSession", back_populates="questions")