"""
products.py — starter product catalog + measurement-based matching.

This gives RoomScan AI real product recommendations instead of just text
advice. The core idea:

  1. Each product has real-world dimensions (L x W x H, in cm).
  2. When the user has measured their space (see MeasureSpaceScreen /
     /area/measurements), we know the shelf/drawer/cubby dimensions they're
     shopping for.
  3. find_matching_products() only recommends products that will actually
     FIT — the product doesn't need to be an exact match, just smaller than
     or equal to the available space (with a little breathing room so
     nothing recommended is a snug/impossible squeeze).

IMPORTANT — this is a STARTER catalog, not a live Amazon feed:
  - Prices, dimensions, and image URLs below are reasonable placeholders
    for common organizing products. Swap in real ASINs/images/prices before
    shipping (e.g. via the Amazon Product Advertising API), or expand this
    list with your own SKUs.
  - Per-product deep links aren't available without real ASINs, so every
    product currently links to one of the two storefront links you
    provided, chosen by category (kitchen vs. closet). Once you have real
    ASINs, replace `amazon_link` per-product with a proper affiliate
    product link (and per-product "Add to Cart" becomes possible via the
    Amazon `addToCart` URL scheme: 
    https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=...&Quantity.1=1&tag=YOURTAG
"""

from typing import Dict, List, Optional

# Your affiliate storefronts, used as the link for every product in that
# category until per-product ASIN links are wired in.
AFFILIATE_LINKS = {
    "kitchen": "https://a.co/0j6uGHGE",
    "closet": "https://a.co/0h2hBkLQ",
}

# Room types that map to each product category. Extend as you add more
# ROOM_TYPES on the frontend (constants/RoomConfig.js).
KITCHEN_ROOM_TYPES = {"kitchen", "pantry"}


def category_for_room(room_type: Optional[str]) -> str:
    """Map a room_type string to a product category ('kitchen' or 'closet')."""
    if room_type and room_type.lower() in KITCHEN_ROOM_TYPES:
        return "kitchen"
    return "closet"


