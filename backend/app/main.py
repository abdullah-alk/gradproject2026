from fastapi import FastAPI, HTTPException, Body, Form, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor
import os, shutil, uuid, json, re
from datetime import datetime, timedelta

app = FastAPI(title="CyberGuard GRC - Production Ready")

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
    from app.ai.rag_engine import RAGEngine
    rag_engine = RAGEngine()
    print("[✅] AI ENGINE IS ONLINE AND READY!")
    print("="*50 + "\n")
except Exception as e:
    print(f"\n[❌] AI ENGINE ERROR: {e}\n")
    rag_engine = None

# --- 3. إعدادات قاعدة البيانات ---
DB_CONFIG = {
    "dbname": "ecc_compliance",
    "user": "postgres",
    "password": "post123",
    "host": "localhost",
    "port": "5432"
}

UPLOAD_DIR = "secure_evidence_vault"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=RealDictCursor)

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

# --- 5. Validation Functions (NEW) ---

def validate_password(password: str) -> tuple[bool, str]:
    """
    Strong password validation:
    - At least 8 characters
    - Contains uppercase and lowercase
    - Contains at least one number
    - Contains at least one special character
    """
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
    """
    Name validation: English letters and spaces only
    """
    if not name or len(name.strip()) < 2:
        return False, "Name must be at least 2 characters"
    if not re.match(r'^[A-Za-z\s]+$', name):
        return False, "Name must contain only English letters and spaces"
    return True, "Valid"

# --- 6. مسارات المستخدمين (UPDATED WITH VALIDATION) ---

