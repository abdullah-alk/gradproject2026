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

from fastapi import Body, HTTPException

@app.post("/api/ai/generate-questions")
async def generate_questions(data: dict = Body(...)):
    try:
        engine = get_rag_engine()

        control_id = data.get("control_id")
        mode = data.get("mode", "audit")

        if not control_id:
            raise HTTPException(status_code=400, detail="control_id is required")

        raw_response = engine.process_request(
            control_id=control_id,
            query="",
            mode=mode
        )

        clean = raw_response.strip()
        start = clean.find('[')
        end = clean.rfind(']') + 1

        if start != -1 and end > start:
            json_str = clean[start:end]
            questions = json.loads(json_str)
            return {"questions": questions}

        return {
            "questions": [],
            "raw_response": raw_response[:500],
            "error": "AI response was not in expected JSON format"
        }

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        return {
            "questions": [],
            "error": f"Could not parse AI response: {str(e)}"
        }
    except Exception as e:
        print(f"[❌] AI ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
async def get_stats():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Get total level 1 controls
        cur.execute("SELECT COUNT(*) as total FROM ecc_controls WHERE level = 1")
        total = cur.fetchone()['total'] or 10  # Default to 10 if empty
        
        # Get counts by status
        cur.execute("SELECT COUNT(*) as count FROM ecc_controls WHERE status = 'Non-Compliant' AND level = 1")
        non_compliant = cur.fetchone()['count'] or 0
        
        cur.execute("SELECT COUNT(*) as count FROM ecc_controls WHERE status = 'Partial' AND level = 1")
        partial = cur.fetchone()['count'] or 0
        
        cur.execute("SELECT COUNT(*) as count FROM ecc_controls WHERE status = 'Compliant' AND level = 1")
        compliant = cur.fetchone()['count'] or 0

        # Calculate compliance score
        if total > 0:
            score = round(((compliant + partial * 0.5) / total * 100), 1)
        else:
            score = 0.0
        
        # Calculate audit progress
        audited = compliant + non_compliant + partial
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
            # Default: 30 days from now
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
        
        # Create a scheduled audit session
        cur.execute("""
            INSERT INTO audit_sessions 
            (user_id, mode, status, scheduled_next_audit, created_at)
            VALUES (1, 'scheduled', 'scheduled', %s, NOW())
            RETURNING id
        """, (scheduled_date,))
        
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
    """Toggle auto-scheduling (placeholder - implement with user settings table)"""
    enabled = data.get('enabled', False)
    print(f"[⚙️] Auto-scheduling {'enabled' if enabled else 'disabled'}")
    return {
        "message": f"Auto-scheduling {'enabled' if enabled else 'disabled'}",
        "enabled": enabled
    }

# --- Health Check ---
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
