"""
Entry point for the Visual Inventory Management System API.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
import models  # noqa: F401 - imported so its models register on Base.metadata
from router import router

# Create all tables on startup if they don't already exist.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Visual Inventory Management System")

# Allow the local frontend (opened as a file:// page or served from a
# dev server) to call this API from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def health_check():
    """Simple health-check endpoint."""
    return {"status": "ok"}
