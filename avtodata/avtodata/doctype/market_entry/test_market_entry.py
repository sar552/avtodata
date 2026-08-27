# Copyright (c) 2026, AvtoData and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

TEST_BRAND = "TOYOTA"
TEST_MODEL = "TOYOTA-CAMRY HEV"


class TestMarketEntry(FrappeTestCase):
	def _new_entry(self, quantity):
		entry = frappe.new_doc("Market Entry")
		entry.date = "2031-02-01"
		entry.brand = TEST_BRAND
		entry.model = TEST_MODEL
		entry.sales_quantity = quantity
		return entry

	def test_negative_quantity_is_rejected(self):
		entry = self._new_entry(-1)
		with self.assertRaises(frappe.ValidationError):
			entry.insert()

	def test_zero_quantity_is_allowed(self):
		entry = self._new_entry(0)
		entry.insert()
		self.assertTrue(entry.name)
		entry.delete()
