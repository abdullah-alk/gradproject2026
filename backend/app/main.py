from fastapi import FastAPI, HTTPException, Body, Form, Depends, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import shutil
import uuid
import json
import re
from datetime import datetime, timedelta
from typing import Optional

app = FastAPI(title="CyberGuard GRC - Production Ready")

# --- 1. CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. AI Engine (lazy load for Railway/Render) ---
rag_engine = None


def get_rag_engine():
    global rag_engine
    if rag_engine is None:
        print("\n" + "=" * 50)
        print("[🚀] INITIALIZING CYBERGUARD AI ENGINE...")
        print("[⚙️] Connecting to Groq Cloud...")
        from app.ai.rag_engine import RAGEngine
        rag_engine = RAGEngine()
        print("[✅] AI ENGINE IS ONLINE AND READY!")
        print("=" * 50 + "\n")
    return rag_engine


# --- 3. Database config ---
DATABASE_URL = os.environ.get("DATABASE_URL")

UPLOAD_DIR = "secure_evidence_vault"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)


def get_db_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg2.connect(
        DATABASE_URL,
        cursor_factory=RealDictCursor,
        connect_timeout=10,
    )


# --- 4. Auth helpers ---
def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:71]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        pwd_bytes = plain_password.encode("utf-8")[:71]
        return bcrypt.checkpw(pwd_bytes, hashed_password.encode("utf-8"))
    except Exception:
        return False


def extract_user_id_from_token(token: str | None) -> Optional[int]:
    if not token:
        return None
    token = token.replace("Bearer ", "").strip()
    match = re.search(r"token_(\d+)_", token)
    return int(match.group(1)) if match else None


def get_current_user(authorization: Optional[str] = Header(None)):
    user_id = extract_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT id, username, full_name, email, role, is_active
            FROM users
            WHERE id = %s AND is_active = true
            """,
            (user_id,),
        )
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Unauthorized")
        return dict(user)
    finally:
        cur.close()
        conn.close()


# --- VALIDATION (unchanged) ---
def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number"
    if not re.search(r"[@$!%*?&#]", password):
        return False, "Password must contain at least one special character"
    return True, "Valid"


def validate_full_name(name: str) -> tuple[bool, str]:
    if not name or len(name.strip()) < 2:
        return False, "Name must be at least 2 characters"
    if not re.match(r"^[A-Za-z\s]+$", name):
        return False, "Name must contain only English letters and spaces"
    return True, "Valid"


# =========================
# REGISTER / LOGIN (unchanged)
# =========================
@app.post("/api/register")
async def register(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        pwd_valid, pwd_msg = validate_password(data.get("password", ""))
        if not pwd_valid:
            raise HTTPException(status_code=400, detail=pwd_msg)

        cur.execute(
            "SELECT id FROM users WHERE username=%s OR email=%s",
            (data["username"], data["email"]),
        )
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="User exists")

        cur.execute(
            """
            INSERT INTO users (full_name, username, email, password_hash, role, is_active, created_at)
            VALUES (%s,%s,%s,%s,'User',true,NOW())
            """,
            (
                data["full_name"],
                data["username"],
                data["email"],
                hash_password(data["password"]),
            ),
        )
        conn.commit()
        return {"message": "OK"}
    finally:
        cur.close()
        conn.close()


@app.post("/api/auth/login")
async def login(username: str = Form(...), password: str = Form(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM users WHERE username=%s", (username,))
        user = cur.fetchone()

        if user and verify_password(password, user["password_hash"]):
            return {
                "access_token": f"token_{user['id']}_{datetime.now().timestamp()}",
                "user": {"id": user["id"], "username": user["username"]},
            }

        raise HTTPException(status_code=401, detail="Invalid")
    finally:
        cur.close()
        conn.close()


# =========================
# FIX 1: COMPLIANCE SCORE (USER FIXED)
# =========================
@app.post("/api/audit/compliance-score")
async def save_compliance_score(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = current_user["id"]

        cur.execute(
            "DELETE FROM compliance_scores WHERE user_id=%s AND control_id=%s",
            (user_id, data.get("control_id")),
        )

        cur.execute(
            """
            INSERT INTO compliance_scores
            (user_id, control_id, score, total_questions, answered_yes, answered_no, answered_partial, calculated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,NOW())
            """,
            (
                user_id,
                data.get("control_id"),
                data.get("score", 0),
                data.get("total_questions", 0),
                data.get("answered_yes", 0),
                data.get("answered_no", 0),
                data.get("answered_partial", 0),
            ),
        )
        conn.commit()
        return {"message": "saved"}
    finally:
        cur.close()
        conn.close()


# =========================
# FIX 2: START SESSION (USER FIXED)
# =========================
@app.post("/api/audit/session/start")
async def start_audit_session(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = current_user["id"]

        cur.execute(
            """
            INSERT INTO audit_sessions
            (user_id, control_id, mode, status, started_at, scheduled_next_audit, created_at)
            VALUES (%s,%s,%s,'in_progress',NOW(),NOW()+interval '30 days',NOW())
            RETURNING id
            """,
            (user_id, data.get("control_id"), data.get("mode", "audit")),
        )

        session = cur.fetchone()
        conn.commit()
        return {"session_id": session["id"]}
    finally:
        cur.close()
        conn.close()


# =========================
# FIX 3: SESSIONS (USER FILTER)
# =========================
@app.get("/api/audit/sessions")
async def get_audit_sessions(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT * FROM audit_sessions WHERE user_id=%s ORDER BY created_at DESC",
            (current_user["id"],),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


# =========================
# FIX 4: SCHEDULED AUDITS (USER FIXED)
# =========================
@app.get("/api/audit/sessions/scheduled")
async def get_scheduled_audits(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT *
            FROM audit_sessions
            WHERE user_id=%s AND status='scheduled'
            ORDER BY scheduled_next_audit ASC
            """,
            (current_user["id"],),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


# =========================
# FIX 5: AUTO SCHEDULER (NO USER=1 ANYMORE)
# =========================
@app.post("/api/scheduler/auto")
async def toggle_auto_scheduling(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = current_user["id"]

        cur.execute(
            "SELECT COUNT(*) FROM ecc_controls WHERE status='Non-Compliant'"
        )
        gaps = cur.fetchone()["count"] or 0

        days = 7 if gaps > 3 else 14 if gaps > 0 else 30

        cur.execute(
            "INSERT INTO audit_sessions (user_id, mode, status, scheduled_next_audit, created_at)"
            "VALUES (%s,'ai','scheduled',NOW()+interval '%s days',NOW())",
            (user_id, days),
        )

        conn.commit()
        return {"enabled": True}
    finally:
        cur.close()
        conn.close()


# =========================
# DASHBOARD (UNCHANGED - NOW WORKS CORRECTLY)
# =========================
@app.get("/api/dashboard/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT COALESCE(AVG(score),0) as avg_score,
                   COUNT(DISTINCT control_id) as audited
            FROM compliance_scores
            WHERE user_id=%s
            """,
            (user_id,),
        )
        sc = cur.fetchone()

        return {
            "compliance_score": float(sc["avg_score"] or 0),
            "audited_controls": int(sc["audited"] or 0),
        }
    finally:
        cur.close()
        conn.close()


@app.get("/")
async def root():
    return {"status": "ok"}
