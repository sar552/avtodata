# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Trim(Document):
	def before_insert(self):
		# Nom {model}-{trim_name} qolipida yasalgani uchun model naming'dan
		# OLDIN zanjirdan aniqlanishi shart.
		self._sync_model_from_version()

	def validate(self):
		self._sync_model_from_version()

	def _sync_model_from_version(self):
		# Versiya tanlangan bo'lsa, model zanjirdan avtomatik aniqlanadi:
		# Trim -> Model Version -> Generation -> Model
		if self.model_version:
			generation = frappe.db.get_value("Model Version", self.model_version, "generation")
			self.model = frappe.db.get_value("Generation", generation, "model")

	def on_trash(self):
		frappe.db.set_value("Market Entry", {"trim": self.name}, "trim", None)
