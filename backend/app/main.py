import os
import re
import hashlib
from datetime import datetime
from typing import Optional

import numpy as np
import psycopg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pgvector.psycopg import register_vector
from pydantic import BaseModel, Field

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://tech:tech@db:5432/techinsight",
)
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))

TOKEN_RE = re.compile(r"[A-Za-z0-9_]+|[\u3040-\u30ff\u4e00-\u9fff]+")


def psycopg_url(url: str) -> str:
    return (
        url.replace("postgresql+asyncpg://", "postgresql://")
        .replace("postgresql+psycopg://", "postgresql://")
    )


def embed_text(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    tokens = TOKEN_RE.findall((text or "").lower())
    vec = np.zeros(dim, dtype=np.float32)
    for t in tokens:
        h = hashlib.blake2b(t.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(h, "little") % dim
        vec[idx] += 1.0
    norm = float(np.linalg.norm(vec))
    if norm > 0:
        vec /= norm
    return vec.tolist()


def parse_ts(s: Optional[str]):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


app = FastAPI(title="TechInsight API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ArticleCreate(BaseModel):
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)
    author: Optional[str] = None
    category: Optional[str] = None
    published_at: Optional[str] = None


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None
    published_at: Optional[str] = None


class ArticleOut(BaseModel):
    id: int
    title: str
    content: str
    author: Optional[str]
    category: Optional[str]
    published_at: Optional[str]

class SearchHit(BaseModel):
    score: float
    distance: float
    article: ArticleOut


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/articles", response_model=list[ArticleOut])
def list_articles(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    db_url = psycopg_url(DATABASE_URL)
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, content, author, category, published_at
                FROM articles
                ORDER BY published_at DESC NULLS LAST, id DESC
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            )
            rows = cur.fetchall()

    return [
        ArticleOut(
            id=r[0],
            title=r[1],
            content=r[2],
            author=r[3],
            category=r[4],
            published_at=r[5].isoformat() if r[5] else None,
        )
        for r in rows
    ]


@app.get("/articles/search", response_model=list[SearchHit])
def semantic_search(
    q: str = Query(min_length=1),
    limit: int = Query(10, ge=1, le=50),
    max_distance: float = Query(0.6, ge=0.0, le=2.0),
):
    db_url = psycopg_url(DATABASE_URL)
    qvec = embed_text(q)

    with psycopg.connect(db_url) as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  id, title, content, author, category, published_at,
                  (embedding <=> (%s)::vector) AS distance
                FROM articles
                WHERE embedding IS NOT NULL
                  AND (embedding <=> (%s)::vector) <= %s
                ORDER BY distance
                LIMIT %s
                """,
                (qvec, qvec, max_distance, limit),
            )
            rows = cur.fetchall()

    hits: list[SearchHit] = []
    for r in rows:
        distance = float(r[6])
        score = 1.0 / (1.0 + distance)

        hits.append(
            SearchHit(
                score=score,
                distance=distance,
                article=ArticleOut(
                    id=r[0],
                    title=r[1],
                    content=r[2],
                    author=r[3],
                    category=r[4],
                    published_at=r[5].isoformat() if r[5] else None,
                ),
            )
        )

    return hits




@app.get("/articles/{article_id}", response_model=ArticleOut)
def get_article(article_id: int):
    db_url = psycopg_url(DATABASE_URL)
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, content, author, category, published_at
                FROM articles
                WHERE id = %s
                """,
                (article_id,),
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Article not found")

    return ArticleOut(
        id=row[0],
        title=row[1],
        content=row[2],
        author=row[3],
        category=row[4],
        published_at=row[5].isoformat() if row[5] else None,
    )


@app.post("/articles", response_model=ArticleOut, status_code=201)
def create_article(payload: ArticleCreate):
    db_url = psycopg_url(DATABASE_URL)
    emb = embed_text(f"{payload.title}\n{payload.content}")
    published_at = parse_ts(payload.published_at)

    with psycopg.connect(db_url) as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO articles
                  (id, title, content, author, category, published_at, embedding)
                VALUES
                  ((SELECT COALESCE(MAX(id), 0) + 1 FROM articles),
                   %s, %s, %s, %s, %s, %s)
                RETURNING id, title, content, author, category, published_at
                """,
                (
                    payload.title,
                    payload.content,
                    payload.author,
                    payload.category,
                    published_at,
                    emb,
                ),
            )
            row = cur.fetchone()
            conn.commit()

    return ArticleOut(
        id=row[0],
        title=row[1],
        content=row[2],
        author=row[3],
        category=row[4],
        published_at=row[5].isoformat() if row[5] else None,
    )


@app.put("/articles/{article_id}", response_model=ArticleOut)
def update_article(article_id: int, payload: ArticleUpdate):
    db_url = psycopg_url(DATABASE_URL)

    with psycopg.connect(db_url) as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT title, content, author, category, published_at
                FROM articles
                WHERE id = %s
                """,
                (article_id,),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Article not found")

            title = payload.title if payload.title is not None else row[0]
            content = payload.content if payload.content is not None else row[1]
            author = payload.author if payload.author is not None else row[2]
            category = payload.category if payload.category is not None else row[3]
            published_at = (
                parse_ts(payload.published_at)
                if payload.published_at is not None
                else row[4]
            )

            emb = embed_text(f"{title}\n{content}")

            cur.execute(
                """
                UPDATE articles
                SET title=%s,
                    content=%s,
                    author=%s,
                    category=%s,
                    published_at=%s,
                    embedding=%s,
                    updated_at=NOW()
                WHERE id=%s
                RETURNING id, title, content, author, category, published_at
                """,
                (
                    title,
                    content,
                    author,
                    category,
                    published_at,
                    emb,
                    article_id,
                ),
            )
            out = cur.fetchone()
            conn.commit()

    return ArticleOut(
        id=out[0],
        title=out[1],
        content=out[2],
        author=out[3],
        category=out[4],
        published_at=out[5].isoformat() if out[5] else None,
    )


@app.delete("/articles/{article_id}", status_code=204)
def delete_article(article_id: int):
    db_url = psycopg_url(DATABASE_URL)
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM articles WHERE id = %s", (article_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Article not found")
            conn.commit()
    return
