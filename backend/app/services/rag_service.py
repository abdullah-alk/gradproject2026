# app/services/rag_service.py
#📍 from mistralai.client import MistralClient
#📍 from mistralai.models.chat_completion import ChatMessage
#📍UPDATE:
from langchain_groq import ChatGroq
import os 
from typing import List, Dict
import json
from ..config import settings
from ..ai.rag_engine import RAGEngine
from ..ai.prompts import (
    AUDIT_QUESTION_GENERATION_PROMPT,
    IMPLEMENTATION_GUIDANCE_PROMPT,
    GAP_ANALYSIS_PROMPT
)

class RAGService:
    def __init__(self):
        #📍 self.client = MistralClient(api_key=settings.MISTRAL_API_KEY)
        self.rag_engine = RAGEngine()
        #📍 self.model = "mistral-large-latest"
        #📍UPDATE:
        '''
        self.llm = ChatGroq(
            model_name="llama-3.3-70b-versatile",
            temperature=0.2,
            groq_api_key=settings.GROQ_API_KEY # NEED CHECKING    
        )
        '''
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
            
    async def generate_audit_questions(self, control_id: str) -> List[Dict]:
        """
        توليد أسئلة Audit لـ Control محدد
        """
        # استرجاع السياق من RAG
        context = self.rag_engine.retrieve_context(control_id, mode="audit")
        
        # بناء Prompt
        prompt = AUDIT_QUESTION_GENERATION_PROMPT.format(context=context)
        
        # استدعاء LLM
       """ 📍
        messages = [
            ChatMessage(role="user", content=prompt)
        ]
        """

        """📍
        response = self.client.chat(
            model=self.model,
            messages=messages,
            temperature=0.3,
            max_tokens=2000
        )
        """
        #📍UPDATE:
        response = self.llm.invoke(prompt)
        
        # استخراج النتيجة
        #📍content = response.choices[0].message.content
        #📍UPDATE:
        content = response.content
        
        # Parse JSON
        try:
            # إزالة markdown code blocks إذا وجدت
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            questions = json.loads(content.strip())
            return questions
        except Exception as e:
            print(f"Error parsing LLM response: {e}")
            return []
    
    async def generate_implementation_guidance(self, control_id: str) -> str:
        """
        توليد إرشادات التنفيذ لـ Control
        """
        context = self.rag_engine.retrieve_context(control_id, mode="implementation")
        
        prompt = IMPLEMENTATION_GUIDANCE_PROMPT.format(context=context)
        
       #📍messages = [Message(role="user", content=prompt)]
        """📍
        response = self.client.(
            model=self.model,
            messages=messages,
            temperature=0.4,
            max_tokens=3000
        )
        """
        
        #📍UPDATE:
        response = self.llm.invoke(prompt)
        
        return response.content #📍 response.choices[0].message.content
    
    async def analyze_gaps(self, control_id: str, audit_results: Dict) -> List[Dict]:
        """
        تحليل الفجوات بناءً على نتائج Audit
        """
        context = self.rag_engine.retrieve_context(control_id)
        
        # تحويل النتائج لنص
        results_text = json.dumps(audit_results, indent=2)
        
        prompt = GAP_ANALYSIS_PROMPT.format(
            context=context,
            audit_results=results_text
        )
        
       #📍 messages = [Message(role="user", content=prompt)]
       """ 📍 
        response = self.client.(
            model=self.model,
            messages=messages,
            temperature=0.3,
            max_tokens=2000
        )
        """
        #📍UPDATE:
        response = self.llm.invoke(prompt)

        #📍 content = response.choices[0].message.content
        #📍 UPDATE:
        content = response.content

        try:
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            gaps = json.loads(content.strip())
            return gaps
        except Exception as e:
            print(f"Error parsing gap analysis: {e}")
            return []
