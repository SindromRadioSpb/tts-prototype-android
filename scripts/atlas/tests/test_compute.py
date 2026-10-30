"""Compute grammar core: parsing, evaluation, angle units, printed-number matching."""
import unittest

import atlas_compute as C


class EvaluateTest(unittest.TestCase):
    def test_belt_ratio(self):
        self.assertAlmostEqual(C.evaluate('d*(1-xi)/D', {'d': 100, 'xi': 0.02, 'D': 250}), 0.392)

    def test_power_and_sqrt(self):
        # π/2·350 + 2·√255625 = 549.779 + 1011.187
        L = C.evaluate('pi/2*(D+d)+2*sqrt(A^2+((D-d)/2)^2)', {'D': 250, 'd': 100, 'A': 500})
        self.assertAlmostEqual(L, 1560.966, places=3)

    def test_right_assoc_power_and_unary(self):
        self.assertEqual(C.evaluate('-2^2', {}), -4)
        self.assertEqual(C.evaluate('2^3^2', {}), 512)

    def test_constants_and_multiarg_functions(self):
        self.assertAlmostEqual(C.evaluate('ln(e)+log10(100)+pow(2,3)+min(4,1)+max(4,1)+abs(-2)', {}), 1 + 2 + 8 + 1 + 4 + 2)


class ErrorsTest(unittest.TestCase):
    def code(self, expr, bindings=None, unit=None):
        with self.assertRaises(C.ComputeError) as e:
            C.evaluate(expr, bindings or {}, unit)
        return e.exception.code

    def test_trig_requires_angle_unit(self):
        self.assertEqual(self.code('F*sin(alpha)', {'F': 10, 'alpha': 30}), 'ANGLE_UNIT_REQUIRED')

    def test_unknown_function_rejected(self):
        self.assertEqual(self.code('floor(x)', {'x': 1}), 'UNKNOWN_FUNCTION')
        self.assertEqual(self.code('__import__(x)', {'x': 1}), 'UNKNOWN_FUNCTION')

    def test_unbound_variable(self):
        self.assertEqual(self.code('a+b', {'a': 1}), 'UNKNOWN_VARIABLE')

    def test_syntax(self):
        self.assertEqual(self.code('2*(3+'), 'SYNTAX')
        self.assertEqual(self.code('2 3'), 'SYNTAX')
        self.assertEqual(self.code('a.b', {}), 'SYNTAX')

    def test_arity(self):
        self.assertEqual(self.code('sqrt(1,2)'), 'ARITY')
        self.assertEqual(self.code('atan2(1)', unit='deg'), 'ARITY')

    def test_domain(self):
        self.assertEqual(self.code('sqrt(-1)'), 'DOMAIN')
        self.assertEqual(self.code('ln(0)'), 'DOMAIN')
        self.assertEqual(self.code('1/0'), 'DOMAIN')

    def test_bad_angle_unit(self):
        self.assertEqual(self.code('sin(1)', unit='grad'), 'ANGLE_UNIT_REQUIRED')


class AngleTest(unittest.TestCase):
    def test_trig_degrees(self):
        self.assertAlmostEqual(C.evaluate('F*sin(alpha)', {'F': 10, 'alpha': 30}, 'deg'), 5.0)

    def test_trig_radians(self):
        self.assertAlmostEqual(C.evaluate('cos(pi)', {}, 'rad'), -1.0)

    def test_atan_returns_in_angle_unit(self):
        self.assertAlmostEqual(C.evaluate('atan(a/b)', {'a': 1, 'b': 1}, 'deg'), 45.0)
        self.assertAlmostEqual(C.evaluate('atan2(1,-1)', {}, 'deg'), 135.0)


class IntrospectionTest(unittest.TestCase):
    def test_variables_and_trig_flag(self):
        self.assertEqual(C.variables('x_in*cos(alpha)+pi'), {'x_in', 'alpha'})
        self.assertTrue(C.uses_trig('atan2(y,x)'))
        self.assertFalse(C.uses_trig('sqrt(x)+pi'))

    def test_parse_returns_reusable_tree(self):
        tree = C.parse('a+1')
        self.assertIsNotNone(tree)


class PrintedTest(unittest.TestCase):
    def test_matches_printed(self):
        self.assertTrue(C.matches_printed(2200.0, '2200'))
        self.assertTrue(C.matches_printed(0.0316, '0,0316'))
        self.assertFalse(C.matches_printed(2280.0, '2200'))
        self.assertTrue(C.matches_printed(0.03158, '0.0316'))
        self.assertTrue(C.matches_printed(-0.15, '−0.15'))

    def test_p289_source_inconsistency(self):
        value = C.evaluate('x*Fr+y*Fa', {'x': .56, 'Fr': 2000, 'y': 2, 'Fa': 600})
        self.assertFalse(C.matches_printed(value, '2200'))
        self.assertTrue(C.matches_printed(C.evaluate('x*Fr+y*Fa', {'x': .56, 'Fr': 2000, 'y': 1.8, 'Fa': 600}), '2200'))


if __name__ == '__main__':
    unittest.main()
