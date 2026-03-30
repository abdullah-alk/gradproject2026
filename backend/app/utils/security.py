# app/utils/security.py
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2
import base64
import os

class EncryptionService:
    def __init__(self, secret_key: str):
        # Generate encryption key from secret
        kdf = PBKDF2(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'ecc_compliance_salt',  # في الإنتاج، استخدم salt عشوائي
            iterations=100000
        )
        key = base64.urlsafe_b64encode(kdf.derive(secret_key.encode()))
        self.cipher = Fernet(key)
    
    def encrypt(self, data: str) -> str:
        """تشفير البيانات"""
        return self.cipher.encrypt(data.encode()).decode()
    
    def decrypt(self, encrypted_data: str) -> str:
        """فك تشفير البيانات"""
        return self.cipher.decrypt(encrypted_data.encode()).decode()
    
    def encrypt_file(self, file_path: str) -> str:
        """تشفير ملف"""
        with open(file_path, 'rb') as f:
            data = f.read()
        
        encrypted = self.cipher.encrypt(data)
        
        encrypted_path = file_path + '.encrypted'
        with open(encrypted_path, 'wb') as f:
            f.write(encrypted)
        
        # حذف الملف الأصلي
        os.remove(file_path)
        
        return encrypted_path