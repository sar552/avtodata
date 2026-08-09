// Copyright (c) 2026, AvtoData and contributors
// For license information, please see license.txt

frappe.ui.form.on("Trim Technical Spec Value", {
	form_render(frm, cdt, cdn) {
		avtodata.apply_enum_options(frm, cdt, cdn, "technical_specs");
	},
	technical_spec_definition(frm, cdt, cdn) {
		avtodata.apply_enum_options(frm, cdt, cdn, "technical_specs");
	},
});
