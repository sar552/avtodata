# Copyright (c) 2026, AvtoData and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_first_day, getdate

from avtodata.permissions import require_permission

from .services.market_document_orchestrator import MarketDocumentOrchestrator

RU_MONTHS = [
	"Январь",
	"Февраль",
	"Март",
	"Апрель",
	"Май",
	"Июнь",
	"Июль",
	"Август",
	"Сентябрь",
	"Октябрь",
	"Ноябрь",
	"Декабрь",
]


class MarketDocument(Document):
	def validate(self):
		self._normalize_period()
		self._set_title()
		self._set_document_number()
		self._check_period_uniqueness()
		self._enforce_draft_only_edit()

	def _normalize_period(self):
		if self.period_month:
			self.period_month = get_first_day(self.period_month)

	def _set_title(self):
		if not self.title and self.period_month:
			d = getdate(self.period_month)
			self.title = f"Продажи автомобилей — {RU_MONTHS[d.month - 1]} {d.year}"

	def _set_document_number(self):
		if self.period_month:
			self.document_number = "ПР-" + getdate(self.period_month).strftime("%Y%m")

	def _check_period_uniqueness(self):
		filters = {"period_month": self.period_month, "deleted_at": ("is", "not set")}
		if self.name:
			filters["name"] = ("!=", self.name)
		if frappe.db.exists("Market Document", filters):
			frappe.throw(_("A document for this period already exists."))

	def _enforce_draft_only_edit(self):
		if self.is_new():
			return
		before = self.get_doc_before_save()
		if not before:
			return
		changed = self.period_month != before.period_month or self.title != before.title
		if before.status != "Draft" and changed:
			frappe.throw(_("This document is not editable outside of Draft status."))


@frappe.whitelist()
def create_sales_document(period_month, title, brand, model, trim=None, sales_quantity=None):
	require_permission("sales.manage")
	return MarketDocumentOrchestrator.create(period_month, title, brand, model, trim, sales_quantity)


@frappe.whitelist()
def copy_sales_document(source_id, period_month, title):
	require_permission("sales.manage")
	return MarketDocumentOrchestrator.copy(source_id, period_month, title)


@frappe.whitelist()
def update_sales_document_period(document_id, period_month, title):
	require_permission("sales.manage")
	return MarketDocumentOrchestrator.update_period(document_id, period_month, title)


@frappe.whitelist()
def publish_market_document(document_id):
	require_permission("sales.publish")
	return MarketDocumentOrchestrator.publish(document_id)


@frappe.whitelist()
def reopen_market_document(document_id):
	require_permission("sales.publish")
	return MarketDocumentOrchestrator.reopen(document_id)


@frappe.whitelist()
def soft_delete_sales_document(document_id):
	require_permission("sales.manage")
	return MarketDocumentOrchestrator.soft_delete(document_id)


def get_permission_query_conditions(user=None):
	# Soft-deleted documents are excluded everywhere, for every role — this
	# mirrors the source app filtering `.is('deleted_at', null)` on every
	# list query, not a per-user ownership rule.
	return "`tabMarket Document`.deleted_at is null"
