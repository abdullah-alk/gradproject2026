from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.control import ECCControl
from ..schemas.control import ECCControlResponse, ECCControlHierarchy
from ..api.auth import get_current_user
from ..models.user import User

router = APIRouter(prefix="/api/controls", tags=["ECC Controls"])

@router.get("/", response_model=List[ECCControlResponse])
async def get_all_controls(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    الحصول على جميع ECC Controls
    """
    controls = db.query(ECCControl).all()
    return controls

@router.get("/hierarchy", response_model=List[ECCControlHierarchy])
async def get_controls_hierarchy(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    الحصول على Controls بشكل هرمي (Domain -> Control -> Sub-control)
    """
    controls = db.query(ECCControl).order_by(ECCControl.control_id).all()
    
    # تنظيم الهيكل الهرمي
    hierarchy = {}
    
    for control in controls:
        domain = control.domain
        if domain not in hierarchy:
            hierarchy[domain] = {
                "domain": domain,
                "controls": []
            }
        
        # التحقق من المستوى
        if control.level == 1:
            # Control رئيسي
            hierarchy[domain]["controls"].append({
                "control_id": control.control_id,
                "title": control.title,
                "description": control.description,
                "sub_controls": []
            })
        elif control.level == 2:
            # Sub-control
            parent_id = control.parent_control_id
            # البحث عن الـ parent وإضافة الـ sub-control
            for ctrl in hierarchy[domain]["controls"]:
                if ctrl["control_id"] == parent_id:
                    ctrl["sub_controls"].append({
                        "control_id": control.control_id,
                        "title": control.title,
                        "description": control.description
                    })
                    break
    
    return list(hierarchy.values())

@router.get("/{control_id}", response_model=ECCControlResponse)
async def get_control_details(
    control_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    الحصول على تفاصيل Control محدد
    """
    control = db.query(ECCControl).filter(ECCControl.control_id == control_id).first()
    
    if not control:
        raise HTTPException(status_code=404, detail="Control not found")
    
    return control