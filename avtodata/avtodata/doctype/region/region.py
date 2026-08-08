# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Region(Document):
	def on_trash(self):
		frappe.db.delete("City", {"region": self.name})
