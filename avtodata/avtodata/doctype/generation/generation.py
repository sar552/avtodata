# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class Generation(Document):
	def validate(self):
		self._validate_period("production_start", "production_end")
		self._validate_period("model_year_start", "model_year_end")

	def _validate_period(self, start_field, end_field):
		start, end = self.get(start_field), self.get(end_field)
		if start and end and end < start:
			frappe.throw(_("End date cannot be before start date."))

	def on_trash(self):
		versions = frappe.get_all("Model Version", filters={"generation": self.name}, pluck="name")
		if versions:
			frappe.db.set_value("Trim", {"model_version": ("in", versions)}, "model_version", None)
			frappe.db.delete("Model Version", {"generation": self.name})
