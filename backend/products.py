"""
products.py — pre-approved product catalog + AI-driven semantic matching.

Only products in PRODUCTS below are ever recommended by name — the
recommendation prompt (see app.py's select_matching_products) is only ever
given this exact list to choose from, never invited to invent an outside
product.

CATALOG STATUS: built from a real 51-item Amazon spreadsheet (names, ASINs,
and dimensions as actually listed) — no fabricated products, dimensions, or
links. A few notes on how the raw sheet was interpreted:

  - Dimensions are (length_cm, width_cm, height_cm), matching the app's
    L/W/H measurement convention. Where the sheet gave letters (D/L/W/H)
    they were mapped directly; a few rows gave three bare numbers with no
    letters at all — confirmed by the source listing text (e.g. the cable
    management box's own description spells out "L/W/H<29.4x11.4x10.5cm")
    that L×W×H is the sheet's consistent default order.
  - ~13 products have `dims_cm=None`: either no dimensions were given at
    all (label clips, hangers, hat/jewelry/cord organizers, paper towel
    holder), the product is adjustable/expandable rather than fixed-size
    (utensil/cutlery/cooking-utensil organizers, pull-out drawers, drawer
    dividers), or it's a soft/flexible item with no rigid footprint (mesh
    zippered bags) or missing a dimension entirely (lazy susan has a
    diameter but no listed height). These are matched on relevance alone —
    see select_matching_products in app.py — never given a fabricated size.
  - Two products were both labeled "Under sink organizer" with different
    dimensions; disambiguated below as (Wide)/(Slim) by their actual
    relative size, not an invented feature.
  - No price data exists in the source sheet — price is intentionally
    omitted from every entry rather than guessed; the UI shows "View on
    Amazon" instead of a price.
  - Links were given as https://link.amazon/{ASIN} (not a real amazon.com
    domain). The ASIN is real, so entries store just the `asin` and the
    real product-page URL is built on demand — see _asin_link below.
"""

from typing import Dict, List, Optional, Tuple