# Each product's dims are (length_cm, width_cm, height_cm) — the same
# L x W x H convention used in the app's measurement flow.
PRODUCTS: List[Dict] = [
    # ---- Kitchen ----
    {
        "id": "kit-bin-clear-40",
        "name": "Clear Pantry Storage Bin (Large)",
        "category": "kitchen",
        "dims_cm": (40, 32, 17),
        "price": 24.99,
        "image_url": "https://images.unsplash.com/photo-1584720559969-89d80e5c7a0c?w=400&q=80",
        "base_reason": "grouping bulky snacks or produce into one grab-and-go zone",
    },
    {
        "id": "kit-bin-clear-30",
        "name": "Clear Pantry Storage Bin (Medium)",
        "category": "kitchen",
        "dims_cm": (30, 20, 12),
        "price": 16.99,
        "image_url": "https://images.unsplash.com/photo-1620732692235-c8ee7e5a3f9b?w=400&q=80",
        "base_reason": "corralling smaller packaged goods like snack bars or spice packets",
    },
    {
        "id": "kit-bin-clear-small",
        "name": "Clear Pantry Storage Bin (Small)",
        "category": "kitchen",
        "dims_cm": (20, 14, 10),
        "price": 11.99,
        "image_url": "https://images.unsplash.com/photo-1621275471769-e6aa344546d5?w=400&q=80",
        "base_reason": "keeping single-serve packets or baking add-ins from sliding around",
    },
    {
        "id": "kit-lazy-susan",
        "name": "Turntable Lazy Susan (Two-Tier)",
        "category": "kitchen",
        "dims_cm": (30, 30, 15),
        "price": 22.99,
        "image_url": "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=400&q=80",
        "base_reason": "making everything in a deep cabinet reachable with one spin, instead of digging to the back",
    },
    {
        "id": "kit-shelf-riser",
        "name": "Stackable Cabinet Shelf Riser",
        "category": "kitchen",
        "dims_cm": (35, 25, 9),
        "price": 19.99,
        "image_url": "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80",
        "base_reason": "doubling usable shelf space above shorter items without wasting the height",
    },
    {
        "id": "kit-drawer-divider",
        "name": "Expandable Drawer Divider Set",
        "category": "kitchen",
        "dims_cm": (45, 5, 8),
        "price": 14.99,
        "image_url": "https://images.unsplash.com/photo-1584622781564-1d987f7333c1?w=400&q=80",
        "base_reason": "keeping utensils in their own lane instead of one tangled pile",
    },
    {
        "id": "kit-can-organizer",
        "name": "3-Tier Can Organizer Rack",
        "category": "kitchen",
        "dims_cm": (33, 25, 13),
        "price": 17.99,
        "image_url": "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&q=80",
        "base_reason": "letting cans roll forward so the oldest one is always used first",
    },
    # ---- Closet ----
    {
        "id": "clo-bin-fabric-large",
        "name": "Fabric Storage Bin with Handles (Large)",
        "category": "closet",
        "dims_cm": (40, 30, 25),
        "price": 21.99,
        "image_url": "https://images.unsplash.com/photo-1600166898405-da9535204843?w=400&q=80",
        "base_reason": "giving bulky items like sweaters or blankets one dedicated, easy-to-pull-out home",
    },
    {
        "id": "clo-bin-clear-shoe",
        "name": "Clear Stackable Shoe Box",
        "category": "closet",
        "dims_cm": (33, 20, 13),
        "price": 9.99,
        "image_url": "https://images.unsplash.com/photo-1595341888016-a392ef81b7de?w=400&q=80",
        "base_reason": "keeping pairs visible and stackable instead of a jumbled shoe pile",
    },
    {
        "id": "clo-bin-canvas-small",
        "name": "Canvas Storage Cube (Small)",
        "category": "closet",
        "dims_cm": (25, 25, 25),
        "price": 12.99,
        "image_url": "https://images.unsplash.com/photo-1594620302200-9a762244a156?w=400&q=80",
        "base_reason": "grouping smaller accessories like scarves or belts into one visible cube",
    },
    {
        "id": "clo-drawer-organizer",
        "name": "Foldable Drawer Organizer Set",
        "category": "closet",
        "dims_cm": (30, 10, 8),
        "price": 15.99,
        "image_url": "https://images.unsplash.com/photo-1631889993959-41b4e9c6e3c5?w=400&q=80",
        "base_reason": "keeping folded shirts upright and visible instead of stacked and buried",
    },
    {
        "id": "clo-shelf-divider",
        "name": "Closet Shelf Divider (4-Pack)",
        "category": "closet",
        "dims_cm": (28, 20, 15),
        "price": 13.99,
        "image_url": "https://images.unsplash.com/photo-1558997519-83ea9252edf8?w=400&q=80",
        "base_reason": "stopping stacked sweaters from toppling into each other's piles",
    },
    {
        "id": "clo-hanging-organizer",
        "name": "6-Shelf Hanging Closet Organizer",
        "category": "closet",
        "dims_cm": (28, 28, 20),
        "price": 18.99,
        "image_url": "https://images.unsplash.com/photo-1558944351-3d5f9d4b4d1d?w=400&q=80",
        "base_reason": "adding vertical storage that hangs from the rod, using space that's currently empty air",
    },
    {
        "id": "clo-bin-clear-large",
        "name": "Clear Closet Storage Bin (X-Large)",
        "category": "closet",
        "dims_cm": (45, 35, 25),
        "price": 27.99,
        "image_url": "https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=400&q=80",
        "base_reason": "consolidating out-of-season clothing into one clearly labeled, stackable bin",
    },
]


def _to_cm(value: float, unit: str) -> float:
    return value * 2.54 if unit == "in" else value


