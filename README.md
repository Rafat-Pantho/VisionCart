# VisionCart

### Visual Inventory Management System powered by Gemma 4

---

## Overview

Small retail businesses still track shelf stock the old-fashioned way: a person
walks the aisle, counts items by eye, and types the numbers into a spreadsheet
(or worse, a notebook). It's slow, it's error-prone, and by the time the count
is done it's already out of date.

**VisionCart** replaces that manual count with a single photo. Snap a picture
of a shelf, and a vision-language model (Gemma 4) identifies every product on
it and counts how many units are visible. The backend reconciles those counts
against the expected inventory in real time, flags anything running low (or
gone entirely), and surfaces it all on a live dashboard — turning a "cluttered
shelf" photo into organized, actionable inventory data in seconds.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | [FastAPI](https://fastapi.tiangolo.com/) (Python) |
| Database | SQLite (via SQLAlchemy ORM) |
| AI / Vision | `gemma-4-26b-a4b-it` via the [Google GenAI SDK](https://pypi.org/project/google-genai/) |
| Frontend | Vanilla HTML, JavaScript, and [Tailwind CSS](https://tailwindcss.com/) (via CDN) |

No frontend build step, no framework — just a single static `index.html` that
talks to the FastAPI backend over `fetch()`.

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/Rafat-Pantho/VisionCart.git
cd VisionCart
```

### 2. Set up the backend virtual environment

```bash
cd backend
python -m venv venv

# Activate the virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Create your `.env` file

Inside the `backend/` directory, create a file named `.env` with your Gemini
API key:

```
GEMINI_API_KEY=your_api_key_here
```

### 4. Seed the database

This creates `inventory.db` and populates it with starter product data:

```bash
python seed_db.py
```

### 5. Start the API server

```bash
uvicorn main:app --reload
```

The API will be running at `http://localhost:8000`.

### 6. Open the frontend

No server needed — just open the file directly in your browser:

```
frontend/index.html
```

(Double-click it in your file explorer, or run `start frontend/index.html` /
`open frontend/index.html` from the project root.)

## Usage

The dashboard is split into a **Before / After** layout:

- **Left — "Cluttered Shelf" (Before):** Choose a shelf photo and click
  **Scan Shelf**. A preview of the uploaded image appears immediately so you
  can confirm what's being analyzed.
- **Right — "Organized Data" (After):** Once Gemma 4 finishes processing the
  image, the panel updates live — metric cards summarize total unique
  products, items needing restock, and the last scan time; any low-stock or
  out-of-stock items are called out in the alerts banner and highlighted
  directly in the inventory table.

Products the AI detects are reconciled against the database automatically:
counts are updated, new products are added, and anything expected but **not**
visible in the photo (e.g. an empty shelf) is correctly zeroed out and flagged
— not left showing stale, outdated quantities.