@app.post("/api/register")
async def register(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Validate full name
        name_valid, name_msg = validate_full_name(data.get('full_name', ''))
        if not name_valid:
            raise HTTPException(status_code=400, detail=name_msg)
        
        # Validate password
        pwd_valid, pwd_msg = validate_password(data.get('password', ''))
        if not pwd_valid:
            raise HTTPException(status_code=400, detail=pwd_msg)
        
        # Check if user exists
        cur.execute("SELECT id FROM users WHERE username = %s OR email = %s", 
                   (data['username'], data['email']))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Username or email already exists")
        
        hashed_pw = hash_password(data['password'])
        cur.execute("""
            INSERT INTO users (full_name, username, email, password_hash, role, is_active, created_at)
            VALUES (%s, %s, %s, %s, 'User', true, NOW())
        """, (data['full_name'].strip(), data['username'].strip(), data['email'].strip(), hashed_pw))
        conn.commit()
        print(f"[👤] New user registered: {data['username']}")
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
            return {
                "access_token": f"token_{user['id']}_{datetime.now().timestamp()}",
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
async def get_me():
    return {"message": "OK"}

# --- 7. مسارات الضوابط (Controls) ---

@app.get("/api/controls/")
async def get_controls():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, control_id, title, domain, description, status, level 
            FROM ecc_controls 
            WHERE level = 1
            ORDER BY control_id ASC
        """)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

@app.get("/api/controls/hierarchy")
async def get_controls_hierarchy():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, control_id, title, domain, description, parent_control_id, level, status
            FROM ecc_controls ORDER BY control_id ASC
        """)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

@app.get("/api/controls/{control_id}")
async def get_control_by_id(control_id: str):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM ecc_controls WHERE control_id = %s", (control_id,))
        res = cur.fetchone()
        if not res:
            raise HTTPException(status_code=404, detail="Control not found")
        return res
    finally:
        cur.close()
        conn.close()

@app.post("/api/controls/{control_id}/status")
async def update_control_status(control_id: str, data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        status = data.get('status')
        if status not in ['Compliant', 'Non-Compliant', 'Partial', 'Not Started']:
            raise HTTPException(status_code=400, detail="Invalid status")
        
        cur.execute(
            "UPDATE ecc_controls SET status = %s WHERE control_id = %s",
            (status, control_id)
        )
        conn.commit()
        print(f"[✅] Control {control_id} updated to: {status}")
        return {"message": "Status updated", "control_id": control_id, "status": status}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

# --- 8. مسارات الـ AI - توليد الأسئلة والتوصيات (UPDATED) ---

@app.post("/api/ai/generate-questions")
async def generate_questions(data: dict = Body(...)):
    """
    يولد 10 أسئلة تدقيق أو guide من RAG بناءً على الضابط المختار
    mode: 'audit' | 'guide'
    """
    if not rag_engine:
        raise HTTPException(status_code=500, detail="AI Engine is offline. Please contact administrator.")

    control_id = data.get("control_id")
    mode = data.get("mode", "audit")

    if not control_id:
        raise HTTPException(status_code=400, detail="control_id is required")

    print(f"[🤖] Generating 10 {mode} questions for control: {control_id}")

    raw_response = rag_engine.process_request(
        control_id=control_id,
        query="",
        mode=mode
    )

    # تفكيك JSON من الرد
    try:
        clean = raw_response.strip()
        start = clean.find('[')
        end = clean.rfind(']') + 1
        if start != -1 and end > start:
            json_str = clean[start:end]
            questions = json.loads(json_str)
            
            # Ensure we have questions
            if len(questions) == 0:
                print(f"[⚠️] AI returned 0 questions for {control_id}")
                return {
                    "questions": [],
                    "error": "AI could not generate questions. Ensure ECC documents are indexed in ChromaDB."
                }
            
            print(f"[✅] Generated {len(questions)} questions for {control_id}")
            return {"questions": questions}
        else:
            print(f"[⚠️] No JSON array found in AI response for {control_id}")
            return {
                "questions": [],
                "raw_response": raw_response[:500],
                "error": "AI response was not in expected JSON format"
            }
    except json.JSONDecodeError as e:
        print(f"[❌] JSON Parse Error for {control_id}: {e}")
        return {
            "questions": [],
            "raw_response": raw_response[:500],
            "error": f"Could not parse AI response: {str(e)}"
        }

@app.post("/api/ai/recommendations")
async def get_recommendations(data: dict = Body(...)):
    """
    يولد توصيات مخصصة بناءً على إجابات المستخدم في Guide Mode
    """
    if not rag_engine:
        raise HTTPException(status_code=500, detail="AI Engine is offline")

    control_id = data.get("control_id")
    user_answers = data.get("user_answers", "")

    if not control_id:
        raise HTTPException(status_code=400, detail="control_id is required")

    print(f"[🤖] Generating recommendations for control: {control_id}")

    response = rag_engine.process_request(
        control_id=control_id,
        query=user_answers,
        mode="recommendations"
    )
    
    if not response or len(response.strip()) < 20:
        return {
            "answer": "Unable to generate recommendations at this time. Please ensure all assessment questions were answered.",
            "error": "Empty or invalid AI response"
        }
    
    return {"answer": response}

@app.post("/api/ai/process")
async def process_ai(data: dict = Body(...)):
    """المعالج العام - للأسئلة الحرة من المستخدم"""
    if not rag_engine:
        raise HTTPException(status_code=500, detail="AI Engine is offline")

    response = rag_engine.process_request(
        control_id=data.get("control_id"),
        query=data.get("query", "") or data.get("text", ""),
        mode=data.get("mode", "guidance")
    )
    return {"answer": response}

# --- 9. مسارات جلسات التدقيق (FIXED) ---

@app.post("/api/audit/session/start")
async def start_audit_session(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = data.get('user_id')
        control_id = data.get('control_id')  # This is DB id, not control_id string
        mode = data.get('mode', 'audit')
        
        # Calculate next audit date (30 days from now by default)
        next_audit = datetime.now() + timedelta(days=30)
        
        cur.execute("""
            INSERT INTO audit_sessions 
            (user_id, control_id, mode, status, started_at, scheduled_next_audit, created_at)
            VALUES (%s, %s, %s, 'in_progress', NOW(), %s, NOW())
            RETURNING id
        """, (user_id, control_id, mode, next_audit))
        session = cur.fetchone()
        conn.commit()
        print(f"[🎯] Audit session started: {session['id']} (control_id={control_id}, mode={mode})")
        return {"session_id": session['id'], "message": "Session started"}
    except Exception as e:
        conn.rollback()
        print(f"[❌] Start Session Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/api/audit/session/answer")
async def save_audit_answer(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO audit_qa (session_id, question, answer, ai_generated, notes, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
        """, (
            data.get('session_id'),
            data.get('question'),
            data.get('answer'),
            data.get('ai_generated', True),
            data.get('notes', '')
        ))
        conn.commit()
        print(f"[📝] Answer saved for session {data.get('session_id')}: {data.get('answer')}")
        return {"message": "Answer saved"}
    except Exception as e:
        conn.rollback()
        print(f"[❌] Save Answer Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/api/audit/session/complete")
async def complete_audit_session(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        session_id = data.get('session_id')
        status = data.get('status')
        score = data.get('score')
        
        cur.execute("""
            UPDATE audit_sessions 
            SET status = %s, score = %s, completed_at = NOW()
            WHERE id = %s
        """, (status, score, session_id))
        conn.commit()
        print(f"[✅] Session {session_id} completed: {status} (Score: {score}%)")
        return {"message": "Session completed", "session_id": session_id, "status": status, "score": score}
    except Exception as e:
        conn.rollback()
        print(f"[❌] Complete Session Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

# --- 10. مسارات درجات الامتثال (FIXED) ---

@app.post("/api/audit/compliance-score")
async def save_compliance_score(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = data.get('user_id')
        control_id = data.get('control_id')
        session_id = data.get('session_id')
        score = data.get('score', 0)
        total = data.get('total_questions', 0)
        yes = data.get('answered_yes', 0)
        no = data.get('answered_no', 0)
        partial = data.get('answered_partial', 0)
        
        # Delete old score for this control
        cur.execute("""
            DELETE FROM compliance_scores 
            WHERE user_id = %s AND control_id = %s
        """, (user_id, control_id))
        
        # Insert new score
        cur.execute("""
            INSERT INTO compliance_scores
            (user_id, control_id, score, total_questions, answered_yes, answered_no, answered_partial, calculated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        """, (user_id, control_id, score, total, yes, no, partial))
        
        conn.commit()
        print(f"[📊] Compliance score saved: control_id={control_id}, score={score}%, yes={yes}, partial={partial}, no={no}")
        return {"message": "Score saved successfully", "control_id": control_id, "score": score}
    except Exception as e:
        conn.rollback()
        print(f"[❌] Save Score Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

# --- 11. مسارات الداشبورد (ENHANCED) ---

@app.get("/api/dashboard/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = current_user["id"]
        # Get total level 1 controls
        cur.execute("SELECT COUNT(*) as total FROM ecc_controls WHERE level = 1")
        total = cur.fetchone()['total'] or 10  # Default to 10 if empty
        
        # Get real audit data from compliance_scores - filtered by user
        cur.execute("""
            SELECT 
                COUNT(DISTINCT control_id) as audited_cnt,
                COALESCE(AVG(score), 0) as avg_score,
                SUM(CASE WHEN score >= 80 THEN 1 ELSE 0 END) as compliant_cnt,
                SUM(CASE WHEN score >= 40 AND score < 80 THEN 1 ELSE 0 END) as partial_cnt,
                SUM(CASE WHEN score < 40 THEN 1 ELSE 0 END) as noncompliant_cnt
            FROM (
                SELECT control_id, MAX(score) as score
                FROM compliance_scores
                WHERE user_id = %s
                GROUP BY control_id
            ) latest
        """, (user_id,))
        sc = cur.fetchone()
        avg_score     = float(sc['avg_score'] or 0)
        compliant     = int(sc['compliant_cnt'] or 0)
        partial       = int(sc['partial_cnt'] or 0)
        non_compliant = int(sc['noncompliant_cnt'] or 0)
        audited       = int(sc['audited_cnt'] or 0)
        score         = round(avg_score, 1) if avg_score > 0 else 0.0
        audit_progress = round((audited / total * 100)) if total > 0 else 0

        # Get control statuses
        cur.execute("SELECT control_id, status FROM ecc_controls WHERE level = 1 ORDER BY control_id")
        control_statuses = cur.fetchall()

        # Get next scheduled audit
        cur.execute("""
            SELECT scheduled_next_audit FROM audit_sessions
            WHERE scheduled_next_audit IS NOT NULL AND scheduled_next_audit > NOW()
            ORDER BY scheduled_next_audit ASC LIMIT 1
        """)
        next_audit = cur.fetchone()
        
        if next_audit and next_audit['scheduled_next_audit']:
            next_audit_date = next_audit['scheduled_next_audit'].isoformat()
        else:
            next_audit_date = None  # No audit scheduled yet - let frontend handle

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
        
        print(f"[📊] Dashboard stats: score={score}%, gaps={non_compliant}, audited={audited}/{total}")
        return result
        
    except Exception as e:
        print(f"[❌] Dashboard Stats Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.get("/api/dashboard/domain-scores")
async def get_domain_scores():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT domain,
                   COUNT(*) as total,
                   SUM(CASE WHEN status = 'Compliant' THEN 1 ELSE 0 END) as compliant,
                   SUM(CASE WHEN status = 'Partial' THEN 0.5 ELSE 0 END) as partial_score,
                   SUM(CASE WHEN status = 'Non-Compliant' THEN 1 ELSE 0 END) as non_compliant
            FROM ecc_controls WHERE level = 1
            GROUP BY domain ORDER BY domain
        """)
        domains = cur.fetchall()
        result = []
        for d in domains:
            t = d['total']
            score = round(((d['compliant'] + d['partial_score']) / t * 100), 1) if t > 0 else 0
            result.append({
                "domain": d['domain'], 
                "score": score, 
                "total": t,
                "compliant": int(d['compliant']), 
                "non_compliant": int(d['non_compliant'])
            })
        return result
    finally:
        cur.close()
        conn.close()

@app.get("/api/dashboard/category-scores")
async def get_category_scores():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT domain as category,
                   ROUND(AVG(CASE WHEN status='Compliant' THEN 100 
                                  WHEN status='Partial' THEN 50 
                                  ELSE 0 END), 1) as score
            FROM ecc_controls WHERE level = 1 
            GROUP BY domain
            ORDER BY domain
        """)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

# --- 12. مسارات الأدلة (ENHANCED) ---

@app.post("/api/evidence/upload")
async def upload_evidence(control_id: str = Form(...), file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4()}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM ecc_controls WHERE control_id = %s", (control_id,))
        ctrl = cur.fetchone()
        control_db_id = ctrl['id'] if ctrl else None
        
        cur.execute("""
            INSERT INTO evidence (control_id, title, file_path, status, created_at, updated_at)
            VALUES (%s, %s, %s, 'Pending', NOW(), NOW())
        """, (control_db_id, file.filename, file_path))
        conn.commit()
        print(f"[📎] Evidence uploaded: {file.filename} for control {control_id}")
        return {"message": "Evidence uploaded successfully", "file": file.filename}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.get("/api/evidence/")
async def get_evidence(domain: str = None, status: str = None):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        query = """
            SELECT e.id, e.control_id, e.title, e.file_path, e.status, e.created_at,
                   ec.control_id as control_code, ec.domain, ec.title as control_name
            FROM evidence e 
            LEFT JOIN ecc_controls ec ON e.control_id = ec.id 
            WHERE 1=1
        """
        params = []
        if domain:
            query += " AND ec.domain = %s"
            params.append(domain)
        if status:
            query += " AND e.status = %s"
            params.append(status)
        query += " ORDER BY e.created_at DESC"
        
        cur.execute(query, params)
        results = cur.fetchall()
        print(f"[📁] Retrieved {len(results)} evidence records")
        return results
    finally:
        cur.close()
        conn.close()

# --- 13. مسارات الثغرات والتوصيات (FIXED) ---

@app.post("/api/gaps/save")
async def save_gap(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        session_id = data.get('session_id')
        control_id = data.get('control_id')
        gap_desc = data.get('gap_description')
        recommendation = data.get('recommendation')
        priority = data.get('priority', 'Medium')
        
        cur.execute("""
            INSERT INTO gaps_recommendations
            (session_id, control_id, gap_description, recommendation, priority, status, created_at)
            VALUES (%s, %s, %s, %s, %s, 'Open', NOW())
            RETURNING id
        """, (session_id, control_id, gap_desc, recommendation, priority))
        
        gap = cur.fetchone()
        conn.commit()
        print(f"[🔍] Gap saved: ID={gap['id']}, control={control_id}, priority={priority}")
        return {"message": "Gap recommendation saved", "gap_id": gap['id']}
    except Exception as e:
        conn.rollback()
        print(f"[❌] Save Gap Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.get("/api/gaps/")
async def get_gaps(session_id: int = None, control_id: int = None):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
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

# --- 14. Scheduler Endpoints (NEW) ---

@app.get("/api/scheduler/recommendations")
async def get_scheduler_recommendations():
    """Get AI-based scheduling recommendations"""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Get current stats
        cur.execute("SELECT COUNT(*) as gaps FROM ecc_controls WHERE status = 'Non-Compliant' AND level = 1")
        gaps = cur.fetchone()['gaps'] or 0
        
        cur.execute("""
            SELECT ROUND(AVG(CASE WHEN status='Compliant' THEN 100 
                                  WHEN status='Partial' THEN 50 
                                  ELSE 0 END), 1) as score
            FROM ecc_controls WHERE level = 1
        """)
        score = cur.fetchone()['score'] or 0
        
        # AI recommendation logic
        if gaps > 3:
            days = 7
            focus = "Critical gaps in multiple domains require immediate attention"
        elif gaps > 0:
            days = 14
            focus = "Address non-compliant controls before next audit cycle"
        else:
            days = 30
            focus = "Maintain current compliance posture with regular reviews"
        
        return [{
            "current_score": score,
            "critical_gaps": gaps,
            "recommended_days": days,
            "recommendation_text": f"Based on {gaps} critical gap(s) and {score}% compliance, schedule next audit in {days} days.",
            "focus_areas": focus
        }]
    finally:
        cur.close()
        conn.close()

@app.post("/api/scheduler/schedule")
async def schedule_audit_endpoint(data: dict = Body(...)):
    """Schedule a manual audit"""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        audit_date = data.get('audit_date')
        scope = data.get('scope', 'full')
        auditor = data.get('assigned_auditor', 'security-team')
        
        # Validate date
        try:
            scheduled_date = datetime.fromisoformat(audit_date)
            if scheduled_date < datetime.now():
                raise HTTPException(status_code=400, detail="Audit date cannot be in the past")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
        
        # Extract user_id from Authorization token
        import re as _re
        _token = data.get('_token', '')
        _uid_match = _re.search(r'token_(\d+)_', _token)
        user_id = int(_uid_match.group(1)) if _uid_match else 1

        # Cancel previous scheduled sessions for this user
        cur.execute("""
            UPDATE audit_sessions SET status = 'cancelled'
            WHERE user_id = %s AND status = 'scheduled'
        """, (user_id,))

        # Create a scheduled audit session
        cur.execute("""
            INSERT INTO audit_sessions 
            (user_id, mode, status, scheduled_next_audit, scope, assigned_auditor, created_at)
            VALUES (%s, 'scheduled', 'scheduled', %s, %s, %s, NOW())
            RETURNING id
        """, (user_id, scheduled_date, scope, auditor))
        
        session = cur.fetchone()
        conn.commit()
        print(f"[📅] Audit scheduled: session={session['id']}, date={audit_date}, scope={scope}")
        return {
            "message": "Audit scheduled successfully",
            "session_id": session['id'],
            "audit_date": audit_date,
            "scope": scope
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        print(f"[❌] Schedule Audit Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/api/scheduler/auto")
async def toggle_auto_scheduling(data: dict = Body(...)):
    """Toggle auto-scheduling - saves next audit date based on risk profile"""
    enabled = data.get('enabled', False)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if enabled:
            # Calculate risk-based next audit date
            cur.execute("SELECT COUNT(*) as gaps FROM ecc_controls WHERE status = 'Non-Compliant' AND level = 1")
            gaps = cur.fetchone()['gaps'] or 0

            days = 7 if gaps > 3 else (14 if gaps > 0 else 30)
            next_date = datetime.now() + timedelta(days=days)

            # Extract user_id from token
            import re as _re
            _token = data.get('_token', '')
            _uid_match = _re.search(r'token_(\d+)_', _token)
            user_id = int(_uid_match.group(1)) if _uid_match else 1

            # Cancel previous scheduled
            cur.execute("""
                UPDATE audit_sessions SET status = 'cancelled'
                WHERE user_id = %s AND status = 'scheduled'
            """, (user_id,))

            # Insert AI-scheduled session
            cur.execute("""
                INSERT INTO audit_sessions (user_id, mode, status, scheduled_next_audit, created_at)
                VALUES (%s, 'ai_scheduled', 'scheduled', %s, NOW())
                RETURNING id
            """, (user_id, next_date))
            session = cur.fetchone()
            conn.commit()

            print(f"[🤖] AI auto-scheduling enabled: next audit in {days} days (session {session['id']})")
            return {
                "message": "Auto-scheduling enabled",
                "enabled": True,
                "next_audit_date": next_date.isoformat(),
                "days_until_audit": days,
                "session_id": session['id']
            }
        else:
            print("[⚙️] Auto-scheduling disabled")
            return {"message": "Auto-scheduling disabled", "enabled": False}
    except Exception as e:
        conn.rollback()
        print(f"[❌] Auto-scheduling Error: {e}")
        return {"message": f"Auto-scheduling {'enabled' if enabled else 'disabled'}", "enabled": enabled}
    finally:
        cur.close()
        conn.close()


@app.get("/api/audit/sessions/scheduled")
async def get_scheduled_audits():
    """Get only future scheduled audits with scope and auditor"""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                s.id, s.mode, s.status,
                s.scheduled_next_audit, s.created_at,
                s.scope, s.assigned_auditor,
                ec.title as control_title, ec.domain
            FROM audit_sessions s
            LEFT JOIN ecc_controls ec ON s.control_id = ec.id
            WHERE s.status = 'scheduled'
            AND s.scheduled_next_audit > NOW()
            ORDER BY s.scheduled_next_audit ASC
            LIMIT 20
        """)
        rows = cur.fetchall()

        scope_names = {
            'full':'Full Audit (All 10 Controls)', 'governance':'Governance Domain',
            'data':'Data Protection Domain', 'identity':'Identity & Access Domain',
            'network':'Network Hardening Domain', 'custom':'Custom Scope'
        }
        auditor_names = {
            'security-team':'Security Team', 'compliance-team':'Compliance Team',
            'external-auditor':'External Auditor', 'ai-system':'AI System'
        }

        result = []
        for r in rows:
            raw_date = r['scheduled_next_audit'] or r['created_at']
            date_str = raw_date.strftime('%b %d, %Y') if raw_date and hasattr(raw_date, 'strftime') else str(raw_date or '')[:10]
            mode = r['mode'] or ''
            scope_raw   = r['scope'] or 'full'
            auditor_raw = r['assigned_auditor'] or 'security-team'
            title = 'AI-Scheduled Audit' if 'ai' in mode else 'Scheduled Compliance Audit'

            result.append({
                "id":      r['id'],
                "title":   title,
                "status":  "Scheduled",
                "date":    date_str,
                "scope":   scope_names.get(scope_raw, scope_raw),
                "auditor": auditor_names.get(auditor_raw, auditor_raw),
                "mode":    mode,
                "domain":  r['domain'] or ''
            })
        print(f"[📅] Upcoming scheduled audits: {len(result)}")
        return result
    except Exception as e:
        print(f"[❌] Scheduled Audits Error: {e}")
        return []
    finally:
        cur.close()
        conn.close()

@app.get("/api/audit/sessions")
async def get_audit_sessions():
    """Get audit sessions for history display"""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                s.id, s.mode, s.status, s.score,
                s.started_at, s.completed_at, s.created_at,
                s.scope, s.assigned_auditor,
                ec.control_id as control_code, ec.title as control_title, ec.domain
            FROM audit_sessions s
            LEFT JOIN ecc_controls ec ON s.control_id = ec.id
            WHERE s.status NOT IN ('cancelled')
            ORDER BY 
                CASE WHEN s.status = 'scheduled' THEN 0 ELSE 1 END,
                s.created_at DESC
            LIMIT 20
        """)
        rows = cur.fetchall()
        domain_names = {
            '1-1':'Governance','1-2':'Risk Management','1-3':'Asset Management',
            '1-4':'Cybersecurity Operations','1-5':'Network Hardening',
            '1-6':'Identity & Access','1-7':'Data Protection',
            '1-8':'Vulnerability Management','1-9':'Incident Response','1-10':'Physical Security'
        }
        result = []
        for r in rows:
            if r['control_title']:
                title = r['control_title'] + ' Audit'
            elif r['control_code'] and r['control_code'] in domain_names:
                title = domain_names[r['control_code']] + ' Audit'
            elif r['mode'] == 'ai_scheduled':
                title = 'AI-Scheduled Compliance Audit'
            elif r['mode'] == 'scheduled':
                title = 'Scheduled Compliance Audit'
            else:
                title = 'Compliance Audit'

            status = (r['status'] or '').lower()
            if status == 'completed': display_status = 'Completed'
            elif status == 'compliant': display_status = 'Completed'
            elif status in ('partial','non-compliant','non_compliant'): display_status = status.title()
            elif status == 'scheduled': display_status = 'Scheduled'
            elif status == 'in_progress': display_status = 'In Progress'
            else: display_status = r['status'] or 'Unknown'

            raw_date = r['completed_at'] or r['started_at'] or r['created_at']
            date_str = raw_date.strftime('%b %d, %Y') if raw_date and hasattr(raw_date,'strftime') else str(raw_date or '')[:10]

            result.append({
                "id": r['id'], "title": title, "status": display_status,
                "score": r['score'], "date": date_str,
                "auditor": r['assigned_auditor'] or 'Security Team',
                "domain": r['domain'] or '', "mode": r['mode'] or ''
            })
        print(f"[📋] Audit sessions retrieved: {len(result)} records")
        return result
    except Exception as e:
        print(f"[❌] Get Sessions Error: {e}")
        return []
    finally:
        cur.close()
        conn.close()


@app.post("/api/evidence/save")
async def save_evidence(data: dict = Body(...)):
    """Save audit result to evidence table - persists after logout"""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        control_id   = data.get('control_id')
        session_id   = data.get('session_id')
        title        = data.get('title', 'Audit Report')
        status       = data.get('status', 'Pending')
        score        = data.get('score')
        domain       = data.get('domain', '')
        control_code = data.get('control_code', '')

        # Delete old evidence for same control (keep latest only)
        if control_id:
            cur.execute("DELETE FROM evidence WHERE control_id = %s", (control_id,))

        cur.execute("""
            INSERT INTO evidence 
            (control_id, session_id, title, description, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
            RETURNING id
        """, (
            control_id, session_id, title,
            f"{domain} — Score: {score}%" if score is not None else domain,
            status
        ))
        ev = cur.fetchone()
        conn.commit()
        print(f"[📋] Evidence saved: {title} — {status} ({score}%)")
        return {"message": "Evidence saved", "evidence_id": ev['id']}
    except Exception as e:
        conn.rollback()
        print(f"[❌] Save Evidence Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

# --- Health Check ---

@app.get("/api/alerts")
async def get_alerts(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    user_id = current_user["id"]
    alerts = []
    try:
        # Non-compliant controls for THIS user only
        cur.execute("""
            SELECT DISTINCT ec.control_id, ec.title, ec.domain
            FROM compliance_scores cs
            JOIN ecc_controls ec ON cs.control_id = ec.id
            WHERE cs.user_id = %s AND cs.score < 40 AND ec.level = 1
            ORDER BY ec.control_id LIMIT 3
        """, (user_id,))
        for c in cur.fetchall():
            alerts.append({
                "level": "critical",
                "title": f"Non-Compliant: {c['title']}",
                "body": f"Control {c['control_id']} ({c['domain']}) failed your last audit. Immediate remediation required.",
                "source": "ECC Auditor AI",
                "control_id": c["control_id"],
            })

        # No scheduled audit for this user
        cur.execute("""
            SELECT COUNT(*) as total FROM audit_sessions
            WHERE user_id = %s AND status = 'scheduled' AND scheduled_next_audit > NOW()
        """, (user_id,))
        if int(cur.fetchone()["total"] or 0) == 0:
            alerts.append({
                "level": "warning",
                "title": "No Upcoming Audit Scheduled",
                "body": "Schedule your next audit to maintain ECC-2023 compliance.",
                "source": "ECC Auditor AI",
                "control_id": None,
            })

        # Score alert for this user
        cur.execute("SELECT COALESCE(AVG(score), 0) as avg FROM compliance_scores WHERE user_id = %s", (user_id,))
        avg = float(cur.fetchone()["avg"] or 0)
        if 0 < avg < 50:
            alerts.append({
                "level": "critical",
                "title": f"Low Compliance Score: {round(avg)}%",
                "body": f"Score is {round(avg)}%, below acceptable threshold. Prioritize remediation immediately.",
                "source": "ECC Auditor AI",
                "control_id": None,
            })
        elif 50 <= avg < 80:
            alerts.append({
                "level": "warning",
                "title": f"Compliance Score Needs Improvement: {round(avg)}%",
                "body": f"Score is {round(avg)}%. Target is 95%. Focus on partial and non-compliant controls.",
                "source": "ECC Auditor AI",
                "control_id": None,
            })

        if not alerts:
            alerts.append({
                "level": "info",
                "title": "No Critical Issues Detected",
                "body": "Your compliance posture looks good. Keep scheduling periodic audits.",
                "source": "ECC Auditor AI",
                "control_id": None,
            })

        return alerts[:6]
    except Exception as e:
        print(f"[❌] Alerts Error: {e}")
        return []
    finally:
        cur.close()
        conn.close()

@app.get("/")
async def root():
    return {
        "app": "CyberGuard GRC Platform",
        "version": "3.2 Production",
        "status": "online",
        "ai_engine": "online" if rag_engine else "offline"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
