"""
API routes for the Visual Inventory Management System dashboard:
scanning a shelf photo and reconciling it against the products table,
and reading back the current inventory state.
"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from database import get_db
import models
from ai_service import analyze_shelf_image

router = APIRouter(prefix="/api", tags=["inventory"])

DEFAULT_LOW_STOCK_THRESHOLD = 5


class InventoryUpdate(BaseModel):
    """One product's post-scan state, as reported back to the caller."""

    product_name: str
    expected_quantity: int
    actual_quantity: int
    low_stock_threshold: int


class ScanShelfResponse(BaseModel):
    scan_id: int
    inventory_updates: list[InventoryUpdate]
    alerts: list[str]


class ProductOut(BaseModel):
    id: int
    product_name: str
    expected_quantity: int
    actual_quantity: int
    low_stock_threshold: int

    class Config:
        from_attributes = True


@router.post("/scan-shelf", response_model=ScanShelfResponse)
async def scan_shelf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Analyze a shelf photo and reconcile the results into the products table."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    image_bytes = await file.read()

    try:
        analysis = analyze_shelf_image(image_bytes, file.content_type)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    inventory_updates: list[InventoryUpdate] = []
    alerts: list[str] = []
    detected_names: set[str] = set()

    for item in analysis.products:
        detected_names.add(item.product_name.lower())

        product = (
            db.query(models.Product)
            .filter(func.lower(models.Product.product_name) == item.product_name.lower())
            .first()
        )

        if product:
            product.actual_quantity = item.counted_quantity
        else:
            product = models.Product(
                product_name=item.product_name,
                expected_quantity=0,
                actual_quantity=item.counted_quantity,
                low_stock_threshold=DEFAULT_LOW_STOCK_THRESHOLD,
            )
            db.add(product)

        db.flush()  # populate product.id / defaults before we read them back below

        inventory_updates.append(
            InventoryUpdate(
                product_name=product.product_name,
                expected_quantity=product.expected_quantity,
                actual_quantity=product.actual_quantity,
                low_stock_threshold=product.low_stock_threshold,
            )
        )

        if product.actual_quantity < product.low_stock_threshold:
            alerts.append(
                f"Low stock: '{product.product_name}' has {product.actual_quantity} "
                f"units (threshold {product.low_stock_threshold})."
            )

    # Any product already in the database that the AI did NOT see on this
    # shelf photo is out of stock, not merely "unchanged" — zero it out
    # instead of leaving its previous (now stale) actual_quantity in place.
    missing_products_query = db.query(models.Product)
    if detected_names:
        missing_products_query = missing_products_query.filter(
            func.lower(models.Product.product_name).notin_(detected_names)
        )

    for product in missing_products_query.all():
        product.actual_quantity = 0

        inventory_updates.append(
            InventoryUpdate(
                product_name=product.product_name,
                expected_quantity=product.expected_quantity,
                actual_quantity=product.actual_quantity,
                low_stock_threshold=product.low_stock_threshold,
            )
        )

        if product.actual_quantity < product.low_stock_threshold:
            alerts.append(
                f"Low stock: '{product.product_name}' has {product.actual_quantity} "
                f"units (threshold {product.low_stock_threshold})."
            )

    scan_log = models.ScanLog(items_detected=len(analysis.products))
    db.add(scan_log)

    db.commit()
    db.refresh(scan_log)

    return ScanShelfResponse(
        scan_id=scan_log.id,
        inventory_updates=inventory_updates,
        alerts=alerts,
    )


@router.get("/inventory", response_model=list[ProductOut])
def get_inventory(db: Session = Depends(get_db)):
    """Return the current state of every product for the dashboard table."""
    return db.query(models.Product).all()
