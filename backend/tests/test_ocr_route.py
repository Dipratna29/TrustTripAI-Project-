"""Cloud OCR fallback endpoint: auth, configuration, validation, rate limits and provider errors (provider mocked)."""

import base64
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from config import Config
from routes import ocr_routes
from services.auth_tokens import issue_token

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PNG_B64 = base64.b64encode(PNG).decode()


def _provider(payload=None, exc=None):
    m = MagicMock()
    if exc:
        m.side_effect = exc
    else:
        resp = MagicMock()
        resp.json.return_value = payload
        resp.raise_for_status.return_value = None
        m.return_value = resp
    return m


class OcrRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.headers = {"Authorization": f"Bearer {issue_token(5, 'ravi')}"}
        ocr_routes.OCR_LIMITER.reset()
        self.key = patch.object(Config, "OCR_SPACE_API_KEY", "test-key")
        self.key.start()

    def tearDown(self):
        self.key.stop()

    def post(self, body, headers=None):
        return self.client.post("/ocr", json=body, headers=headers if headers is not None else self.headers)

    def test_requires_login(self):
        self.assertEqual(self.post({"image_base64": PNG_B64}, headers={}).status_code, 401)

    def test_not_configured_returns_503(self):
        with patch.object(Config, "OCR_SPACE_API_KEY", ""):
            self.assertEqual(self.post({"image_base64": PNG_B64}).status_code, 503)

    def test_rejects_empty_invalid_unsupported_and_large(self):
        self.assertEqual(self.post({}).status_code, 400)
        self.assertEqual(self.post({"image_base64": "not base64!!"}).status_code, 400)
        self.assertEqual(self.post({"image_base64": base64.b64encode(b"GIF89a....").decode()}).status_code, 400)
        big = base64.b64encode(b"\xff\xd8\xff" + b"\x00" * (3 * 1024 * 1024 + 1)).decode()
        self.assertEqual(self.post({"image_base64": big}).status_code, 413)

    def test_success_preserves_lines_and_maps_language(self):
        payload = {"IsErroredOnProcessing": False,
                   "ParsedResults": [{"ParsedText": "स्टेशन रोड\r\nStation Road\r\n"}]}
        provider = _provider(payload)
        with patch.object(ocr_routes.requests, "post", provider):
            res = self.post({"image_base64": f"data:image/png;base64,{PNG_B64}", "language": "hi"})
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["text"], "स्टेशन रोड\nStation Road")
        sent = provider.call_args.kwargs["data"]
        self.assertEqual(sent["language"], "hin")
        self.assertTrue(sent["base64Image"].startswith("data:image/png;base64,"))

    def test_no_text_returns_empty_not_fabricated(self):
        with patch.object(ocr_routes.requests, "post", _provider({"IsErroredOnProcessing": False, "ParsedResults": [{"ParsedText": ""}]})):
            body = self.post({"image_base64": PNG_B64}).get_json()
        self.assertEqual((body["text"], body["blocks"]), ("", []))

    def test_provider_failures(self):
        with patch.object(ocr_routes.requests, "post", _provider({"IsErroredOnProcessing": True, "ErrorMessage": ["bad"]})):
            self.assertEqual(self.post({"image_base64": PNG_B64}).status_code, 422)
        with patch.object(ocr_routes.requests, "post", _provider(exc=requests.Timeout())):
            self.assertEqual(self.post({"image_base64": PNG_B64}).status_code, 504)
        with patch.object(ocr_routes.requests, "post", _provider(exc=requests.ConnectionError())):
            self.assertEqual(self.post({"image_base64": PNG_B64}).status_code, 502)

    def test_rate_limited(self):
        with patch.object(ocr_routes.requests, "post", _provider({"IsErroredOnProcessing": False, "ParsedResults": []})):
            codes = [self.post({"image_base64": PNG_B64}).status_code for _ in range(21)]
        self.assertEqual(codes[:20], [200] * 20)
        self.assertEqual(codes[20], 429)


if __name__ == "__main__":
    unittest.main()
