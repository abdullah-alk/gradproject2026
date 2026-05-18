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
import smtplib
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings
from contextlib import asynccontextmanager
import asyncio



async def daily_reminder_task():
    while True:
        await asyncio.sleep(86400)
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT s.id, s.scheduled_next_audit, s.scope,
                       u.email, u.full_name,
                       s.reminder_7_sent, s.reminder_3_sent, s.reminder_1_sent,
                       EXTRACT(DAY FROM s.scheduled_next_audit - NOW()) as days_left
                FROM audit_sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.status = 'scheduled'
                AND s.scheduled_next_audit > NOW()
                AND s.scheduled_next_audit <= NOW() + INTERVAL '7 days'
            """)
            audits = cur.fetchall()
            for a in audits:
                days_left = int(a['days_left'])
                date_str = a['scheduled_next_audit'].strftime('%B %d, %Y')
                if days_left <= 7 and not a['reminder_7_sent']:
                    send_email(a['email'], "Audit Reminder 7 Days Left", build_reminder_email(a['full_name'], date_str, a['scope'], 7))
                    cur.execute("UPDATE audit_sessions SET reminder_7_sent = true WHERE id = %s", (a['id'],))
                if days_left <= 3 and not a['reminder_3_sent']:
                    send_email(a['email'], "Audit Reminder 3 Days Left", build_reminder_email(a['full_name'], date_str, a['scope'], 3))
                    cur.execute("UPDATE audit_sessions SET reminder_3_sent = true WHERE id = %s", (a['id'],))
                if days_left <= 1 and not a['reminder_1_sent']:
                    send_email(a['email'], "Audit Tomorrow", build_reminder_email(a['full_name'], date_str, a['scope'], 1))
                    cur.execute("UPDATE audit_sessions SET reminder_1_sent = true WHERE id = %s", (a['id'],))
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f"Daily reminder error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(daily_reminder_task())
    yield

app = FastAPI(title="CyberGuard GRC - Production Ready", lifespan=lifespan)

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


# --- 5. Validation ---
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
        return False, "Password must contain at least one special character (@$!%*?&#)"
    return True, "Valid"


def validate_full_name(name: str) -> tuple[bool, str]:
    if not name or len(name.strip()) < 2:
        return False, "Name must be at least 2 characters"
    if not re.match(r"^[A-Za-z\s]+$", name):
        return False, "Name must contain only English letters and spaces"
    return True, "Valid"


# --- 6. User routes ---
@app.post("/api/register")
async def register(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        name_valid, name_msg = validate_full_name(data.get("full_name", ""))
        if not name_valid:
            raise HTTPException(status_code=400, detail=name_msg)
        pwd_valid, pwd_msg = validate_password(data.get("password", ""))
        if not pwd_valid:
            raise HTTPException(status_code=400, detail=pwd_msg)
        cur.execute(
            "SELECT id, is_verified FROM users WHERE username = %s OR email = %s",
            (data["username"], data["email"]),
        )
        existing_user = cur.fetchone()
        if existing_user:
            if existing_user['is_verified']:
                raise HTTPException(status_code=400, detail="Username or email already exists")
            else:
                cur.execute("DELETE FROM users WHERE id = %s", (existing_user['id'],))
        hashed_pw = hash_password(data["password"])
        cur.execute(
            "INSERT INTO users (full_name, username, email, password_hash, role, is_active, is_verified, created_at) VALUES (%s, %s, %s, %s, 'User', true, true, NOW())",
            (data["full_name"].strip(), data["username"].strip(), data["email"].strip(), hashed_pw),
        )
        conn.commit()
        print(f"[👤] New user registered: {data['username']}")
        return {"message": "Registration successful", "username": data["username"]}
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
        if user and verify_password(password, user["password_hash"]):
            if not user.get("is_verified", True):
                raise HTTPException(status_code=401, detail="Please verify your email before logging in")
            print(f"[🔑] User logged in: {username}")
            return {
                "access_token": f"token_{user['id']}_{datetime.now().timestamp()}",
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "full_name": user["full_name"],
                    "email": user["email"],
                    "role": user["role"],
                },
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


# --- 7. Controls ---
@app.get("/api/controls/")
async def get_controls():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT id, control_id, title, domain, description, status, level
            FROM ecc_controls
            WHERE level = 1
            ORDER BY control_id ASC
            """
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

# # UPDATED CODE
# @app.get("/api/controls/")
# async def get_controls(level: Optional[int] = 1): # جعلنا المستوى 1 هو الافتراضي
#     conn = get_db_connection()
#     cur = conn.cursor()
#     try:
#         cur.execute(
#             """
#             SELECT id, control_id, title, domain, description, status, level
#             FROM ecc_controls
#             WHERE level = %s
#             ORDER BY control_id ASC
#             """, (level,)
#         )
#         return cur.fetchall()
#     finally:
#         cur.close()
#         conn.close()


@app.get("/api/controls/hierarchy")
async def get_controls_hierarchy():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT id, control_id, title, domain, description, parent_control_id, level, status
            FROM ecc_controls ORDER BY control_id ASC
            """
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()

# # UPDATED CODE
# @app.get("/api/controls/hierarchy")
# async def get_controls_hierarchy():
#     conn = get_db_connection()
#     cur = conn.cursor()
#     try:
#         # جلب كافة الضوابط دون استثناء لأي مستوى
#         cur.execute(
#             """
#             SELECT id, control_id, title, domain, description, parent_control_id, level, status
#             FROM ecc_controls 
#             ORDER BY level ASC, control_id ASC
#             """
#         )
#         rows = cur.fetchall()

#         # بناء قاموس لتخزين الضوابط وترتيبها
#         all_controls = {}
#         hierarchy = []

#         for row in rows:
#             # تجهيز بيانات الضابط مع قائمة أبناء فارغة
#             control_item = {
#                 "id": row["id"],
#                 "control_id": row["control_id"],
#                 "title": row["title"],
#                 "domain": row["domain"],
#                 "description": row["description"],
#                 "status": row["status"],
#                 "level": row["level"],
#                 "sub_controls": []
#             }
#             all_controls[row["control_id"]] = control_item

#             # إذا كان المستوى 1، نضفه كجذر أساسي في الشجرة
#             if row["level"] == 1 or not row["parent_control_id"]:
#                 hierarchy.append(control_item)
#             else:
#                 # إذا كان ضابطاً فرعياً، نبحث عن والده في القاموس ونحقنه داخله
#                 parent_id = row["parent_control_id"]
#                 if parent_id in all_controls:
#                     all_controls[parent_id]["sub_controls"].append(control_item)
#                 else:
#                     # حالة احتياطية: إذا لم يجد الأب (مثلاً خطأ في إدخال البيانات)، يضعه في المستوى الأول
#                     hierarchy.append(control_item)

