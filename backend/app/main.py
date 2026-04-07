from fastapi import FastAPI, HTTPException, Body, Form, Depends, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor
import os, shutil, uuid, json, re
from datetime import datetime, timedelta
import jwt # REQUIRES: pip install pyjwt

from contextlib import asynccontextmanager

# --- JWT Authentication Settings ---
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-super-secret-development-key")
ALGORITHM = "HS256"

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=7) # Token lasts for 7 days
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# This is the dependency that protects your routes!
def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return {"id": user_id}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# --- Application Startup ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 CyberGuard Server Starting Up...")
    try:
        engine = get_rag_engine()
        print("✅ AI Engine initialized successfully on startup.")
    except Exception as e:
        print(f"❌ Failed to initialize AI Engine on startup: {e}")
    
    yield
    
    print("🛑 CyberGuard Server Shutting Down...")

app = FastAPI(title="CyberGuard GRC - Production Ready", lifespan=lifespan)

# --- 1. إعدادات CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. إعدادات AI Engine (Groq / RAG) ---
try:
    print("\n" + "="*50)
    print("[🚀] INITIALIZING CYBERGUARD AI ENGINE...")
    print("[⚙️] Connecting to Groq Cloud...")
    rag_engine = None

    def get_rag_engine():
        global rag_engine
        if rag_engine is None:
            from app.ai.rag_engine import RAGEngine
            rag_engine = RAGEngine()
        return rag_engine
    print("[✅] AI ENGINE IS ONLINE AND READY!")
    print("="*50 + "\n")
except Exception as e:
    print(f"\n[❌] AI ENGINE ERROR: {e}\n")
    rag_engine = None

# --- 3. إعدادات قاعدة البيانات ---
DATABASE_URL = os.environ.get("DATABASE_URL")

UPLOAD_DIR = "secure_evidence_vault"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

def get_db_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

# --- 4. وظائف الحماية وتشفير الباسورد ---
def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')[:71]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        pwd_bytes = plain_password.encode('utf-8')[:71]
        return bcrypt.checkpw(pwd_bytes, hashed_password.encode('utf-8'))
    except Exception:
        return False

# --- 5. Validation Functions ---
def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r'\d', password):
        return False, "Password must contain at least one number"
    if not re.search(r'[@$!%*?&#]', password):
        return False, "Password must contain at least one special character (@$!%*?&#)"
    return True, "Valid"

def validate_full_name(name: str) -> tuple[bool, str]:
    if not name or len(name.strip()) < 2:
        return False, "Name must be at least 2 characters"
    if not re.match(r'^[A-Za-z\s]+$', name):
        return False, "Name must contain only English letters and spaces"
    return True, "Valid"

