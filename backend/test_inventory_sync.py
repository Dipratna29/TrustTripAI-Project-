"""
test_inventory_sync.py
Comprehensive End-to-End Test Suite for TrustTrip Inventory & Safety Gear Synchronization:
Admin Web <-> Flask Backend API <-> Remote Supabase PostgreSQL <-> Android App
"""

import unittest
import requests
import time
import os
import json
from config import Config
from database.supabase_client import get_supabase_client

BASE_URL = "http://127.0.0.1:5000"


class TestInventorySync(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from live_test_support import require_live
        require_live("TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD")
        cls.client = get_supabase_client()
        supabase_url = Config.SUPABASE_URL
        supabase_key = Config.SUPABASE_SERVICE_ROLE_KEY or Config.SUPABASE_KEY

        # Sign in with test admin account to get real Supabase Auth JWT token
        auth_url = f"{supabase_url}/auth/v1/token?grant_type=password"
        auth_res = requests.post(
            auth_url,
            json={"email": os.environ["TEST_ADMIN_EMAIL"], "password": os.environ["TEST_ADMIN_PASSWORD"]},
            headers={"apikey": supabase_key, "Content-Type": "application/json"},
            timeout=15
        )
        if auth_res.status_code == 200:
            cls.admin_token = auth_res.json()["access_token"]
        else:
            raise RuntimeError(f"Could not authenticate test admin: {auth_res.text}")

        cls.headers = {
            "Authorization": f"Bearer {cls.admin_token}",
            "Content-Type": "application/json"
        }
        cls.test_item_id = None
        cls.test_sku = f"TEST-SYNC-{int(time.time())}"

    def test_01_admin_create_item_and_verify_mobile_sees_it(self):
        """Admin creates item -> verified in Supabase -> verified in mobile GET /equipment"""
        payload = {
            "name": "Sync Test Emergency Flare",
            "category": "Emergency",
            "sku": self.__class__.test_sku,
            "current_stock": 20,
            "minimum_stock": 5,
            "unit": "units",
            "price": 899.0,
            "supplier": "TrustTrip Safety Depot",
            "image_url": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=300",
            "description": "High visibility LED emergency distress beacon"
        }
        res = requests.post(f"{BASE_URL}/api/admin/inventory", headers=self.headers, json=payload)
        self.assertIn(res.status_code, [200, 201])
        data = res.json()
        self.assertTrue(data.get("success"))
        item = data.get("data")
        self.__class__.test_item_id = item["id"]
        print(f"\n[PASS] Admin created inventory item #{self.__class__.test_item_id} (SKU: {self.__class__.test_sku})")

        # Verify Mobile GET /equipment sees the exact item
        mob_res = requests.get(f"{BASE_URL}/equipment")
        self.assertEqual(mob_res.status_code, 200)
        mob_items = mob_res.json()
        matched = [i for i in mob_items if i.get("id") == self.__class__.test_item_id]
        self.assertTrue(len(matched) > 0, "Created item was not found in mobile equipment catalog")
        self.assertEqual(matched[0]["current_stock"], 20)
        self.assertEqual(matched[0]["price"], 899.0)
        self.assertEqual(matched[0]["status"], "IN_STOCK")
        print(f"[PASS] Mobile GET /equipment verified item presence, stock=20, status='IN_STOCK'")

    def test_02_admin_stock_add_and_verify_transaction(self):
        """Admin adds 5 stock units -> stock becomes 25 -> STOCK_IN transaction logged"""
        item_id = self.__class__.test_item_id
        res = requests.post(f"{BASE_URL}/api/admin/inventory/{item_id}/add-stock", headers=self.headers, json={
            "quantity": 5,
            "supplier": "TrustTrip Safety Depot",
            "notes": "E2E Restock Test"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data["data"]["new_stock"], 25)
        print(f"[PASS] Admin stock +5 confirmed. New stock = 25")

        # Verify mobile sees 25 stock
        mob_res = requests.get(f"{BASE_URL}/equipment/{item_id}")
        self.assertEqual(mob_res.status_code, 200)
        self.assertEqual(mob_res.json().get("current_stock"), 25)
        print(f"[PASS] Mobile GET /equipment/{item_id} reflects updated stock = 25")

        # Verify transaction ledger has STOCK_IN
        tx_res = requests.get(f"{BASE_URL}/api/admin/inventory/transactions?item_id={item_id}", headers=self.headers)
        self.assertEqual(tx_res.status_code, 200)
        tx_list = tx_res.json().get("transactions", [])
        self.assertTrue(any(t["type"] == "STOCK_IN" and t["quantity"] == 5 for t in tx_list))
        print(f"[PASS] STOCK_IN transaction verified in audit ledger")

    def test_03_admin_stock_remove_and_verify_transaction(self):
        """Admin removes 3 stock units -> stock becomes 22 -> STOCK_OUT transaction logged"""
        item_id = self.__class__.test_item_id
        res = requests.post(f"{BASE_URL}/api/admin/inventory/{item_id}/remove-stock", headers=self.headers, json={
            "quantity": 3,
            "reason": "Test audit reduction"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data["data"]["new_stock"], 22)
        print(f"[PASS] Admin stock -3 confirmed. New stock = 22")

        # Verify transaction ledger has STOCK_OUT
        tx_res = requests.get(f"{BASE_URL}/api/admin/inventory/transactions?item_id={item_id}", headers=self.headers)
        self.assertEqual(tx_res.status_code, 200)
        tx_list = tx_res.json().get("transactions", [])
        self.assertTrue(any(t["type"] == "STOCK_OUT" and t["quantity"] == 3 for t in tx_list))
        print(f"[PASS] STOCK_OUT transaction verified in audit ledger")

    def test_04_prevent_negative_stock(self):
        """Admin tries removing 999 units (exceeding stock of 22) -> rejected with 400"""
        item_id = self.__class__.test_item_id
        res = requests.post(f"{BASE_URL}/api/admin/inventory/{item_id}/remove-stock", headers=self.headers, json={
            "quantity": 999,
            "reason": "Oversell attempt"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("Insufficient stock", res.json().get("message", ""))
        print(f"[PASS] Overselling blocked: '{res.json().get('message')}'")

    def test_05_mobile_purchase_and_inventory_sync(self):
        """Mobile places order for 2 units -> equipment_orders created -> stock decreases to 20 -> ORDER_DEDUCT logged"""
        item_id = self.__class__.test_item_id
        order_payload = {
            "user_id": 1,
            "equipment_id": item_id,
            "quantity": 2,
            "total_price": 1798.0,
            "latitude": 19.0760,
            "longitude": 72.8777
        }
        res = requests.post(f"{BASE_URL}/place-order", json=order_payload)
        self.assertIn(res.status_code, (200, 201))
        data = res.json()
        self.assertTrue(data.get("success"))
        order_info = data.get("data")
        self.assertEqual(order_info["remaining_stock"], 20)
        print(f"\n[PASS] Mobile purchase completed! Order #{order_info['order_id']}, Remaining stock = 20")

        # Verify Admin Inventory reflects 20 units
        admin_inv_res = requests.get(f"{BASE_URL}/api/admin/inventory?search={self.__class__.test_sku}", headers=self.headers)
        self.assertEqual(admin_inv_res.status_code, 200)
        admin_items = admin_inv_res.json().get("items", [])
        self.assertEqual(len(admin_items), 1)
        self.assertEqual(admin_items[0]["current_stock"], 20)
        print(f"[PASS] Admin Inventory automatically reflects stock decreased to 20")

        # Verify ORDER_DEDUCT transaction recorded
        tx_res = requests.get(f"{BASE_URL}/api/admin/inventory/transactions?item_id={item_id}", headers=self.headers)
        tx_list = tx_res.json().get("transactions", [])
        self.assertTrue(any(t["type"] == "ORDER_DEDUCT" and t["quantity"] == 2 for t in tx_list))
        print(f"[PASS] ORDER_DEDUCT transaction verified in audit ledger")

        # Verify mobile user orders contains this purchase
        orders_res = requests.get(f"{BASE_URL}/user-orders/1")
        self.assertEqual(orders_res.status_code, 200)
        orders = orders_res.json()
        matched = [o for o in orders if o.get("id") == order_info["order_id"]]
        self.assertTrue(len(matched) > 0)
        self.assertEqual(matched[0]["quantity"], 2)
        print(f"[PASS] User Orders list verified with item name '{matched[0].get('name')}'")

    def test_06_admin_soft_delete_preserves_history(self):
        """Admin deletes item with orders -> soft-deleted status='INACTIVE' -> hidden from mobile catalog"""
        item_id = self.__class__.test_item_id
        res = requests.delete(f"{BASE_URL}/api/admin/inventory/{item_id}", headers=self.headers)
        self.assertEqual(res.status_code, 200)
        print(f"\n[PASS] Admin deleted item #{item_id}")

        # Verify status in Supabase is INACTIVE
        db_item = self.client.table("inventory_items").select("*").eq("id", item_id).execute()
        self.assertEqual(len(db_item.data), 1)
        self.assertEqual(db_item.data[0]["status"], "INACTIVE")
        print(f"[PASS] Item safely preserved in Supabase as status='INACTIVE' (history intact)")

        # Verify mobile GET /equipment excludes INACTIVE item
        mob_res = requests.get(f"{BASE_URL}/equipment")
        mob_ids = [i["id"] for i in mob_res.json()]
        self.assertNotIn(item_id, mob_ids)
        print(f"[PASS] Mobile GET /equipment excludes INACTIVE item")


if __name__ == "__main__":
    unittest.main()
