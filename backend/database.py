import os
import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

logger = logging.getLogger(__name__)

# Use asyncpg for Postgres. Connect to localhost:5433 for local dev, or DATABASE_URL in production
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:password@localhost:5433/anonconnect")

# Render provides postgres://... which SQLAlchemy doesn't like for asyncpg
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    try:
        async with engine.begin() as conn:
            # For a production app we'd use Alembic, but for now we create tables directly
            await conn.run_sync(Base.metadata.create_all)
            
            # Auto-migration for chat_count column
            from sqlalchemy import text
            try:
                await conn.execute(text("ALTER TABLE users ADD COLUMN chat_count INTEGER DEFAULT 0;"))
                logger.info("Migration: Added chat_count column to users table.")
            except Exception:
                # Column might already exist or table not initialized yet
                pass
        logger.info("Database tables initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
