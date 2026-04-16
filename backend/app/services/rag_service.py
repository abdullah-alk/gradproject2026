# app/services/rag_service.py
from mistralai.client import MistralClient
from mistralai.models.chat_completion import ChatMessage
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
        self.client = MistralClient(api_key=settings.MISTRAL_API_KEY)
        self.rag_engine = RAGEngine()
        self.model = "mistral-large-latest"
            
    async def generate_audit_questions(self, control_id: str) -> List[Dict]:
        """
        توليد أسئلة Audit لـ Control محدد
        """
        # استرجاع السياق من RAG
        context = self.rag_engine.retrieve_context(control_id, mode="audit")
        
        # بناء Prompt
        prompt = AUDIT_QUESTION_GENERATION_PROMPT.format(context=context)
        
        # استدعاء LLM
       
        messages = [
            ChatMessage(role="user", content=prompt)
        ]
        

        
        response = self.client.chat(
            model=self.model,
            messages=messages,
            temperature=0.3,
            max_tokens=2000
        )
        
        # استخراج النتيجة
        content = response.choices[0].message.content
        
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
        
       messages = [Message(role="user", content=prompt)]
        
        response = self.client.(
            model=self.model,
            messages=messages,
            temperature=0.4,
            max_tokens=3000
        )
                
        return response.choices[0].message.content
    
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
        
      messages = [Message(role="user", content=prompt)]
      
        response = self.client.(
            model=self.model,
            messages=messages,
            temperature=0.3,
            max_tokens=2000
        )

       content = response.choices[0].message.content

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
