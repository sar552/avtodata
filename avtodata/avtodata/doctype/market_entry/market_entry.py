# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class MarketEntry(Document):
	def validate(self):
		if flt(self.sales_quantity) <= 0 and not frappe.flags.in_import:
			frappe.throw(_("Sales quantity must be greater than zero."))
