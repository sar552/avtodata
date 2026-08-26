// Copyright (c) 2026, AvtoData and contributors
// For license information, please see license.txt

frappe.ui.form.on("Market Entry", {
	setup(frm) {
		// Kaskad: brend -> model -> komplektatsiya
		frm.set_query("model", () => {
			if (!frm.doc.brand) {
				return {};
			}
			return { filters: { brand: frm.doc.brand } };
		});
		frm.set_query("trim", () => {
			if (!frm.doc.model) {
				return {};
			}
			return { filters: { model: frm.doc.model } };
		});
	},
	brand(frm) {
		if (frm.doc.model) {
			frm.set_value("model", null);
		}
	},
	model(frm) {
		if (frm.doc.trim) {
			frm.set_value("trim", null);
		}
	},
});
