"""
products.py — pre-approved product catalog + deterministic candidate filtering.

Only products in PRODUCTS below are ever recommended. The recommendation
prompt (see app.py's select_matching_products) is only ever shown candidates
that already passed the hard filters here, and is never invited to invent an
outside product.

LINKS — READ THIS BEFORE CHANGING THEM
--------------------------------------
Each product's `slug` is the code from the source spreadsheet's own link,
`https://link.amazon/<slug>`. `link.amazon` is Amazon's real short-link
domain and every one of these 51 links resolves correctly, to amazon.ca,
carrying the affiliate tag `homefreeorg06-20`.

A previous version of this file assumed those slugs were ASINs, concluded
`link.amazon` was a placeholder domain, and rebuilt every URL as
`amazon.com/dp/<slug>`. They are not ASINs — they're 9 characters and mixed
case, where an ASIN is 10 and uppercase — so that produced three separate
regressions at once: every link 404'd, the affiliate tag was stripped (so
clicks earned nothing), and Canadian users were sent to the US store.

So: the short link is stored verbatim and used as-is. `asin` holds the real
10-character ASIN each short link resolves to, kept only so a canonical
amazon.ca URL can be rebuilt if the short-link service ever changes. Do not
"normalise" the short links away again.

DIMENSIONS
----------
`dims_cm` is (length, width, height) in cm, matching the app's L/W/H
convention, exactly as the source sheet listed them. ~13 products have
`dims_cm=None`: either no dimensions were given, the product is
adjustable/expandable rather than fixed-size, or it's a soft item with no
rigid footprint. Those are matched on relevance alone and never given a
fabricated size — see `candidates_for`.

TAGS
----
`rooms` is a hard gate: a product is only ever considered for a room in this
list (`ROOM_ANY` means every room). Velvet hangers should not surface in a
kitchen no matter how well they fit.

`keywords` are matched loosely against the AI-detected area name ("Top
Shelf", "Under Sink", "Junk Drawer") to boost relevance. They deliberately
do NOT gate — area names are free text generated per photo, so an unmatched
keyword means "no signal", not "wrong product".

`max_qty` caps computed quantities. A 90cm shelf fits ~20 spice jars, but
recommending "20x Spice Jars" reads as broken rather than helpful, so items
that make sense in multiples carry a sane ceiling and everything else stays
at 1.

No price data exists in the source sheet, so price is omitted rather than
guessed; the UI shows "View on Amazon" instead.
"""

from typing import Dict, List, Optional, Tuple

# Every link resolves to amazon.ca carrying this tag. Kept as a constant so
# the canonical-URL fallback below can't silently drop it.
AFFILIATE_TAG = "homefreeorg06-20"
AMAZON_DOMAIN = "www.amazon.ca"

# Sentinel for products that belong in any room (labels, drawer dividers).
ROOM_ANY = "any"

# Room keys as defined in frontend/constants/RoomConfig.js — kept in sync by
# hand; an unknown key here would silently make a product unreachable.
KNOWN_ROOMS = {
    "bedroom", "kitchen", "living_room", "bathroom", "dining_room",
    "office", "baby_room", "wardrobe", "garage", "storage_room",
}

