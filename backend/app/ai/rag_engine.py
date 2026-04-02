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
        api_key = os.getenv("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")
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
            # 🚨 IMPORTANT: Ensure this file path matches your actual JSON file location!
            # If your JSON is in a folder, it might need to be "app/data/ecc_controls.json"
            self.load_ecc_data("data/ecc_controls.json")

    def process_request(self, control_id: str, query: str = "", mode: str = "guidance") -> str:
        if not self.llm:
            return "AI Service is not configured properly. Please check GROQ_API_KEY."

        # Retrieve relevant context from vectorstore
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

            # Invoke AI model
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
            # --- ADD THESE TWO DEBUG LINES ---
            print(f"[🔍] Frontend is asking for Control ID: '{control_id}'")
            print(f"[📊] Total documents currently inside ChromaDB: {self.vectorstore._collection.count()}")
            # ---------------------------------

            results = self.vectorstore.similarity_search(
                f"Technical requirements, implementation guidelines, and deliverables for ECC control {control_id}",
                k=k,
                filter={"control_id": control_id}
            )
            if not results:
                print(f"[⚠️] No context found for control {control_id}") # It's probably failing here!
                return ""
            return "\n\n---\n\n".join([doc.page_content for doc in results])
        except Exception as e:
            print(f"[❌] Context retrieval error for {control_id}: {e}")
            return ""

    def load_ecc_data(self, json_path: str):
        if not os.path.exists(json_path):
            print(f"[❌] FATAL ERROR: ECC data file not found at: {json_path}")
            return
        
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                controls_data = json.load(f)

            documents = []
            for cid, content in controls_data.items():
                full_content = (
                    f"CONTROL_ID: {cid}\nTITLE: {content.get('title', '')}\nDOMAIN: {content.get('domain', '')}\n"
                    f"OBJECTIVE: {content.get('objective', '')}\nDESCRIPTION: {content.get('description', '')}\n\n"
                    f"FULL REQUIREMENTS:\n{content.get('full_text', '')}\n\n"
                    f"IMPLEMENTATION GUIDELINES:\n{content.get('implementation_guidelines', '')}\n\n"
                    f"EXPECTED DELIVERABLES:\n{content.get('expected_deliverables', '')}"
                )
                chunks = self.text_splitter.split_text(full_content)
                for chunk in chunks:
                    doc = Document(
                        page_content=chunk,
                        metadata={"control_id": cid, "domain": content.get('domain', ''), "title": content.get('title', '')}
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
