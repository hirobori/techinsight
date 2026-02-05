import os
import csv
import re
import hashlib
from datetime import datetime
import numpy as np
import psycopg
from pgvector.psycopg import register_vector

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://tech:tech@db:5432/techinsight")
CSV_PATH = os.getenv("CSV_PATH", "/data/articles.csv")
RUN_SEED = os.getenv("RUN_SEED", "true").lower() in ("1", "true", "yes")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))

TOKEN_RE = re.compile(r"[A-Za-z0-9_]+|[\u3040-\u30ff\u4e00-\u9fff]+")

def _psycopg_url(url: str) -> str:
    # psycopg.connect に渡せる形式へ正規化する
    # SQLAlchemyのドライバ指定（+asyncpg / +psycopg）を外す
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("postgresql+psycopg://", "postgresql://")
    return url

def _parse_ts(s: str):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

def embed_text(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    tokens = TOKEN_RE.findall(text.lower())
    vec = np.zeros(dim, dtype=np.float32)
    for t in tokens:
        h = hashlib.blake2b(t.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(h, "little") % dim
        vec[idx] += 1.0
    norm = float(np.linalg.norm(vec))
    if norm > 0:
        vec /= norm
    return vec.tolist()

def main():
    if not RUN_SEED:
        print("[seed] RUN_SEED=false -> skip")
        return

    if not os.path.exists(CSV_PATH):
        print(f"[seed] CSV not found: {CSV_PATH} -> skip")
        return

    db_url = _psycopg_url(DATABASE_URL)

    with psycopg.connect(db_url) as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM articles;")
            count = cur.fetchone()[0]
            if count and count > 0:
                print(f"[seed] already seeded: {count} rows -> skip")
                return

            batch = []
            BATCH_SIZE = 500

            with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    article_id = int(row["id"])
                    title = row.get("title", "") or ""
                    content = row.get("content", "") or ""
                    author = row.get("author")
                    category = row.get("category")
                    published_at = _parse_ts(row.get("published_at", ""))

                    text = f"{title}\n{content}"
                    emb = embed_text(text)

                    batch.append((article_id, title, content, author, category, published_at, emb))

                    if len(batch) >= BATCH_SIZE:
                        cur.executemany(
                            """
                            INSERT INTO articles (id, title, content, author, category, published_at, embedding)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            """,
                            batch,
                        )
                        conn.commit()
                        print(f"[seed] inserted {len(batch)}")
                        batch.clear()

            if batch:
                cur.executemany(
                    """
                    INSERT INTO articles (id, title, content, author, category, published_at, embedding)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    batch,
                )
                conn.commit()
                print(f"[seed] inserted {len(batch)}")

            cur.execute("ANALYZE articles;")
            conn.commit()

    print("[seed] done")

if __name__ == "__main__":
    main()
