# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TechnicalSpecDefinition(Document):
	def validate(self):
		self._guard_system_record()
		self._validate_precision()
		self._validate_enum_options()

	def on_trash(self):
		self._guard_system_record()

	def _guard_system_record(self):
		if self.is_system and "System Manager" not in frappe.get_roles():
			frappe.throw(_("Only a System Manager can modify a system-defined technical spec."))

	def _validate_precision(self):
		if self.data_type == "number" and not (0 <= (self.display_precision or 0) <= 6):
			frappe.throw(_("Display precision must be between 0 and 6."))

	def _validate_enum_options(self):
		if self.data_type == "enum" and len(self.enum_options or []) < 2:
			frappe.throw(_("Provide at least 2 options for an enum technical spec."))