# Each entry:
#   id        short stable slug
#   name      display name (disambiguated where the source sheet repeated
#             a label)
#   asin      real Amazon ASIN extracted from the source link
#   icon      a plain emoji shown in place of a (currently unverifiable)
#             product photo — see CATALOG STATUS above
#   dims_cm   (length, width, height) in cm, or None — see CATALOG STATUS
#   note      short factual context surfaced to the AI when dims_cm is None
#             (e.g. an adjustable range) — never shown to the user as a spec
PRODUCTS: List[Dict] = [
    {"id": "basket-label-clips", "name": "Basket Label Clips", "asin": "B09pOax2u", "icon": "🏷️", "dims_cm": None, "note": "small clip-on labels for baskets/bins, no fixed footprint"},
    {"id": "waterproof-labels", "name": "Removable Waterproof Labels", "asin": "B0gTOVs5c", "icon": "🏷️", "dims_cm": None, "note": "10x15cm label sheet, flat — no rigid footprint to fit-check"},
    {"id": "bathroom-organizer", "name": "Bathroom Organizer", "asin": "B07DPT5Ns", "icon": "🧴", "dims_cm": (17.5, 30, 40), "note": None},
    {"id": "under-sink-organizer-wide", "name": "Under-Sink Organizer (Wide)", "asin": "B09hEpZYH", "icon": "🧴", "dims_cm": (41, 30, 38.1), "note": None},
    {"id": "clear-bins-with-lids", "name": "Clear Storage Bins with Lids", "asin": "B052noQsI", "icon": "📦", "dims_cm": (28.5, 19, 15), "note": None},
    {"id": "under-sink-organizer-slim", "name": "Under-Sink Organizer (Slim)", "asin": "B09vAiFKx", "icon": "🧴", "dims_cm": (38, 20, 33), "note": None},
    {"id": "shower-organizer", "name": "Shower Organizer", "asin": "B04sJAM5L", "icon": "🚿", "dims_cm": (10, 3, 5), "note": None},
    {"id": "drawer-organizer-set", "name": "Drawer Organizer Set", "asin": "B0ajg6T7d", "icon": "🗄️", "dims_cm": None, "note": "modular drawer organizer set, no fixed footprint given"},
    {"id": "clothing-storage-bags", "name": "Clothing Storage Bags", "asin": "B01HvC2q5", "icon": "👕", "dims_cm": (59, 40.6, 33), "note": None},
    {"id": "fabric-drawers", "name": "Fabric Drawers", "asin": "B0gU2ozT6", "icon": "🗄️", "dims_cm": (20, 18, 4), "note": None},
    {"id": "dresser-drawer-organizers", "name": "Dresser Drawer Organizers", "asin": "B09HBNPo4", "icon": "🗄️", "dims_cm": None, "note": "no fixed footprint given"},
    {"id": "closet-organizers", "name": "Organizers for Closet", "asin": "B0h4jvLjO", "icon": "👕", "dims_cm": (42, 28, 20), "note": None},
    {"id": "hat-organizer", "name": "Hat Organizer", "asin": "B0iMpjx3f", "icon": "👒", "dims_cm": None, "note": "hangs/mounts, no fixed footprint given"},
    {"id": "drawer-jewelry-organizer", "name": "Drawer Jewelry Organizer", "asin": "B0988VXDm", "icon": "💍", "dims_cm": None, "note": "no fixed footprint given"},
    {"id": "sunglass-organizer", "name": "Sunglass Organizer", "asin": "B07yiidoL", "icon": "🕶️", "dims_cm": (36, 17.7, 3), "note": None},
    {"id": "velvet-hangers", "name": "Velvet Hangers", "asin": "B09Oj3SO6", "icon": "👔", "dims_cm": None, "note": "standard hangers, no fixed footprint applicable"},
    {"id": "slim-plastic-hangers", "name": "Slim Plastic Hangers", "asin": "B00PTc06C", "icon": "👔", "dims_cm": None, "note": "standard hangers, no fixed footprint applicable"},
    {"id": "glass-food-jars", "name": "Glass Food Storage Jars", "asin": "B0isqtTZ0", "icon": "🫙", "dims_cm": (8.2, 8.2, 24), "note": None},
    {"id": "spice-glass-jars", "name": "Spice Glass Jars", "asin": "B0fpaKNUo", "icon": "🫙", "dims_cm": (6.5, 6.5, 10.5), "note": None},
    {"id": "clear-storage-bins-basic", "name": "Clear Storage Bins (Basic)", "asin": "B04xWGZYb", "icon": "📦", "dims_cm": (27.9, 20.3, 15.2), "note": None},
    {"id": "food-storage-bag-organizer", "name": "Food Storage Bag Organizer", "asin": "B06qA3yFG", "icon": "🍽️", "dims_cm": (31.8, 30, 31.8), "note": None},
    {"id": "paper-towel-holder", "name": "Paper Towel Holder", "asin": "B0c295dHg", "icon": "🧻", "dims_cm": None, "note": "no fixed footprint given"},
    {"id": "food-wrap-dispenser", "name": "Food Wrap Dispenser", "asin": "B0fxZUC4U", "icon": "🍽️", "dims_cm": (33, 21.5, 7.5), "note": None},
    {"id": "utensil-organizer", "name": "Utensil Organizer", "asin": "B00vYH03Z", "icon": "🍴", "dims_cm": None, "note": "adjustable/expandable, width 30.5-43cm depending on setting, no fixed height given"},
    {"id": "drawer-knife-organizer", "name": "Drawer Knife Organizer", "asin": "B0gCM95nG", "icon": "🔪", "dims_cm": (42.2, 31, 4.5), "note": None},
    {"id": "over-door-pantry-organizer", "name": "Over-the-Door Pantry Organizer", "asin": "B01poykxZ", "icon": "🚪", "dims_cm": (14, 42, 161), "note": None},
    {"id": "pull-out-drawers", "name": "Pull-Out Drawers", "asin": "B0czDAuVK", "icon": "🗄️", "dims_cm": None, "note": "adjustable slide-out drawer, depth adjustable 31.7-52cm"},
    {"id": "tea-bag-organizer", "name": "Tea Bag Organizer", "asin": "B0c0Qd5zc", "icon": "🍵", "dims_cm": (27.2, 18.2, 9.7), "note": None},
    {"id": "food-wrap-shelf", "name": "Food Wrap Shelf", "asin": "B02rN9FNj", "icon": "🍽️", "dims_cm": (8.8, 14.5, 23.4), "note": None},
    {"id": "cooking-utensil-organizer", "name": "Cooking Utensil Organizer", "asin": "B07KRrhHo", "icon": "🍴", "dims_cm": None, "note": "adjustable/expandable, width 22-40cm depending on setting"},
    {"id": "pan-organizer", "name": "Pan Organizer", "asin": "B0bRJFpMN", "icon": "🍳", "dims_cm": (20.3, 10.5, 12.2), "note": None},
    {"id": "lazy-susan", "name": "Lazy Susan Turntable", "asin": "B01Jxe8HK", "icon": "🍽️", "dims_cm": None, "note": "round turntable, 45.7cm diameter, no height given"},
    {"id": "plastic-food-containers-2l", "name": "Plastic Food Containers (2L)", "asin": "B08Og6Eo9", "icon": "🍱", "dims_cm": (29.2, 15.5, 27.4), "note": None},
    {"id": "plastic-food-containers-5-2l", "name": "Plastic Food Containers (5.2L)", "asin": "B0hfcXYPM", "icon": "🍱", "dims_cm": (18.6, 18.6, 22.6), "note": None},
    {"id": "cereal-keeper", "name": "Cereal Keeper", "asin": "B05WREHbC", "icon": "🥣", "dims_cm": (33, 24.1, 12.1), "note": None},
    {"id": "cutlery-organizer", "name": "Cutlery Organizer", "asin": "B05Gg00Rh", "icon": "🍴", "dims_cm": None, "note": "adjustable/expandable, width 32-55cm depending on setting, depth 43cm, height 5cm"},
    {"id": "spice-drawer-organizer", "name": "Spice Drawer Organizer", "asin": "B0i35VxLP", "icon": "🧂", "dims_cm": (33, 12.7, 3.5), "note": None},
    {"id": "spice-jars", "name": "Spice Jars", "asin": "B048j0AbF", "icon": "🧂", "dims_cm": (4.5, 4.2, 10.5), "note": None},
    {"id": "spice-cabinet-organizer-1", "name": "Spice Cabinet Organizer (Style 1)", "asin": "B01E0azIB", "icon": "🧂", "dims_cm": (10.2, 25.4, 10.2), "note": None},
    {"id": "spice-cabinet-organizer-2", "name": "Spice Cabinet Organizer (Style 2)", "asin": "B0bDEJZic", "icon": "🧂", "dims_cm": (8.9, 22.9, 38.1), "note": None},
    {"id": "drawer-dividers", "name": "Drawer Dividers", "asin": "B01tJSs0j", "icon": "🗄️", "dims_cm": None, "note": "each divider 43x6.8x5.5cm, adjustable to fit drawers 45-55cm long"},
    {"id": "glass-jar-1-gallon", "name": "Glass Jar Food Storage (1 Gallon)", "asin": "B05YQcnwH", "icon": "🫙", "dims_cm": (17.8, 17.8, 24.2), "note": None},
    {"id": "food-storage-containers", "name": "Food Storage Containers", "asin": "B0al6ZPf7", "icon": "🍱", "dims_cm": (22, 8.5, 24), "note": None},
    {"id": "cord-organizer-appliances", "name": "Cord Organizer for Appliances", "asin": "B09NqXrzh", "icon": "🔌", "dims_cm": None, "note": "no fixed footprint given"},
    {"id": "organizer-bins", "name": "Organizer Bins", "asin": "B05iWQ1cW", "icon": "📦", "dims_cm": (26.7, 18.3, 11.4), "note": None},
    {"id": "storage-totes", "name": "Storage Totes", "asin": "B0bpgXH4O", "icon": "📦", "dims_cm": (65, 42.2, 33.8), "note": None},
    {"id": "craft-storage-bin", "name": "Craft Storage Bin", "asin": "B0eqfMHdb", "icon": "🎨", "dims_cm": (40.5, 29.5, 18.5), "note": None},
    {"id": "wrapping-paper-storage", "name": "Wrapping Paper Storage", "asin": "B0dc67zkv", "icon": "🎁", "dims_cm": (105, 36, 14), "note": None},
    {"id": "cable-management-box", "name": "Cable Management Box", "asin": "B06Zx2cjw", "icon": "🔌", "dims_cm": (29.4, 11.4, 10.5), "note": None},
    {"id": "mesh-zippered-bags", "name": "Mesh Zippered Bags", "asin": "B02yanFw2", "icon": "👜", "dims_cm": None, "note": "soft mesh bag, 34x24cm flat, no rigid height"},
    {"id": "storage-bins-13qt", "name": "13-Quart Storage Bins", "asin": "B0ae8jmqX", "icon": "📦", "dims_cm": (41.9, 27.9, 17.3), "note": None},
]