#         return hierarchy
#     finally:
#         cur.close()
#         conn.close()


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

# # UPDATED CODE
# @app.get("/api/controls/{control_id}")
# async def get_control_by_id(control_id: str):
#     conn = get_db_connection()
#     # نستخدم RealDictCursor لضمان عودة البيانات كقاموس (Dictionary) مفاتحه هي أسماء الأعمدة
#     cur = conn.cursor()
#     try:
#         # نقوم بجلب كافة الأعمدة للتأكد من وجود الوصف (description) والأهداف (objective) 
#         # لأن محرك AI يحتاج هذه النصوص لتوليد الأسئلة
#         cur.execute(
#             """
#             SELECT id, control_id, title, domain, description, objective, 
#                    implementation_guidelines, expected_deliverables, 
#                    parent_control_id, level, status 
#             FROM ecc_controls 
#             WHERE control_id = %s
#             """, 
#             (control_id,)
#         )
        
#         res = cur.fetchone()
        
#         if not res:
#             # في حال لم يجد الضابط (مثل 1-9-3-1)، يفضل إرجاع رسالة واضحة للمساعدة في التشخيص
#             print(f"[⚠️] Control ID '{control_id}' requested but not found in DB.")
#             raise HTTPException(status_code=404, detail=f"Control '{control_id}' not found")
        
#         # تحويل القيم التي قد تكون None إلى نصوص فارغة لتجنب أخطاء JSON في المتصفح
#         for key, value in res.items():
#             if value is None:
#                 res[key] = ""
                
#         return res
#     except Exception as e:
#         print(f"[❌] Error fetching control {control_id}: {str(e)}")
#         raise HTTPException(status_code=500, detail="Internal Server Error during fetching control")
#     finally:
#         cur.close()
#         conn.close()


