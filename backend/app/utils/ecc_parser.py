# app/utils/ecc_parser.py
import PyPDF2
import json
import re

def parse_ecc_pdf(pdf_path: str) -> dict:
    """
    استخراج بيانات ECC Controls من ملف PDF
    """
    controls = {}
    
    with open(pdf_path, 'rb') as file:
        reader = PyPDF2.PdfReader(file)
        
        current_control = None
        current_section = None
        text_buffer = ""
        
        for page in reader.pages:
            text = page.extract_text()
            
            # البحث عن Control IDs (مثل 1-1-1, 1-2-3)
            control_pattern = r'(\d+-\d+-?\d*)\s+'
            matches = re.finditer(control_pattern, text)
            
            for match in matches:
                control_id = match.group(1).strip()
                
                # استخراج النص بعد Control ID
                start_pos = match.end()
                section_text = text[start_pos:start_pos+1000]
                
                # تحديد الأقسام
                if "Objective" in section_text:
                    objective = extract_section(section_text, "Objective", "Controls")
                else:
                    objective = ""
                
                if "Control implementation guidelines" in section_text:
                    guidelines = extract_section(section_text, "Control implementation guidelines", "Expected deliverables")
                else:
                    guidelines = ""
                
                if "Expected deliverables" in section_text:
                    deliverables = extract_section(section_text, "Expected deliverables", None)
                else:
                    deliverables = ""
                
                controls[control_id] = {
                    "control_id": control_id,
                    "objective": objective.strip(),
                    "implementation_guidelines": guidelines.strip(),
                    "expected_deliverables": deliverables.strip(),
                    "full_text": section_text[:2000]
                }
    
    return controls

def extract_section(text: str, start_marker: str, end_marker: str = None) -> str:
    """
    استخراج نص بين علامتين
    """
    try:
        start_idx = text.index(start_marker) + len(start_marker)
        if end_marker:
            end_idx = text.index(end_marker, start_idx)
            return text[start_idx:end_idx]
        else:
            return text[start_idx:]
    except ValueError:
        return ""

# استخدام
if __name__ == "__main__":
    controls_data = parse_ecc_pdf("../data/ecc_10_controls.pdf")
    
    with open("../data/ecc_controls.json", "w", encoding="utf-8") as f:
        json.dump(controls_data, f, ensure_ascii=False, indent=2)