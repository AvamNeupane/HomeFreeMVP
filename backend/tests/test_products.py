"""
Catalog integrity + the deterministic half of product matching.

These are pure functions with no Flask app and no Gemini, so they're
imported directly rather than through a fixture. They cover the parts that
used to be left to prompt-following: room suitability, dimensional fit, and
quantity.
"""

import re

import pytest

from products import (
    AFFILIATE_TAG,
    KNOWN_ROOMS,
    PRODUCTS,
    ROOM_ANY,
    build_candidate_context,
    build_product_entry,
    canonical_link,
    candidates_for,
    get_product,
    product_link,
    suggested_quantity,
)


def _measurement(length, width, height, unit='cm'):
    return {'unit': unit, 'shelf_profiles': [{'length': length, 'width': width, 'height': height}]}


class TestCatalogIntegrity:
    def test_every_product_has_a_unique_id(self):
        ids = [p['id'] for p in PRODUCTS]
        assert len(ids) == len(set(ids))

    def test_every_asin_is_a_real_amazon_asin(self):
        # The bug this guards: the catalog once stored 9-character mixed-case
        # short-link slugs in the `asin` field and built product URLs from
        # them, producing 51 dead links. A real ASIN is 10 uppercase
        # alphanumerics.
        bad = [p['id'] for p in PRODUCTS if not re.fullmatch(r'[A-Z0-9]{10}', p['asin'])]
        assert bad == [], f"not valid ASINs: {bad}"

    def test_display_links_use_the_sheets_own_short_link(self):
        # Short links already resolve to amazon.ca carrying the affiliate
        # tag, so they're used verbatim; rewriting them lost the tag (and
        # therefore all commission) the last time someone tried.
        for p in PRODUCTS:
            assert product_link(p) == f"https://link.amazon/{p['slug']}"

    def test_canonical_fallback_keeps_the_affiliate_tag_and_stays_on_amazon_ca(self):
        for p in PRODUCTS:
            link = canonical_link(p)
            assert link.startswith('https://www.amazon.ca/dp/')
            assert f'tag={AFFILIATE_TAG}' in link

    def test_every_room_tag_is_a_real_room(self):
        for p in PRODUCTS:
            for room in p['rooms']:
                assert room == ROOM_ANY or room in KNOWN_ROOMS, f"{p['id']} -> {room}"

    def test_max_qty_is_sane(self):
        for p in PRODUCTS:
            assert 1 <= p['max_qty'] <= 12, p['id']


class TestRoomGating:
    def test_velvet_hangers_are_not_offered_for_a_kitchen(self):
        ids = [c['product']['id'] for c in candidates_for('kitchen', 'Cabinet', None)]
        assert 'velvet-hangers' not in ids

    def test_velvet_hangers_are_offered_for_a_wardrobe(self):
        ids = [c['product']['id'] for c in candidates_for('wardrobe', 'Hanging Rail', None)]
        assert 'velvet-hangers' in ids

    def test_universal_products_appear_in_every_room(self):
        for room in KNOWN_ROOMS:
            ids = [c['product']['id'] for c in candidates_for(room, 'Drawer', None)]
            assert 'drawer-dividers' in ids, room

    def test_an_unknown_custom_room_does_not_empty_the_catalog(self):
        # Users can name their own rooms; an unrecognised key must not
        # silently produce an empty shopping list.
        assert candidates_for('my_craft_nook', 'Shelf', None)


class TestDimensionalFiltering:
    def test_a_product_too_large_for_the_measured_space_is_removed(self):
        # The over-door organizer is 161cm tall; a 40cm-high shelf can't
        # take it. It must be absent, not merely labelled as not fitting.
        tiny_shelf = _measurement(90, 30, 40)
        ids = [c['product']['id'] for c in candidates_for('kitchen', 'Cabinet', tiny_shelf)]
        assert 'over-door-pantry-organizer' not in ids

    def test_a_product_that_fits_is_kept_and_marked_fit_checked(self):
        shelf = _measurement(90, 30, 40)
        spice = next(c for c in candidates_for('kitchen', 'Shelf', shelf) if c['product']['id'] == 'spice-jars')
        assert spice['fit_checked'] is True
        assert spice['fits_count'] > 0

    def test_products_without_dimensions_survive_a_measured_area(self):
        # Adjustable/soft/accessory items can't be fit-checked; excluding
        # them would drop hangers and dividers from every measured area.
        shelf = _measurement(90, 30, 40)
        found = next(c for c in candidates_for('kitchen', 'Drawer', shelf) if c['product']['id'] == 'cutlery-organizer')
        assert found['fit_checked'] is False

    def test_a_skipped_measurement_is_treated_as_no_measurement(self):
        skipped = {'skipped': True, 'unit': 'cm', 'shelf_profiles': []}
        ids = [c['product']['id'] for c in candidates_for('kitchen', 'Cabinet', skipped)]
        assert 'over-door-pantry-organizer' in ids

    def test_inches_are_converted_before_comparing(self):
        # 36x12x16in is roughly 91x30x40cm — the same shelf as above, so the
        # 161cm-tall over-door rack still must not fit.
        shelf_in = _measurement(36, 12, 16, unit='in')
        ids = [c['product']['id'] for c in candidates_for('kitchen', 'Cabinet', shelf_in)]
        assert 'over-door-pantry-organizer' not in ids
        assert 'spice-jars' in ids


class TestQuantity:
    def test_quantity_is_one_without_a_measurement(self):
        candidate = next(c for c in candidates_for('kitchen', 'Shelf', None) if c['product']['id'] == 'spice-jars')
        assert suggested_quantity(candidate) == 1

    def test_quantity_is_capped_at_the_products_max(self):
        # A 90x30cm shelf fits far more than 12 of a 4.5x4.2cm jar; the cap
        # is what stops the report recommending an absurd number.
        shelf = _measurement(90, 30, 40)
        candidate = next(c for c in candidates_for('kitchen', 'Shelf', shelf) if c['product']['id'] == 'spice-jars')
        assert candidate['fits_count'] > 12
        assert suggested_quantity(candidate) == 12

    def test_single_instance_products_never_suggest_multiples(self):
        shelf = _measurement(200, 60, 200)
        for candidate in candidates_for('kitchen', 'Cabinet', shelf):
            if candidate['product']['max_qty'] == 1:
                assert suggested_quantity(candidate) == 1


class TestCandidateContext:
    def test_context_only_lists_the_filtered_candidates(self):
        shelf = _measurement(90, 30, 40)
        candidates = candidates_for('kitchen', 'Shelf', shelf)
        context = build_candidate_context(candidates)
        assert 'over-door-pantry-organizer' not in context
        assert 'velvet-hangers' not in context
        for candidate in candidates:
            assert candidate['product']['id'] in context


class TestBuildProductEntry:
    def test_entry_uses_the_short_link(self):
        entry = build_product_entry('spice-jars', 'Keeps your spices visible.', 6)
        assert entry['amazon_link'] == product_link(get_product('spice-jars'))
        assert entry['quantity'] == 6

    def test_unknown_product_id_returns_none(self):
        assert build_product_entry('not-a-real-product', 'x', 1) is None
