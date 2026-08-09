frappe.provide("avtodata");

// Spec qatorida text_value (Autocomplete) uchun variantlarni boshqaradi:
// tanlangan Technical Spec Definition enum bo'lsa, uning enum_options
// ro'yxatini dropdown qilib beradi (ekranda label_ru, bazada option_code);
// enum bo'lmasa ro'yxat bo'shatiladi va maydon erkin matn qabul qiladi.
avtodata.apply_enum_options = function (frm, cdt, cdn, table_field) {
	const row = locals[cdt][cdn];
	const grid = frm.fields_dict[table_field] && frm.fields_dict[table_field].grid;
	const grid_row = grid && grid.grid_rows_by_docname[cdn];
	if (!grid_row) {
		return;
	}

	const set_options = (options) => {
		const field =
			(grid_row.grid_form && grid_row.grid_form.fields_dict.text_value) ||
			(grid_row.on_grid_fields_dict && grid_row.on_grid_fields_dict.text_value);
		if (field && field.set_data) {
			field.set_data(options);
		}
	};

	if (!row.technical_spec_definition) {
		set_options([]);
		return;
	}

	frappe.db.get_doc("Technical Spec Definition", row.technical_spec_definition).then((spec) => {
		if (spec.data_type === "enum") {
			set_options(
				(spec.enum_options || []).map((o) => ({
					label: o.label_ru || o.option_code,
					value: o.option_code,
				}))
			);
		} else {
			set_options([]);
		}
	});
};
