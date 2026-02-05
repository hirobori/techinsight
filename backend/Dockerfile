FROM python:3.13-slim

WORKDIR /app
RUN pip install --no-cache-dir -U pip

RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    "uvicorn[standard]==0.30.6" \
    SQLAlchemy==2.0.37 \
    alembic==1.14.1 \
    asyncpg==0.30.0 \
    "psycopg[binary]==3.2.5" \
    pgvector==0.3.6 \
    numpy==2.1.0

COPY . /app

EXPOSE 8000

CMD ["bash", "-lc", "alembic upgrade head && python -m app.scripts.import_articles && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
