import unittest

from acquisition_service.receipts import (
    TokenError,
    issue_capability,
    verify_capability,
)


class ReceiptTests(unittest.TestCase):
    def test_capability_is_subject_origin_scope_and_expiry_bound(self):
        token = issue_capability(
            "k" * 32,
            subject="owner-1",
            origin="https://linguistpro.example",
            scopes=["resolve", "prepare", "stream"],
            now=1000,
            ttl_seconds=120,
            nonce="n-1",
        )
        payload = verify_capability(token, "k" * 32, origin="https://linguistpro.example",
                                    required_scope="prepare", now=1050)
        self.assertEqual(payload["sub"], "owner-1")
        with self.assertRaises(TokenError):
            verify_capability(token, "k" * 32, origin="https://evil.example",
                              required_scope="prepare", now=1050)
        with self.assertRaises(TokenError):
            verify_capability(token, "k" * 32, origin="https://linguistpro.example",
                              required_scope="admin", now=1050)
        with self.assertRaises(TokenError):
            verify_capability(token, "k" * 32, origin="https://linguistpro.example",
                              required_scope="prepare", now=1121)

    def test_tamper_fails_closed(self):
        token = issue_capability("k" * 32, subject="owner-1", origin="https://lp.example",
                                 scopes=["resolve"], now=1, ttl_seconds=60, nonce="n")
        with self.assertRaises(TokenError):
            verify_capability(token[:-1] + ("A" if token[-1] != "A" else "B"), "k" * 32,
                              origin="https://lp.example", required_scope="resolve", now=2)


if __name__ == "__main__":
    unittest.main()
