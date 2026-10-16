# Deploying TrustTrip on free tiers

| Part | Free host | What you get |
| --- | --- | --- |
| Database, auth, photo storage | **Supabase** (Free plan) | Postgres + Storage bucket `avatars` |
| Flask API (`backend/`) | **Render** (Free web service) | `https://trusttrip-api-r5vu.onrender.com` |
| Admin panel (`admin/`) | **Vercel** or **Netlify** (Hobby/Free) | Static Vite site |
| Android app (`frontend/`) | **Expo EAS Build** (Free plan) | Installable APK / Play Store AAB |

Maps use OpenStreetMap/CARTO tiles through Leaflet, and translation falls back across Google → MyMemory → Groq, so neither needs a paid key.

---

## 1. Supabase

1. Create a project and open **SQL Editor**.
2. Run, in order:
   - `backend/database/supabase_schema.sql`
   - `backend/database/admin_schema.sql`
   - `backend/database/migrations/001_admin_tables.sql`
   - `backend/database/migrations/002_razorpay_payment_integration.sql`
   - `backend/database/migrations/003_cod_and_profile_photo.sql` (**new**: Cash on Delivery columns, `users.profile_photo_url`, public `avatars` bucket)
3. **Project Settings → API**: copy the Project URL and the `service_role` key (backend only, never ship it in the app).

## 2. Backend API on Render

1. Push the repo to GitHub.
2. Render → **New → Blueprint** → choose the repo. `render.yaml` creates the `trusttrip-api` service (Python 3.12, gunicorn, health check `/`).
3. Fill the prompted secrets:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required)
   - `GROQ_API_KEY` (AI assistant and translation fallback)
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (optional: without them online payment is disabled and Cash on Delivery still works)
   - `CORS_ORIGINS`: your admin URL, e.g. `https://trusttrip-admin.vercel.app`
   - `SECRET_KEY` is generated automatically. It signs user sessions, so keep it stable.
4. Check `https://<your-service>.onrender.com/health`. It should return `{"status": "ok"}`.

> The free Render instance sleeps after about 15 minutes idle, and the first request then takes about 30–50 s. The app's request timeout is 30 s and the screens show retry states. For a demo, open `/health` a minute beforehand.

Local run:

```bash
cd backend && python -m venv venv && venv/Scripts/activate && pip install -r requirements.txt
cp .env.example .env   # fill values
python app.py
```

Tests: `python -m unittest discover -s tests`

## 3. Admin panel on Vercel

1. Vercel → **New Project** → root directory `admin`, framework preset **Vite**.
2. Environment variables: `VITE_BACKEND_URL=https://trusttrip-api-r5vu.onrender.com`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (the anon key).
3. Deploy. `admin/vercel.json` (or `public/_redirects` on Netlify) handles client-side routes.
4. Add the resulting URL to the API's `CORS_ORIGINS`.

## 4. Android app with EAS

```bash
cd frontend
npm install
npm install -g eas-cli
eas login
eas init                      # links the project (writes extra.eas.projectId)
```

Set your API URL in `eas.json` (`preview`/`production` → `env.API_BASE_URL`), then:

```bash
eas build -p android --profile preview      # installable APK for testing / demo
eas build -p android --profile production   # AAB for Google Play
```

Important:

- This update adds native modules (`react-native-webview`, `expo-image-picker`) and removes `react-native-maps`. **Rebuild the dev client** (`npx expo run:android` or `eas build --profile development`). An old dev client will crash on the new map and photo screens.
- The Android package id is now `com.trusttrip.app` (was `com.anonymous.TrustTrip`). Regenerate native folders once with `npx expo prebuild --clean`.
- Release builds require an `https://` API URL. `src/config/constants.js` refuses plain HTTP outside development.
- Users signed in on an old build are asked to sign in once more, because the app now uses signed session tokens.

## 5. Security checklist before going public

- [ ] **Rotate the Razorpay test key/secret** that were committed in `backend/.env.example` in git history (now replaced with placeholders).
- [ ] Never commit `.env` files (already git-ignored).
- [ ] Keep `RAZORPAY_MODE=test` until you complete Razorpay KYC. Switch to `live` keys only then.
- [ ] Set `CORS_ORIGINS` to the admin URL only.
- [ ] Password reset is not automated yet. The Forgot Password screen tells users to contact support.
