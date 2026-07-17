"""
AI processing layer: sends shelf images to Gemma and gets back a
structured count of every product detected on the shelf.
"""

import re

from dotenv import load_dotenv
from pydantic import BaseModel
from google import genai
from google.genai import types

# Populates GEMINI_API_KEY (and friends) from .env into the environment.
load_dotenv()

MODEL_NAME = "gemma-4-26b-a4b-it"

PROMPT = (
    "Analyze this shelf image. Identify every unique product type and count "
    "their visible quantities. Use generic names (e.g., 'Red Cola Can', "
    "'Blue Soap Box')."
)

# Total attempts (1 initial + N retries) made against the model before
# giving up. Gemma occasionally wraps its JSON in prose or code fences,
# or just hiccups on a single call — a couple of retries clears most of those.
MAX_ATTEMPTS = 3

_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def _clean_json_text(text: str) -> str:
    """
    Best-effort cleanup of a model response before JSON parsing.

    Handles the two most common ways Gemma mangles structured output:
    wrapping the JSON in a ```json ... ``` fence, or padding it with
    leading/trailing prose (e.g. "Here is the result: {...}").
    """
    text = text.strip()

    fence_match = _CODE_FENCE_RE.search(text)
    if fence_match:
        text = fence_match.group(1).strip()

    if not text.startswith("{"):
        object_match = _JSON_OBJECT_RE.search(text)
        if object_match:
            text = object_match.group(0)

    return text


class AIProductCount(BaseModel):
    """A single product type and how many units of it were counted."""

    product_name: str
    counted_quantity: int


class AIShelfAnalysis(BaseModel):
    """Full result of analyzing one shelf image."""

    products: list[AIProductCount]


def analyze_shelf_image(image_bytes: bytes, mime_type: str) -> AIShelfAnalysis:
    """
    Send a shelf image to Gemma and return a structured product/quantity count.

    Retries up to MAX_ATTEMPTS times if the call fails or the model returns
    text that isn't clean JSON, cleaning the response (stripping code fences /
    surrounding prose) before each parse attempt.

    Raises:
        ValueError: if every attempt fails (callers/routers should catch this).
    """
    client = genai.Client()
    last_error: Exception | None = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    PROMPT,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=AIShelfAnalysis,
                    # Low temperature: this is a counting task, not a creative one.
                    temperature=0.1,
                ),
            )
        except Exception as exc:
            last_error = ValueError(f"Gemma API call failed (attempt {attempt}): {exc}")
            continue

        try:
            cleaned_text = _clean_json_text(response.text)
            return AIShelfAnalysis.model_validate_json(cleaned_text)
        except Exception as exc:
            last_error = ValueError(
                f"Failed to parse AI response into AIShelfAnalysis "
                f"(attempt {attempt}): {exc}"
            )
            continue

    raise last_error