# Each entry:
#   id        short stable slug used as the AI's pick token
#   name      display name (disambiguated where the sheet repeated a label)
#   slug      code from the source sheet's https://link.amazon/<slug> URL
#   asin      real 10-char ASIN the short link resolves to (fallback only)
#   icon      plain emoji shown in place of a product photo
#   dims_cm   (length, width, height) in cm, or None
#   note      factual context surfaced to the AI when dims_cm is None
#   rooms     hard room gate (see TAGS above)
#   keywords  soft relevance signals matched against the area name
#   max_qty   ceiling for computed quantity; 1 means never suggest multiples
PRODUCTS: List[Dict] = [
    {"id": "basket-label-clips", "name": "Basket Label Clips", "slug": "B09pOax2u", "asin": "B0DHRX4J9S", "icon": "🏷️", "dims_cm": None, "note": "clip-on labels for baskets/bins, sold as a pack, no fixed footprint", "rooms": [ROOM_ANY], "keywords": ["basket", "bin", "label", "shelf", "pantry"], "max_qty": 1},
    {"id": "waterproof-labels", "name": "Removable Waterproof Labels", "slug": "B0gTOVs5c", "asin": "B0C7YVNDRG", "icon": "🏷️", "dims_cm": None, "note": "100-piece label sheet, flat — no rigid footprint to fit-check", "rooms": [ROOM_ANY], "keywords": ["label", "bin", "jar", "container", "pantry"], "max_qty": 1},
    {"id": "bathroom-organizer", "name": "Bathroom Organizer", "slug": "B07DPT5Ns", "asin": "B0C3CNFTB9", "icon": "🧴", "dims_cm": (17.5, 30, 40), "note": None, "rooms": ["bathroom"], "keywords": ["counter", "countertop", "vanity", "sink", "shelf"], "max_qty": 2},
    {"id": "under-sink-organizer-wide", "name": "Under-Sink Organizer (Wide)", "slug": "B09hEpZYH", "asin": "B0F534NF54", "icon": "🧴", "dims_cm": (41, 30, 38.1), "note": None, "rooms": ["kitchen", "bathroom"], "keywords": ["under sink", "sink", "cabinet", "cupboard"], "max_qty": 2},
    {"id": "clear-bins-with-lids", "name": "Clear Storage Bins with Lids", "slug": "B052noQsI", "asin": "B09YHKP5FR", "icon": "📦", "dims_cm": (28.5, 19, 15), "note": None, "rooms": ["kitchen", "bathroom", "storage_room", "garage", "office", "wardrobe"], "keywords": ["shelf", "fridge", "pantry", "cabinet", "bin", "stackable"], "max_qty": 6},
    {"id": "under-sink-organizer-slim", "name": "Under-Sink Organizer (Slim)", "slug": "B09vAiFKx", "asin": "B0B3JJYJSS", "icon": "🧴", "dims_cm": (38, 20, 33), "note": None, "rooms": ["kitchen", "bathroom"], "keywords": ["under sink", "sink", "cabinet", "cupboard", "narrow"], "max_qty": 2},
    {"id": "shower-organizer", "name": "Shower Organizer", "slug": "B04sJAM5L", "asin": "B09MFDXZHJ", "icon": "🚿", "dims_cm": (10, 3, 5), "note": None, "rooms": ["bathroom"], "keywords": ["shower", "bath", "tub", "wall"], "max_qty": 2},
    {"id": "drawer-organizer-set", "name": "Drawer Organizer Set", "slug": "B0ajg6T7d", "asin": "B09M9LQYQD", "icon": "🗄️", "dims_cm": None, "note": "modular set of clear drawer trays, sizes vary within the set", "rooms": [ROOM_ANY], "keywords": ["drawer", "dresser", "desk"], "max_qty": 1},
    {"id": "clothing-storage-bags", "name": "Clothing Storage Bags", "slug": "B01HvC2q5", "asin": "B085ZV98JM", "icon": "👕", "dims_cm": (59, 40.6, 33), "note": None, "rooms": ["bedroom", "wardrobe", "storage_room"], "keywords": ["closet", "shelf", "seasonal", "clothes", "under bed"], "max_qty": 4},
    {"id": "fabric-drawers", "name": "Fabric Drawers", "slug": "B0gU2ozT6", "asin": "B0GVHQ653C", "icon": "🗄️", "dims_cm": (20, 18, 4), "note": None, "rooms": ["bedroom", "wardrobe", "storage_room", "baby_room", "living_room"], "keywords": ["closet", "shelf", "cube", "collapsible"], "max_qty": 6},
    {"id": "dresser-drawer-organizers", "name": "Dresser Drawer Organizers", "slug": "B09HBNPo4", "asin": "B0D4TDM9JM", "icon": "🗄️", "dims_cm": None, "note": "foldable fabric drawer dividers, sold as a set", "rooms": ["bedroom", "wardrobe", "baby_room"], "keywords": ["drawer", "dresser", "underwear", "socks"], "max_qty": 1},
    {"id": "closet-organizers", "name": "Organizers for Closet", "slug": "B0h4jvLjO", "asin": "B0CJQQPVXT", "icon": "👕", "dims_cm": (42, 28, 20), "note": None, "rooms": ["bedroom", "wardrobe", "storage_room", "baby_room"], "keywords": ["closet", "shelf", "bin"], "max_qty": 6},
    {"id": "hat-organizer", "name": "Hat Organizer", "slug": "B0iMpjx3f", "asin": "B0C4H3Z6K7", "icon": "👒", "dims_cm": None, "note": "hangs on a rod or door, no fixed footprint given", "rooms": ["bedroom", "wardrobe"], "keywords": ["closet", "hat", "hanging", "door", "rod"], "max_qty": 1},
    {"id": "drawer-jewelry-organizer", "name": "Drawer Jewelry Organizer", "slug": "B0988VXDm", "asin": "B0BXN9GFBW", "icon": "💍", "dims_cm": None, "note": "drawer insert tray, no fixed footprint given", "rooms": ["bedroom", "wardrobe"], "keywords": ["drawer", "jewelry", "dresser", "vanity"], "max_qty": 2},
    {"id": "sunglass-organizer", "name": "Sunglass Organizer", "slug": "B07yiidoL", "asin": "B09LR3L9FH", "icon": "🕶️", "dims_cm": (36, 17.7, 3), "note": None, "rooms": ["bedroom", "wardrobe", "living_room", "office"], "keywords": ["drawer", "sunglasses", "glasses", "dresser"], "max_qty": 1},
    {"id": "velvet-hangers", "name": "Velvet Hangers", "slug": "B09Oj3SO6", "asin": "B077BMY1KZ", "icon": "👔", "dims_cm": None, "note": "standard hangers sold in a pack, no fixed footprint applicable", "rooms": ["bedroom", "wardrobe"], "keywords": ["closet", "rod", "hanging", "clothes"], "max_qty": 1},
    {"id": "slim-plastic-hangers", "name": "Slim Plastic Hangers", "slug": "B00PTc06C", "asin": "B08563834J", "icon": "👔", "dims_cm": None, "note": "standard hangers sold in a pack, no fixed footprint applicable", "rooms": ["bedroom", "wardrobe"], "keywords": ["closet", "rod", "hanging", "clothes"], "max_qty": 1},
    {"id": "glass-food-jars", "name": "Glass Food Storage Jars", "slug": "B0isqtTZ0", "asin": "B0FB8X95V4", "icon": "🫙", "dims_cm": (8.2, 8.2, 24), "note": None, "rooms": ["kitchen", "dining_room"], "keywords": ["pantry", "shelf", "counter", "dry goods", "jar"], "max_qty": 6},
    {"id": "spice-glass-jars", "name": "Spice Glass Jars", "slug": "B0fpaKNUo", "asin": "B09TPMD4P8", "icon": "🫙", "dims_cm": (6.5, 6.5, 10.5), "note": None, "rooms": ["kitchen"], "keywords": ["spice", "drawer", "cabinet", "shelf", "rack"], "max_qty": 12},
    {"id": "clear-storage-bins-basic", "name": "Clear Storage Bins (Basic)", "slug": "B04xWGZYb", "asin": "B09C6HM41P", "icon": "📦", "dims_cm": (27.9, 20.3, 15.2), "note": None, "rooms": ["kitchen", "bathroom", "storage_room", "garage", "office", "wardrobe"], "keywords": ["shelf", "pantry", "bin", "cabinet"], "max_qty": 6},
    {"id": "food-storage-bag-organizer", "name": "Food Storage Bag Organizer", "slug": "B06qA3yFG", "asin": "B09Q19P3C5", "icon": "🍽️", "dims_cm": (31.8, 30, 31.8), "note": None, "rooms": ["kitchen"], "keywords": ["drawer", "cabinet", "pantry", "bags", "ziploc"], "max_qty": 1},
    {"id": "paper-towel-holder", "name": "Paper Towel Holder", "slug": "B0c295dHg", "asin": "B0921Y3SCW", "icon": "🧻", "dims_cm": None, "note": "countertop or wall-mounted stand, no fixed footprint given", "rooms": ["kitchen"], "keywords": ["counter", "countertop", "wall"], "max_qty": 1},
    {"id": "food-wrap-dispenser", "name": "Food Wrap Dispenser", "slug": "B0fxZUC4U", "asin": "B09SBCFJCJ", "icon": "🍽️", "dims_cm": (33, 21.5, 7.5), "note": None, "rooms": ["kitchen"], "keywords": ["drawer", "cabinet", "wrap", "foil"], "max_qty": 1},
    {"id": "utensil-organizer", "name": "Utensil Organizer", "slug": "B00vYH03Z", "asin": "B0D7D3N6J5", "icon": "🍴", "dims_cm": None, "note": "adjustable/expandable, width 30.5-43cm depending on setting, 40.5cm deep", "rooms": ["kitchen"], "keywords": ["drawer", "utensil", "cutlery", "silverware"], "max_qty": 1},
    {"id": "drawer-knife-organizer", "name": "Drawer Knife Organizer", "slug": "B0gCM95nG", "asin": "B082FXX1DV", "icon": "🔪", "dims_cm": (42.2, 31, 4.5), "note": None, "rooms": ["kitchen"], "keywords": ["drawer", "knife", "block"], "max_qty": 1},
    {"id": "over-door-pantry-organizer", "name": "Over-the-Door Pantry Organizer", "slug": "B01poykxZ", "asin": "B0B9RY9YMC", "icon": "🚪", "dims_cm": (14, 42, 161), "note": None, "rooms": ["kitchen", "bathroom", "storage_room", "bedroom"], "keywords": ["door", "pantry", "hanging", "back of door"], "max_qty": 1},
    {"id": "pull-out-drawers", "name": "Pull-Out Drawers", "slug": "B0czDAuVK", "asin": "B0DHTJC7D9", "icon": "🗄️", "dims_cm": None, "note": "adjustable slide-out cabinet drawer, depth adjustable 31.7-52cm", "rooms": ["kitchen", "bathroom"], "keywords": ["cabinet", "cupboard", "under sink", "slide", "deep"], "max_qty": 4},
    {"id": "tea-bag-organizer", "name": "Tea Bag Organizer", "slug": "B0c0Qd5zc", "asin": "B0BR58NG9V", "icon": "🍵", "dims_cm": (27.2, 18.2, 9.7), "note": None, "rooms": ["kitchen", "dining_room"], "keywords": ["drawer", "cabinet", "counter", "tea", "coffee"], "max_qty": 1},
    {"id": "food-wrap-shelf", "name": "Food Wrap Shelf", "slug": "B02rN9FNj", "asin": "B07T3L3TV1", "icon": "🍽️", "dims_cm": (8.8, 14.5, 23.4), "note": None, "rooms": ["kitchen"], "keywords": ["cabinet", "wrap", "shelf", "foil"], "max_qty": 2},
    {"id": "cooking-utensil-organizer", "name": "Cooking Utensil Organizer", "slug": "B07KRrhHo", "asin": "B0DFMFY8HN", "icon": "🍴", "dims_cm": None, "note": "adjustable/expandable, width 22-40cm depending on setting, 40cm deep, 5cm tall", "rooms": ["kitchen"], "keywords": ["drawer", "utensil", "cooking", "spatula"], "max_qty": 1},
    {"id": "pan-organizer", "name": "Pan Organizer", "slug": "B0bRJFpMN", "asin": "B07HFKD77Z", "icon": "🍳", "dims_cm": (20.3, 10.5, 12.2), "note": None, "rooms": ["kitchen"], "keywords": ["cabinet", "pan", "pot", "lid", "cupboard"], "max_qty": 3},
    {"id": "lazy-susan", "name": "Lazy Susan Turntable", "slug": "B01Jxe8HK", "asin": "B0036OQU2E", "icon": "🍽️", "dims_cm": None, "note": "round turntable, 45.7cm diameter, no height given", "rooms": ["kitchen", "bathroom", "dining_room"], "keywords": ["cabinet", "corner", "shelf", "turntable", "pantry"], "max_qty": 2},
    {"id": "plastic-food-containers-2l", "name": "Plastic Food Containers (2L)", "slug": "B08Og6Eo9", "asin": "B08TLY55JX", "icon": "🍱", "dims_cm": (29.2, 15.5, 27.4), "note": None, "rooms": ["kitchen"], "keywords": ["pantry", "shelf", "dry goods", "cereal", "flour"], "max_qty": 6},
    {"id": "plastic-food-containers-5-2l", "name": "Plastic Food Containers (5.2L)", "slug": "B0hfcXYPM", "asin": "B087G4T7VN", "icon": "🍱", "dims_cm": (18.6, 18.6, 22.6), "note": None, "rooms": ["kitchen"], "keywords": ["pantry", "shelf", "dry goods", "bulk"], "max_qty": 6},
    {"id": "cereal-keeper", "name": "Cereal Keeper", "slug": "B05WREHbC", "asin": "B00BEUDXTK", "icon": "🥣", "dims_cm": (33, 24.1, 12.1), "note": None, "rooms": ["kitchen"], "keywords": ["pantry", "shelf", "cereal", "cupboard"], "max_qty": 4},
    {"id": "cutlery-organizer", "name": "Cutlery Organizer", "slug": "B05Gg00Rh", "asin": "B09WZV9K5K", "icon": "🍴", "dims_cm": None, "note": "adjustable/expandable, width 32-55cm depending on setting, 43cm deep, 5cm tall", "rooms": ["kitchen", "dining_room"], "keywords": ["drawer", "cutlery", "silverware", "utensil"], "max_qty": 1},
    {"id": "spice-drawer-organizer", "name": "Spice Drawer Organizer", "slug": "B0i35VxLP", "asin": "B0BLLCV44K", "icon": "🧂", "dims_cm": (33, 12.7, 3.5), "note": None, "rooms": ["kitchen"], "keywords": ["drawer", "spice", "insert"], "max_qty": 3},
    {"id": "spice-jars", "name": "Spice Jars", "slug": "B048j0AbF", "asin": "B0B2LLV1FL", "icon": "🧂", "dims_cm": (4.5, 4.2, 10.5), "note": None, "rooms": ["kitchen"], "keywords": ["spice", "drawer", "shelf", "rack", "jar"], "max_qty": 12},
    {"id": "spice-cabinet-organizer-1", "name": "Spice Cabinet Organizer (Style 1)", "slug": "B01E0azIB", "asin": "B082JFN6ZP", "icon": "🧂", "dims_cm": (10.2, 25.4, 10.2), "note": None, "rooms": ["kitchen"], "keywords": ["cabinet", "spice", "shelf", "rack", "cupboard"], "max_qty": 3},
    {"id": "spice-cabinet-organizer-2", "name": "Spice Cabinet Organizer (Style 2)", "slug": "B0bDEJZic", "asin": "B0036OQU56", "icon": "🧂", "dims_cm": (8.9, 22.9, 38.1), "note": None, "rooms": ["kitchen"], "keywords": ["cabinet", "spice", "shelf", "rack", "tiered"], "max_qty": 3},
    {"id": "drawer-dividers", "name": "Drawer Dividers", "slug": "B01tJSs0j", "asin": "B08ZC9D6XJ", "icon": "🗄️", "dims_cm": None, "note": "each divider 43x6.8x5.5cm, adjustable to fit drawers 45-55cm long", "rooms": [ROOM_ANY], "keywords": ["drawer", "dresser", "divider", "desk"], "max_qty": 6},
    {"id": "glass-jar-1-gallon", "name": "Glass Jar Food Storage (1 Gallon)", "slug": "B05YQcnwH", "asin": "B01EIJ0P6W", "icon": "🫙", "dims_cm": (17.8, 17.8, 24.2), "note": None, "rooms": ["kitchen"], "keywords": ["pantry", "counter", "shelf", "bulk", "jar"], "max_qty": 4},
    {"id": "food-storage-containers", "name": "Food Storage Containers", "slug": "B0al6ZPf7", "asin": "B08TWH2QHV", "icon": "🍱", "dims_cm": (22, 8.5, 24), "note": None, "rooms": ["kitchen"], "keywords": ["pantry", "fridge", "shelf", "leftovers"], "max_qty": 6},
    {"id": "cord-organizer-appliances", "name": "Cord Organizer for Appliances", "slug": "B09NqXrzh", "asin": "B0CLXSTMM8", "icon": "🔌", "dims_cm": None, "note": "adhesive cord wrap, no fixed footprint given", "rooms": ["kitchen", "office", "living_room"], "keywords": ["counter", "cord", "cable", "appliance", "plug"], "max_qty": 4},
    {"id": "organizer-bins", "name": "Organizer Bins", "slug": "B05iWQ1cW", "asin": "B0BMFKGVXD", "icon": "📦", "dims_cm": (26.7, 18.3, 11.4), "note": None, "rooms": ["kitchen", "bathroom", "office", "storage_room", "wardrobe", "baby_room"], "keywords": ["shelf", "bin", "pantry", "cabinet", "basket"], "max_qty": 6},
    {"id": "storage-totes", "name": "Storage Totes", "slug": "B0bpgXH4O", "asin": "B0F1J1LHD6", "icon": "📦", "dims_cm": (65, 42.2, 33.8), "note": None, "rooms": ["storage_room", "garage", "bedroom", "wardrobe", "baby_room"], "keywords": ["floor", "shelf", "seasonal", "closet", "tote"], "max_qty": 4},
    {"id": "craft-storage-bin", "name": "Craft Storage Bin", "slug": "B0eqfMHdb", "asin": "B0BCK6TZ23", "icon": "🎨", "dims_cm": (40.5, 29.5, 18.5), "note": None, "rooms": ["office", "storage_room", "baby_room", "living_room"], "keywords": ["craft", "shelf", "supplies", "art", "toys"], "max_qty": 3},
    {"id": "wrapping-paper-storage", "name": "Wrapping Paper Storage", "slug": "B0dc67zkv", "asin": "B07KWBSS5T", "icon": "🎁", "dims_cm": (105, 36, 14), "note": None, "rooms": ["storage_room", "garage", "office", "wardrobe"], "keywords": ["closet", "under bed", "gift wrap", "long"], "max_qty": 1},
    {"id": "cable-management-box", "name": "Cable Management Box", "slug": "B06Zx2cjw", "asin": "B07Q2SK4JQ", "icon": "🔌", "dims_cm": (29.4, 11.4, 10.5), "note": None, "rooms": ["office", "living_room", "bedroom"], "keywords": ["desk", "cord", "cable", "floor", "power strip", "tv"], "max_qty": 2},
    {"id": "mesh-zippered-bags", "name": "Mesh Zippered Bags", "slug": "B02yanFw2", "asin": "B07VPVNRDR", "icon": "👜", "dims_cm": None, "note": "soft mesh bags sold as a pack, 34x24cm flat, no rigid height", "rooms": [ROOM_ANY], "keywords": ["travel", "drawer", "closet", "bag", "toys"], "max_qty": 1},
    {"id": "storage-bins-13qt", "name": "13-Quart Storage Bins", "slug": "B0ae8jmqX", "asin": "B00CQGTGZQ", "icon": "📦", "dims_cm": (41.9, 27.9, 17.3), "note": None, "rooms": ["storage_room", "garage", "wardrobe", "bedroom", "office", "baby_room"], "keywords": ["shelf", "closet", "bin", "stackable"], "max_qty": 6},
]


