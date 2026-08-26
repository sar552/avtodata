"""Business logic for the Market Document lifecycle.

Kept out of market_document.py so the Document controller stays a thin
dispatcher — mirrors akfa_accounting's Trip Master + TripOrchestrator split.
"""

import frappe
from frappe import _
from frappe.utils import flt, now_datetime


class MarketDocumentOrchestrator:
	@staticmethod
	def create(period_month, title, brand, model, trim, sales_quantity):
		if not (brand and model and sales_quantity and flt(sales_quantity) > 0):
			frappe.throw(_("Brand, model and a sales quantity greater than zero are required."))
		if frappe.db.get_value("Model", model, "brand") != brand:
			frappe.throw(_("The selected model does not belong to the selected brand."))

		document = frappe.new_doc("Market Document")
		document.period_month = period_month
		document.title = title
		document.insert()

		entry = frappe.new_doc("Market Entry")
		entry.market_document = document.name
		entry.brand = brand
		entry.model = model
		entry.trim = trim
		entry.sales_quantity = sales_quantity
		entry.insert()

		return {"document": document.as_dict(), "entry": entry.as_dict()}

	@staticmethod
	def copy(source_id, period_month, title):
		source_rows = frappe.get_all(
			"Market Entry",
			filters={"market_document": source_id},
			fields=["brand", "model", "trim", "sales_quantity"],
		)

		document = frappe.new_doc("Market Document")
		document.period_month = period_month
		document.title = title
		document.insert()

		entries = []
		for row in source_rows:
			entry = frappe.new_doc("Market Entry")
			entry.update(row)
			entry.market_document = document.name
			entry.insert()
			entries.append(entry.as_dict())

		return {"document": document.as_dict(), "entries": entries}

	@staticmethod
	def update_period(document_id, period_month, title):
		document = frappe.get_doc("Market Document", document_id)
		if document.status != "Draft" or document.deleted_at:
			frappe.throw(_("Document not found or not in Draft status."))
		document.period_month = period_month
		document.title = title
		document.save()
		return document.as_dict()

	@staticmethod
	def publish(document_id):
		if not frappe.db.exists("Market Entry", {"market_document": document_id}):
			frappe.throw(_("Cannot publish a document with no entries."))
		document = frappe.get_doc("Market Document", document_id)
		document.db_set("status", "Published")
		return document.as_dict()

	@staticmethod
	def reopen(document_id):
		document = frappe.get_doc("Market Document", document_id)
		document.db_set("status", "Draft")
		return document.as_dict()

	@staticmethod
	def soft_delete(document_id):
		document = frappe.get_doc("Market Document", document_id)
		if document.deleted_at:
			return {"success": True}
		document.db_set("deleted_at", now_datetime())
		return {"success": True}
