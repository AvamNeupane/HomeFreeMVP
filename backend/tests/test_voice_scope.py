"""
Scope guardrails: this is an organizing product, not an interior design
one.

The persona used to describe itself as "a professional home organizer and
interior decorator" and was explicitly told to "flag ... when a space could
look better even if it's already organized", so the AI would push a style
refresh at someone who had only asked to be tidy. These tests pin the line
so it can't drift back in through a prompt edit.

The line is function, not taste: visual choices that serve an organizing
system (matching hangers, labelled bins, category-then-colour) are kept
deliberately and asserted below, so "remove all design language" can't be
over-applied and strip real organizing technique.
"""

import re

import pytest

from natasha_voice import (
    CHAT_SYSTEM_PROMPT_TEMPLATE,
    NATASHA_PERSONA,
    NEUTRAL_VOICE,
    ORGANIZING_SCOPE,
    voice_for_tier,
)

ALL_PROMPTS = {
    'NATASHA_PERSONA': NATASHA_PERSONA,
    'NEUTRAL_VOICE': NEUTRAL_VOICE,
    'CHAT_SYSTEM_PROMPT_TEMPLATE': CHAT_SYSTEM_PROMPT_TEMPLATE,
}

# Phrases that would put the AI back in the decorating business. Checked
# case-insensitively against every prompt fragment the model actually sees.
BANNED = [
    'interior decorator',
    'interior-design',
    'interior design',
    'organizing/decorating',
    'style refresh',
    'style preferences',
    'aesthetic',
    'restyle',
    'visual style',
    'colour scheme',
    'color scheme',
]


# These prompts are hand-wrapped prose, so a banned phrase can straddle a
# line break ("matching\nhangers"). Collapse whitespace before matching.
def _flat(text):
    return re.sub(r'\s+', ' ', text).strip().lower()


def _affirmative_body(prompt):
    """
    The prompt with every sentence that FORBIDS something removed.

    A scope rule has to name what it rules out ("no paint or colour
    schemes", "Never ask about style"), so a blunt substring ban would flag
    the very lines doing the work. Only affirmative text is checked.
    """
    body = prompt.replace(ORGANIZING_SCOPE, '')
    kept = [
        sentence for sentence in re.split(r'(?<=[.:\n])', body)
        if not re.search(r"\b(never|not|no|don't|do not)\b", sentence, re.I)
    ]
    return _flat(' '.join(kept))


@pytest.mark.parametrize('name,prompt', sorted(ALL_PROMPTS.items()))
@pytest.mark.parametrize('phrase', BANNED)
def test_prompts_contain_no_decorating_language(name, prompt, phrase):
    body = _affirmative_body(prompt)
    assert phrase not in body, f"{name} reintroduces decorating language: {phrase!r}"


class TestScopeIsStatedToBothTiers:
    def test_paid_voice_carries_the_scope_rule(self):
        assert ORGANIZING_SCOPE in voice_for_tier('paid')

    def test_free_voice_carries_the_scope_rule(self):
        assert ORGANIZING_SCOPE in voice_for_tier('free')

    def test_scope_rule_names_what_is_out_of_bounds(self):
        scope = _flat(ORGANIZING_SCOPE)
        for out_of_scope in ('paint', 'artwork', 'furniture', 'not an interior decorator'):
            assert out_of_scope in scope


class TestOrganizingTechniqueIsKept:
    """
    The user's explicit call: visual choices in service of an organizing
    system stay. These are organizing technique, not decorating, and
    stripping them would make the advice worse.
    """

    @pytest.mark.parametrize('technique', [
        'matching hangers',
        'labeled bins',
        'category-then-color',
        'filed',
    ])
    def test_persona_still_teaches_real_technique(self, technique):
        assert technique in _flat(NATASHA_PERSONA)

    def test_scope_rule_explicitly_permits_system_serving_visuals(self):
        scope = _flat(ORGANIZING_SCOPE)
        assert 'matching hangers' in scope
        assert 'easy to find' in scope


class TestDefaultPathOptions:
    """
    Two of the three fallback directions used to be decorating ("Style
    Refresh" and a "Both" that meant declutter-plus-restyle). Every
    offered direction must now be an organizing one.
    """

    def test_no_default_path_option_is_a_decorating_direction(self, sqlite_app):
        for option in sqlite_app.DEFAULT_PATH_OPTIONS:
            blob = f"{option['key']} {option['label']} {option['description']}".lower()
            for phrase in ('style', 'look better', 'decor', 'aesthetic', 'beautiful'):
                assert phrase not in blob, f"{option['key']} is a decorating direction: {phrase!r}"

    def test_still_offers_a_real_choice(self, sqlite_app):
        assert len(sqlite_app.DEFAULT_PATH_OPTIONS) >= 2
        keys = {o['key'] for o in sqlite_app.DEFAULT_PATH_OPTIONS}
        assert 'declutter' in keys


class TestPrioritiesBlock:
    def test_priorities_block_no_longer_takes_a_visual_style(self, sqlite_app):
        # Signature change is the point: nothing can pass a style through.
        out = sqlite_app._format_priorities_block(['Maximize storage'])
        assert 'Maximize storage' in out
        assert 'visual style' not in out.lower()

    def test_empty_priorities_still_produce_a_usable_line(self, sqlite_app):
        out = sqlite_app._format_priorities_block(None)
        assert 'visual style' not in out.lower()
        assert out.strip()
