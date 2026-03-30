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
            print(f"✅ AI Engine: High-Precision Groq Connected (llama-3.3-70b-versatile)")
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
        """Load existing ChromaDB vectorstore"""
        if os.path.exists(settings.CHROMA_PERSIST_DIRECTORY):
            self.vectorstore = Chroma(
                persist_directory=settings.CHROMA_PERSIST_DIRECTORY,
                embedding_function=self.embeddings
            )
            print(f"✅ ChromaDB loaded from: {settings.CHROMA_PERSIST_DIRECTORY}")
        else:
            print(f"⚠️ ChromaDB not found at: {settings.CHROMA_PERSIST_DIRECTORY}")
            print("   Run indexing script to create vectorstore")

    def process_request(self, control_id: str, query: str = "", mode: str = "guidance") -> str:
        """
        المعالج الرئيسي - يدعم الآن query و mode مختلفة
        Modes: audit | guide | guidance | gap | recommendations
        
        Args:
            control_id: ECC control ID (e.g., "1-1", "1-2")
            query: User query or additional context
            mode: Processing mode
            
        Returns:
            str: AI-generated response (JSON for audit/guide, text for others)
        """
        if not self.llm:
            return "AI Service is not configured properly. Please check GROQ_API_KEY."

        # Retrieve relevant context from vectorstore
        context = self.retrieve_context(control_id)
        if not context:
            return f"No documentation found for Control ID: {control_id}. Please ensure ECC documents are indexed in ChromaDB."

        try:
            # Select appropriate prompt based on mode
            if mode == "audit":
                # توليد أسئلة التدقيق - يُرجع JSON بـ 10 أسئلة
                final_prompt = AUDIT_QUESTION_GENERATION_PROMPT.format(context=context)
                print(f"[🤖] Generating AUDIT questions for {control_id}")

            elif mode == "guide":
                # توليد أسئلة Guide Mode - يُرجع JSON بـ 10 أسئلة
                final_prompt = GUIDE_QUESTION_GENERATION_PROMPT.format(context=context)
                print(f"[🤖] Generating GUIDE questions for {control_id}")

            elif mode == "recommendations":
                # توليد توصيات بناءً على إجابات المستخدم
                final_prompt = RECOMMENDATIONS_PROMPT.format(
                    context=context,
                    user_answers=query
                )
                print(f"[🤖] Generating RECOMMENDATIONS for {control_id}")

            elif mode == "gap":
                # تحليل الثغرات
                final_prompt = GAP_ANALYSIS_PROMPT.format(
                    context=context,
                    audit_results=query or "Initial assessment required for this control."
                )
                print(f"[🤖] Performing GAP ANALYSIS for {control_id}")

            else:
                # guidance - إجابة على سؤال حر
                if query:
                    final_prompt = f"{IMPLEMENTATION_GUIDANCE_PROMPT.format(context=context)}\n\n**User Question:** {query}"
                else:
                    final_prompt = IMPLEMENTATION_GUIDANCE_PROMPT.format(context=context)
                print(f"[🤖] Providing IMPLEMENTATION GUIDANCE for {control_id}")

            # Invoke AI model
            response = self.llm.invoke(final_prompt)
            result = response.content
            
            # Log response length for monitoring
            print(f"[✅] AI response generated: {len(result)} characters")
            
            return result

        except Exception as e:
            print(f"[❌] RAG Error (mode={mode}, control={control_id}): {e}")
            return f"AI Service Error: Unable to process request. {str(e)}"

    def retrieve_context(self, control_id: str, k: int = 5) -> str:
        """
        Retrieve relevant context from vectorstore for a specific control
        
        Args:
            control_id: ECC control ID
            k: Number of chunks to retrieve
            
        Returns:
            str: Combined context from retrieved chunks
        """
        if not self.vectorstore:
            print(f"[⚠️] Vectorstore not loaded - cannot retrieve context for {control_id}")
            return ""
        
        try:
            # Search with control_id filter
            results = self.vectorstore.similarity_search(
                f"Technical requirements, implementation guidelines, and deliverables for ECC control {control_id}",
                k=k,
                filter={"control_id": control_id}
            )
            
            if not results:
                print(f"[⚠️] No context found for control {control_id}")
                return ""
            
            # Combine all retrieved chunks
            context = "\n\n---\n\n".join([doc.page_content for doc in results])
            print(f"[📚] Retrieved {len(results)} chunks for {control_id} ({len(context)} chars)")
            
            return context
            
        except Exception as e:
            print(f"[❌] Context retrieval error for {control_id}: {e}")
            return ""

    def load_ecc_data(self, json_path: str):
        """
        Load ECC control data from JSON and index into ChromaDB
        
        Args:
            json_path: Path to ECC controls JSON file
        """
        if not os.path.exists(json_path):
            print(f"[❌] ECC data file not found: {json_path}")
            return
        
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                controls_data = json.load(f)

            documents = []
            for cid, content in controls_data.items():
                # Construct comprehensive document text
                full_content = (
                    f"CONTROL_ID: {cid}\n"
                    f"TITLE: {content.get('title', '')}\n"
                    f"DOMAIN: {content.get('domain', '')}\n"
                    f"OBJECTIVE: {content.get('objective', '')}\n"
                    f"DESCRIPTION: {content.get('description', '')}\n\n"
                    f"FULL REQUIREMENTS:\n{content.get('full_text', '')}\n\n"
                    f"IMPLEMENTATION GUIDELINES:\n{content.get('implementation_guidelines', '')}\n\n"
                    f"EXPECTED DELIVERABLES:\n{content.get('expected_deliverables', '')}"
                )
                
                # Split into chunks
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

            # Create vectorstore
            print(f"[⚙️] Indexing {len(documents)} document chunks into ChromaDB...")
            self.vectorstore = Chroma.from_documents(
                documents=documents,
                embedding=self.embeddings,
                persist_directory=settings.CHROMA_PERSIST_DIRECTORY
            )
            
            print(f"✅ Successfully indexed {len(documents)} chunks from {len(controls_data)} controls")
            print(f"✅ Vectorstore persisted to: {settings.CHROMA_PERSIST_DIRECTORY}")
            
        except json.JSONDecodeError as e:
            print(f"[❌] JSON parsing error: {e}")
        except Exception as e:
            print(f"[❌] Indexing error: {e}")

    def test_retrieval(self, control_id: str):
        """
        Test context retrieval for a specific control (useful for debugging)
        
        Args:
            control_id: ECC control ID to test
        """
        print(f"\n{'='*60}")
        print(f"Testing Context Retrieval for Control: {control_id}")
        print('='*60)
        
        context = self.retrieve_context(control_id, k=3)
        
        if context:
            print(f"\n📚 Retrieved Context ({len(context)} characters):\n")
            print(context[:500] + "..." if len(context) > 500 else context)
            print(f"\n✅ Retrieval successful for {control_id}")
        else:
            print(f"\n❌ No context found for {control_id}")
        
        print('='*60 + '\n')