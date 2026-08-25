# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Trim(Document):
	def on_trash(self):
		frappe.db.set_value("Market Entry", {"trim": self.name}, "trim", None)