def _fits(product_dims_cm, space_dims_cm, tolerance_cm: float = 1.0) -> bool:
    """
    True if the product fits inside the available space in at least one
    orientation (L/W can be swapped — a product can be rotated 90°, but its
    height still has to clear the shelf height as given).
    `tolerance_cm` gives a hair of slack so an exact-size fit isn't rejected
    for floating point reasons — the product must still be <= the space.
    """
    p_l, p_w, p_h = product_dims_cm
    s_l, s_w, s_h = space_dims_cm

    if p_h > s_h + tolerance_cm:
        return False

    orientation_a = p_l <= s_l + tolerance_cm and p_w <= s_w + tolerance_cm
    orientation_b = p_w <= s_l + tolerance_cm and p_l <= s_w + tolerance_cm
    return orientation_a or orientation_b


def _leftover_volume(product_dims_cm, space_dims_cm) -> float:
    """Lower is a tighter, more space-efficient fit."""
    p_vol = product_dims_cm[0] * product_dims_cm[1] * product_dims_cm[2]
    s_vol = space_dims_cm[0] * space_dims_cm[1] * space_dims_cm[2]
    return max(0.0, s_vol - p_vol)


def find_matching_products(
    measurement: Optional[Dict],
    category: str,
    limit: int = 4,
) -> List[Dict]:
    """
    Return up to `limit` products from `category` that fit the user's
    measured space, ranked by tightest reasonable fit. If no usable
    measurement was provided (or nothing fits), falls back to a general
    best-seller-style pick for the category so the user still gets
    suggestions — just flagged as unmeasured/general.

    Each returned dict has: id, name, price, image_url, amazon_link, reason,
    matched_size (the shelf profile it fits, or None), fit_note.
    """
    catalog = [p for p in PRODUCTS if p["category"] == category]
    if not catalog:
        return []

    profiles = []
    if measurement and not measurement.get("skipped"):
        unit = measurement.get("unit", "in")
        for profile in measurement.get("shelf_profiles", []):
            try:
                w = _to_cm(float(profile["width"]), unit)
                d = _to_cm(float(profile["depth"]), unit)
                h = _to_cm(float(profile["height"]), unit)
                profiles.append((w, d, h))
            except (KeyError, TypeError, ValueError):
                continue

    results = []

    if profiles:
        # Rank every (product, shelf profile) pair that fits, tightest first.
        scored = []
        for product in catalog:
            best_fit = None
            best_leftover = None
            for space in profiles:
                if _fits(product["dims_cm"], space):
                    leftover = _leftover_volume(product["dims_cm"], space)
                    if best_leftover is None or leftover < best_leftover:
                        best_leftover = leftover
                        best_fit = space
            if best_fit is not None:
                scored.append((best_leftover, product, best_fit))

        scored.sort(key=lambda x: x[0])

        for _, product, fit_space in scored[:limit]:
            results.append(_build_product_entry(product, fit_space=fit_space))

    if not results:
        # No measurements, or nothing measured happened to fit — fall back
        # to general picks so the user isn't left with nothing.
        for product in catalog[:limit]:
            results.append(_build_product_entry(product, fit_space=None))

    return results


def _build_product_entry(product: Dict, fit_space) -> Dict:
    l, w, h = product["dims_cm"]
    if fit_space:
        fit_note = (
            f"Fits in your measured space ({round(l)}×{round(w)}×{round(h)} cm product "
            f"vs. {round(fit_space[0])}×{round(fit_space[1])}×{round(fit_space[2])} cm available)."
        )
    else:
        fit_note = "General pick — take a measurement for this area to get exact-fit suggestions."

    return {
        "id": product["id"],
        "name": product["name"],
        "price": product["price"],
        "image_url": product["image_url"],
        "amazon_link": AFFILIATE_LINKS[product["category"]],
        "reason": product["base_reason"],
        "dims_cm": product["dims_cm"],
        "fit_note": fit_note,
    }