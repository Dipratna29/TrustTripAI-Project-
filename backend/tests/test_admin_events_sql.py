"""
Executes migration 004 against a real PostgreSQL server and verifies the admin event
triggers: exactly-once events, no duplicates on retry/redelivery, threshold crossing,
rollback safety and RLS.

Requires a disposable Postgres (each test creates and drops its own database).
Set TEST_PG_DSN, e.g. postgresql://postgres@localhost:54329/postgres
The suite is skipped when no server is reachable. Never point it at production.
"""

import os
import unittest
import uuid
from pathlib import Path

try:
    import psycopg
except ImportError:  # pragma: no cover
    psycopg = None

BASE = Path(__file__).resolve().parent.parent
MIGRATION = (BASE / "database" / "migrations" / "004_admin_events_and_password_reset.sql").read_text(encoding="utf-8")
FIXTURE = (BASE / "tests" / "fixtures" / "supabase_minimal_schema.sql").read_text(encoding="utf-8")
DSN = os.environ.get("TEST_PG_DSN", "postgresql://postgres@localhost:54329/postgres")


def _server_available():
    if psycopg is None:
        return False
    try:
        with psycopg.connect(DSN, connect_timeout=3):
            return True
    except Exception:
        return False


@unittest.skipUnless(_server_available(), "No disposable PostgreSQL server (set TEST_PG_DSN)")
class TestAdminEventTriggers(unittest.TestCase):
    def setUp(self):
        self.dbname = f"tt_test_{uuid.uuid4().hex[:10]}"
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'CREATE DATABASE "{self.dbname}"')
        self.dsn = DSN.rsplit("/", 1)[0] + f"/{self.dbname}"
        self.conn = psycopg.connect(self.dsn, autocommit=True)
        self.conn.execute(FIXTURE)
        self.conn.execute(MIGRATION)
        # Running the migration twice must be harmless (idempotent)
        self.conn.execute(MIGRATION)

    def tearDown(self):
        self.conn.close()
        with psycopg.connect(DSN, autocommit=True) as admin:
            admin.execute(f'DROP DATABASE IF EXISTS "{self.dbname}" WITH (FORCE)')

    # helpers -----------------------------------------------------------------
    def q(self, sql, params=None):
        return self.conn.execute(sql, params or ()).fetchall()

    def events(self, event_type=None):
        if event_type:
            return self.q("SELECT event_type, entity_id, metadata, severity FROM admin_events WHERE event_type=%s ORDER BY id", (event_type,))
        return self.q("SELECT event_type, entity_id, metadata, severity FROM admin_events ORDER BY id")

    def make_item(self, stock=10, minimum=5, name="Safety Whistle", price=200):
        return self.q("INSERT INTO inventory_items(name, price, current_stock, minimum_stock) VALUES (%s,%s,%s,%s) RETURNING id",
                      (name, price, stock, minimum))[0][0]

    # tests -------------------------------------------------------------------
    def test_registration_creates_one_event_without_password(self):
        uid = self.q("INSERT INTO users(username, password, name, mob) VALUES ('asha', 'pbkdf2:secret', 'Asha K', '+919999999999') RETURNING user_id")[0][0]
        ev = self.events("user.registered")
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0][1], str(uid))
        meta = ev[0][2]
        self.assertEqual(meta["username"], "asha")
        self.assertNotIn("password", meta)
        self.assertNotIn("mob", meta)

    def test_failed_registration_creates_no_event(self):
        self.q("INSERT INTO users(username, password) VALUES ('dup', 'x') RETURNING user_id")
        with self.assertRaises(psycopg.errors.UniqueViolation):
            self.conn.execute("INSERT INTO users(username, password) VALUES ('dup', 'y')")
        self.assertEqual(len(self.events("user.registered")), 1)

    def test_order_placed_event_matches_order(self):
        item = self.make_item(name="Pepper Spray")
        oid = self.q("""INSERT INTO equipment_orders(user_id, equipment_id, quantity, total_price, status, payment_method)
                        VALUES (7, %s, 2, 400.00, 'Confirmed', 'COD') RETURNING id""", (item,))[0][0]
        ev = self.events("order.placed")
        self.assertEqual(len(ev), 1)
        meta = ev[0][2]
        self.assertEqual(ev[0][1], str(oid))
        self.assertEqual(meta["order_id"], oid)
        self.assertEqual(meta["status"], "Confirmed")
        self.assertEqual(float(meta["total"]), 400.0)
        self.assertEqual(meta["currency"], "INR")
        self.assertEqual(meta["item"], "Pepper Spray")
        self.assertEqual(meta["payment_method"], "COD")

    def test_rolled_back_order_creates_no_event(self):
        item = self.make_item()
        with psycopg.connect(self.dsn) as c:  # transactional connection
            c.execute("INSERT INTO equipment_orders(user_id, equipment_id, quantity, total_price) VALUES (1, %s, 1, 200)", (item,))
            c.rollback()
        self.assertEqual(self.events("order.placed"), [])

    def test_redelivered_event_is_deduplicated(self):
        args = ("order.placed", "ORDER", "INFO", "t", "m", "order", "99", None, None, "order.placed:99")
        first = self.q("SELECT record_admin_event(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", args)[0][0]
        second = self.q("SELECT record_admin_event(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", args)[0][0]
        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(self.q("SELECT count(*) FROM admin_events WHERE dedup_key='order.placed:99'")[0][0], 1)

    def test_order_status_change_only_on_real_change(self):
        item = self.make_item()
        oid = self.q("INSERT INTO equipment_orders(user_id, equipment_id, quantity, total_price, status) VALUES (1,%s,1,200,'Confirmed') RETURNING id", (item,))[0][0]
        self.conn.execute("UPDATE equipment_orders SET status='Shipped' WHERE id=%s", (oid,))
        self.conn.execute("UPDATE equipment_orders SET status='Shipped' WHERE id=%s", (oid,))  # no-op redelivery
        self.conn.execute("UPDATE equipment_orders SET status='Cancelled' WHERE id=%s", (oid,))
        ev = self.events("order.status_changed")
        self.assertEqual([e[2]["to"] for e in ev], ["Shipped", "Cancelled"])
        self.assertEqual(ev[1][3], "WARNING")

    def test_low_stock_alert_once_per_crossing(self):
        item = self.make_item(stock=7, minimum=5)
        self.conn.execute("UPDATE inventory_items SET current_stock=6 WHERE id=%s", (item,))  # still above min
        self.conn.execute("UPDATE inventory_items SET current_stock=5 WHERE id=%s", (item,))  # crosses -> alert
        self.conn.execute("UPDATE inventory_items SET current_stock=3 WHERE id=%s", (item,))  # same condition -> no alert
        self.assertEqual(len(self.events("inventory.low_stock")), 1)
        self.conn.execute("UPDATE inventory_items SET current_stock=0 WHERE id=%s", (item,))
        out = self.events("inventory.out_of_stock")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0][3], "CRITICAL")
        self.conn.execute("UPDATE inventory_items SET current_stock=20 WHERE id=%s", (item,))
        self.assertEqual(len(self.events("inventory.restocked")), 1)
        self.conn.execute("UPDATE inventory_items SET current_stock=4 WHERE id=%s", (item,))  # new crossing -> new alert
        self.assertEqual(len(self.events("inventory.low_stock")), 2)

    def test_manual_stock_adjustment_event_but_not_for_order_deduct(self):
        item = self.make_item()
        self.conn.execute("INSERT INTO inventory_transactions(item_id,type,quantity,previous_stock,new_stock) VALUES (%s,'STOCK_IN',5,10,15)", (item,))
        self.conn.execute("INSERT INTO inventory_transactions(item_id,type,quantity,previous_stock,new_stock) VALUES (%s,'ORDER_DEDUCT',1,15,14)", (item,))
        self.assertEqual(len(self.events("inventory.adjusted")), 1)

    def test_complaint_and_sos_events(self):
        cid = self.q("INSERT INTO complaints(username, category, priority) VALUES ('asha','Overcharging','HIGH') RETURNING id")[0][0]
        sid = self.q("INSERT INTO sos_incidents(user_id, username, emergency_type, location_name, latitude) VALUES (3,'asha','Medical','Rajwada',16.7) RETURNING id")[0][0]
        c = self.events("complaint.filed")
        s = self.events("sos.triggered")
        self.assertEqual((len(c), c[0][1], c[0][3]), (1, str(cid), "WARNING"))
        self.assertEqual((len(s), s[0][1], s[0][3]), (1, str(sid), "CRITICAL"))
        self.assertTrue(s[0][2]["has_location"])
        self.assertNotIn("latitude", s[0][2])  # precise location stays in the SOS record, not the feed

    def test_payment_events_only_on_status_change(self):
        pid = self.q("INSERT INTO razorpay_payments(razorpay_order_id,user_id,amount_paise,status) VALUES ('order_x',1,50000,'PENDING') RETURNING id")[0][0]
        self.assertEqual(self.events("payment.paid"), [])
        self.conn.execute("UPDATE razorpay_payments SET status='PAID' WHERE id=%s", (pid,))
        self.conn.execute("UPDATE razorpay_payments SET status='PAID' WHERE id=%s", (pid,))
        paid = self.events("payment.paid")
        self.assertEqual(len(paid), 1)
        self.assertEqual(float(paid[0][2]["amount"]), 500.0)

    def test_guide_and_offer_events(self):
        self.conn.execute("INSERT INTO guide(g_id,name) VALUES (1,'Ravi')")
        self.conn.execute("INSERT INTO guide_bookings(username,guide_id,status) VALUES ('asha',1,'PENDING')")
        oid = self.q("INSERT INTO offers(title,status) VALUES ('Monsoon 10%%','DRAFT') RETURNING id")[0][0]
        self.conn.execute("UPDATE offers SET status='PUBLISHED' WHERE id=%s", (oid,))
        self.assertEqual(len(self.events("guide.booked")), 1)
        self.assertEqual(len(self.events("offer.created")), 1)
        self.assertEqual(len(self.events("offer.status_changed")), 1)

    def test_rls_blocks_travelers_and_allows_active_admins(self):
        self.q("INSERT INTO users(username, password) VALUES ('asha','x') RETURNING user_id")
        admin_uuid = str(uuid.uuid4())
        self.conn.execute("INSERT INTO admin_users(user_id,email,role,status) VALUES (%s,'a@x','ADMIN','ACTIVE')", (admin_uuid,))
        self.conn.execute("GRANT USAGE ON SCHEMA public, auth TO authenticated")
        self.conn.execute("GRANT SELECT ON admin_events, admin_users TO authenticated")
        with psycopg.connect(self.dsn) as c:
            c.execute("SET ROLE authenticated")
            c.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (str(uuid.uuid4()),))
            self.assertEqual(c.execute("SELECT count(*) FROM admin_events").fetchone()[0], 0)
            c.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (admin_uuid,))
            self.assertEqual(c.execute("SELECT count(*) FROM admin_events").fetchone()[0], 1)
            c.rollback()

    def test_password_reset_table_and_realtime_publication(self):
        self.assertEqual(self.q("SELECT count(*) FROM password_reset_codes")[0][0], 0)
        pub = self.q("SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='admin_events'")[0][0]
        self.assertEqual(pub, 1)


if __name__ == "__main__":
    unittest.main()