def _asin_link(asin: str) -> str:
    """Real Amazon product-page link built from the ASIN — the source
    sheet's own links used a placeholder https://link.amazon/ domain."""
    return f"https://www.amazon.com/dp/{asin}"


def _to_cm(value: float, unit: str) -> float:
    return value * 2.54 if unit == "in" else value


def _fits(product_dims_cm: Tuple[float, float, float], space_dims_cm: Tuple[float, float, float], tolerance_cm: float = 1.0) -> bool:
    """True if the product fits inside the space in at least one orientation."""
    p_l, p_w, p_h = product_dims_cm
    s_l, s_w, s_h = space_dims_cm

    if p_h is None or p_h > s_h + tolerance_cm:
        return False

    orientation_a = p_l <= s_l + tolerance_cm and p_w <= s_w + tolerance_cm
    orientation_b = p_w <= s_l + tolerance_cm and p_l <= s_w + tolerance_cm
    return orientation_a or orientation_b


def _best_measured_space(measurement: Optional[Dict]) -> Optional[Tuple[float, float, float]]:
    """
    Extracts the largest shelf profile's (length, width, height) in cm from
    a saved measurement record, preferring inner_* clearance dims when
    present. None if there's no usable (complete, unskipped) measurement.
    """
    if not measurement or measurement.get("skipped"):
        return None
    unit = measurement.get("unit", "in")
    profiles = []
    for profile in measurement.get("shelf_profiles", []):
        try:
            l_key = "inner_length" if "inner_length" in profile else "length"
            w_key = "inner_width" if "inner_width" in profile else "width"
            h_key = "inner_height" if "inner_height" in profile else "height"
            l = _to_cm(float(profile[l_key]), unit)
            w = _to_cm(float(profile[w_key]), unit)
            h = _to_cm(float(profile[h_key]), unit)
            profiles.append((l, w, h))
        except (KeyError, TypeError, ValueError):
            continue
    if not profiles:
        return None
    return max(profiles, key=lambda s: s[0] * s[1] * s[2])


