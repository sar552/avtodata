"""Tez kiritish paneli uchun API.

Dispetcher bitta qatorda brend → model → komplektatsiya → soni kiritadi.
Bir xil (sana + model + komplektatsiya) juftligi takrorlansa — qo'shib
yuborish yoki alohida qator ochish tanlanadi, shunda dubl bilmasdan
kirib qolmaydi.
"""

import frappe
from frappe import _
from frappe.utils import cint, getdate


def _entry_dict(doc):
	return {
		"name": doc.name,
		"date": str(doc.date),
		"brand": doc.brand,
		"model": doc.model,
		"trim": doc.trim,
		"sales_quantity": cint(doc.sales_quantity),
	}


@frappe.whitelist()
def quick_save(date, brand, model, sales_quantity, trim=None, mode=None):
	"""mode: None — dubl bo'lsa so'raydi; 'add' — mavjudiga qo'shadi; 'new' — yangi qator."""
	if not (date and brand and model):
		frappe.throw(_("Date, brand and model are required."))
	qty = cint(sales_quantity)
	if qty < 0:
		frappe.throw(_("Sales quantity cannot be negative."))
	if frappe.db.get_value("Model", model, "brand") != brand:
		frappe.throw(_("The selected model does not belong to the selected brand."))

	filters = {"date": getdate(date), "model": model, "trim": trim or ["in", ["", None]]}
	existing = frappe.get_all("Market Entry", filters=filters, fields=["name", "sales_quantity"], limit=1)

	if existing and not mode:
		return {"status": "duplicate", "existing": {"name": existing[0].name, "sales_quantity": cint(existing[0].sales_quantity)}}

	if existing and mode == "add":
		doc = frappe.get_doc("Market Entry", existing[0].name)
		doc.sales_quantity = cint(doc.sales_quantity) + qty
		doc.save()
		return {"status": "updated", "entry": _entry_dict(doc)}

	doc = frappe.get_doc({
		"doctype": "Market Entry", "date": getdate(date), "brand": brand,
		"model": model, "trim": trim or None, "sales_quantity": qty,
	})
	doc.insert()
	return {"status": "created", "entry": _entry_dict(doc)}


@frappe.whitelist()
def get_entries(date, limit=100):
	"""Tanlangan sanaga kiritilgan qatorlar (oxirgisi tepada) va jami."""
	rows = frappe.get_all(
		"Market Entry", filters={"date": getdate(date)},
		fields=["name", "brand", "model", "trim", "sales_quantity", "creation", "owner"],
		order_by="creation desc", limit_page_length=cint(limit),
	)
	labels = {}
	if rows:
		for m in frappe.get_all("Model", filters={"name": ["in", list({r.model for r in rows if r.model})]}, fields=["name", "model_name"]):
			labels[m.name] = m.model_name
	for r in rows:
		r.model_label = labels.get(r.model) or r.model
		r.sales_quantity = cint(r.sales_quantity)
	totals = frappe.db.sql(
		"select count(*) n, coalesce(sum(sales_quantity), 0) q from `tabMarket Entry` where date = %s",
		(getdate(date),), as_dict=True,
	)[0]
	return {"rows": rows, "count": cint(totals.n), "total": cint(totals.q), "shown": len(rows)}


@frappe.whitelist()
def delete_entry(name):
	frappe.delete_doc("Market Entry", name)
	return {"status": "deleted"}


@frappe.whitelist()
def update_qty(name, sales_quantity):
	doc = frappe.get_doc("Market Entry", name)
	doc.sales_quantity = cint(sales_quantity)
	doc.save()
	return {"status": "updated", "entry": _entry_dict(doc)}
