from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://ecc_user:post123@localhost:5432/ecc_compliance"
    SECRET_KEY: str = "8844c68d5e56560bfa4c71294b49ceb6fc88e339c9741a12ed79e080c5eaac18"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    MISTRAL_API_KEY: str = "SRIbGRYmdljDaVehUi7o4FbU3QSDC051"
    EMBEDDING_MODEL: str = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    CHROMA_PERSIST_DIRECTORY: str = "./data/vector_store"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    CORS_ORIGINS: List[str] = ["*"]
    GMAIL_USER: str = ""
    GMAIL_PASS: str = ""

    class Config:
        env_file = ".env"
        extra = "allow" # هذه تسمح بتجاوز الحقول الإضافية

settings = Settings()
