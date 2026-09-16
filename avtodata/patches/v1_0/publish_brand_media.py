"""Brend logolari va model rasmlarini ochiq (public) fayllarga o'tkazadi.

Ular katalogda hammaga ko'rinishi kerak: private fayl har so'rovda Frappe'ning
ruxsat tekshiruvidan o'tadi va boshqa foydalanuvchida umuman ochilmasligi
mumkin — dashboardda "buzilgan rasm" bo'lib chiqadi. Fayli diskda yo'q
yozuvlarga tegilmaydi (havola saqlanadi, interfeys o'zi chidamli).
"""

import frappe

TARGETS = (("Vehicle Brand", "logo"), ("Model", "image"))


def execute():
	moved = skipped = 0
	for doctype, field in TARGETS:
		if not frappe.db.has_column(doctype, field):
			continue
		rows = frappe.get_all(doctype, filters={field: ["like", "/private/files/%"]}, fields=["name", field])
		for row in rows:
			url = row.get(field)
			files = frappe.get_all("File", filters={"file_url": url, "is_private": 1}, pluck="name")
			for file_name in files:
				try:
					doc = frappe.get_doc("File", file_name)
					doc.is_private = 0
					doc.save(ignore_permissions=True)
					frappe.db.set_value(doctype, row.name, field, doc.file_url, update_modified=False)
					moved += 1
				except Exception:
					# Ko'pincha fayl diskda yo'q — bu yozuvni chetlab o'tamiz
					frappe.db.rollback()
					skipped += 1
	if moved or skipped:
		print(f"publish_brand_media: {moved} ta fayl ochiq qilindi, {skipped} ta o'tkazib yuborildi")
	frappe.db.commit()
