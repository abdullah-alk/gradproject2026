# ingest.py
import os
from app.ai.rag_engine import RAGEngine

def main():

    rag = RAGEngine()

    # استخدام المسار المطلق للتأكد من مكان الملف
    base_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base_dir, "data", "ecc_controls.json")



    if os.path.exists(json_path):

        try:
            rag.load_ecc_data(json_path)



        except Exception as e:

    else:

        # طباعة محتويات المجلد لمساعدتك في اكتشاف الخطأ
        if os.path.exists(os.path.join(base_dir, "data")):

        else:


if __name__ == "__main__":
    main()
