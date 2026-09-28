# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class TrimPrice(Document):
	def validate(self):
		if flt(self.amount) <= 0:
			frappe.throw(_("Price must be greater than zero."))
		if not 0 <= flt(self.vat_percent) < 100:
			frappe.throw(_("VAT percent must be between 0 and 100."))
		self._check_duplicate()

	def _check_duplicate(self):
		filters = {"trim": self.trim, "valid_from": self.valid_from, "currency": self.currency, "name": ("!=", self.name or "")}
		if frappe.db.exists("Trim Price", filters):
			frappe.throw(_("A price for this trim, date and currency already exists."))
