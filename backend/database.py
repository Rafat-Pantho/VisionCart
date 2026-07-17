"""
Database configuration for the Visual Inventory Management System.

Sets up a synchronous SQLite database using SQLAlchemy: the engine,
the session factory, and the declarative Base that models inherit from.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# SQLite file lives alongside this module as "inventory.db".
SQLALCHEMY_DATABASE_URL = "sqlite:///./inventory.db"

# check_same_thread=False is required for SQLite when the same connection
# may be accessed by different threads within a single request (FastAPI default).
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# Each instance of SessionLocal is a database session.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class that all ORM models will inherit from.
Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a DB session and ensures it's closed after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
