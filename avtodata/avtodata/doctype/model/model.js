// Copyright (c) 2026, AvtoData and contributors
// For license information, please see license.txt

frappe.ui.form.on("Model", {
	refresh(frm) {
		set_class_options(frm);
		render_trims_section(frm);
		if (!frm.is_new() && frm.doc.brand) {
			frm.add_custom_button(__("Model Dashboard"), () => {
				frappe.set_route("model-dashboard", frm.doc.brand);
			});
		}
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

// Model formasining pastida komplektatsiyalar ro'yxati: chip bosilsa Trim
// formasi ochiladi, "+ Add" yangi Trim'ni shu model bilan ochadi.
function render_trims_section(frm) {
	const field = frm.get_field("trims_html");
	if (!field) return;
	if (frm.is_new()) {
		field.$wrapper.html("");
		return;
	}
	const esc = frappe.utils.escape_html;

	frappe.call({
		method: "frappe.client.get_list",
		args: {
			doctype: "Trim",
			fields: ["name", "trim_name"],
			filters: { model: frm.doc.name },
			order_by: "trim_name asc",
			limit_page_length: 0,
		},
		callback(r) {
			const trims = r.message || [];
			const chips = trims.length
				? trims
						.map(
							(t) =>
								`<span class="mh-chip" data-name="${esc(t.name)}">${esc(t.trim_name)}</span>`
						)
						.join("")
				: `<span class="mh-muted">${__("No records")}</span>`;

			field.$wrapper.html(`
				<style>
					.mh-toolbar { margin-bottom: 8px; }
					.mh-add { cursor: pointer; color: var(--text-muted); border: 1px solid var(--border-color); border-radius: 999px; padding: 1px 10px; font-size: var(--text-sm); }
					.mh-add:hover { color: var(--text-color); }
					.mh-muted { color: var(--text-muted); font-size: var(--text-sm); }
					.mh-chips { display: flex; flex-wrap: wrap; gap: 6px; }
					.mh-chip { border: 1px solid var(--border-color); border-radius: 999px; padding: 2px 10px; font-size: var(--text-sm); cursor: pointer; background: var(--bg-color); }
					.mh-chip:hover { box-shadow: var(--shadow-sm); }
				</style>
				<div class="mh-toolbar"><span class="mh-add">+ ${__("Add")}</span></div>
				<div class="mh-chips">${chips}</div>
			`);

			field.$wrapper.find(".mh-chip").on("click", function () {
				frappe.set_route("Form", "Trim", $(this).data("name"));
			});
			field.$wrapper.find(".mh-add").on("click", () => {
				frappe.new_doc("Trim", { model: frm.doc.name });
			});
		},
	});
}
