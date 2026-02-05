from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    op.execute("""
    CREATE TABLE IF NOT EXISTS articles (
      id BIGINT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT,
      category TEXT,
      published_at TIMESTAMPTZ,
      embedding vector(384),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """)

def downgrade():
    op.execute("DROP TABLE IF EXISTS articles;")
