# Copyright (c) 2026, AvtoData and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

TEST_MODEL = "Toyota-Camry"


class TestMarketEntry(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		# Market Document names come from a naming series, which commits
		# independently of the test transaction — clear any leftover row
		# from a previous test method in this run before creating a fresh one.
		frappe.db.delete("Market Entry", {"market_document": ("in", frappe.get_all(
			"Market Document", {"period_month": "2031-02-01"}, pluck="name"
		))})
		frappe.db.delete("Market Document", {"period_month": "2031-02-01"})
		self.document = frappe.new_doc("Market Document")
		self.document.period_month = "2031-02-01"
		self.document.insert()

	def test_zero_quantity_is_rejected_on_manual_insert(self):
		entry = frappe.new_doc("Market Entry")
		entry.market_document = self.document.name
		entry.model = TEST_MODEL
		entry.sales_quantity = 0
		with self.assertRaises(frappe.ValidationError):
			entry.insert()

	def test_zero_quantity_is_allowed_during_import(self):
		entry = frappe.new_doc("Market Entry")
		entry.market_document = self.document.name
		entry.model = TEST_MODEL
		entry.sales_quantity = 0
		frappe.flags.in_import = True
		try:
			entry.insert()
		finally:
			frappe.flags.in_import = False
		self.assertTrue(entry.name)

	def test_entry_locked_once_document_is_published(self):
		entry = frappe.new_doc("Market Entry")
		entry.market_document = self.document.name
		entry.model = TEST_MODEL
		entry.sales_quantity = 5
		entry.insert()

		self.document.reload()
		self.document.db_set("status", "Published")

		entry.sales_quantity = 6
		with self.assertRaises(frappe.ValidationError):
			entry.save()

		with self.assertRaises(frappe.ValidationError):
			entry.delete()
