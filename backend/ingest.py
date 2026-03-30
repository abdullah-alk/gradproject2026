# ingest.py
import os
from app.ai.rag_engine import RAGEngine

def main():
    print("Initializing RAG Engine...")
    rag = RAGEngine()

    # استخدام المسار المطلق للتأكد من مكان الملف
    base_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base_dir, "data", "ecc_controls.json")

    print(f"Checking path: {json_path}")

    if os.path.exists(json_path):
        print(f"✅ Found data file! Starting ingestion...")
        try:
            rag.load_ecc_data(json_path)
            print("---")
            print("✅ SUCCESS: Database built in 'chroma_db' folder.")
            print("🚀 Run: uvicorn app.main:app --reload")
        except Exception as e:
            print(f"❌ Error during ingestion: {e}")
    else:
        print(f"❌ Error: Data file NOT found at {json_path}")
        # طباعة محتويات المجلد لمساعدتك في اكتشاف الخطأ
        if os.path.exists(os.path.join(base_dir, "data")):
            print(f"Files inside 'data' folder: {os.listdir(os.path.join(base_dir, 'data'))}")
        else:
            print("The 'data' folder itself is missing in the backend directory!")

if __name__ == "__main__":
    main()