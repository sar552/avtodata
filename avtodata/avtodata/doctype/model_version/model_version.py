# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ModelVersion(Document):
	def on_trash(self):
		frappe.db.set_value("Trim", {"model_version": self.name}, "model_version", None)