@app.post("/api/controls/{control_id}/status")
async def update_control_status(control_id: str, data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        status = data.get("status")
        if status not in ["Compliant", "Non-Compliant", "Partial", "Not Started"]:
            raise HTTPException(status_code=400, detail="Invalid status")

        cur.execute(
            "UPDATE ecc_controls SET status = %s WHERE control_id = %s",
            (status, control_id),
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

# # UPDATED CODE 
# @app.post("/api/controls/{control_id}/status")
# async def update_control_status(control_id: str, data: dict = Body(...)):
#     conn = get_db_connection()
#     cur = conn.cursor()
#     try:
#         status = data.get("status")
#         if status not in ["Compliant", "Non-Compliant", "Partial", "Not Started"]:
#             raise HTTPException(status_code=400, detail="Invalid status")

#         cur.execute(
#             "UPDATE ecc_controls SET status = %s WHERE control_id = %s",
#             (status, control_id),
#         )
        
#         # --- السطر المضاف للتحقق ---
#         if cur.rowcount == 0:
#             raise HTTPException(status_code=404, detail="Control ID not found")
#         # --------------------------

#         conn.commit()
#         return {"message": "Status updated", "control_id": control_id, "status": status}
#     except HTTPException: raise
#     except Exception as e:
#         conn.rollback()
#         raise HTTPException(status_code=500, detail=str(e))
#     finally:
#         cur.close()
#         conn.close()

# --- 8. AI routes ---
@app.post("/api/ai/generate-questions")
async def generate_questions(data: dict = Body(...)):
    control_id = data.get("control_id")
    mode = data.get("mode", "audit")

    if not control_id:
        raise HTTPException(status_code=400, detail="control_id is required")

    try:
        engine = get_rag_engine()
    except Exception as e:
        print(f"[❌] AI ENGINE ERROR: {e}")
        raise HTTPException(status_code=500, detail="AI Engine is offline. Please contact administrator.")

    print(f"[🤖] Generating 10 {mode} questions for control: {control_id}")

    try:
        raw_response = engine.process_request(
            control_id=control_id,
            query="",
            mode=mode,
        )

        clean = raw_response.strip()
        start = clean.find("[")
        end = clean.rfind("]") + 1

        if start != -1 and end > start:
            json_str = clean[start:end]
            questions = json.loads(json_str)

            if len(questions) == 0:
                print(f"[⚠️] AI returned 0 questions for {control_id}")
                return {
                    "questions": [],
                    "error": "AI could not generate questions. Ensure ECC documents are indexed in ChromaDB.",
                }

            print(f"[✅] Generated {len(questions)} questions for {control_id}")
            return {"questions": questions}

        print(f"[⚠️] No JSON array found in AI response for {control_id}")
        return {
            "questions": [],
            "raw_response": raw_response[:500],
            "error": "AI response was not in expected JSON format",
        }

    except json.JSONDecodeError as e:
        print(f"[❌] JSON Parse Error for {control_id}: {e}")
        return {
            "questions": [],
            "raw_response": raw_response[:500],
            "error": f"Could not parse AI response: {str(e)}",
        }
    except Exception as e:
        print(f"[❌] Generate Questions Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# # UPDATED CODE
# @app.post("/api/ai/generate-questions")
# async def generate_questions(data: dict = Body(...)):
#     control_id = data.get("control_id")
#     mode = data.get("mode", "audit")

#     if not control_id:
#         raise HTTPException(status_code=400, detail="control_id is required")

#     # 1. جلب بيانات الضابط من SQL لضمان وجود سياق (Context) حتى للمستويات العميقة
#     conn = get_db_connection()
#     cur = conn.cursor()
#     cur.execute("SELECT title, description, objective FROM ecc_controls WHERE control_id = %s", (control_id,))
#     control_data = cur.fetchone()
#     cur.close()
#     conn.close()

#     if not control_data:
#          print(f"[⚠️] Control {control_id} not found in SQL database.")
#          return {"questions": [], "error": f"Control {control_id} not found in database."}

#     # تجهيز سياق إضافي للذكاء الاصطناعي
#     control_context = f"Control Title: {control_data['title']}\nDescription: {control_data['description']}\nObjective: {control_data['objective']}"

#     try:
#         engine = get_rag_engine()
#     except Exception as e:
#         print(f"[❌] AI ENGINE ERROR: {e}")
#         raise HTTPException(status_code=500, detail="AI Engine is offline.")

#     print(f"[🤖] Generating 10 {mode} questions for control: {control_id} using SQL Context")

#     try:
#         # 2. نرسل السياق الذي جلبناه من SQL مع الطلب
#         raw_response = engine.process_request(
#             control_id=control_id,
#             query=f"Based on this control details: {control_context}, generate 10 audit questions.",
#             mode=mode,
#         )

#         clean = raw_response.strip()
#         start = clean.find("[")
#         end = clean.rfind("]") + 1

#         if start != -1 and end > start:
#             json_str = clean[start:end]
#             questions = json.loads(json_str)

#             if len(questions) == 0:
#                 print(f"[⚠️] AI returned 0 questions for {control_id}")
#                 return {"questions": [], "error": "AI could not generate questions."}

#             print(f"[✅] Generated {len(questions)} questions for {control_id}")
#             return {"questions": questions}

#         return {
#             "questions": [],
#             "error": "AI response format error",
#             "raw_response": raw_response[:200]
#         }

#     except Exception as e:
#         print(f"[❌] Generate Questions Error: {e}")
#         raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/recommendations")
async def get_recommendations(data: dict = Body(...)):
    control_id = data.get("control_id")
    user_answers = data.get("user_answers", "")

    if not control_id:
        raise HTTPException(status_code=400, detail="control_id is required")

    try:
        engine = get_rag_engine()
    except Exception as e:
        print(f"[❌] AI ENGINE ERROR: {e}")
        raise HTTPException(status_code=500, detail="AI Engine is offline")

    print(f"[🤖] Generating recommendations for control: {control_id}")

    response = engine.process_request(
        control_id=control_id,
        query=user_answers,
        mode="recommendations",
    )

    if not response or len(response.strip()) < 20:
        return {
            "answer": "Unable to generate recommendations at this time. Please ensure all assessment questions were answered.",
            "error": "Empty or invalid AI response",
        }

    return {"answer": response}


@app.post("/api/ai/process")
async def process_ai(data: dict = Body(...)):
    try:
        engine = get_rag_engine()
    except Exception as e:
        print(f"[❌] AI ENGINE ERROR: {e}")
        raise HTTPException(status_code=500, detail="AI Engine is offline")

    response = engine.process_request(
        control_id=data.get("control_id"),
        query=data.get("query", "") or data.get("text", ""),
        mode=data.get("mode", "guidance"),
    )
    return {"answer": response}


# --- 9. Audit sessions ---
@app.post("/api/audit/session/start")
async def start_audit_session(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = data.get("user_id")
        control_id_raw = data.get("control_id")
        mode = data.get("mode", "audit")
        next_audit = datetime.now() + timedelta(days=30)
        # تحويل control_id من نص إلى integer
        control_db_id = None
        if control_id_raw:
            cur.execute("SELECT id FROM ecc_controls WHERE control_id = %s", (control_id_raw,))
            row = cur.fetchone()
            if row:
                control_db_id = row["id"]
        cur.execute(
            """
            INSERT INTO audit_sessions
            (user_id, control_id, mode, status, started_at, scheduled_next_audit, created_at)
            VALUES (%s, %s, %s, 'in_progress', NOW(), %s, NOW())
            RETURNING id
            """,
            (user_id, control_db_id, mode, next_audit),
        )
        session = cur.fetchone()
        conn.commit()
        print(f"[🎯] Audit session started: {session['id']} (control_id={control_id_raw}, mode={mode})")
        return {"session_id": session["id"], "message": "Session started", "control_db_id": control_db_id}
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
        cur.execute(
            """
            INSERT INTO audit_qa (session_id, question, answer, ai_generated, notes, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            """,
            (
                data.get("session_id"),
                data.get("question"),
                data.get("answer"),
                data.get("ai_generated", True),
                data.get("notes", ""),
            ),
        )
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
        session_id = data.get("session_id")
        status = data.get("status")
        score = data.get("score")

        cur.execute(
            """
            UPDATE audit_sessions
            SET status = %s, score = %s, completed_at = NOW()
            WHERE id = %s
            """,
            (status, score, session_id),
        )
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


# --- 10. Compliance scores ---
@app.post("/api/audit/compliance-score")
async def save_compliance_score(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = data.get("user_id")
        control_id = data.get("control_id")
        score = data.get("score", 0)
        total = data.get("total_questions", 0)
        yes = data.get("answered_yes", 0)
        no = data.get("answered_no", 0)
        partial = data.get("answered_partial", 0)

        cur.execute(
            """
            DELETE FROM compliance_scores
            WHERE user_id = %s AND control_id = %s
            """,
            (user_id, control_id),
        )

        cur.execute(
            """
            INSERT INTO compliance_scores
            (user_id, control_id, score, total_questions, answered_yes, answered_no, answered_partial, calculated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            """,
            (user_id, control_id, score, total, yes, no, partial),
        )

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


# --- 11. Dashboard ---
@app.get("/api/dashboard/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) as total FROM ecc_controls WHERE level = 1")
        total = cur.fetchone()["total"] or 10

        cur.execute(
            """
            SELECT
                COUNT(DISTINCT ec.control_id) as audited_cnt,
                COALESCE(AVG(cs.score), 0) as avg_score,
                SUM(CASE WHEN cs.score >= 80 THEN 1 ELSE 0 END) as compliant_cnt,
                SUM(CASE WHEN cs.score >= 40 AND cs.score < 80 THEN 1 ELSE 0 END) as partial_cnt,
                SUM(CASE WHEN cs.score < 40 THEN 1 ELSE 0 END) as noncompliant_cnt
            FROM (
                SELECT control_id, MAX(score) as score
                FROM compliance_scores
                WHERE user_id = %s
                GROUP BY control_id
            ) cs
            JOIN ecc_controls ec ON cs.control_id = ec.id
            """,
            (user_id,)
        )
        sc = cur.fetchone()
        avg_score = float(sc["avg_score"] or 0)
        compliant = int(sc["compliant_cnt"] or 0)
        partial = int(sc["partial_cnt"] or 0)
        non_compliant = int(sc["noncompliant_cnt"] or 0)
        audited = int(sc["audited_cnt"] or 0)
        score = round(avg_score, 1) if avg_score > 0 else 0.0
        audit_progress = round((audited / total * 100)) if total > 0 else 0

        cur.execute("SELECT control_id, status FROM ecc_controls WHERE level = 1 ORDER BY control_id")
        control_statuses = cur.fetchall()

        cur.execute(
            """
            SELECT scheduled_next_audit FROM audit_sessions
            WHERE scheduled_next_audit IS NOT NULL AND scheduled_next_audit > NOW()
            ORDER BY scheduled_next_audit ASC LIMIT 1
            """
        )
        next_audit = cur.fetchone()

        next_audit_date = (
            next_audit["scheduled_next_audit"].isoformat()
            if next_audit and next_audit["scheduled_next_audit"]
            else None
        )

        result = {
            "compliance_score": score,
            "total_controls": total,
            "critical_gaps": non_compliant,
            "partial_controls": partial,
            "compliant_controls": compliant,
            "audit_progress": audit_progress,
            "audited_controls": audited,
            "next_audit_date": next_audit_date,
            "control_statuses": [dict(cs) for cs in control_statuses],
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
async def get_domain_scores(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT ec.domain,
                   ROUND(AVG(cs.score), 1) as score
            FROM compliance_scores cs
            JOIN ecc_controls ec ON cs.control_id = ec.id
            WHERE cs.user_id = %s
            GROUP BY ec.domain
            ORDER BY ec.domain
        """, (user_id,))
        rows = cur.fetchall()
        return [{"domain": r["domain"], "score": float(r["score"] or 0)} for r in rows]
    finally:
        cur.close()
        conn.close()


@app.get("/api/dashboard/category-scores")
async def get_category_scores(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT ec.title as category,
                   ROUND(AVG(cs.score), 1) as score
            FROM compliance_scores cs
            JOIN ecc_controls ec ON cs.control_id = ec.id
            WHERE cs.user_id = %s
            GROUP BY ec.title
            ORDER BY MIN(ec.control_id)
        """, (user_id,))
        rows = cur.fetchall()
        return [{"category": r["category"], "score": float(r["score"] or 0)} for r in rows]
    finally:
        cur.close()
        conn.close()


# --- 12. Evidence ---
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
        control_db_id = ctrl["id"] if ctrl else None

        cur.execute(
            """
            INSERT INTO evidence (control_id, title, file_path, status, created_at, updated_at)
            VALUES (%s, %s, %s, 'Pending', NOW(), NOW())
            """,
            (control_db_id, file.filename, file_path),
        )
        conn.commit()
        print(f"[📎] Evidence uploaded: {file.filename} for control {control_id}")
        return {"message": "Evidence uploaded successfully", "file": file.filename}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


def ensure_evidence_schema(cur):
    # Keep production databases compatible with the evidence repository features.
    cur.execute("ALTER TABLE evidence ADD COLUMN IF NOT EXISTS session_id INTEGER")
    cur.execute("ALTER TABLE evidence ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(100)")
    cur.execute("ALTER TABLE evidence ADD COLUMN IF NOT EXISTS description TEXT")
    cur.execute("ALTER TABLE evidence ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()")


@app.get("/api/evidence/")
async def get_evidence(domain: str = None, status: str = None):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        ensure_evidence_schema(cur)
        conn.commit()
        query = """
            SELECT
                e.id, e.control_id, e.session_id, e.evidence_type, e.title,
                e.description, e.file_path, e.status, e.created_at, e.updated_at,
                ec.control_id as control_code, ec.domain, ec.title as control_name,
                s.score as session_score,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'question', qa.question,
                            'answer', qa.answer,
                            'evidence', qa.notes,
                            'created_at', qa.created_at
                        )
                        ORDER BY qa.id
                    ) FILTER (WHERE qa.id IS NOT NULL),
                    '[]'::json
                ) as answers
            FROM evidence e
            LEFT JOIN ecc_controls ec ON e.control_id = ec.id
            LEFT JOIN audit_sessions s ON e.session_id = s.id
            LEFT JOIN audit_qa qa ON e.session_id = qa.session_id
            WHERE 1=1
        """
        params = []
        if domain:
            query += " AND ec.domain = %s"
            params.append(domain)
        if status:
            query += " AND e.status = %s"
            params.append(status)
        query += """
            GROUP BY e.id, e.control_id, e.session_id, e.evidence_type, e.title,
                     e.description, e.file_path, e.status, e.created_at, e.updated_at,
                     ec.control_id, ec.domain, ec.title, s.score
            ORDER BY e.created_at DESC
        """

        cur.execute(query, params)
        results = cur.fetchall()
        for item in results:
            item["score"] = item.get("session_score") or _extract_score_from_description(item.get("description"))
            if item.get("session_id") and not item.get("evidence_type"):
                item["evidence_type"] = "audit_session"
        print(f"[📁] Retrieved {len(results)} evidence records")
        return results
    finally:
        cur.close()
        conn.close()


def _extract_score_from_description(description: str | None):
    if not description:
        return None
    match = re.search(r"Score:\s*(\d+(?:\.\d+)?)%", description, re.IGNORECASE)
    return float(match.group(1)) if match else None


async def _insert_evidence_record(data: dict, evidence_type: str = "audit_session"):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        ensure_evidence_schema(cur)
        control_id = data.get("control_id")
        session_id = data.get("session_id")
        title = data.get("title", "Audit Report")
        status = data.get("status", "Pending")
        score = data.get("score")
        domain = data.get("domain", "")
        description = data.get("description")
        if not description:
            description = f"{domain} — Score: {score}%" if score is not None else domain

        # Audit evidence is append-only so every completed audit remains permanently viewable.
        cur.execute(
            """
            INSERT INTO evidence
            (control_id, session_id, evidence_type, title, description, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
            RETURNING id
            """,
            (control_id, session_id, evidence_type, title, description, status),
        )
        ev = cur.fetchone()
        conn.commit()
        print(f"[📋] Evidence saved permanently: {title} — {status} ({score}%)")
        return {"message": "Evidence saved", "evidence_id": ev["id"]}
    except Exception as e:
        conn.rollback()
        print(f"[❌] Save Evidence Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@app.post("/api/evidence/save")
async def save_evidence(data: dict = Body(...)):
    return await _insert_evidence_record(data, data.get("evidence_type", "audit_session"))


@app.post("/api/evidence/save-audit")
async def save_audit_evidence(data: dict = Body(...)):
    return await _insert_evidence_record(data, "audit_session")


# --- 13. Gaps ---
@app.post("/api/gaps/save")
async def save_gap(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        session_id = data.get("session_id")
        control_id = data.get("control_id")
        gap_description = data.get("gap_description")
        recommendation = data.get("recommendation")
        priority = data.get("priority", "Medium")
        # تحويل control_id من نص إلى integer إذا لزم
        if control_id and not str(control_id).isdigit():
            cur.execute("SELECT id FROM ecc_controls WHERE control_id = %s", (control_id,))
            row = cur.fetchone()
            control_id = row["id"] if row else None
        cur.execute(
            """
            INSERT INTO gaps_recommendations
            (session_id, control_id, gap_description, recommendation, priority, status, created_at)
            VALUES (%s, %s, %s, %s, %s, 'Open', NOW())
            RETURNING id
            """,
            (session_id, control_id, gap_description, recommendation, priority),
        )
        gap = cur.fetchone()
        conn.commit()
        print(f"[🔍] Gap saved: ID={gap['id']}, control={control_id}, priority={priority}")
        return {"message": "Gap recommendation saved", "gap_id": gap["id"]}
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


# --- 14. Scheduler ---
@app.get("/api/scheduler/recommendations")
async def get_scheduler_recommendations():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) as gaps FROM ecc_controls WHERE status = 'Non-Compliant' AND level = 1")
        gaps = cur.fetchone()["gaps"] or 0

        cur.execute(
            """
            SELECT ROUND(AVG(CASE WHEN status='Compliant' THEN 100
                                  WHEN status='Partial' THEN 50
                                  ELSE 0 END), 1) as score
            FROM ecc_controls WHERE level = 1
            """
        )
        score = cur.fetchone()["score"] or 0

        if gaps > 3:
            days = 7
            focus = "Critical gaps in multiple domains require immediate attention"
        elif gaps > 0:
            days = 14
            focus = "Address non-compliant controls before next audit cycle"
        else:
            days = 30
            focus = "Maintain current compliance posture with regular reviews"

        return [
            {
                "current_score": score,
                "critical_gaps": gaps,
                "recommended_days": days,
                "recommendation_text": f"Based on {gaps} critical gap(s) and {score}% compliance, schedule next audit in {days} days.",
                "focus_areas": focus,
            }
        ]
    finally:
        cur.close()
        conn.close()


@app.post("/api/scheduler/schedule")
async def schedule_audit_endpoint(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        audit_date = data.get("audit_date")
        scope = data.get("scope", "full")
        priority = data.get("priority_level", "medium")
        repeat_enabled = data.get("repeat_enabled", False)
        repeat_frequency = data.get("repeat_frequency")
        repeat_until = data.get("repeat_until")

        try:
            scheduled_date = datetime.fromisoformat(audit_date)
            if scheduled_date < datetime.now():
                raise HTTPException(status_code=400, detail="Audit date cannot be in the past")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")

        
        user_id = current_user["id"]

        cur.execute(
                        """
                INSERT INTO audit_sessions
            (
                    user_id,
                     mode,
                    status,
                    scheduled_next_audit,
                    scope,
                    priority_level,
                    repeat_enabled,
                    repeat_frequency,
                    repeat_until,
                    created_at
            )
                  VALUES
                (
                    %s,
                    'scheduled',
                    'scheduled',
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        NOW()
                )
                RETURNING id
                """,
             (
        user_id,
        scheduled_date,
        scope,
        priority,
        repeat_enabled,
        repeat_frequency,
        repeat_until
        ),
    )

        session = cur.fetchone()
        conn.commit()
        print(f"[📅] Audit scheduled: session={session['id']}, date={audit_date}, scope={scope}")
        return {
            "message": "Audit scheduled successfully",
            "session_id": session["id"],
            "audit_date": audit_date,
            "scope": scope,
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


@app.post("/api/scheduler/send-reminders")
async def send_audit_reminders():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT s.id, s.scheduled_next_audit, s.scope,
                   u.email, u.full_name,
                   s.reminder_7_sent, s.reminder_3_sent, s.reminder_1_sent,
                   EXTRACT(DAY FROM s.scheduled_next_audit - NOW()) as days_left
            FROM audit_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.status = 'scheduled'
            AND s.scheduled_next_audit > NOW()
            AND s.scheduled_next_audit <= NOW() + INTERVAL '7 days'
        """)
        audits = cur.fetchall()
        sent = 0
        for a in audits:
            days_left = int(a['days_left'])
            date_str = a['scheduled_next_audit'].strftime('%B %d, %Y')
            
            # تذكير 7 أيام
            if days_left <= 7 and not a['reminder_7_sent']:
                subject = "📅 Audit Reminder — 7 Days Left"
                body = build_reminder_email(a['full_name'], date_str, a['scope'], 7)
                try:
                    send_email(a['email'], subject, body)
                    cur.execute("UPDATE audit_sessions SET reminder_7_sent = true WHERE id = %s", (a['id'],))
                    sent += 1
                except Exception as e:
                    print(f"[❌] 7-day reminder error: {e}")
            
            # تذكير 3 أيام
            if days_left <= 3 and not a['reminder_3_sent']:
                subject = "Audit Reminder 3 Days Left"
                body = build_reminder_email(a['full_name'], date_str, a['scope'], 3)
                try:
                    send_email(a['email'], subject, body)
                    cur.execute("UPDATE audit_sessions SET reminder_3_sent = true WHERE id = %s", (a['id'],))
                    sent += 1
                except Exception as e:
                    print(f"3-day reminder error: {e}")

            # تذكير 1 يوم
            if days_left <= 1 and not a['reminder_1_sent']:
                subject = "Audit Tomorrow"
                body = build_reminder_email(a['full_name'], date_str, a['scope'], 1)
                try:
                    send_email(a['email'], subject, body)
                    cur.execute("UPDATE audit_sessions SET reminder_1_sent = true WHERE id = %s", (a['id'],))
                    sent += 1
                except Exception as e:
                    print(f"1-day reminder error: {e}")
        
        conn.commit()
        print(f"[📧] Sent {sent} audit reminders")
        return {"message": f"Sent {sent} reminders"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

def build_reminder_email(name, date_str, scope, days):
    color = '#f59e0b' if days == 7 else '#ef4444'
    icon = '📅' if days == 7 else '⚠️' if days == 3 else '🚨'
    days_text = f"{days} days" if days > 1 else "Tomorrow!"
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px">
        <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:32px">🛡️</div>
            <h2 style="color:#06b6d4;margin:8px 0">ECC Auditor</h2>
        </div>
        <p style="color:#94a3b8;margin-bottom:20px">Dear <strong>{name}</strong>,</p>
        <div style="background:#1e293b;border:1px solid {color}40;border-radius:8px;padding:20px;margin-bottom:20px;text-align:center">
            <div style="font-size:28px;margin-bottom:8px">{icon}</div>
            <p style="color:{color};font-weight:700;font-size:18px;margin:0">
                Your audit is in <strong>{days} days</strong>
            </p>
            <p style="font-size:24px;font-weight:800;color:#06b6d4;margin:10px 0">{date_str}</p>
            <p style="color:#94a3b8;margin:0;font-size:13px">Scope: {scope or 'Full Audit'}</p>
        </div>
        <p style="color:#94a3b8;font-size:13px;margin-bottom:20px">
            Please prepare your documentation and evidence before the audit date.
        </p>
        <a href="https://cyberguards.up.railway.app/scheduler.html" 
           style="display:block;text-align:center;background:#06b6d4;color:white;padding:14px;border-radius:8px;text-decoration:none;font-weight:700">
            View Scheduler
        </a>
        <p style="color:#475569;font-size:11px;margin-top:20px;text-align:center">
            ECC Auditor — CyberGuard GRC Platform
        </p>
    </div>
    """

@app.delete("/api/scheduler/schedule/{session_id}")
async def delete_scheduled_audit(session_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM audit_sessions WHERE id = %s AND user_id = %s AND status = 'scheduled'",
            (session_id, current_user["id"])
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Audit not found")
        conn.commit()
        return {"message": "Audit deleted"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()



@app.post("/api/scheduler/auto")
async def toggle_auto_scheduling(data: dict = Body(...)):
    enabled = data.get("enabled", False)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if enabled:
            cur.execute("SELECT COUNT(*) as gaps FROM ecc_controls WHERE status = 'Non-Compliant' AND level = 1")
            gaps = cur.fetchone()["gaps"] or 0

            days = 7 if gaps > 3 else (14 if gaps > 0 else 30)
            next_date = datetime.now() + timedelta(days=days)
            user_id = extract_user_id_from_token(data.get("_token", "")) or 1

            cur.execute(
                """
                UPDATE audit_sessions SET status = 'cancelled'
                WHERE user_id = %s AND status = 'scheduled'
                """,
                (user_id,),
            )

            cur.execute(
                """
                INSERT INTO audit_sessions (user_id, mode, status, scheduled_next_audit, created_at)
                VALUES (%s, 'ai_scheduled', 'scheduled', %s, NOW())
                RETURNING id
                """,
                (user_id, next_date),
            )
            session = cur.fetchone()
            conn.commit()

            print(f"[🤖] AI auto-scheduling enabled: next audit in {days} days (session {session['id']})")
            return {
                "message": "Auto-scheduling enabled",
                "enabled": True,
                "next_audit_date": next_date.isoformat(),
                "days_until_audit": days,
                "session_id": session["id"],
            }

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
async def get_scheduled_audits(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT
                s.id, s.mode, s.status,
                s.scheduled_next_audit, s.created_at,
                s.scope, s.priority_level,
                s.repeat_enabled,s.repeat_frequency,
                ec.title as control_title, ec.domain
            FROM audit_sessions s
            LEFT JOIN ecc_controls ec ON s.control_id = ec.id
            WHERE s.status = 'scheduled'
            AND DATE(s.scheduled_next_audit) >= CURRENT_DATE
            AND s.user_id = %s
            ORDER BY s.scheduled_next_audit ASC
            LIMIT 20
            """,
            (current_user["id"],)
        )
        rows = cur.fetchall()

        scope_names = {
            "full": "Full ECC Assessment",

            "1-1": "1-1 Cybersecurity Strategy",
            "1-2": "1-2 Cybersecurity Management",
            "1-3": "1-3 Policies & Procedures",
            "1-4": "1-4 Roles & Responsibilities",
            "1-5": "1-5 Risk Management",
            "1-6": "1-6 IT Project Management",
            "1-7": "1-7 Compliance & Regulations",
            "1-8": "1-8 Review & Audit",
            "1-9": "1-9 Cybersecurity in HR",
            "1-10": "1-10 Awareness & Training",
        }
        auditor_names = {
            "security-team": "Security Team",
            "compliance-team": "Compliance Team",
            "external-auditor": "External Auditor",
            "ai-system": "AI System",
        }

        result = []
        for r in rows:
            raw_date = r["scheduled_next_audit"] or r["created_at"]
            date_str = raw_date.strftime("%b %d, %Y") if raw_date and hasattr(raw_date, "strftime") else str(raw_date or "")[:10]
            mode = r["mode"] or ""
            scope_raw = r["scope"] or "full"
            priority_raw = r["priority_level"] or "medium"
            title = "AI-Scheduled Audit" if "ai" in mode else "Scheduled Compliance Audit"

            result.append(
                {
                    "id": r["id"],
                    "title": title,
                    "status": "Scheduled",
                    "date": date_str,
                    "scope": scope_names.get(scope_raw, scope_raw),
                    "priority": priority_raw,
                    "mode": mode,
                    "domain": r["domain"] or "",
                    
                    "repeat_enabled": r["repeat_enabled"],
                    "repeat_frequency": r["repeat_frequency"],
                }
            )
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
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT
                s.id, s.mode, s.status, s.score,
                s.started_at, s.completed_at, s.created_at,
                s.scope, s.priority_level,
                ec.control_id as control_code, ec.title as control_title, ec.domain
            FROM audit_sessions s
            LEFT JOIN ecc_controls ec ON s.control_id = ec.id
            WHERE s.status NOT IN ('cancelled')
            ORDER BY
                CASE WHEN s.status = 'scheduled' THEN 0 ELSE 1 END,
                s.created_at DESC
            LIMIT 20
            """
        )
        rows = cur.fetchall()
        domain_names = {
            "1-1": "Governance",
            "1-2": "Risk Management",
            "1-3": "Asset Management",
            "1-4": "Cybersecurity Operations",
            "1-5": "Network Hardening",
            "1-6": "Identity & Access",
            "1-7": "Data Protection",
            "1-8": "Vulnerability Management",
            "1-9": "Incident Response",
            "1-10": "Physical Security",
        }

        result = []
        for r in rows:
            if r["control_title"]:
                title = r["control_title"] + " Audit"
            elif r["control_code"] and r["control_code"] in domain_names:
                title = domain_names[r["control_code"]] + " Audit"
            elif r["mode"] == "ai_scheduled":
                title = "AI-Scheduled Compliance Audit"
            elif r["mode"] == "scheduled":
                title = "Scheduled Compliance Audit"
            else:
                title = "Compliance Audit"

            status = (r["status"] or "").lower()
            if status == "completed":
                display_status = "Completed"
            elif status == "compliant":
                display_status = "Completed"
            elif status in ("partial", "non-compliant", "non_compliant"):
                display_status = status.title()
            elif status == "scheduled":
                display_status = "Scheduled"
            elif status == "in_progress":
                display_status = "In Progress"
            else:
                display_status = r["status"] or "Unknown"

            raw_date = r["completed_at"] or r["started_at"] or r["created_at"]
            date_str = raw_date.strftime("%b %d, %Y") if raw_date and hasattr(raw_date, "strftime") else str(raw_date or "")[:10]

            result.append(
                {
                    "id": r["id"],
                    "title": title,
                    "status": display_status,
                    "score": r["score"],
                    "date": date_str,
                    "priority": r["priority_level"] or "medium",
                    "domain": r["domain"] or "",
                    "mode": r["mode"] or "",
                }
            )

        print(f"[📋] Audit sessions retrieved: {len(result)} records")
        return result
    except Exception as e:
        print(f"[❌] Get Sessions Error: {e}")
        return []
    finally:
        cur.close()
        conn.close()


@app.get("/api/alerts")
async def get_alerts(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    user_id = current_user["id"]
    alerts = []

    try:
        cur.execute(
            """
            SELECT ec.control_id, ec.title, ec.domain, MAX(cs.calculated_at) as last_audit
            FROM compliance_scores cs
            LEFT JOIN ecc_controls ec ON cs.control_id = ec.id
            WHERE cs.user_id = %s AND cs.score < 40 AND cs.control_id IS NOT NULL
            GROUP BY ec.control_id, ec.title, ec.domain
            ORDER BY last_audit DESC LIMIT 5
            """,
            (user_id,),
        )
        non_compliant = cur.fetchall()
        for c in non_compliant:
            alerts.append(
                {
                    "level": "critical",
                    "title": f"{c['title']} — Non-Compliant",
                    "body": f"Control {c['control_id']} ({c['domain']}) failed your last audit. Immediate remediation required to meet ECC-2023 requirements.",
                    "source": "ECC Auditor AI",
                    "control_id": c["control_id"],
                }
            )

        cur.execute(
            """
            SELECT COALESCE(AVG(score), 0) as avg_score
            FROM compliance_scores WHERE user_id = %s
            """,
            (user_id,),
        )
        avg = float(cur.fetchone()["avg_score"] or 0)
        if avg > 0 and avg < 50:
            alerts.append(
                {
                    "level": "critical",
                    "title": f"Low Compliance Score: {round(avg)}%",
                    "body": f"Your overall compliance score is {round(avg)}%, which is below the acceptable threshold. Prioritize remediation of critical gaps immediately.",
                    "source": "ECC Auditor AI",
                    "control_id": None,
                }
            )
        elif avg >= 50 and avg < 80:
            alerts.append(
                {
                    "level": "warning",
                    "title": f"Compliance Score Needs Improvement: {round(avg)}%",
                    "body": f"Your compliance score is {round(avg)}%. Target is 95%. Focus on resolving partial and non-compliant controls.",
                    "source": "ECC Auditor AI",
                    "control_id": None,
                }
            )

        if not alerts:
            alerts.append(
                {
                    "level": "info",
                    "title": "No Critical Issues Detected",
                    "body": "Your ECC-2023 compliance posture looks good. Continue monitoring and schedule periodic audits to maintain compliance.",
                    "source": "ECC Auditor AI",
                    "control_id": None,
                }
            )

        return alerts[:6]
    except Exception as e:
        print(f"[❌] Alerts Error: {e}")
        return []
    finally:
        cur.close()
        conn.close()
@app.get("/api/dashboard/gaps")
async def get_dashboard_gaps(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT gr.gap_description, gr.recommendation, gr.priority,
                   ec.control_id, ec.title as control_title,
                   s.mode
            FROM gaps_recommendations gr
            JOIN audit_sessions s ON gr.session_id = s.id
            LEFT JOIN ecc_controls ec ON gr.control_id = ec.id
            WHERE s.user_id = %s AND gr.control_id IS NOT NULL
            AND s.mode = 'guide'
            ORDER BY gr.created_at DESC LIMIT 5
        """, (user_id,))
        return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        print(f"[❌] Gaps Error: {e}")
        return []
    finally:
        cur.close()
        conn.close()
    # --- 15. Profile ---
@app.get("/api/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "full_name": current_user["full_name"],
        "username": current_user["username"],
        "email": current_user["email"],
        "role": current_user["role"],
    }

@app.post("/api/profile/update")
async def update_profile(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        user_id = current_user["id"]
        full_name = data.get("full_name", "").strip()
        current_password = data.get("current_password", "")
        new_password = data.get("new_password", "")

        if full_name:
            name_valid, name_msg = validate_full_name(full_name)
            if not name_valid:
                raise HTTPException(status_code=400, detail=name_msg)
            cur.execute("UPDATE users SET full_name = %s WHERE id = %s", (full_name, user_id))

        email = data.get("email", "").strip()
        if email:
            cur.execute("SELECT id FROM users WHERE email = %s AND id != %s", (email, user_id))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="Email already in use")
            cur.execute("UPDATE users SET email = %s WHERE id = %s", (email, user_id))

        if new_password:
            cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
            if not verify_password(current_password, user["password_hash"]):
                raise HTTPException(status_code=400, detail="Current password is incorrect")
            pwd_valid, pwd_msg = validate_password(new_password)
            if not pwd_valid:
                raise HTTPException(status_code=400, detail=pwd_msg)
            cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(new_password), user_id))

        conn.commit()
        cur.execute("SELECT id, username, full_name, email, role FROM users WHERE id = %s", (user_id,))
        updated = dict(cur.fetchone())
        print(f"[✅] Profile updated for user {user_id}")
        return {"message": "Profile updated successfully", "user": updated}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        print(f"[❌] Profile Update Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

# --- 16. Admin ---
def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

@app.get("/api/admin/users")
async def admin_get_users(current_user: dict = Depends(require_admin)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.id, u.full_name, u.username, u.email, u.role, u.is_active, u.created_at,
                   COUNT(DISTINCT cs.control_id) as audited_controls,
                   COALESCE(AVG(cs.score), 0) as avg_score
            FROM users u
            LEFT JOIN compliance_scores cs ON u.id = cs.user_id
            GROUP BY u.id ORDER BY u.created_at DESC
        """)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        cur.close()
        conn.close()

@app.post("/api/admin/users/{user_id}/toggle")
async def admin_toggle_user(user_id: int, current_user: dict = Depends(require_admin)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET is_active = NOT is_active WHERE id = %s RETURNING is_active", (user_id,))
        result = cur.fetchone()
        conn.commit()
        return {"message": "User status updated", "is_active": result["is_active"]}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/api/admin/users/{user_id}/role")
async def admin_change_role(user_id: int, data: dict = Body(...), current_user: dict = Depends(require_admin)):
    role = data.get("role")
    if role not in ["Admin", "User", "Auditor"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET role = %s WHERE id = %s", (role, user_id))
        conn.commit()
        return {"message": "Role updated", "role": role}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, current_user: dict = Depends(require_admin)):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()
        return {"message": "User deleted"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.get("/api/admin/stats")
async def admin_get_stats(current_user: dict = Depends(require_admin)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) as total FROM users WHERE is_active = true")
        total_users = cur.fetchone()["total"]
        cur.execute("SELECT COUNT(*) as total FROM audit_sessions WHERE status NOT IN ('cancelled')")
        total_sessions = cur.fetchone()["total"]
        cur.execute("SELECT COALESCE(AVG(score), 0) as avg FROM compliance_scores")
        avg_score = round(float(cur.fetchone()["avg"]), 1)
        cur.execute("SELECT COUNT(*) as total FROM gaps_recommendations")
        total_gaps = cur.fetchone()["total"]
        return {
            "total_users": total_users,
            "total_sessions": total_sessions,
            "avg_compliance_score": avg_score,
            "total_gaps": total_gaps,
        }
    finally:
        cur.close()
        conn.close()

# --- 17. OTP & Email ---
otp_store = {}
 
def send_email(to_email: str, subject: str, body: str):
    import requests
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not api_key:
        raise Exception("Email service not configured")
    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        json={
            "from": "ECC Auditor <noreply@xn--mgb2dctb.online>",
            "to": [to_email],
            "subject": subject,
            "html": body
        }
    )
    if response.status_code != 200:
        raise Exception(f"Email failed: {response.text}")
    print(f"[📧] Email sent to {to_email}")
 
@app.post("/api/auth/send-otp")
async def send_otp(data: dict = Body(...)):
    email = data.get("email", "").strip().lower()
    purpose = data.get("purpose", "verify")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if purpose == "reset":
            cur.execute("SELECT id FROM users WHERE email = %s AND is_active = true", (email,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="No account found with this email")
        otp = str(random.randint(100000, 999999))
        otp_store[email] = {"otp": otp, "expires": datetime.now() + timedelta(minutes=10), "purpose": purpose}
        subject = "ECC Auditor — Your Verification Code"
        body = f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px">
            <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:32px">🛡️</div>
                <h2 style="color:#06b6d4;margin:8px 0">ECC Auditor</h2>
            </div>
            <p style="color:#94a3b8;margin-bottom:20px">Your verification code is:</p>
            <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px">
                <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#06b6d4">{otp}</span>
            </div>
            <p style="color:#64748b;font-size:13px">This code expires in 10 minutes. Do not share it with anyone.</p>
        </div>
        """
        send_email(email, subject, body)
        return {"message": "OTP sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[❌] OTP Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
 
@app.post("/api/auth/verify-otp")
async def verify_otp(data: dict = Body(...)):
    email = data.get("email", "").strip().lower()
    otp = str(data.get("otp", "")).strip()
    if not email or not otp:
        raise HTTPException(status_code=400, detail="Email and OTP are required")
    stored = otp_store.get(email)
    if not stored:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new one")
    if datetime.now() > stored["expires"]:
        del otp_store[email]
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one")
    if stored["otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    del otp_store[email]
    return {"message": "OTP verified", "verified": True}

@app.post("/api/auth/reset-password")
async def reset_password(data: dict = Body(...)):
    email = data.get("email", "").strip().lower()
    new_password = data.get("new_password", "")
    if not email or not new_password:
        raise HTTPException(status_code=400, detail="Email and new password are required")
    pwd_valid, pwd_msg = validate_password(new_password)
    if not pwd_valid:
        raise HTTPException(status_code=400, detail=pwd_msg)
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET password_hash = %s WHERE email = %s AND is_active = true", (hash_password(new_password), email))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        conn.commit()
        return {"message": "Password reset successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/api/auth/check-availability")
async def check_availability(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id, is_verified FROM users WHERE username = %s OR email = %s",
            (data.get("username"), data.get("email"))
        )
        existing = cur.fetchone()
        if existing and existing['is_verified']:
            raise HTTPException(status_code=400, detail="Username or email already exists")
        return {"available": True}
    finally:
        cur.close()
        conn.close()

@app.post("/api/auth/verify-email")
async def verify_email(data: dict = Body(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET is_verified = true WHERE email = %s", (data.get("email"),))
        conn.commit()
        return {"message": "Email verified"}
    finally:
        cur.close()
        conn.close()
@app.post("/api/profile/change-email")
async def change_email(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    new_email = data.get("new_email", "").strip().lower()
    current_password = data.get("current_password", "")
    if not new_email or not current_password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # تحقق من كلمة المرور
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (current_user["id"],))
        user = cur.fetchone()
        if not verify_password(current_password, user["password_hash"]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        # تحقق إن الإيميل مو مستخدم
        cur.execute("SELECT id FROM users WHERE email = %s AND id != %s", (new_email, current_user["id"]))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Email already in use")
        # حفظ الإيميل الجديد مؤقتاً في otp_store
        otp = str(random.randint(100000, 999999))
        otp_store[new_email] = {
            "otp": otp,
            "expires": datetime.now() + timedelta(minutes=10),
            "purpose": "change_email",
            "user_id": current_user["id"]
        }
        subject = "ECC Auditor — Verify Your New Email"
        body = f"""
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:32px;border-radius:12px">
            <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:32px">🛡️</div>
                <h2 style="color:#06b6d4;margin:8px 0">ECC Auditor</h2>
            </div>
            <p style="color:#94a3b8;margin-bottom:20px">Verify your new email address:</p>
            <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px">
                <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#06b6d4">{otp}</span>
            </div>
            <p style="color:#64748b;font-size:13px">This code expires in 10 minutes. Do not share it with anyone.</p>
        </div>
        """
        send_email(new_email, subject, body)
        return {"message": "OTP sent to new email"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/api/profile/confirm-email-change")
async def confirm_email_change(data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    new_email = data.get("new_email", "").strip().lower()
    otp = str(data.get("otp", "")).strip()
    stored = otp_store.get(new_email)
    if not stored or stored.get("purpose") != "change_email":
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new one")
    if datetime.now() > stored["expires"]:
        del otp_store[new_email]
        raise HTTPException(status_code=400, detail="OTP expired")
    if stored["otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    if stored["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    del otp_store[new_email]
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE users SET email = %s WHERE id = %s", (new_email, current_user["id"]))
        conn.commit()
        return {"message": "Email updated successfully", "new_email": new_email}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

# --- Health ---
@app.get("/")
async def root():
    return {
        "app": "CyberGuard GRC Platform",
        "version": "3.2 Production",
        "status": "online",
        "ai_engine": "online" if rag_engine is not None else "lazy",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
