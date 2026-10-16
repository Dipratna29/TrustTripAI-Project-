# TrustTrip: Notification Center, Visual Translation & Repair Report

Branch: `feature/notifications-visual-translation` (not committed or pushed yet). Date: 2026-10-16.

## Status by feature

| Feature | Status | Evidence / what is missing |
| --- | --- | --- |
| Admin Notification Center: DB triggers, dedup, RLS | **PASS** | 13 tests run migration 004 on a real PostgreSQL 18 (registration, order, status change, low/out-of-stock crossing, stock adjustment, complaint, SOS, payment, guide, offer, rollback, redelivery dedup, RLS) |
| Admin Notification Center: API | **PASS** | 14 API tests: admin-only, per-category permissions, filters, pagination, read/unread/read-all, metadata allowlist |
| Admin Notification Center: UI | **PASS (local)** | Browser-verified against the real Flask app with an in-memory DB: badge, filters, mark read, open order, status change, mobile width, light/dark. **Not yet run against live Supabase**: migration 004 must be applied first. |
| Real-order scenario on the live database | **BLOCKED** | Needs migration 004 applied and your approval to write test data (or a separate test Supabase project) |
| Admin order management (list/detail/status, cancel restock) | **PASS** | API tests and browser check |
| Visual translation (camera/gallery → OCR → edit → translate → speak) | **PARTIAL** | 9 mobile unit tests + 7 backend OCR tests (provider mocked); typecheck and Android bundle OK. **On-device OCR and camera not yet verified on a phone**: needs a new EAS build. |
| Voice input (speech-to-text) | **PARTIAL** | Code complete, typechecks, config plugin added; needs a new native build and a device test |
| SMS (Twilio) | **PARTIAL / BLOCKED** | 6 tests (missing creds, success, rejection, timeout, network error, invalid number, simulation in prod blocked). Real delivery BLOCKED: no Twilio credentials. |
| Password reset (SMS code) | **PARTIAL** | 9 flow tests: generic response, hashed single-use code, expiry, 5-attempt limit, rate limits, new code invalidates old, password policy, and the new password really logs in. Real SMS delivery blocked by Twilio config. |
| Push notifications | **PARTIAL / BLOCKED** | 12 tests (ticket errors, retry, receipts, dead-token deactivation, token validation/ownership). Device delivery BLOCKED: needs Firebase `google-services.json` + FCM V1 key in EAS. |
| Live weather on Home | **PASS** | Backend tests (mocked) + one live call returned real Open-Meteo data for Ichalkaranji; mobile cache tests |
| Women-safety facilities (real API, distance, verified/stale labels) | **PASS** | Backend + mobile tests; live API returned real rows |
| Offers screen (only currently valid offers) | **PASS** | Date-validity tests; error returns 503, not a fake empty success |
| Test-suite authentication | **PASS** | Live scripts now log in via `/login` and send the issued token; protected routes are no longer bypassed |

## Root causes found and fixed

1. **Admin auth bypass (critical):** `validate_admin_token` decoded JWTs **without signature verification** when Supabase rejected them, and granted **SUPER_ADMIN to any valid Supabase login without an `admin_users` row**. Travelers have Supabase Auth accounts, so any traveler could reach the admin API. Fixed, with regression tests. The admin login fallback that minted SUPER_ADMIN sessions was also removed.
2. **Committed admin credentials (critical, action needed):** `test_admin_api.py` created `test_admin_suite@trusttrip.com` as SUPER_ADMIN with a password in the repo; it is **ACTIVE in the live database**. `test_full_e2e_integration.py` contained a password for `admin@trusttrip.com` (also SUPER_ADMIN). Both passwords were removed from the code, but they remain in git history on GitHub.
3. **Firebase error:** Android Expo push tokens need FCM config; the project has no `google-services.json`. `app.config.js` now injects it from the EAS file variable `GOOGLE_SERVICES_JSON`.
4. **Push reported as sent when rejected:** Expo returns HTTP 200 with per-message errors; the old check treated any response data as success. Also refused to send without `EXPO_ACCESS_TOKEN` (optional).
5. **SMS could never work:** imported a `twilio` package that was not in `requirements.txt`; rewritten on the Twilio REST API. Simulation is explicit and never reported as sent.
6. **Fake password reset:** replaced with a real SMS-code flow.
7. **Hardcoded data:** Home weather "28°C/Clear", crowd "Low 0%", "Safe" tile, "Divya" greeting; Women Safety static list. Replaced with live data and honest empty states.
8. **Missing DB columns:** live `equipment_orders` lacked migration-002 columns, so COD orders silently dropped address/phone. Fixed in migration 004.
9. **`/offers` and `/facilities`** returned HTTP 500 when the DB client failed to initialise. Now a clean 503.
10. Unused `react-native-maps` / `@react-native-voice/voice` were removed earlier (the voice library broke the release build).

