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

    def retrieve_context(self, control_id: str, k: int = 5) -> str:
        if not self.vectorstore:
            return ""
        try:
            print(f"[🔍] Frontend is asking for Control ID: '{control_id}'")
            print(f"[📊] Total documents currently inside ChromaDB: {self.vectorstore._collection.count()}")

            results = self.vectorstore.similarity_search(
                f"Technical requirements, implementation guidelines, and deliverables for ECC control {control_id}",
                k=k,
                filter={"control_id": control_id}
            )
            if not results:
                print(f"[⚠️] No context found for control {control_id}")
                return ""
            return "\n\n---\n\n".join([doc.page_content for doc in results])
        except Exception as e:
            print(f"[❌] Context retrieval error for {control_id}: {e}")
            return ""

    # UPDATED CODE 1
    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     if not self.vectorstore:
    #         return ""
    #     try:
    #         # البحث النصي المباشر هو الأكثر دقة في حالات الضوابط الفرعية
    #         query_text = f"Control ID {control_id} details, requirements, guidelines, and deliverables"
            
    #         # جرب البحث مع الفلتر أولاً
    #         results = self.vectorstore.similarity_search(
    #             query_text,
    #             k=k,
    #             filter={"control_id": control_id}
    #         )
        
    #     # إذا لم يجد نتائج (وهذا ما يحدث معك)، ابحث بدون فلتر لضمان الاسترجاع
    #         if not results:
    #             print(f"[🔍] Filter failed for {control_id}, trying broad search...")
    #             results = self.vectorstore.similarity_search(query_text, k=k)

    #         if not results:
    #             return ""
            
    #         return "\n\n---\n\n".join([doc.page_content for doc in results])
    #     except Exception as e:
    #         print(f"[❌] Context retrieval error: {e}")
    #         return ""

    # Updated Code 2
    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     if not self.vectorstore:
    #         return ""
    #     try:
    #         # 1. البحث النصي الموسع
    #         query_text = f"Control {control_id} details and requirements"
    #         results = self.vectorstore.similarity_search(query_text, k=15)
            
    #         relevant_chunks = []
    #         target_id = str(control_id).strip() # تنظيف الرقم المطلوب
    
    #         for doc in results:
    #             # جلب المعرف من الميتا داتا وتنظيفه
    #             meta_id = str(doc.metadata.get("control_id", "")).strip()
    #             content = doc.page_content
                
    #             # 2. فحص مرن: هل الرقم موجود في الميتا داتا أو في أول النص؟
    #             if target_id == meta_id or content.startswith(f"CONTROL_ID: {target_id}"):
    #                 relevant_chunks.append(content)
    #             # خيار احتياطي: إذا وجد الرقم في بداية النص بأي شكل
    #             elif target_id in content[:50]: 
    #                 relevant_chunks.append(content)
    
    #         if not relevant_chunks:
    #             # إذا فشلت الفلترة، سنأخذ أول نتيجة كملجأ أخير بشرط احتوائها على الرقم
    #             for doc in results:
    #                 if target_id in doc.page_content:
    #                     relevant_chunks.append(doc.page_content)
    #                     break
    
    #         if not relevant_chunks:
    #             print(f"[⚠️] No precise context for {target_id}")
    #             return ""
                
    #         return "\n\n---\n\n".join(relevant_chunks[:k])
            
    #     except Exception as e:
    #         print(f"[❌] Retrieval error: {e}")
    #         return ""

    # UPDATED CODE 3
    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     if not self.vectorstore:
    #         return ""
    #     try:
    #         target_id = str(control_id).strip()
    #         relevant_chunks = []
    
    #         # 1. محاولة جلب الضابط مباشرة عن طريق الميتاداتا (الأسرع والأدق)
    #         # هذا يتخطى البحث بالتشابه ويذهب للهدف مباشرة
    #         direct_results = self.vectorstore.get(where={"control_id": target_id})
    #         if direct_results and direct_results['documents']:
    #             relevant_chunks.extend(direct_results['documents'])
    
    #         # 2. إذا لم نجد نتائج كافية، نستخدم البحث النصي الموسع
    #         if len(relevant_chunks) < 1:
    #             query_text = f"Control {target_id} cybersecurity requirements"
    #             # زدنا الـ k هنا لضمان مسح أكبر قدر من النتائج
    #             results = self.vectorstore.similarity_search(query_text, k=25)
    
    #             for doc in results:
    #                 meta_id = str(doc.metadata.get("control_id", "")).strip()
    #                 content = doc.page_content
                    
    #                 # فحص دقيق للمطابقة
    #                 if target_id == meta_id or content.strip().startswith(target_id):
    #                     if content not in relevant_chunks:
    #                         relevant_chunks.append(content)
    #                 # فحص مرن للضوابط المتشعبة
    #                 elif f" {target_id} " in f" {content[:50]} ":
    #                     if content not in relevant_chunks:
    #                         relevant_chunks.append(content)
    
    #         # 3. ملجأ أخير: البحث عن الرقم في النصوص المخزنة (Fallback)
    #         if not relevant_chunks:
    #             # نبحث في الـ vectorstore عن أي وثيقة تحتوي حرفياً على الرقم في بدايتها
    #             all_docs = self.vectorstore.get()
    #             for i, doc_text in enumerate(all_docs['documents']):
    #                 if doc_text.strip().startswith(target_id):
    #                     relevant_chunks.append(doc_text)
    #                     if len(relevant_chunks) >= k: break
    
    #         if not relevant_chunks:
    #             print(f"[⚠️] No precise context found for: {target_id}")
    #             return ""
    
    #         # إزالة التكرار وضمان عدم تجاوز العدد المطلوب
    #         unique_chunks = list(dict.fromkeys(relevant_chunks))
    #         return "\n\n---\n\n".join(unique_chunks[:k])
    
    #     except Exception as e:
    #         print(f"[❌] Retrieval error for {control_id}: {e}")
    #         return ""

    # UPDATED CODE 4
    # def retrieve_context(self, control_id: str, k: int = 5) -> str:
    #     if not self.vectorstore:
    #         return ""
    #     try:
    #         # 1. تنظيف المعرف لضمان مطابقة دقيقة للميتاداتا
    #         target_id = str(control_id).strip()
    
    #         # 2. البحث باستخدام "الفلترة الصارمة" (Exact Metadata Filtering)
    #         # هذا هو الخيار الأسرع والأدق لهيكلية بياناتك
    #         results = self.vectorstore.get(
    #             where={"control_id": target_id}
    #         )
    
    #         relevant_chunks = []
    #         if results and results['documents']:
    #             relevant_chunks.extend(results['documents'])
    
    #         # 3. خطة احتياطية في حال وجود خلل في ميتاداتا قاعدة البيانات
    #         if not relevant_chunks:
    #             # البحث عن المعرف في أول النص (لأن حقل full_text يبدأ دائماً بالرقم)
    #             # نرفع الـ k لضمان مسح أكبر قدر من القطع النصية
    #             fallback_results = self.vectorstore.similarity_search(target_id, k=15)
    #             for doc in fallback_results:
    #                 content = doc.page_content.strip()
    #                 # التحقق أن النص يبدأ فعلياً بالرقم المطلوب
    #                 if content.startswith(target_id):
    #                     relevant_chunks.append(content)
    
    #         if not relevant_chunks:
    #             return ""
    
    #         # إزالة التكرار وضمان استرجاع العدد المطلوب فقط
    #         unique_chunks = list(dict.fromkeys(relevant_chunks))
    #         return "\n\n---\n\n".join(unique_chunks[:k])
    
    #     except Exception as e:
    #         print(f"[❌] Retrieval error for {control_id}: {e}")
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
                # --- 1. معالجة الأدوات (Cybersecurity Tools) ---
                tools = content.get('cybersecurity_tools', [])
                if isinstance(tools, list) and tools:
                    tools_text = "\n".join([f"• {t}" for t in tools])
                else:
                    tools_text = "No specific tools mentioned."

                # --- 2. معالجة المخرجات والإرشادات ---
                def list_to_text(data):
                    if isinstance(data, list):
                        return "\n".join([f"• {item}" for item in data])
                    return data

                guidelines = list_to_text(content.get('implementation_guidelines', ''))
                deliverables = list_to_text(content.get('expected_deliverables', ''))

                # --- 3. بناء النص الكامل ---
                full_content = (
                    f"CONTROL_ID: {cid}\n"
                    f"TITLE: {content.get('title', '')}\n"
                    f"DOMAIN: {content.get('domain', '')}\n"
                    f"OBJECTIVE: {content.get('objective', '')}\n\n"
                    f"CYBERSECURITY TOOLS:\n{tools_text}\n\n"
                    f"FULL REQUIREMENTS:\n{content.get('full_text', '')}\n\n"
                    f"IMPLEMENTATION GUIDELINES:\n{guidelines}\n\n"
                    f"EXPECTED DELIVERABLES:\n{deliverables}"
                )

                chunks = self.text_splitter.split_text(full_content)
                for chunk in chunks:
                    doc = Document(
                        page_content=chunk,
                        metadata={
                            "control_id": cid, 
                            "domain": content.get('domain', ''), 
                            "title": content.get('title', '')
                        }
                    )
                    documents.append(doc)

            print(f"[⚙️] Indexing {len(documents)} chunks into ChromaDB...")
            self.vectorstore = Chroma.from_documents(
                documents=documents,
                embedding=self.embeddings,
                persist_directory=settings.CHROMA_PERSIST_DIRECTORY
            )
            print("✅ Vectorstore successfully built and persisted!")
            
        except Exception as e:
            print(f"[❌] Indexing error: {e}")
