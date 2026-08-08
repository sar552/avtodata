# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Model(Document):
	def on_trash(self):
		frappe.db.delete("Trim", {"model": self.name})
