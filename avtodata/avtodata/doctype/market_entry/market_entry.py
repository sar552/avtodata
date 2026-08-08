# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class MarketEntry(Document):
	def validate(self):
		self._enforce_parent_editable()
		self._validate_quantity()

	def on_trash(self):
		self._enforce_parent_editable()

	def _enforce_parent_editable(self):
		status, deleted_at = frappe.db.get_value(
			"Market Document", self.market_document, ["status", "deleted_at"]
		)
		if status != "Draft" or deleted_at:
			frappe.throw(_("Entries can only be modified while the document is in Draft status."))

	def _validate_quantity(self):
		if flt(self.sales_quantity) <= 0 and not frappe.flags.in_import:
			frappe.throw(_("Sales quantity must be greater than zero."))