# --- 6. مسارات المستخدمين (MULTI-TENANT REGISTRATION) ---
@app.post("/api/register")
async def register(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        name_valid, name_msg = validate_full_name(data.get('full_name', ''))
        if not name_valid:
            raise HTTPException(status_code=400, detail=name_msg)
        
        pwd_valid, pwd_msg = validate_password(data.get('password', ''))
        if not pwd_valid:
            raise HTTPException(status_code=400, detail=pwd_msg)
        
        cur.execute("SELECT id FROM users WHERE username = %s OR email = %s", (data['username'], data['email']))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Username or email already exists")
        
        hashed_pw = hash_password(data['password'])
        
        # Insert user and get ID
        cur.execute("""
            INSERT INTO users (full_name, username, email, password_hash, role, is_active, created_at)
            VALUES (%s, %s, %s, %s, 'User', true, NOW())
            RETURNING id
        """, (data['full_name'].strip(), data['username'].strip(), data['email'].strip(), hashed_pw))
        
        new_user_id = cur.fetchone()['id']
        
        # 🚨 MULTI-TENANT MAGIC: Clone the master controls for this new user
        cur.execute("""
            INSERT INTO ecc_controls (control_id, title, domain, level, description, status, user_id)
            SELECT control_id, title, domain, level, description, 'Pending', %s
            FROM ecc_controls 
            WHERE user_id IS NULL
        """, (new_user_id,))
        
        conn.commit()
        print(f"[👤] New user registered & workspace initialized: {data['username']}")
        return {"message": "Registration successful", "username": data['username']}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        print(f"[❌] Registration Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/api/auth/login")
async def login(username: str = Form(...), password: str = Form(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM users WHERE username = %s AND is_active = true", (username,))
        user = cur.fetchone()
        if user and verify_password(password, user['password_hash']):
            print(f"[🔑] User logged in: {username}")
            
            # Generate real JWT Token
            access_token = create_access_token(data={"user_id": user['id']})
            
            return {
                "access_token": access_token,
                "user": {
                    "id": user['id'],
                    "username": user['username'],
                    "full_name": user['full_name'],
                    "email": user['email'],
                    "role": user['role']
                }
            }
        raise HTTPException(status_code=401, detail="Invalid username or password")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[❌] Login Error: {e}")
        raise HTTPException(status_code=500, detail="Server Error")
    finally:
        cur.close()
        conn.close()

@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"message": "OK", "user_id": current_user['id']}

# --- 7. مسارات الضوابط (Controls) ---
@app.get("/api/controls/")
async def get_controls(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, control_id, title, domain, description, status, level 
            FROM ecc_controls 
            WHERE level = 1 AND user_id = %s
            ORDER BY control_id ASC
        """, (current_user['id'],))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

@app.get("/api/controls/hierarchy")
async def get_controls_hierarchy(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, control_id, title, domain, description, parent_control_id, level, status
            FROM ecc_controls 
            WHERE user_id = %s 
            ORDER BY control_id ASC
        """, (current_user['id'],))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

@app.get("/api/controls/{control_id}")
async def get_control_by_id(control_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM ecc_controls WHERE control_id = %s AND user_id = %s", (control_id, current_user['id']))
        res = cur.fetchone()
        if not res:
            raise HTTPException(status_code=404, detail="Control not found")
        return res
    finally:
        cur.close()
        conn.close()

@app.post("/api/controls/{control_id}/status")
async def update_control_status(control_id: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        status = data.get('status')
        if status not in ['Compliant', 'Non-Compliant', 'Partial', 'Not Started']:
            raise HTTPException(status_code=400, detail="Invalid status")
        
        cur.execute(
            "UPDATE ecc_controls SET status = %s WHERE control_id = %s AND user_id = %s",
            (status, control_id, current_user['id'])
        )
        conn.commit()
        return {"message": "Status updated", "control_id": control_id, "status": status}
    finally:
        cur.close()
        conn.close()

# --- 8. مسارات الـ AI ---
@app.post("/api/ai/generate-questions")
async def generate_questions(data: dict = Body(...)):
    try:
        engine = get_rag_engine()
        control_id = data.get("control_id")
        mode = data.get("mode", "audit")

        if not control_id:
            raise HTTPException(status_code=400, detail="control_id is required")

        raw_response = engine.process_request(control_id=control_id, query="", mode=mode)
        clean = raw_response.strip()
        start = clean.find('[')
        end = clean.rfind(']') + 1

        if start != -1 and end > start:
            questions = json.loads(clean[start:end])
            return {"questions": questions}

        return {"questions": [], "error": "AI response not valid JSON"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/recommendations")
async def get_recommendations(data: dict = Body(...)):
    if not rag_engine:
        raise HTTPException(status_code=500, detail="AI Engine is offline")
    control_id = data.get("control_id")
    user_answers = data.get("user_answers", "")
    if not control_id:
        raise HTTPException(status_code=400, detail="control_id is required")
    response = rag_engine.process_request(control_id=control_id, query=user_answers, mode="recommendations")
    return {"answer": response}

@app.post("/api/ai/process")
async def process_ai(data: dict = Body(...)):
    if not rag_engine:
        raise HTTPException(status_code=500, detail="AI Engine is offline")
    response = rag_engine.process_request(
        control_id=data.get("control_id"),
        query=data.get("query", "") or data.get("text", ""),
        mode=data.get("mode", "guidance")
    )
    return {"answer": response}

# --- 9. مسارات جلسات التدقيق ---
@app.post("/api/audit/session/start")
async def start_audit_session(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        control_id = data.get('control_id') 
        mode = data.get('mode', 'audit')
        next_audit = datetime.now() + timedelta(days=30)
        
        cur.execute("""
            INSERT INTO audit_sessions 
            (user_id, control_id, mode, status, started_at, scheduled_next_audit, created_at)
            VALUES (%s, %s, %s, 'in_progress', NOW(), %s, NOW())
            RETURNING id
        """, (current_user['id'], control_id, mode, next_audit))
        session = cur.fetchone()
        conn.commit()
        return {"session_id": session['id'], "message": "Session started"}
    finally:
        cur.close()
        conn.close()

@app.post("/api/audit/session/answer")
async def save_audit_answer(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    # Assuming answers belong to a session, and session belongs to user. Keep simple for now.
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO audit_qa (session_id, question, answer, ai_generated, notes, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
        """, (data.get('session_id'), data.get('question'), data.get('answer'), data.get('ai_generated', True), data.get('notes', '')))
        conn.commit()
        return {"message": "Answer saved"}
    finally:
        cur.close()
        conn.close()

@app.post("/api/audit/session/complete")
async def complete_audit_session(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE audit_sessions 
            SET status = %s, score = %s, completed_at = NOW()
            WHERE id = %s AND user_id = %s
        """, (data.get('status'), data.get('score'), data.get('session_id'), current_user['id']))
        conn.commit()
        return {"message": "Session completed"}
    finally:
        cur.close()
        conn.close()

# --- 10. مسارات درجات الامتثال ---
@app.post("/api/audit/compliance-score")
async def save_compliance_score(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = current_user['id']
        control_id = data.get('control_id')
        score = data.get('score', 0)
        total = data.get('total_questions', 0)
        yes = data.get('answered_yes', 0)
        no = data.get('answered_no', 0)
        partial = data.get('answered_partial', 0)
        
        cur.execute("DELETE FROM compliance_scores WHERE user_id = %s AND control_id = %s", (user_id, control_id))
        cur.execute("""
            INSERT INTO compliance_scores
            (user_id, control_id, score, total_questions, answered_yes, answered_no, answered_partial, calculated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        """, (user_id, control_id, score, total, yes, no, partial))
        conn.commit()
        return {"message": "Score saved successfully"}
    finally:
        cur.close()
        conn.close()

# --- 11. مسارات الداشبورد (MULTI-TENANT FILTERED) ---
@app.get("/api/dashboard/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    user_id = current_user['id'] # 🚨 GRAB THE LOGGED-IN USER'S ID
    
    try:
        # 1. Get total level 1 controls FOR THIS USER ONLY
        cur.execute("SELECT COUNT(*) as total FROM ecc_controls WHERE level = 1 AND user_id = %s", (user_id,))
        total = cur.fetchone()['total'] or 0 
        
        # 2. Get counts by status FOR THIS USER ONLY
        cur.execute("SELECT COUNT(*) as count FROM ecc_controls WHERE status = 'Non-Compliant' AND level = 1 AND user_id = %s", (user_id,))
        non_compliant = cur.fetchone()['count'] or 0
        
        cur.execute("SELECT COUNT(*) as count FROM ecc_controls WHERE status = 'Partial' AND level = 1 AND user_id = %s", (user_id,))
        partial = cur.fetchone()['count'] or 0
        
        cur.execute("SELECT COUNT(*) as count FROM ecc_controls WHERE status = 'Compliant' AND level = 1 AND user_id = %s", (user_id,))
        compliant = cur.fetchone()['count'] or 0

        # Calculate compliance score mathematically
        if total > 0:
            score = round(((compliant + partial * 0.5) / total * 100), 1)
            # Calculate audit progress
            audited = compliant + non_compliant + partial
            audit_progress = round((audited / total * 100))
        else:
            # If total is 0, the user has no controls assigned to them!
            score = 0.0
            audited = 0
            audit_progress = 0

        # Get control statuses for the heatmap/list
        cur.execute("SELECT control_id, status FROM ecc_controls WHERE level = 1 AND user_id = %s ORDER BY control_id", (user_id,))
        control_statuses = cur.fetchall()

        # Get next scheduled audit for THIS user
        cur.execute("""
            SELECT scheduled_next_audit FROM audit_sessions
            WHERE user_id = %s AND scheduled_next_audit IS NOT NULL AND scheduled_next_audit > NOW()
            ORDER BY scheduled_next_audit ASC LIMIT 1
        """, (user_id,))
        next_audit = cur.fetchone()
        
        if next_audit and next_audit['scheduled_next_audit']:
            next_audit_date = next_audit['scheduled_next_audit'].isoformat()
        else:
            next_audit_date = (datetime.now() + timedelta(days=30)).isoformat()

        result = {
            "compliance_score": score,
            "total_controls": total,
            "critical_gaps": non_compliant,
            "partial_controls": partial,
            "compliant_controls": compliant,
            "audit_progress": audit_progress,
            "audited_controls": audited,
            "next_audit_date": next_audit_date,
            "control_statuses": [dict(cs) for cs in control_statuses]
        }
        
        print(f"[📊] Dashboard loaded for User {user_id}: Score={score}%, Progress={audit_progress}%")
        return result
        
    finally:
        cur.close()
        conn.close()


@app.get("/api/dashboard/domain-scores")
async def get_domain_scores(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    user_id = current_user['id']
    
    try:
        # Group by domain, but ONLY for this specific user
        cur.execute("""
            SELECT domain, COUNT(*) as total,
                   SUM(CASE WHEN status = 'Compliant' THEN 1 ELSE 0 END) as compliant,
                   SUM(CASE WHEN status = 'Partial' THEN 0.5 ELSE 0 END) as partial_score,
                   SUM(CASE WHEN status = 'Non-Compliant' THEN 1 ELSE 0 END) as non_compliant
            FROM ecc_controls 
            WHERE level = 1 AND user_id = %s
            GROUP BY domain ORDER BY domain
        """, (user_id,))
        
        domains = cur.fetchall()
        result = []
        for d in domains:
            t = d['total']
            score = round(((d['compliant'] + d['partial_score']) / t * 100), 1) if t > 0 else 0
            result.append({
                "domain": d['domain'], "score": score, "total": t,
                "compliant": int(d['compliant']), "non_compliant": int(d['non_compliant'])
            })
        return result
    finally:
        cur.close()
        conn.close()


@app.get("/api/dashboard/category-scores")
async def get_category_scores(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    user_id = current_user['id']
    
    try:
        cur.execute("""
            SELECT domain as category,
                   ROUND(AVG(CASE WHEN status='Compliant' THEN 100 
                                  WHEN status='Partial' THEN 50 
                                  ELSE 0 END), 1) as score
            FROM ecc_controls 
            WHERE level = 1 AND user_id = %s
            GROUP BY domain ORDER BY domain
        """, (user_id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

# --- 12. مسارات الأدلة ---
@app.post("/api/evidence/upload")
async def upload_evidence(control_id: str = Form(...), file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    file_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM ecc_controls WHERE control_id = %s AND user_id = %s", (control_id, current_user['id']))
        ctrl = cur.fetchone()
        control_db_id = ctrl['id'] if ctrl else None
        
        cur.execute("""
            INSERT INTO evidence (control_id, user_id, title, file_path, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, 'Pending', NOW(), NOW())
        """, (control_db_id, current_user['id'], file.filename, file_path))
        conn.commit()
        return {"message": "Evidence uploaded successfully", "file": file.filename}
    finally:
        cur.close()
        conn.close()

@app.get("/api/evidence/")
async def get_evidence(domain: str = None, status: str = None, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        query = """
            SELECT e.id, e.control_id, e.title, e.file_path, e.status, e.created_at,
                   ec.control_id as control_code, ec.domain, ec.title as control_name
            FROM evidence e 
            LEFT JOIN ecc_controls ec ON e.control_id = ec.id 
            WHERE e.user_id = %s
        """
        params = [current_user['id']]
        if domain:
            query += " AND ec.domain = %s"
            params.append(domain)
        if status:
            query += " AND e.status = %s"
            params.append(status)
        query += " ORDER BY e.created_at DESC"
        
        cur.execute(query, params)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

@app.post("/api/evidence/save-audit")
async def save_audit_evidence(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        control_db_id = data.get('control_id')
        session_id = data.get('session_id')
        title = data.get('title', 'Audit Report')
        description = json.dumps(data.get('answers', []))  # Store answers as JSON string
        status = data.get('status', 'Pending')
        score = data.get('score')
        evidence_type = data.get('evidence_type', 'audit_session')
 
        cur.execute("""
            INSERT INTO evidence 
            (control_id, session_id, user_id, evidence_type, title, description, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            RETURNING id
        """, (control_db_id, session_id, current_user['id'], evidence_type, title, description, status))
 
        evidence = cur.fetchone()
        conn.commit()
        print(f"[📁] Audit saved to evidence: {title} (user={current_user['id']})")
        return {"message": "Audit saved to evidence", "evidence_id": evidence['id']}
    except Exception as e:
        conn.rollback()
        print(f"[❌] Save Audit Evidence Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
        
# --- 13. مسارات الثغرات والتوصيات ---
@app.post("/api/gaps/save")
async def save_gap(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Assuming table has user_id, if not, you'll need to add it or link via session
        cur.execute("""
            INSERT INTO gaps_recommendations (session_id, control_id, gap_description, recommendation, priority, status, created_at)
            VALUES (%s, %s, %s, %s, %s, 'Open', NOW())
            RETURNING id
        """, (data.get('session_id'), data.get('control_id'), data.get('gap_description'), data.get('recommendation'), data.get('priority', 'Medium')))
        gap = cur.fetchone()
        conn.commit()
        return {"message": "Gap recommendation saved", "gap_id": gap['id']}
    finally:
        cur.close()
        conn.close()

@app.get("/api/gaps/")
async def get_gaps(session_id: int = None, control_id: int = None, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Note: True multi-tenancy would require joining with audit_sessions to check user ownership of the session
        query = "SELECT * FROM gaps_recommendations WHERE 1=1"
        params = []
        if session_id:
            query += " AND session_id = %s"
            params.append(session_id)
        if control_id:
            query += " AND control_id = %s"
            params.append(control_id)
        query += " ORDER BY created_at DESC"
        cur.execute(query, params)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

# --- Health Check ---
@app.get("/")
async def root():
    return {"app": "CyberGuard GRC Platform", "version": "4.0 Multi-Tenant", "status": "online"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port)