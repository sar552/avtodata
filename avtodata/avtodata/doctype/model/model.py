# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Model(Document):
	def on_trash(self):
		frappe.db.delete("Trim", {"model": self.name})
		generations = frappe.get_all("Generation", filters={"model": self.name}, pluck="name")
		if generations:
			frappe.db.delete("Model Version", {"generation": ("in", generations)})
			frappe.db.delete("Generation", {"model": self.name})
