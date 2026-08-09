// Copyright (c) 2026, AvtoData and contributors
// For license information, please see license.txt

frappe.ui.form.on("Model", {
	setup(frm) {
		// Klasslar tanlangan segment ichidan chiqadi; segment tanlanmagan
		// bo'lsa hammasi ko'rinadi.
		frm.set_query("vehicle_class", () => {
			if (!frm.doc.vehicle_segment) {
				return {};
			}
			return { filters: { vehicle_segment: frm.doc.vehicle_segment } };
		});
	},
	vehicle_segment(frm) {
		if (frm.doc.vehicle_class) {
			frm.set_value("vehicle_class", null);
		}
	},
});
