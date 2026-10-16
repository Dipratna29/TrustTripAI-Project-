"""
Translation with a provider fallback chain so the travel translator keeps working
when one free provider is blocked or rate-limited:

1. Google (deep-translator)  - best quality, but Google often blocks server IPs (HTTP 429)
2. MyMemory public API       - free, no key, supports auto-detect
3. Groq LLM                  - used when GROQ_API_KEY is configured
"""

import logging
from functools import lru_cache

import requests
from deep_translator import GoogleTranslator

from config import Config

logger = logging.getLogger(__name__)

# Languages the mobile app offers; providers also accept other ISO codes.
LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "mr": "Marathi", "bn": "Bengali", "ta": "Tamil",
    "te": "Telugu", "kn": "Kannada", "ml": "Malayalam", "gu": "Gujarati", "pa": "Punjabi",
    "ur": "Urdu", "fr": "French", "de": "German", "es": "Spanish", "it": "Italian",
    "pt": "Portuguese", "ru": "Russian", "ja": "Japanese", "ko": "Korean",
    "zh-CN": "Chinese (Simplified)", "ar": "Arabic",
}

MAX_TEXT_LENGTH = 4500  # Google rejects > 5000 chars; MyMemory segments are shorter but handle this
_HTTP_TIMEOUT = 12


def normalize_language(code, default):
    code = str(code or "").strip()
    if not code:
        return default
    if code.lower() in ("zh", "zh-cn"):
        return "zh-CN"
    return code.lower()


def _google(text, source, target):
    return GoogleTranslator(source=source, target=target).translate(text)


def _mymemory(text, source, target):
    src = "Autodetect" if source == "auto" else source
    params = {"q": text, "langpair": f"{src}|{target}"}
    if Config.MYMEMORY_EMAIL:
        params["de"] = Config.MYMEMORY_EMAIL  # raises the free daily quota
    resp = requests.get("https://api.mymemory.translated.net/get", params=params, timeout=_HTTP_TIMEOUT)
    resp.raise_for_status()
    payload = resp.json()
    if str(payload.get("responseStatus")) != "200":
        raise RuntimeError(f"MyMemory error: {payload.get('responseDetails')}")
    translated = (payload.get("responseData") or {}).get("translatedText")
    if not translated or "MYMEMORY WARNING" in translated.upper():
        raise RuntimeError("MyMemory quota reached")
    return translated


def _groq(text, source, target):
    if not Config.GROQ_API_KEY:
        raise RuntimeError("Groq not configured")
    from groq import Groq

    client = Groq(api_key=Config.GROQ_API_KEY, timeout=20.0, max_retries=0)
    src_name = "the detected language" if source == "auto" else LANGUAGE_NAMES.get(source, source)
    tgt_name = LANGUAGE_NAMES.get(target, target)
    completion = client.chat.completions.create(
        model=Config.GROQ_MODEL,
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a translation engine. Translate the user's text from {src_name} to {tgt_name}. "
                    "Reply with the translation only, in the target script, without quotes or explanations."
                ),
            },
            {"role": "user", "content": text},
        ],
    )
    return (completion.choices[0].message.content or "").strip()


_PROVIDERS = (("google", _google), ("mymemory", _mymemory), ("groq", _groq))


@lru_cache(maxsize=512)
def translate_text(text, source="auto", target="en"):
    source = normalize_language(source, "auto")
    target = normalize_language(target, "en")
    if target == "auto":
        raise ValueError("Target language cannot be 'auto'")
    if source == target:
        return text

    last_error = None
    for name, provider in _PROVIDERS:
        try:
            translated = provider(text, source, target)
            if translated and translated.strip():
                return translated.strip()
        except Exception as exc:  # try the next provider
            last_error = exc
            logger.info("Translation provider %s failed: %s", name, exc)

    raise RuntimeError(f"All translation providers failed: {last_error}")
