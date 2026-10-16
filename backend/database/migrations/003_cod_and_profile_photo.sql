-- 003: Cash on Delivery orders + user profile photos
-- Run in the Supabase SQL editor (or via run_migrations.py).

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

ALTER TABLE public.equipment_orders
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'RAZORPAY',
    ADD COLUMN IF NOT EXISTS delivery_address TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON public.equipment_orders (payment_method);

-- Public bucket for avatars (the backend also creates it on first upload if missing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
