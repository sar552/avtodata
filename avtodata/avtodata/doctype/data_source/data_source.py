# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document

CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


class DataSource(Document):
	def validate(self):
		self.code = (self.code or "").strip().lower()
		if not CODE_PATTERN.match(self.code):
			frappe.throw(_("Code may only contain latin letters, digits, underscore and hyphen."))
