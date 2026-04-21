import json
import os
from typing import List, Dict, Optional
from dotenv import load_dotenv

# Robust imports for LangChain
try:
    from langchain_huggingface import HuggingFaceEmbeddings
except ImportError:
    try:
        from langchain_community.embeddings import HuggingFaceEmbeddings
    except ImportError:
        HuggingFaceEmbeddings = None

try:
    from langchain_community.vectorstores import Chroma
except ImportError:
    Chroma = None

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
    except ImportError:
        RecursiveCharacterTextSplitter = None

try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None

try:
    from langchain_core.documents import Document
except ImportError:
    try:
        from langchain.schema import Document
    except ImportError:
        Document = None

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
        
        # Absolute path setup - most reliable for Railway
        self.ai_dir = os.path.dirname(os.path.abspath(__file__))
        self.app_dir = os.path.dirname(self.ai_dir)
        self.backend_dir = os.path.dirname(self.app_dir)
        
        self.data_dir = os.path.join(self.backend_dir, "data")
        self.persist_dir = os.path.join(self.data_dir, "vector_store")
        self.data_json_path = os.path.join(self.data_dir, "ecc_controls.json")

        self.last_status = "Initializing"
        self.error_details = ""

        # 1. Initialize Embeddings
        if HuggingFaceEmbeddings:
            try:
                self.embeddings = HuggingFaceEmbeddings(
                    model_name=settings.EMBEDDING_MODEL,
                    model_kwargs={'device': 'cpu'},
                    encode_kwargs={'normalize_embeddings': True}
                )
            except Exception as e:
                self.error_details += f"Embeddings error: {str(e)}. "
                try:
                    self.embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
                except:
                    self.embeddings = None
        else:
            self.embeddings = None
            self.error_details += "HuggingFaceEmbeddings library not found. "
        
        # 2. Setup AI Model
        api_key = os.getenv("GROQ_API_KEY")
        if ChatGroq and api_key and api_key.startswith("gsk_"):
            try:
                self.llm = ChatGroq(
                    model_name="llama-3.3-70b-versatile",
                    temperature=0,
                    groq_api_key=api_key
                )
            except Exception as e:
                self.llm = None
                self.error_details += f"LLM error: {str(e)}. "
        else:
            self.llm = None
            self.error_details += "Groq library or API Key missing. "
    
        # 3. Setup Text Splitter
        if RecursiveCharacterTextSplitter:
            self.text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1200,
                chunk_overlap=250
            )
        else:
            self.text_splitter = None
            self.error_details += "TextSplitter library not found. "

        self.vectorstore = None
        self._load_vectorstore()

    def _load_vectorstore(self):
        if not self.embeddings or not Chroma:
            self.last_status = "Failed: Missing dependencies"
            return

        try:
            # Check if vector store exists
            if os.path.exists(self.persist_dir) and os.path.exists(os.path.join(self.persist_dir, "chroma.sqlite3")):
                self.vectorstore = Chroma(
                    persist_directory=self.persist_dir,
                    embedding_function=self.embeddings
                )
                self.last_status = "Ready: Loaded from disk"
            else:
                if os.path.exists(self.data_json_path):
                    self.load_ecc_data(self.data_json_path)
                else:
                    self.last_status = "Failed: No data found"
                    self.error_details += f"Missing files at {self.persist_dir} and {self.data_json_path}. "
        except Exception as e:
            self.error_details += f"Vectorstore load error: {str(e)}. "
            if os.path.exists(self.data_json_path):
                self.load_ecc_data(self.data_json_path)
            else:
                self.last_status = "Error: Rebuild failed"

    def process_request(self, control_id: str, query: str = "", mode: str = "guidance") -> str:
        if not self.llm:
            return f"AI Service is not configured properly. Details: {self.error_details}"
        
        context = self.retrieve_context(control_id)
        if not context:
            return f"No documentation found for Control ID: {control_id}. Status: {self.last_status}. Errors: {self.error_details}"

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
                # Flexible matching: exact or starts with (for sub-controls)
                if cid == control_id or cid.startswith(f"{control_id}-"):
                    relevant_docs.append(doc)
            
            # If filtering was too aggressive, take top 4 results anyway
            if not relevant_docs and results:
                relevant_docs = results[:4]

            if not relevant_docs:
                return ""
                
            return "\n\n---\n\n".join([doc.page_content for doc in relevant_docs])
        except Exception as e:
            self.error_details += f"Retrieval error: {str(e)}. "
            return ""

    def load_ecc_data(self, json_path: str):
        if not os.path.exists(json_path) or not self.embeddings or not self.text_splitter or not Chroma or not Document:
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
                        metadata={"control_id": str(ctrl_id), "source": "ecc_controls.json"}
                    )
                    documents.append(doc)
            
            if documents:
                self.vectorstore = Chroma.from_documents(
                    documents=documents,
                    embedding=self.embeddings,
                    persist_directory=self.persist_dir
                )
                self.last_status = "Ready: Rebuilt from JSON"
        except Exception as e:
            self.last_status = "Error: JSON Load failed"
            self.error_details += f"JSON load error: {str(e)}. "

    def get_debug_info(self):
        return {
            "status": self.last_status,
            "errors": self.error_details,
            "paths": {
                "backend": self.backend_dir,
                "persist": self.persist_dir,
                "json": self.data_json_path
            },
            "vectorstore_ready": self.vectorstore is not None,
            "llm_ready": self.llm is not None,
            "embeddings_ready": self.embeddings is not None
        }