def product_link(product: Dict) -> str:
    """
    The link actually shown to users: the source sheet's own Amazon short
    link, used verbatim. It already resolves to amazon.ca and already
    carries the affiliate tag, so rewriting it can only lose information.
    """
    return f"https://link.amazon/{product['slug']}"


def canonical_link(product: Dict) -> str:
    """
    Fallback direct product URL, built from the resolved ASIN with the
    affiliate tag reattached. Not used for display today — it exists so
    there's a recovery path that still pays out if the short-link domain
    ever stops resolving.
    """
    return f"https://{AMAZON_DOMAIN}/dp/{product['asin']}?tag={AFFILIATE_TAG}"


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


def _how_many_fit(product_dims_cm: Tuple[float, float, float], space_dims_cm: Tuple[float, float, float]) -> int:
    """
    How many of this product fit side by side in the measured space, in
    whichever orientation packs more. Purely geometric — the caller is
    responsible for capping it to something a person would actually buy
    (see `max_qty`), because "20" is arithmetically right and useless.
    """
    p_l, p_w, p_h = product_dims_cm
    s_l, s_w, s_h = space_dims_cm
    if p_h is None or p_h > s_h + 1.0:
        return 0

    best = 0
    for length, width in ((p_l, p_w), (p_w, p_l)):
        if length <= 0 or width <= 0:
            continue
        across = int((s_l + 1.0) // length)
        deep = int((s_w + 1.0) // width)
        best = max(best, across * deep)
    return best


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


def _suits_room(product: Dict, room_key: Optional[str]) -> bool:
    """Hard room gate. An unknown/missing room key lets everything through
    rather than silently recommending nothing — a custom room the user
    typed in themselves shouldn't produce an empty shopping list."""
    rooms = product.get("rooms") or [ROOM_ANY]
    if ROOM_ANY in rooms:
        return True
    if not room_key or room_key not in KNOWN_ROOMS:
        return True
    return room_key in rooms


def _keyword_score(product: Dict, area_name: str) -> int:
    """Soft relevance signal: how many of the product's keywords appear in
    the AI-detected area name. Never gates — area names are free text, so
    zero matches means 'no signal', not 'wrong product'."""
    if not area_name:
        return 0
    haystack = area_name.lower()
    return sum(1 for kw in product.get("keywords", []) if kw in haystack)


def candidates_for(
    room_key: Optional[str],
    area_name: str,
    measurement: Optional[Dict],
) -> List[Dict]:
    """
    Deterministic pre-filter: every product that could legitimately be
    recommended for this specific area, best-scoring first.

    This replaces handing the whole catalog to the AI with a "[does NOT
    fit]" label attached and trusting it to obey. Dimensional fit and room
    suitability are now enforced in Python — a product that doesn't fit is
    removed, not merely annotated — so no prompt-following failure can put
    a 161cm over-door organizer inside a 30cm cabinet.

    Products with no dimensions are kept when a measurement exists: they're
    adjustable, soft-sided, or accessories where physical fit isn't the
    binding constraint, and excluding them would drop things like hangers
    and drawer dividers from every measured area. They're flagged
    `fit_checked: False` so the caller can be honest about it.

    Returns dicts of {product, fits_count, fit_checked, score}.
    """
    space = _best_measured_space(measurement)
    results = []

    for product in PRODUCTS:
        if not _suits_room(product, room_key):
            continue

        dims = product.get("dims_cm")
        has_dims = bool(dims) and all(d is not None for d in dims)
        fit_checked = False
        fits_count = 0

        if space and has_dims:
            if not _fits(dims, space):
                continue  # genuinely too big — removed, not labelled
            fit_checked = True
            fits_count = _how_many_fit(dims, space)

        keyword_score = _keyword_score(product, area_name)
        # Verified fit is worth more than a keyword hit: a product proven to
        # fit the actual measured space is a stronger signal than one whose
        # name happens to share a word with the area label.
        score = (3 if fit_checked else 0) + keyword_score
        results.append({
            "product": product,
            "fits_count": fits_count,
            "fit_checked": fit_checked,
            "score": score,
        })

    results.sort(key=lambda r: (-r["score"], r["product"]["name"]))
    return results


def suggested_quantity(candidate: Dict) -> int:
    """
    How many to recommend: how many physically fit, capped by the product's
    own `max_qty`. Without a measurement, or for an item that only ever
    makes sense as one (a paper towel holder, an over-door rack), this is 1.
    """
    product = candidate["product"]
    cap = int(product.get("max_qty", 1) or 1)
    if cap <= 1 or not candidate.get("fit_checked"):
        return 1
    return max(1, min(cap, candidate.get("fits_count", 1) or 1))


def build_candidate_context(candidates: List[Dict]) -> str:
    """
    Text block listing the already-filtered candidates for the AI to choose
    from. Everything here is known to suit the room and (where a
    measurement exists and the product has dimensions) known to fit, so the
    AI's only remaining job is judging genuine relevance to the plan.
    """
    lines = []
    for candidate in candidates:
        product = candidate["product"]
        dims = product.get("dims_cm")
        if dims and all(d is not None for d in dims):
            dims_str = f"{dims[0]:g}x{dims[1]:g}x{dims[2]:g} cm"
        else:
            dims_str = product.get("note") or "no fixed size"

        extras = []
        if candidate.get("fit_checked"):
            qty = suggested_quantity(candidate)
            extras.append(f"fits the measured space; up to {qty} recommended")
        elif not dims or not all(d is not None for d in dims):
            extras.append("size not fit-checked")
        suffix = f" [{'; '.join(extras)}]" if extras else ""
        lines.append(f"- {product['id']}: {product['name']} ({dims_str}){suffix}")
    return "\n".join(lines)


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
        "amazon_link": product_link(p),
        "reason": reason,
        "dims_cm": p["dims_cm"],
        "quantity": max(1, int(quantity or 1)),
    }