def build_candidate_context(measurement: Optional[Dict]) -> str:
    """
    Text block listing every catalog product with its real dimensions (or
    its adjustable/no-fixed-size note) and, when a measurement was taken,
    whether it numerically fits — grounding for the AI to pick from in
    select_matching_products (app.py). No product is ever left out of this
    list, so a genuinely relevant catalog item can never be missed just
    because it didn't happen to have a fixed size.
    """
    space = _best_measured_space(measurement)
    lines = []
    for p in PRODUCTS:
        dims = p["dims_cm"]
        if dims and all(d is not None for d in dims):
            dims_str = f"{dims[0]}×{dims[1]}×{dims[2]} cm"
            fit_str = ""
            if space:
                fit_str = " [FITS the measured space]" if _fits(dims, space) else " [does NOT fit the measured space]"
        else:
            dims_str = p.get("note") or "no fixed size"
            fit_str = ""
        lines.append(f"- {p['id']}: {p['name']} ({dims_str}){fit_str}")
    return '\n'.join(lines)


def get_product(product_id: str) -> Optional[Dict]:
    return next((p for p in PRODUCTS if p["id"] == product_id), None)


def build_product_entry(product_id: str, reason: str, quantity: int = 1) -> Optional[Dict]:
    """Turns one AI pick {id, reason, quantity} into the display dict the frontend expects."""
    p = get_product(product_id)
    if not p:
        return None
    return {
        "id": p["id"],
        "name": p["name"],
        "icon": p["icon"],
        "amazon_link": _asin_link(p["asin"]),
        "reason": reason,
        "dims_cm": p["dims_cm"],
        "quantity": max(1, int(quantity or 1)),
    }
