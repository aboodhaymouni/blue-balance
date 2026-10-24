"""Core checks that need no model and no data files. Run from the project root: python -m unittest api.tests.test_core -v"""
import unittest
from datetime import datetime

from api import config
from api.arabic import find_quote, normalise
from api.extract import check_evidence, rules_extract
from api.localise import Network, analyse
from api.pii import apply, mask

NET = Network({"nodes": [
    {"id": "R1", "type": "reservoir", "name_ar": "خزان", "parent": None},
    {"id": "M1", "type": "main", "name_ar": "خط ١", "parent": "R1"},
    {"id": "M2", "type": "main", "name_ar": "خط ٢", "parent": "R1"},
    {"id": "Z01", "type": "zone", "name_ar": "أ", "parent": "M1"},
    {"id": "Z02", "type": "zone", "name_ar": "ب", "parent": "M1"},
    {"id": "Z04", "type": "zone", "name_ar": "ج", "parent": "M2"},
    {"id": "Z05", "type": "zone", "name_ar": "د", "parent": "M2"},
    {"id": "Z06", "type": "zone", "name_ar": "ه", "parent": "M2"},
    {"id": "Z07", "type": "zone", "name_ar": "و", "parent": "M2"},
]})
ALL_IN_TURN = {z: True for z in NET.zones}


class QuoteTests(unittest.TestCase):
    def test_exact_and_spacing(self):
        self.assertTrue(find_quote("من امبارح ما في مي", "ما في مي"))
        self.assertTrue(find_quote("ما  في   مي", "ما في مي"))

    def test_letters_are_not_normalised(self):
        self.assertFalse(find_quote("ما في مية", "ما في ميه"))
        self.assertFalse(find_quote("نص", None))

    def test_normalise_for_matching_only(self):
        self.assertEqual(normalise("جبل النزهة"), normalise("جبل النزهه"))


class EvidenceTests(unittest.TestCase):
    def test_invented_quote_is_dropped(self):
        raw = {"issue": {"value": "no_water", "quote": "مقطوعة من أسبوع"}, "since": {"value": "yesterday", "quote": "من امبارح"},
               "turn_claim": {"value": False, "quote": None}, "pii_spans": []}
        fields, dropped, _ = check_evidence("من امبارح ما في مي", raw)
        self.assertIsNone(fields["issue"]["value"])
        self.assertEqual(fields["since"]["value"], "yesterday")
        self.assertIsNone(fields["turn_claim"]["value"])
        self.assertEqual(dropped, [{"field": "issue", "reason": "quote_not_found"}])

    def test_rules_respect_negation(self):
        self.assertEqual(rules_extract("المي مش مقطوعة بس ضعيفة كثير")["issue"]["value"], "weak_pressure")
        self.assertEqual(rules_extract("من امبارح ما في مي")["issue"]["value"], "no_water")


class FallbackTests(unittest.TestCase):
    def test_hosted_then_local_then_rules(self):
        from unittest import mock

        from api import extract as ex

        def boom(_text):
            raise RuntimeError("down")

        ok = {"issue": {"value": "no_water", "quote": "ما في مي"}, "pii_spans": []}
        with mock.patch.object(ex.config, "HOSTED_ON", True), mock.patch.object(ex.config, "AI_OFF", False), \
                mock.patch.object(ex, "call_hosted", boom), mock.patch.object(ex, "call_llm", lambda _t: ok):
            result = ex.extract("ما في مي")
        self.assertEqual(result["engine"], ex.config.LLM_MODEL)
        self.assertIn("down", result["error"])
        with mock.patch.object(ex.config, "HOSTED_ON", True), mock.patch.object(ex.config, "AI_OFF", False), \
                mock.patch.object(ex, "call_hosted", boom), mock.patch.object(ex, "call_llm", boom):
            result = ex.extract("ما في مي")
        self.assertEqual(result["engine"], "rules")
        self.assertEqual(result["raw"]["issue"]["value"], "no_water")


    def test_slow_hosted_model_hits_the_deadline(self):
        import time as _time
        from unittest import mock

        from api import extract as ex

        def slow(_text):
            _time.sleep(1)
            return {"issue": {"value": "leak_seen", "quote": "x"}, "pii_spans": []}

        ok = {"issue": {"value": "no_water", "quote": "ما في مي"}, "pii_spans": []}
        with mock.patch.object(ex.config, "HOSTED_ON", True), mock.patch.object(ex.config, "AI_OFF", False), \
                mock.patch.object(ex.config, "HOSTED_TIMEOUT_S", 0.1), mock.patch.object(ex, "call_hosted", slow), \
                mock.patch.object(ex, "call_llm", lambda _t: ok):
            started = _time.perf_counter()
            result = ex.extract("ما في مي")
        self.assertEqual(result["engine"], ex.config.LLM_MODEL)
        self.assertLess(_time.perf_counter() - started, 0.8)


