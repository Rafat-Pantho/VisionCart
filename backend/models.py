"""
SQLAlchemy ORM models for the Visual Inventory Management System.
"""

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from database import Base


class Product(Base):
    """Baseline inventory record for a single product."""

    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, unique=True, index=True, nullable=False)
    expected_quantity = Column(Integer, nullable=False)  # What we think we have.
    actual_quantity = Column(Integer, nullable=False)  # What the AI counts.
    low_stock_threshold = Column(Integer, nullable=False)  # Alert trigger point.


class ScanLog(Base):
    """History record of a single inventory scan."""

    __tablename__ = "scan_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    items_detected = Column(Integer, nullable=False)  # Unique products found in this scan.
