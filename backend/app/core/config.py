from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    run_seed: bool = True
    csv_path: str = "/data/articles.csv"
    embedding_dim: int = 384
    log_level: str = "INFO"

    class Config:
        env_prefix = ""
        case_sensitive = False

settings = Settings()
