"""LaTeX -> MathML at build time (KaTeX via node), so the reader needs no maths library."""
import json
import os
import subprocess
import tempfile
import unittest

SCRIPT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'render-math.cjs'))


class RenderMathTest(unittest.TestCase):
    def test_mathml_and_errors(self):
        d = tempfile.mkdtemp()
        src, out = os.path.join(d, 'in.json'), os.path.join(d, 'out.json')
        with open(src, 'w', encoding='utf-8') as fh:
            json.dump({'f1': 'i = \\frac{n_{out}}{n_{in}}', 'f2': 'F_x = F\\cdot\\cos\\alpha^{\\circ}', 'bad': '\\frac{1}{'}, fh)
        result = subprocess.run(['node', SCRIPT, src, out], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        with open(out, encoding='utf-8') as fh:
            got = json.load(fh)
        self.assertTrue(got['f1']['mathml'].startswith('<math'))
        self.assertIn('<mfrac>', got['f1']['mathml'])
        self.assertIn('display="block"', got['f1']['mathml'])
        self.assertIn('cos', got['f2']['mathml'])
        self.assertIsNone(got['bad']['mathml'])
        self.assertTrue(got['bad']['error'])


if __name__ == '__main__':
    unittest.main()
