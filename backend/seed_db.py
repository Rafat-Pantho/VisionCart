"""
Standalone script to seed the database with dummy products for frontend testing.

Usage:
    python seed_db.py
"""

from database import SessionLocal, engine, Base
from models import Product

# Ensure tables exist even if this script is run before main.py has been started.
Base.metadata.create_all(bind=engine)

SEED_PRODUCTS = [
    {"product_name": "Red Cola Can", "expected_quantity": 10, "actual_quantity": 10, "low_stock_threshold": 3},
    {"product_name": "Lays Potato Chips", "expected_quantity": 10, "actual_quantity": 10, "low_stock_threshold": 3},
    {"product_name": "Blue Soap Box", "expected_quantity": 10, "actual_quantity": 10, "low_stock_threshold": 3},
    {"product_name": "Green Tea Bottle", "expected_quantity": 10, "actual_quantity": 10, "low_stock_threshold": 3},
    {"product_name": "Chocolate Cookie Pack", "expected_quantity": 10, "actual_quantity": 10, "low_stock_threshold": 3},
    {"product_name": "White Rice Bag", "expected_quantity": 10, "actual_quantity": 10, "low_stock_threshold": 3},
    {"product_name": "Instant Noodle Cup", "expected_quantity": 10, "actual_quantity": 10, "low_stock_threshold": 3},
]


def seed():
    db = SessionLocal()
    try:
        # Safety check: don't duplicate data if this script is run more than once.
        if db.query(Product).first() is not None:
            print("Database already contains products — skipping seed.")
            return

        db.bulk_insert_mappings(Product, SEED_PRODUCTS)
        db.commit()
        print(f"Seeded {len(SEED_PRODUCTS)} products into the database.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