class PiiTests(unittest.TestCase):
    def test_numbers_and_names(self):
        text = "انا ابو محمد رقمي 0791234567 والسيارة 12-34567"
        masked, applied = mask(text, ["ابو محمد", "مش موجود"])
        self.assertNotIn("0791234567", masked)
        self.assertNotIn("ابو محمد", masked)
        self.assertNotIn("12-34567", masked)
        self.assertIn("[هاتف]", masked)
        self.assertEqual(apply("رقمي 0791234567", applied), "رقمي [هاتف]")

    def test_kunya_backstop_spares_places(self):
        masked, _ = mask("انا ابو محمد ساكن جنب مسجد أبو درويش", [], keep=[normalise("مسجد أبو درويش")])
        self.assertNotIn("ابو محمد", masked)
        self.assertIn("أبو درويش", masked)

    def test_placeholders_are_not_masked_again(self):
        masked, _ = mask("انا [اسم] [هاتف]", ["[هاتف]", "[اسم]"])
        self.assertEqual(masked, "انا [اسم] [هاتف]")

    def test_arabic_indic_phone(self):
        masked, _ = mask("اتصلوا ٠٧٩١٢٣٤٥٦٧", [])
        self.assertIn("[هاتف]", masked)


class LocaliserTests(unittest.TestCase):
    def test_tree_beats_busiest_zone(self):
        anomalies = {"Z04": 3, "Z05": 6, "Z06": 2, "Z07": 1}
        posteriors, hit = analyse(NET, anomalies, ALL_IN_TURN)
        self.assertEqual(posteriors[0][0], "M2")
        self.assertGreater(posteriors[0][1], config.INCIDENT_MIN_POSTERIOR)
        self.assertTrue(hit["Z05"])
        self.assertFalse(hit["Z07"])

    def test_single_zone_points_at_its_feeder(self):
        posteriors, _ = analyse(NET, {"Z01": 4}, ALL_IN_TURN)
        self.assertEqual(posteriors[0][0], "Z01")

    def test_quiet_network_has_no_fault(self):
        posteriors, _ = analyse(NET, {"Z05": 1}, ALL_IN_TURN)
        self.assertEqual(posteriors[0][0], "none")

    def test_out_of_turn_zones_are_not_evidence(self):
        in_turn = dict(ALL_IN_TURN, Z04=False, Z05=False, Z06=False, Z07=False)
        posteriors, _ = analyse(NET, {"Z05": 6}, in_turn)
        self.assertNotIn(posteriors[0][0], ("M2", "Z05"))


class ScheduleTests(unittest.TestCase):
    def test_demo_now_is_saturday(self):
        self.assertEqual(config.DEMO_NOW.weekday(), 5)
        self.assertEqual(config.DEMO_NOW, datetime.fromisoformat("2026-10-24T10:00:00+03:00"))


if __name__ == "__main__":
    unittest.main()
