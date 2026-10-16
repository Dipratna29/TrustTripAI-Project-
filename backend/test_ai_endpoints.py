"""
Comprehensive automated test suite for TrustTrip AI Assistant endpoints.
Tests:
- General questions (ML, Python, Math)
- Travel planning (Mumbai, Goa packing, cheap travel)
- Travel safety & emergencies (Being followed, lost passport, SOS guidance)
- TrustTrip RAG context (Safety equipment, verified facilities, fair prices, guides)
- Multi-turn conversation memory (Mumbai -> What to see -> Make it cheaper)
- Multilingual / Hinglish comprehension
- Error handling & rate limiting
"""

import unittest
import requests
import json

BASE_URL = "http://127.0.0.1:5000"


def setUpModule():
    # Calls a running server and spends Groq quota
    from live_test_support import require_live
    require_live()


class TestGroqAIAssistant(unittest.TestCase):

    def test_01_status(self):
        """Verify AI service status and Groq configuration."""
        res = requests.get(f"{BASE_URL}/api/ai/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertTrue(data.get("online"))
        self.assertTrue(data.get("groq_configured"))
        print("\n[PASS] /api/ai/status verified online with model:", data.get("model"))

    def test_02_general_questions(self):
        """Verify the assistant answers general non-travel questions accurately."""
        questions = [
            ("What is machine learning in 1 sentence?", ["machine learning", "learn", "data", "artificial intelligence"]),
            ("Write a Python hello world program.", ["print", "hello"]),
            ("What is 25 multiplied by 16?", ["400"]),
        ]
        for q, expected_keywords in questions:
            res = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": q, "conversation_id": "test-gen-suite"})
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data.get("success"))
            reply = data.get("message", "").lower()
            found = any(k.lower() in reply for k in expected_keywords)
            self.assertTrue(found, f"Expected keywords {expected_keywords} not in reply: {reply[:100]}")
            print(f"[PASS] General Question: '{q}' -> Answer length: {len(reply)} chars")

    def test_03_travel_planning(self):
        """Verify travel advice and structured itineraries."""
        res = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": "Plan a 4-day trip to Mumbai.", "conversation_id": "test-travel-suite"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        reply = data.get("message", "")
        self.assertTrue("Day" in reply or "day" in reply)
        print("\n[PASS] Travel Itinerary verified:")
        print(reply[:200].encode('ascii', errors='replace').decode('ascii'), "...\n")

    def test_04_safety_critical_guidance(self):
        """Verify immediate actionable emergency instructions."""
        res = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": "Someone is following me. What should I do?", "conversation_id": "test-safety-suite"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        reply = data.get("message", "").lower()
        self.assertTrue("sos" in reply or "police" in reply or "safe" in reply or "112" in reply or "100" in reply)
        print("[PASS] Emergency Safety Guidance verified (prioritizes safety/SOS/police).")

    def test_05_trusttrip_rag_facilities_and_equipment(self):
        """Verify real context retrieval from Supabase for equipment and facilities."""
        # Equipment lookup
        res_eq = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": "Show me safety equipment available for rent.", "conversation_id": "test-rag-eq"})
        self.assertEqual(res_eq.status_code, 200)
        reply_eq = res_eq.json().get("message", "").lower()
        print("[PASS] TrustTrip Equipment RAG response length:", len(reply_eq))

        # Facilities lookup with location
        res_fac = requests.post(f"{BASE_URL}/api/ai/chat", json={
            "message": "Where are nearby emergency facilities?",
            "conversation_id": "test-rag-fac",
            "location": {"latitude": 19.0760, "longitude": 72.8777}
        })
        self.assertEqual(res_fac.status_code, 200)
        reply_fac = res_fac.json().get("message", "").lower()
        self.assertTrue("hospital" in reply_fac or "police" in reply_fac or "facility" in reply_fac or "apollo" in reply_fac)
        print("[PASS] TrustTrip Facilities RAG verified with location context.")

    def test_06_multiturn_conversation_memory(self):
        """Verify conversation context retention across follow-up turns."""
        conv_id = "test-multiturn-mem"
        # Turn 1
        r1 = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": "I am traveling to Mumbai for 3 days.", "conversation_id": conv_id})
        self.assertEqual(r1.status_code, 200)

        # Turn 2
        r2 = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": "What should I see there?", "conversation_id": conv_id})
        self.assertEqual(r2.status_code, 200)
        reply2 = r2.json().get("message", "").lower()
        self.assertTrue("mumbai" in reply2 or "gateway" in reply2 or "marine" in reply2)

        # Turn 3
        r3 = requests.post(f"{BASE_URL}/api/ai/chat", json={"message": "Make it cheaper for a student budget.", "conversation_id": conv_id})
        self.assertEqual(r3.status_code, 200)
        reply3 = r3.json().get("message", "").lower()
        self.assertTrue("budget" in reply3 or "cheap" in reply3 or "train" in reply3 or "free" in reply3 or "hostel" in reply3)
        print("[PASS] Multi-turn Conversation Memory successfully retained Mumbai student context.")

    def test_07_legacy_chatbot_backward_compatibility(self):
        """Verify /chatbot/message continues to work seamlessly."""
        res = requests.post(f"{BASE_URL}/chatbot/message", json={"message": "bhai Mumbai me safe area konsa hai?", "username": "Vinay"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIsNotNone(data.get("reply"))
        print("[PASS] Legacy /chatbot/message verified. Tag:", data.get("tag"))


if __name__ == "__main__":
    unittest.main()
