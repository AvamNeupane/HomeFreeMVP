"""Pure-function tests for the PDF report's markdown-building helpers —
no Flask routes, no Gemini calls, just the formatting logic itself."""


class TestFormatProductsSummary:
    def test_includes_dimensions_and_quantity_when_present(self, sqlite_app):
        session_data = {
            'rooms': [{
                'areas': [{
                    'name': 'Closet',
                    'products': [{
                        'name': 'Stackable Bin',
                        'reason': 'Fits the top shelf and keeps loose items contained.',
                        'amazon_link': 'https://amazon.com/dp/example',
                        'dims_cm': [30, 20, 15],
                        'quantity': 3,
                    }],
                }],
            }],
        }
        out = sqlite_app.format_products_summary(session_data)
        assert '### Closet' in out
        assert '**Stackable Bin**' in out
        assert '30 × 20 × 15 cm' in out
        assert 'Recommended quantity: 3' in out
        assert '[Shop on Amazon](https://amazon.com/dp/example)' in out

    def test_no_products_anywhere_shows_fallback_line(self, sqlite_app):
        out = sqlite_app.format_products_summary({'rooms': [{'areas': [{'name': 'Closet', 'products': []}]}]})
        assert 'No products were matched during this session.' in out
        assert '###' not in out

    def test_omits_dimensions_line_for_a_no_fixed_size_product(self, sqlite_app):
        session_data = {'rooms': [{'areas': [{'name': 'Closet', 'products': [{
            'name': 'Adjustable Shelf Divider', 'reason': 'Flexible fit.',
            'amazon_link': 'https://amazon.com/dp/example2',
        }]}]}]}
        out = sqlite_app.format_products_summary(session_data)
        assert 'Dimensions:' not in out
        assert 'Recommended quantity:' not in out
        assert '**Adjustable Shelf Divider**' in out


class TestFormatStaticReportSections:
    def test_includes_all_expected_headings(self, sqlite_app):
        out = sqlite_app.format_static_report_sections({})
        for heading in [
            "## Don't Let Your Donations Become Clutter",
            '## Keep Going!',
            "## Don't Forget Your After Photos!",
            '## How Did It Go?',
            '## Ready for Your Next Space?',
        ]:
            assert heading in out

    def test_uses_support_email_env_override(self, sqlite_app, monkeypatch):
        monkeypatch.setenv('SUPPORT_EMAIL', 'help@example.com')
        out = sqlite_app.format_static_report_sections({})
        assert 'help@example.com' in out

    def test_falls_back_to_default_support_email(self, sqlite_app, monkeypatch):
        monkeypatch.delenv('SUPPORT_EMAIL', raising=False)
        out = sqlite_app.format_static_report_sections({})
        assert 'organizingapp@homefreeorganizing.ca' in out


class TestRenderInlineBold:
    def test_mid_sentence_bold_is_converted(self, sqlite_app):
        out = sqlite_app._render_inline_bold('Take them out of your home **as soon as possible.**')
        assert out == 'Take them out of your home <b>as soon as possible.</b>'

    def test_multiple_bold_spans_on_one_line(self, sqlite_app):
        out = sqlite_app._render_inline_bold('**First** and then **second**.')
        assert out == '<b>First</b> and then <b>second</b>.'

    def test_plain_text_is_unchanged(self, sqlite_app):
        assert sqlite_app._render_inline_bold('No bold markers here.') == 'No bold markers here.'