## Database migration (run once in the Supabase SQL editor)

`backend/database/migrations/004_admin_events_and_password_reset.sql`: idempotent. It adds:
- the `admin_events` table and its triggers
- the `record_admin_event()` function
- the missing order columns
- the `password_reset_codes` table
- RLS policies
- the Realtime publication entry

## New or changed endpoints

| Endpoint | Auth |
| --- | --- |
| `GET /api/admin/events`, `GET /api/admin/events/unread-count`, `PATCH /api/admin/events/<id>/read`, `POST /api/admin/events/read-all` | Admin JWT; filtered by category permission |
| `GET /api/admin/orders`, `GET /api/admin/orders/<id>` | Admin `payments:read` |
| `PATCH /api/admin/orders/<id>/status` | Admin `inventory:write` (valid transitions only; cancel restocks) |
| `POST /api/admin/push/receipts/check` | Admin `notifications:write` |
| `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm` | Public, rate-limited, generic responses |
| `POST /ocr` | Traveler session; 3 MB limit; 20 per 10 min |
| `GET /weather?lat&lon` | Public; ~1 km precision; 10-min cache |
| `GET /facilities?lat&lon&radius_km` | Public (the app computes distance on the phone and does not send coordinates) |
| `GET /offers` | Public; only PUBLISHED offers whose dates include today |

Registration now uses the same password policy as reset: at least 8 characters, including a letter and a number.

## Visual translation

- **OCR:** on-device Google ML Kit (`@react-native-ml-kit/text-recognition`). It is free, works offline, and photos never leave the phone. Scripts: Latin, Devanagari (Hindi/Marathi), Chinese, Japanese, Korean. Tamil, Telugu, Bengali and Gujarati text cannot be read by on-device OCR, and the app says so.
- **Fallback:** `POST /ocr` (OCR.space) is used only when the native module is missing and `OCR_SPACE_API_KEY` is set. The UI discloses the upload.
- **Features:** photos are downscaled to 1600 px. Detected text blocks are highlighted on the photo, and tapping a block translates only that block. Recognized text is editable. Translation uses the existing Google → MyMemory → Groq chain, with Listen (Expo Speech) and Copy.

## Commands executed (actual results)

| Command | Result |
| --- | --- |
| `python -m pytest -q tests test_*.py` (backend, with local Postgres for SQL tests) | **97 passed, 0 failed, 56 skipped** (skipped = live scripts without opt-in) |
| `python -m compileall` (backend) | OK |
| `npx tsc --noEmit` (mobile) | OK |
| `npx jest` (mobile) | **20 passed** (3 suites) |
| `npx expo export --platform android` | Bundle built |
| `npm run build` (admin: `tsc -b` + Vite) | OK |
| Admin UI browser check (local harness) | Notification list, unread badge 4→3, mark read, open order, Shipped → only "Delivered" offered, 390 px light mode |

## Manual verification still required

1. Apply migration 004, then place a real COD order from the app and confirm it appears in Notification Center → Open order.
2. Build a new APK (`eas build -p android --profile preview`). Then test camera/gallery visual translation, voice input, weather, facilities and offers on the phone.
3. Push: add Firebase config + FCM key, rebuild, log in, and confirm a token row appears in `user_devices` and a test push arrives.
4. SMS/password reset: add Twilio credentials (DLT sender for India) and run a reset on a test account.

## Environment variables (names only)

- **Backend (Render):** `SMS_MODE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` / `TWILIO_MESSAGING_SERVICE_SID`, `OCR_SPACE_API_KEY`, `WEATHER_API_URL`, `EXPO_ACCESS_TOKEN` (optional).
- **EAS:** `GOOGLE_SERVICES_JSON` (file).
- **Live test scripts:** `TRUSTTRIP_LIVE_TESTS`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_TRAVELER_USERNAME`, `TEST_TRAVELER_PASSWORD`.

## Known limitations

- Session tokens are stateless: a password reset does not sign out other devices; tokens expire after 30 days.
- Rate limits for OCR and reset requests are per process. The DB-backed hourly cap and attempt limit still apply across instances.
- Live facilities data only covers Mumbai; Ichalkaranji users see an honest "none within 25 km" with helplines.
- Admin Realtime depends on the admin's Supabase session; polling every 20 s is the guaranteed path.
- Offers are informational: the order system has no discount mechanism, so nothing claims a discount was applied.

## Recommended next steps (by severity)

1. **Now:** disable `test_admin_suite@trusttrip.com`, change the `admin@trusttrip.com` password, and rotate the old Razorpay test key.
2. Apply migration 004; commit and push this branch; redeploy Render and Vercel.
3. Configure Firebase/FCM and Twilio, then build and test a new APK.
4. Add verified facilities for your operating cities.
