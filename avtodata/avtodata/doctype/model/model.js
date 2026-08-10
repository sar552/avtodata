// Copyright (c) 2026, AvtoData and contributors
// For license information, please see license.txt

frappe.ui.form.on("Model", {
	refresh(frm) {
		set_class_options(frm);
	},
	vehicle_segment(frm) {
		if (frm.doc.vehicle_class) {
			frm.set_value("vehicle_class", null);
		}
		set_class_options(frm);
	},
});

// Klass variantlari tanlangan segmentning classes jadvalidan olinadi.
function set_class_options(frm) {
	if (!frm.doc.vehicle_segment) {
		frm.set_df_property("vehicle_class", "options", [""]);
		return;
	}
	frappe.db.get_doc("Vehicle Segment", frm.doc.vehicle_segment).then((segment) => {
		const codes = (segment.classes || []).map((row) => row.code);
		frm.set_df_property("vehicle_class", "options", [""].concat(codes));
	});
}
