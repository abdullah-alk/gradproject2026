import json
import os
from typing import List, Dict, Optional
from dotenv import load_dotenv
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_groq import ChatGroq
from app.config import settings

# استيراد البرومبتات المحسنة
from app.ai.prompts import (
    AUDIT_QUESTION_GENERATION_PROMPT,
    GUIDE_QUESTION_GENERATION_PROMPT,
    IMPLEMENTATION_GUIDANCE_PROMPT,
    GAP_ANALYSIS_PROMPT,
    RECOMMENDATIONS_PROMPT
)

class RAGEngine:
    def __init__(self):
        load_dotenv(override=True)

        # 1. Initialize Embeddings
        self.embeddings = HuggingFaceEmbeddings(
            model_name=settings.EMBEDDING_MODEL,
            model_kwargs={'device': 'cpu'},
            encode_kwargs={'normalize_embeddings': True}
        )
        
        # 2. Setup AI Model
        api_key = os.getenv("GROQ_API_KEY")
        if api_key and api_key.startswith("gsk_"):
            self.llm = ChatGroq(
                model_name="llama-3.3-70b-versatile",
                temperature=0,
                groq_api_key=api_key
            )
            print(f"✅ AI Engine: High-Precision Groq Connected")
        else:
            print("❌ AI Engine Error: Valid Groq API Key missing")
            self.llm = None
        
        # 3. Setup Text Splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1200,
            chunk_overlap=250
        )

        self.vectorstore = None
        self._load_vectorstore()

    def _load_vectorstore(self):
        """Load existing ChromaDB vectorstore OR build it if it's missing"""
        if os.path.exists(settings.CHROMA_PERSIST_DIRECTORY):
            self.vectorstore = Chroma(
                persist_directory=settings.CHROMA_PERSIST_DIRECTORY,
                embedding_function=self.embeddings
            )
            print(f"✅ ChromaDB loaded from: {settings.CHROMA_PERSIST_DIRECTORY}")
        else:
            print(f"⚠️ ChromaDB not found at: {settings.CHROMA_PERSIST_DIRECTORY}")
            print("⏳ Building Vectorstore automatically now...")
            self.load_ecc_data("data/ecc_controls.json")

    def process_request(self, control_id: str, query: str = "", mode: str = "guidance") -> str:
        if not self.llm:
            return "AI Service is not configured properly. Please check GROQ_API_KEY."
        
        context = self.retrieve_context(control_id)
        if not context:
            return f"No documentation found for Control ID: {control_id}. Please ensure ECC documents are indexed in ChromaDB."

        try:
            if mode == "audit":
                final_prompt = AUDIT_QUESTION_GENERATION_PROMPT.format(context=context)
            elif mode == "guide":
                final_prompt = GUIDE_QUESTION_GENERATION_PROMPT.format(context=context)
            elif mode == "recommendations":
                final_prompt = RECOMMENDATIONS_PROMPT.format(context=context, user_answers=query)
            elif mode == "gap":
                final_prompt = GAP_ANALYSIS_PROMPT.format(context=context, audit_results=query or "Initial assessment required.")
            else:
                if query:
                    final_prompt = f"{IMPLEMENTATION_GUIDANCE_PROMPT.format(context=context)}\n\n**User Question:** {query}"
                else:
                    final_prompt = IMPLEMENTATION_GUIDANCE_PROMPT.format(context=context)

            response = self.llm.invoke(final_prompt)
            result = response.content
            return result

        except Exception as e:
            print(f"[❌] RAG Error (mode={mode}, control={control_id}): {e}")
            return f"AI Service Error: Unable to process request. {str(e)}"


    def retrieve_context(self, control_id: str, k: int = 3) -> str:
        if not self.vectorstore:
            return ""
    
        try:
            target_id = str(control_id).strip()
    
            # 🧠 1. فلترة صارمة 100% من metadata (بدون siblings)
            results = self.vectorstore.get(
                where={"control_id": target_id}
            )
    
            chunks = results.get("documents", []) if results else []
    
            # 🧠 2. fallback آمن جدًا (بدون عائلة الضابط)
            if not chunks:
                results = self.vectorstore.similarity_search(
                    query=f"CONTROL_ID: {target_id}",
                    k=5
                )
    
                chunks = [
                    doc.page_content
                    for doc in results
                    if f"CONTROL_ID: {target_id}" in doc.page_content
                ]
    
            # 🚨 منع الهلوسة تمامًا
            if not chunks:
                print(f"[⚠️] NO CONTEXT for {target_id}")
                return ""
    
            # 🧹 إزالة التكرار
            unique = list(dict.fromkeys(chunks))
    
            return "\n\n---\n\n".join(unique[:k])
    
        except Exception as e:
            print(f"[❌] Retrieval error: {e}")
            return ""
        
    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     if not self.vectorstore:
    #         return ""
        
    #     try:
    #         target_id = str(control_id).strip()
    #         final_chunks = []
    
    #         # ✅ الطريقة الصحيحة: استخدام similarity_search مع فلتر metadata
    #         results = self.vectorstore.similarity_search(
    #             query=f"Control {target_id}",
    #             k=k,
    #             filter={"control_id": target_id}
    #         )
    
    #         # استخراج النصوص
    #         for doc in results:
    #             content = doc.page_content.strip()
                
    #             # ✅ تحقق إضافي (حماية من أي خلل)
    #             if f"CONTROL_ID: {target_id}" in content:
    #                 final_chunks.append(content)
    
    #         # ❌ إذا ما فيه نتائج → لا تجيب أي شيء (منع الهلوسة)
    #         if not final_chunks:
    #             print(f"[⚠️] No strict match found for: {target_id}")
    #             return ""
    
    #         # إزالة التكرار
    #         unique_chunks = list(dict.fromkeys(final_chunks))
    
    #         return "\n\n---\n\n".join(unique_chunks[:k])
    
    #     except Exception as e:
    #         print(f"[❌] Retrieval error for {control_id}: {e}")
    #         return ""
    
    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     if not self.vectorstore:
    #         return ""
        
    #     try:
    #         target_id = str(control_id).strip()
    #         all_results = []
    
    #         # 1. القنص المباشر بالميتاداتا (الأولوية القصوى)
    #         direct_results = self.vectorstore.get(where={"control_id": target_id})
    #         if direct_results and direct_results['documents']:
    #             all_results.extend(direct_results['documents'])
    
    #         # 2. البحث النصي (في حال عدم وجود ميتاداتا)
    #         if not all_results:
    #             fallback_results = self.vectorstore.similarity_search(target_id, k=15)
    #             all_results.extend([doc.page_content for doc in fallback_results])
    
    #         # 3. الفلترة الصارمة (هنا يكمن الحل لمنع التداخل)
    #         # سنبقي فقط النصوص التي تحتوي فعلياً على المعرف المطلوب في بدايتها
    #         final_chunks = []
    #         for content in all_results:
    #             clean_content = content.strip()
    #             # التأكد أن القطعة النصية تخص الضابط المطلوب حصراً
    #             # نبحث عن المعرف متبوعاً بنقطة أو مسافة أو بداية سطر
    #             if clean_content.startswith(target_id) or f"CONTROL_ID: {target_id}" in clean_content:
    #                 final_chunks.append(clean_content)
    
    #         if not final_chunks:
    #             # إذا فشلت الفلترة الصارمة، لا ترجع نتائج خاطئة (تجنباً للخلط)
    #             print(f"[⚠️] Blocked mismatched context for: {target_id}")
    #             return ""
    
    #         # إزالة التكرار
    #         unique_chunks = list(dict.fromkeys(final_chunks))
    #         return "\n\n---\n\n".join(unique_chunks[:k])
    
    #     except Exception as e:
    #         print(f"[❌] Retrieval error for {control_id}: {e}")
    #         return ""

    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     """
    #     استرجاع السياق بدقة عالية للضوابط الثلاثية والرباعية.
    #     """
    #     if not self.vectorstore:
    #         return ""
        
    #     try:
    #         # 1. تنظيف المعرف (مثل 1-9-3-1)
    #         target_id = str(control_id).strip()
    #         relevant_chunks = []
    
    #         # 2. محاولة القنص المباشر عبر الميتاداتا (الأسرع والأدق)
    #         # نبحث عن تطابق تام لـ control_id في خصائص الوثيقة
    #         direct_results = self.vectorstore.get(where={"control_id": target_id})
    #         if direct_results and direct_results['documents']:
    #             relevant_chunks.extend(direct_results['documents'])
    
    #         # 3. خطة البحث المرن (في حال فشل الميتاداتا أو وجود زوائد نصية)
    #         if not relevant_chunks:
    #             # نرفع k لضمان فحص أكبر عدد ممكن من الاحتمالات
    #             fallback_results = self.vectorstore.similarity_search(target_id, k=20)
                
    #             for doc in fallback_results:
    #                 content = doc.page_content.strip()
                    
    #                 # [السر هنا]: البحث عن وجود المعرف في أول 50 حرفاً من النص
    #                 # هذا الشرط يمسك 1-1-1 ويمسك أيضاً 1-9-3-1 حتى لو قبلها كلمات مثل "Control ID:"
    #                 if target_id in content[:50]:
    #                     relevant_chunks.append(content)
    
    #         # 4. إذا لم يجد شيئاً، يقوم بمحاولة أخيرة للبحث النصي العادي
    #         if not relevant_chunks:
    #             print(f"[⚠️] No precise context found for: {target_id}, trying last resort search...")
    #             last_resort = self.vectorstore.similarity_search(f"Control {target_id}", k=2)
    #             relevant_chunks.extend([d.page_content for d in last_resort])
    
    #         if not relevant_chunks:
    #             return ""
    
    #         # إزالة التكرار وضمان استرجاع العدد المطلوب فقط
    #         unique_chunks = list(dict.fromkeys(relevant_chunks))
    #         return "\n\n---\n\n".join(unique_chunks[:k])
    
    #     except Exception as e:
    #         print(f"[❌] Retrieval error for {control_id}: {e}")
    #         return ""
    
    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     if not self.vectorstore:
    #         return ""
    #     try:
    #         target_id = str(control_id).strip()
    #         relevant_chunks = []
    
    #         # [السر 1] - القنص المباشر بالميتاداتا (من كود 3)
    #         direct_results = self.vectorstore.get(where={"control_id": target_id})
    #         if direct_results and direct_results['documents']:
    #             relevant_chunks.extend(direct_results['documents'])
    
    #         # [السر 2] - إذا لم نجد، نبحث بالرقم في بداية النص (من كود 4)
    #         if not relevant_chunks:
    #             # نبحث بـ k عالية جداً لضمان عدم ضياع الضوابط الرباعية
    #             fallback_results = self.vectorstore.similarity_search(target_id, k=30)
    #             for doc in fallback_results:
    #                 content = doc.page_content.strip()
    #                 # التحقق الصارم: هل يبدأ النص فعلياً برقم الضابط؟
    #                 if content.startswith(target_id) or content.startswith(f"CONTROL_ID: {target_id}"):
    #                     relevant_chunks.append(content)
    
    #         if not relevant_chunks:
    #             print(f"[⚠️] No precise context found for: {target_id}")
    #             return ""
    
    #         # إزالة التكرار
    #         unique_chunks = list(dict.fromkeys(relevant_chunks))
    #         return "\n\n---\n\n".join(unique_chunks[:k])
    
    #     except Exception as e:
    #         print(f"[❌] Retrieval error for {control_id}: {e}")
    #         return ""
    
    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     if not self.vectorstore:
    #         return ""
    #     try:
    #         print(f"[🔍] Frontend is asking for Control ID: '{control_id}'")
    #         print(f"[📊] Total documents currently inside ChromaDB: {self.vectorstore._collection.count()}")

    #         results = self.vectorstore.similarity_search(
    #             f"Technical requirements, implementation guidelines, and deliverables for ECC control {control_id}",
    #             k=k,
    #             filter={"control_id": control_id}
    #         )
    #         if not results:
    #             print(f"[⚠️] No context found for control {control_id}")
    #             return ""
    #         return "\n\n---\n\n".join([doc.page_content for doc in results])
    #     except Exception as e:
    #         print(f"[❌] Context retrieval error for {control_id}: {e}")
    #         return ""

    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     if not self.vectorstore:
    #         return ""
    #     try:
    #         print(f"[🔍] Frontend is asking for Control ID: '{control_id}'")
            
    #         # الحل: ابحث بالمعنى (Similarity) دون قيد الفلتر الصارم في البداية
    #         results = self.vectorstore.similarity_search(
    #             f"Control {control_id} details requirements guidelines",
    #             k=k
    #             # حذفنا السطر: filter={"control_id": control_id}
    #         )
            
    #         if not results:
    #             print(f"[⚠️] No context found for control {control_id}")
    #             return ""
    #         return "\n\n---\n\n".join([doc.page_content for doc in results])
    #     except Exception as e:
    #         print(f"[❌] Context retrieval error for {control_id}: {e}")
    #         return ""
    
    # def retrieve_context(self, control_id: str, k: int = 1) -> str:
    #     if not self.vectorstore:
    #         return ""
    #     try:
    #         print(f"[🔍] Targeted Search for Control ID: '{control_id}'")
            
    #         # 1. البحث الصارم باستخدام الفلتر (لضمان خصوصية الضابط)
    #         results = self.vectorstore.similarity_search(
    #             f"Requirements for {control_id}",
    #             k=k,
    #             filter={"control_id": control_id}  # الفلتر يعود لضمان عدم تكرار الأسئلة
    #         )
            
    #         # 2. خطة بديلة: إذا فشل الفلتر الصارم، جرب البحث بالهوية ككلمة مفتاحية
    #         if not results:
    #             print(f"[⚠️] Strict filter failed, trying keyword fallback for {control_id}...")
    #             results = self.vectorstore.similarity_search(control_id, k=1)
    
    #         if not results:
    #             print(f"[⚠️] No context found for control {control_id}")
    #             return ""
    
    #         # طباعة أول 50 حرف للتأكد في اللوق أن السياق مختلف
    #         print(f"[✅] Context retrieved (Snippet): {results[0].page_content[:50]}...")
            
    #         return "\n\n".join([doc.page_content for doc in results])
            
    #     except Exception as e:
    #         print(f"[❌] Context retrieval error for {control_id}: {e}")
    #         return ""
    
    def load_ecc_data(self, json_path: str):
        if not os.path.exists(json_path):
            print(f"[❌] FATAL ERROR: ECC data file not found at: {json_path}")
            return
            
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                controls_data = json.load(f)
    
            documents = []
            for cid, content in controls_data.items():
                # 1. معالجة القوائم لتصبح نصوصاً واضحة
                def list_to_text(data):
                    if isinstance(data, list) and data:
                        return "\n".join([f"• {item}" for item in data])
                    return str(data) if data else "N/A"
    
                tools_text = list_to_text(content.get('cybersecurity_tools', []))
                guidelines = list_to_text(content.get('implementation_guidelines', []))
                deliverables = list_to_text(content.get('expected_deliverables', []))
    
                # 2. بناء النص الكامل (هذا ما سيراه الـ AI)
                full_content = (
                    f"CONTROL_ID: {cid}\n"
                    f"TITLE: {content.get('title', '')}\n"
                    f"OBJECTIVE: {content.get('objective', '')}\n\n"
                    f"IMPLEMENTATION GUIDELINES:\n{guidelines}\n\n"
                    f"EXPECTED DELIVERABLES:\n{deliverables}\n\n"
                    f"ADDITIONAL TEXT: {content.get('full_text', '')}"
                )
    
                # 3. إنشاء مستند واحد لكل ضابط (بدون SPLITTING)
                # doc = Document(
                #     page_content=full_content,
                #     metadata={
                #         "control_id": str(cid), 
                #         "domain": str(content.get('domain', '')), 
                #         "title": str(content.get('title', ''))
                #     }
                # )

                doc = Document(
                    page_content=full_content,
                    metadata={
                        "control_id": str(cid).strip(),
                        "root_id": str(cid).split("-")[0],   # 👈 مهم جدًا
                        "full_path": str(cid).strip()
                    }
                )    
                documents.append(doc)
    
            # 4. طباعة العدد الفعلي للتأكد
            print(f"[⚙️] Indexing {len(documents)} distinct controls into ChromaDB...")
            
            self.vectorstore = Chroma.from_documents(
                documents=documents,
                embedding=self.embeddings,
                persist_directory=settings.CHROMA_PERSIST_DIRECTORY
            )
            # إزالة persist() لأن النسخ الحديثة من كروما تحفظ تلقائياً
            print("✅ Vectorstore successfully built and persisted!")
                
        except Exception as e:
            print(f"[❌] Indexing error: {e}")
            
    # def load_ecc_data(self, json_path: str):
    #     if not os.path.exists(json_path):
    #         print(f"[❌] FATAL ERROR: ECC data file not found at: {json_path}")
    #         return
        
    #     try:
    #         with open(json_path, 'r', encoding='utf-8') as f:
    #             controls_data = json.load(f)

    #         documents = []
    #         for cid, content in controls_data.items():
    #             # --- 1. معالجة الأدوات (Cybersecurity Tools) ---
    #             tools = content.get('cybersecurity_tools', [])
    #             if isinstance(tools, list) and tools:
    #                 tools_text = "\n".join([f"• {t}" for t in tools])
    #             else:
    #                 tools_text = "No specific tools mentioned."

    #             # --- 2. معالجة المخرجات والإرشادات ---
    #             def list_to_text(data):
    #                 if isinstance(data, list):
    #                     return "\n".join([f"• {item}" for item in data])
    #                 return data

    #             guidelines = list_to_text(content.get('implementation_guidelines', ''))
    #             deliverables = list_to_text(content.get('expected_deliverables', ''))

    #             # --- 3. بناء النص الكامل ---
    #             full_content = (
    #                 f"CONTROL_ID: {cid}\n"
    #                 f"TITLE: {content.get('title', '')}\n"
    #                 f"DOMAIN: {content.get('domain', '')}\n"
    #                 f"OBJECTIVE: {content.get('objective', '')}\n\n"
    #                 f"CYBERSECURITY TOOLS:\n{tools_text}\n\n"
    #                 f"FULL REQUIREMENTS:\n{content.get('full_text', '')}\n\n"
    #                 f"IMPLEMENTATION GUIDELINES:\n{guidelines}\n\n"
    #                 f"EXPECTED DELIVERABLES:\n{deliverables}"
    #             )

    #             chunks = self.text_splitter.split_text(full_content)
    #             for chunk in chunks:
    #                 doc = Document(
    #                     page_content=chunk,
    #                     metadata={
    #                         "control_id": cid, 
    #                         "domain": content.get('domain', ''), 
    #                         "title": content.get('title', '')
    #                     }
    #                 )
    #                 documents.append(doc)

    #         print(f"[⚙️] Indexing {len(documents)} chunks into ChromaDB...")
    #         self.vectorstore = Chroma.from_documents(
    #             documents=documents,
    #             embedding=self.embeddings,
    #             persist_directory=settings.CHROMA_PERSIST_DIRECTORY
    #         )
    #         print("✅ Vectorstore successfully built and persisted!")
            
    #     except Exception as e:
    #         print(f"[❌] Indexing error: {e}")

    # def load_ecc_data(self, json_path: str):
    #     if not os.path.exists(json_path):
    #         print(f"[❌] FATAL ERROR: ECC data file not found at: {json_path}")
    #         return
        
    #     try:
    #         with open(json_path, 'r', encoding='utf-8') as f:
    #             controls_data = json.load(f)
    
    #         documents = []
    #         for cid, content in controls_data.items():
    #             # --- 1. معالجة الأدوات (Cybersecurity Tools) ---
    #             tools = content.get('cybersecurity_tools', [])
    #             if isinstance(tools, list) and tools:
    #                 tools_text = "\n".join([f"• {t}" for t in tools])
    #             else:
    #                 tools_text = "No specific tools mentioned."
    
    #             # --- 2. معالجة المخرجات والإرشادات ---
    #             def list_to_text(data):
    #                 if isinstance(data, list):
    #                     return "\n".join([f"• {item}" for item in data])
    #                 return data
    
    #             guidelines = list_to_text(content.get('implementation_guidelines', ''))
    #             deliverables = list_to_text(content.get('expected_deliverables', ''))
    
    #             # --- 3. بناء النص الكامل (النسخة المحسنة لتعزيز دقة البحث) ---
    #             full_content = (
    #                 f"### START OF CONTROL {cid} ###\n"
    #                 f"CONTROL_ID: {cid}\n"
    #                 f"REFERENCE: ECC-{cid}\n"
    #                 f"TITLE: {content.get('title', '')}\n"
    #                 f"DOMAIN: {content.get('domain', '')}\n"
    #                 f"OBJECTIVE: {content.get('objective', '')}\n\n"
    #                 f"CYBERSECURITY TOOLS FOR {cid}:\n{tools_text}\n\n"
    #                 f"FULL REQUIREMENTS FOR {cid}:\n{content.get('full_text', '')}\n\n"
    #                 f"IMPLEMENTATION GUIDELINES FOR {cid}:\n{guidelines}\n\n"
    #                 f"EXPECTED DELIVERABLES FOR {cid}:\n{deliverables}\n"
    #                 f"### END OF CONTROL {cid} ###"
    #             )
    
    #             chunks = self.text_splitter.split_text(full_content)
    #             for chunk in chunks:
    #                 doc = Document(
    #                     page_content=chunk,
    #                     metadata={
    #                         "control_id": str(cid).strip(), # تنظيف المعرف من أي مسافات زائدة
    #                         "domain": content.get('domain', ''), 
    #                         "title": content.get('title', '')
    #                     }
    #                 )
    #                 documents.append(doc)
    
    #         print(f"[⚙️] Indexing {len(documents)} chunks into ChromaDB...")
    #         # تنظيف الـ Vectorstore القديم قبل الإضافة لضمان عدم التكرار
    #         self.vectorstore = Chroma.from_documents(
    #             documents=documents,
    #             embedding=self.embeddings,
    #             persist_directory=settings.CHROMA_PERSIST_DIRECTORY
    #         )
    #         print("✅ Vectorstore successfully built and persisted!")
            
    #     except Exception as e:
    #         print(f"[❌] Indexing error: {e}")
