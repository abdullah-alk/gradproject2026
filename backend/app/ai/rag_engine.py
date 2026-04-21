import json
import os
from typing import List, Dict, Optional
from dotenv import load_dotenv

# More robust imports
try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    from langchain_community.embeddings import HuggingFaceEmbeddings

try:
    from langchain_community.vectorstores import Chroma
except ImportError:
    # Fallback if needed, though community is usually standard
    from langchain.vectorstores import Chroma

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
    except ImportError:
        # Final fallback - this might fail but we've tried our best
        from langchain_community.text_splitter import RecursiveCharacterTextSplitter

try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None

try:
    from langchain_core.documents import Document
except ImportError:
    from langchain.schema import Document

from ..config import settings
from .prompts import (
    AUDIT_QUESTION_GENERATION_PROMPT,
    GUIDE_QUESTION_GENERATION_PROMPT,
    RECOMMENDATIONS_PROMPT,
    IMPLEMENTATION_GUIDANCE_PROMPT,
    GAP_ANALYSIS_PROMPT
)

class RAGEngine:
    def __init__(self):
        load_dotenv(override=True)
        
        # Absolute paths
        self.persist_dir = os.path.abspath(settings.CHROMA_PERSIST_DIRECTORY)
        self.backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.data_json_path = os.path.join(self.backend_dir, "data", "ecc_controls.json")

        # 1. Initialize Embeddings
        try:
            self.embeddings = HuggingFaceEmbeddings(
                model_name=settings.EMBEDDING_MODEL,
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
        except Exception:
            try:
                self.embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
            except Exception:
                self.embeddings = None
        
        # 2. Setup AI Model
        api_key = os.getenv("GROQ_API_KEY")
        if ChatGroq and api_key and api_key.startswith("gsk_"):
            try:
                self.llm = ChatGroq(
                    model_name="llama-3.3-70b-versatile",
                    temperature=0,
                    groq_api_key=api_key
                )
            except Exception:
                self.llm = None
        else:
            self.llm = None
    
        # 3. Setup Text Splitter
        try:
            self.text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1200,
                chunk_overlap=250
            )
        except Exception:
            self.text_splitter = None

        self.vectorstore = None
        self._load_vectorstore()

    def _load_vectorstore(self):
        if not self.embeddings:
            return

        try:
            if os.path.exists(self.persist_dir) and os.listdir(self.persist_dir):
                self.vectorstore = Chroma(
                    persist_directory=self.persist_dir,
                    embedding_function=self.embeddings
                )
            else:
                if os.path.exists(self.data_json_path):
                    self.load_ecc_data(self.data_json_path)
        except Exception:
            if os.path.exists(self.data_json_path):
                self.load_ecc_data(self.data_json_path)

    def process_request(self, control_id: str, query: str = "", mode: str = "guidance") -> str:
        if not self.llm:
            return "AI Service is not configured properly. Please check GROQ_API_KEY."
        
        context = self.retrieve_context(control_id)
        if not context:
            return f"No documentation found for Control ID: {control_id}. Ensure ECC documents are indexed."

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
            return response.content
        except Exception as e:
            return f"AI Service Error: {str(e)}"

    def retrieve_context(self, control_id: str, k: int = 8) -> str:
        if not self.vectorstore:
            return ""
        try:
            search_query = f"Technical requirements and implementation for ECC control {control_id}"
            results = self.vectorstore.similarity_search(search_query, k=k)
            
            relevant_docs = []
            for doc in results:
                cid = str(doc.metadata.get("control_id", ""))
                if cid == control_id or cid.startswith(f"{control_id}-"):
                    relevant_docs.append(doc)
            
            if not relevant_docs and results:
                relevant_docs = results[:4]

            if not relevant_docs:
                return ""
                
            return "\n\n---\n\n".join([doc.page_content for doc in relevant_docs])
        except Exception:
            return ""

    def load_ecc_data(self, json_path: str):
        if not os.path.exists(json_path) or not self.embeddings or not self.text_splitter:
            return
            
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                controls_data = json.load(f)
            
            documents = []
            for ctrl_id, info in controls_data.items():
                content = f"Control ID: {ctrl_id}\nObjective: {info.get('objective')}\nGuidelines: {info.get('implementation_guidelines')}\nDeliverables: {info.get('expected_deliverables')}\nFull Text: {info.get('full_text')}"
                
                chunks = self.text_splitter.split_text(content)
                for chunk in chunks:
                    doc = Document(
                        page_content=chunk,
                        metadata={"control_id": ctrl_id, "source": "ecc_controls.json"}
                    )
                    documents.append(doc)
            
            if documents:
                self.vectorstore = Chroma.from_documents(
                    documents=documents,
                    embedding=self.embeddings,
                    persist_directory=self.persist_dir
                )
        except Exception:
            pass
