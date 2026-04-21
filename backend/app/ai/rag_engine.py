import json
import os
from typing import List, Dict, Optional
from dotenv import load_dotenv
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_text_splitter import RecursiveCharacterTextSplitter
from langchain_groq import ChatGroq
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
        
        # Determine base directory (backend folder)
        self.base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.data_dir = os.path.join(self.base_dir, "data")
        self.persist_dir = os.path.join(self.data_dir, "vector_store")

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
        else:
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
        if os.path.exists(self.persist_dir):
            self.vectorstore = Chroma(
                persist_directory=self.persist_dir,
                embedding_function=self.embeddings
            )
        else:
            json_path = os.path.join(self.data_dir, "ecc_controls.json")
            if os.path.exists(json_path):
                self.load_ecc_data(json_path)

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
                cid = doc.metadata.get("control_id", "")
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
        if not os.path.exists(json_path):
            return
            
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                controls_data = json.load(f)
            
            documents = []
            for ctrl_id, info in controls_data.items():
                content = f"Control ID: {ctrl_id}\nObjective: {info.get('objective')}\nGuidelines: {info.get('implementation_guidelines')}\nDeliverables: {info.get('expected_deliverables')}\nFull Text: {info.get('full_text')}"
                
                chunks = self.text_splitter.split_text(content)
                for chunk in chunks:
                    from langchain.schema import Document
                    doc = Document(
                        page_content=chunk,
                        metadata={"control_id": ctrl_id, "source": "ecc_controls.json"}
                    )
                    documents.append(doc)
            
            self.vectorstore = Chroma.from_documents(
                documents=documents,
                embedding=self.embeddings,
                persist_directory=self.persist_dir
            )
        except Exception:
            pass
