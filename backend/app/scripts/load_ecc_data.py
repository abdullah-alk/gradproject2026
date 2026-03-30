# app/scripts/load_ecc_data.py
from app.utils.ecc_parser import parse_ecc_pdf
from app.ai.rag_engine import RAGEngine
import json

# استخراج البيانات من PDF
controls = parse_ecc_pdf("../data/ecc_10_controls.pdf")

# حفظ كـ JSON
with open("../data/ecc_controls.json", "w", encoding="utf-8") as f:
    json.dump(controls, f, ensure_ascii=False, indent=2)

# بناء Vector Store
rag = RAGEngine()
rag.load_ecc_data("../data/ecc_controls.json")