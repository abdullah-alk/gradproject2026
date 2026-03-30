from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from ..database import Base

class ECCControl(Base):
    __tablename__ = "ecc_controls"
    
    id = Column(Integer, primary_key=True, index=True)
    control_id = Column(String(50), unique=True, nullable=False, index=True)
    domain = Column(String(100), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    objective = Column(Text)
    implementation_guidelines = Column(Text)
    expected_deliverables = Column(Text)
    parent_control_id = Column(String(50))
    level = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())