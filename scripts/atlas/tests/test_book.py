"""Book level: section map, per-section extraction summary, term candidates."""
import json
import os
import tempfile
import unittest

import atlas_book as B

SECTIONS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'atlas', 'a97002', 'sections.json'))


class SectionsTest(unittest.TestCase):
    def test_real_map_covers_every_page_once(self):
        data = B.load_sections(SECTIONS)
        pages = [p for s in data['sections'] for p in range(s['first'], s['last'] + 1)]
        self.assertEqual(pages, list(range(1, 565)))
        self.assertEqual(B.section_for_page(data, 197)['id'], 's09-belt')
        self.assertEqual(B.section_for_page(data, 485)['id'], 's25-size-tolerance')

    def test_gap_or_overlap_rejected(self):
        bad = {'page_count': 10, 'sections': [{'id': 'a', 'first': 1, 'last': 4}, {'id': 'b', 'first': 6, 'last': 10}]}
        path = os.path.join(tempfile.mkdtemp(), 's.json')
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(bad, fh)
        with self.assertRaises(ValueError):
            B.load_sections(path)


def write_pack(root, sid, objs):
    d = os.path.join(root, sid)
    os.makedirs(d)
    with open(os.path.join(d, 'pages.jsonl'), 'w', encoding='utf-8') as fh:
        for o in objs:
            fh.write(json.dumps(o, ensure_ascii=False) + '\n')
    return d


class CandidatesTest(unittest.TestCase):
    def test_candidates_from_headings_symbols_captions_and_frequent_phrases(self):
        root = tempfile.mkdtemp()
        blocks = [{'type': 'block', 'id': f'a97002:p{p}:b001', 'page': p, 'he_raw': 'שימוש בגלגל מניע קטן וגלגל מניע', 'kind_guess': 'prose'}
                  for p in (197, 198, 199)]
        write_pack(root, 's09-belt', blocks + [
            {'type': 'block', 'id': 'a97002:p197:b002', 'page': 197, 'he_raw': 'יחס תמסורת', 'kind_guess': 'heading'},
            {'type': 'block', 'id': 'a97002:p197:b003', 'page': 197, 'he_raw': 'איור 79 - תמסורת רצועה', 'kind_guess': 'caption'},
            {'type': 'symbol', 'id': 'a97002:p198:st1:s01', 'page': 198, 'symbol_raw': 'd', 'description_he_raw': 'קוטר גלגל מניע', 'unit_raw': 'mm'}])
        cands = B.term_candidates(root, ['s09-belt'], min_count=4)
        by = {c['he']: c for c in cands}
        self.assertIn('יחס תמסורת', by)                 # heading
        self.assertIn('תמסורת רצועה', by)              # caption without 'איור N -'
        self.assertIn('קוטר גלגל מניע', by)            # symbol description
        self.assertIn('גלגל מניע', by)                 # phrase seen 6 times
        self.assertEqual(by['גלגל מניע']['count'], 6)
        self.assertEqual(by['גלגל מניע']['pages'], [197, 198, 199])
        self.assertTrue(by['גלגל מניע']['context'])
        self.assertNotIn('שימוש', by)                  # single common word below threshold / not a phrase source
        for c in cands:
            self.assertRegex(c['id'], r'^c[0-9]{4}$')


class SummaryTest(unittest.TestCase):
    def test_summary_flags_suspicious_pages(self):
        root = tempfile.mkdtemp()
        write_pack(root, 's01-intro', [
            {'type': 'page', 'id': 'a97002:p4', 'page': 4, 'has_text_layer': True},
            {'type': 'page', 'id': 'a97002:p5', 'page': 5, 'has_text_layer': False},
            {'type': 'block', 'id': 'a97002:p4:b001', 'page': 4, 'he_raw': 'מבוא', 'kind_guess': 'heading'},
            {'type': 'figure', 'id': 'a97002:p5:img01', 'page': 5, 'number': None}])
        with open(os.path.join(root, 's01-intro', 'manifest.json'), 'w', encoding='utf-8') as fh:
            json.dump({'warnings': ['caption_without_image:4:1']}, fh)
        row = B.summarize_section(os.path.join(root, 's01-intro'))
        self.assertEqual(row['pages'], 2)
        self.assertEqual(row['blocks'], 1)
        self.assertEqual(row['image_only_pages'], [5])
        self.assertEqual(row['warnings'], 1)


if __name__ == '__main__':
    unittest.main()
