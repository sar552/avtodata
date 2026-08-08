# Copyright (c) 2026, AvtoData and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from avtodata.avtodata.doctype.market_document.market_document import (
	copy_sales_document,
	create_sales_document,
	publish_market_document,
	reopen_market_document,
	soft_delete_sales_document,
	update_sales_document_period,
)

TEST_MODEL = "Toyota-Camry"
TEST_BRAND = "Toyota"


class TestMarketDocument(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def test_create_normalizes_period_and_sets_document_number(self):
		result = create_sales_document(
			period_month="2031-03-17",
			title="",
			brand=TEST_BRAND,
			model=TEST_MODEL,
			trim=None,
			sales_quantity=10,
		)
		self.assertEqual(str(result["document"]["period_month"]), "2031-03-01")
		self.assertEqual(result["document"]["document_number"], "ПР-203103")
		self.assertEqual(result["document"]["status"], "Draft")
		self.assertEqual(
			frappe.db.count("Market Entry", {"market_document": result["document"]["name"]}), 1
		)

	def test_duplicate_active_period_is_rejected(self):
		create_sales_document(
			period_month="2031-04-01", title="", brand=TEST_BRAND, model=TEST_MODEL, sales_quantity=1
		)
		with self.assertRaises(frappe.ValidationError):
			create_sales_document(
				period_month="2031-04-15", title="", brand=TEST_BRAND, model=TEST_MODEL, sales_quantity=1
			)

	def test_publish_requires_at_least_one_entry(self):
		empty = frappe.new_doc("Market Document")
		empty.period_month = "2031-05-01"
		empty.insert()
		with self.assertRaises(frappe.ValidationError):
			publish_market_document(empty.name)

	def test_publish_reopen_lifecycle(self):
		result = create_sales_document(
			period_month="2031-06-01", title="", brand=TEST_BRAND, model=TEST_MODEL, sales_quantity=3
		)
		doc_id = result["document"]["name"]

		published = publish_market_document(doc_id)
		self.assertEqual(published["status"], "Published")

		# idempotent: publishing an already-published document doesn't error
		published_again = publish_market_document(doc_id)
		self.assertEqual(published_again["status"], "Published")

		# entries are locked while published
		entry = frappe.get_last_doc("Market Entry", {"market_document": doc_id})
		entry.sales_quantity = 99
		with self.assertRaises(frappe.ValidationError):
			entry.save()

		with self.assertRaises(frappe.ValidationError):
			update_sales_document_period(doc_id, "2031-07-01", "")

		reopened = reopen_market_document(doc_id)
		self.assertEqual(reopened["status"], "Draft")

	def test_copy_duplicates_entries_into_new_draft(self):
		result = create_sales_document(
			period_month="2031-08-01", title="", brand=TEST_BRAND, model=TEST_MODEL, sales_quantity=7
		)
		copied = copy_sales_document(result["document"]["name"], "2031-09-01", "")
		self.assertEqual(copied["document"]["status"], "Draft")
		self.assertEqual(len(copied["entries"]), 1)
		self.assertEqual(copied["entries"][0]["sales_quantity"], 7)

	def test_soft_delete_is_idempotent_and_excludes_from_list(self):
		result = create_sales_document(
			period_month="2031-10-01", title="", brand=TEST_BRAND, model=TEST_MODEL, sales_quantity=2
		)
		doc_id = result["document"]["name"]

		soft_delete_sales_document(doc_id)
		self.assertTrue(frappe.db.get_value("Market Document", doc_id, "deleted_at"))
		self.assertNotIn(doc_id, [d.name for d in frappe.get_list("Market Document")])

		# calling again must not raise
		soft_delete_sales_document(doc_id)
