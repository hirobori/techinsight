import os
from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

def _sync_db_url(async_url: str) -> str:
    return async_url.replace("postgresql+asyncpg", "postgresql+psycopg")

def get_url() -> str:
    url = os.environ.get("DATABASE_URL", "postgresql+asyncpg://tech:tech@db:5432/techinsight")
    return _sync_db_url(url)

config.set_main_option("sqlalchemy.url", get_url())

target_metadata = None

def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
