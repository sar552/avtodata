// Copyright (c) 2026, AvtoData and contributors
// For license information, please see license.txt

frappe.ui.form.on("Model", {
	refresh(frm) {
		set_class_options(frm);
		render_catalog_sections(frm);
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

const MH_STYLE = `
	<style>
		.mh-toolbar { margin-bottom: 8px; }
		.mh-add { cursor: pointer; color: var(--text-muted); border: 1px solid var(--border-color); border-radius: 999px; padding: 1px 10px; font-size: var(--text-sm); }
		.mh-add:hover { color: var(--text-color); }
		.mh-row { border: 1px solid var(--border-color); border-radius: var(--border-radius); padding: 8px 12px; margin-bottom: 8px; cursor: pointer; }
		.mh-row:hover { box-shadow: var(--shadow-sm); }
		.mh-gen-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 16px; }
		.mh-gen-card { border: 1px solid var(--border-color); border-radius: var(--border-radius-lg); overflow: hidden; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; background: var(--card-bg); }
		.mh-gen-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
		.mh-gen-img { height: 260px; background: var(--bg-color); display: flex; align-items: center; justify-content: center; font-size: 54px; }
		.mh-gen-img img { width: 100%; height: 100%; object-fit: contain; }
		.mh-gen-info { padding: 10px 14px; }
		.mh-muted { color: var(--text-muted); font-size: var(--text-sm); }
		.mh-badge { border: 1px solid var(--border-color); border-radius: 999px; padding: 0 8px; font-size: var(--text-sm); margin-left: 6px; }
		.mh-main { color: var(--primary); border-color: var(--primary); }
		.mh-chips { display: flex; flex-wrap: wrap; gap: 6px; }
		.mh-chip { border: 1px solid var(--border-color); border-radius: 999px; padding: 2px 10px; font-size: var(--text-sm); cursor: pointer; background: var(--bg-color); }
		.mh-chip:hover { box-shadow: var(--shadow-sm); }
	</style>
`;

// Model formasining pastida uchta alohida bo'lim: avlodlar, versiyalar,
// komplektatsiyalar. Har birida o'z "+ Add" tugmasi, yozuvlar bosilganda
// tegishli forma ochiladi.
function render_catalog_sections(frm) {
	const gens_field = frm.get_field("generations_html");
	const vers_field = frm.get_field("versions_html");
	const trims_field = frm.get_field("trims_html");
	if (!gens_field || !vers_field || !trims_field) return;

	if (frm.is_new()) {
		gens_field.$wrapper.html("");
		vers_field.$wrapper.html("");
		trims_field.$wrapper.html("");
		return;
	}
	const esc = frappe.utils.escape_html;
	const empty = `<div class="mh-muted">${__("No records")}</div>`;

	const open_on_click = ($wrapper) => {
		$wrapper.find("[data-name]").on("click", function (e) {
			e.stopPropagation();
			frappe.set_route("Form", $(this).data("doctype"), $(this).data("name"));
		});
	};

	Promise.all([
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Generation",
				fields: [
					"name",
					"generation_name",
					"is_main",
					"is_restyling",
					"production_start",
					"production_end",
					"image",
				],
				filters: { model: frm.doc.name },
				order_by: "creation asc",
				limit_page_length: 0,
			},
		}),
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Trim",
				fields: ["name", "trim_name", "model_version"],
				filters: { model: frm.doc.name },
				order_by: "trim_name asc",
				limit_page_length: 0,
			},
		}),
	]).then(([gens_r, trims_r]) => {
		const gens = gens_r.message || [];
		const trims = trims_r.message || [];
		const gen_label = {};
		for (const g of gens) gen_label[g.name] = g.generation_name;

		const versions_call = gens.length
			? frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Model Version",
						fields: ["name", "version_name", "generation", "engine", "is_main"],
						filters: { generation: ["in", gens.map((g) => g.name)] },
						order_by: "creation asc",
						limit_page_length: 0,
					},
				})
			: Promise.resolve({ message: [] });

		versions_call.then((versions_r) => {
			const versions = versions_r.message || [];

			// 1) Avlodlar
			const gen_rows = gens.length
				? gens
						.map((g) => {
							const badges = [
								g.is_main ? `<span class="mh-badge mh-main">★ ${__("Is Main")}</span>` : "",
								g.is_restyling ? `<span class="mh-badge">${__("Is Restyling")}</span>` : "",
							].join("");
							const start = g.production_start ? g.production_start.slice(0, 4) : "";
							const end = g.production_end ? g.production_end.slice(0, 4) : "н.в.";
							const years = start ? `${start}—${end}` : "";
							const photo = g.image
								? `<img src="${esc(g.image)}" loading="lazy">`
								: "🚗";
							return `
								<div class="mh-gen-card" data-doctype="Generation" data-name="${esc(g.name)}">
									<div class="mh-gen-img">${photo}</div>
									<div class="mh-gen-info">
										<b>${esc(g.generation_name)}</b>
										<div class="mh-muted">${esc(years)}</div>
										<div>${badges}</div>
									</div>
								</div>
							`;
						})
						.join("")
				: empty;
			gens_field.$wrapper.html(`
				${MH_STYLE}
				<div class="mh-toolbar"><span class="mh-add" data-add="gen">+ ${__("Add")}</span></div>
				<div class="mh-gen-grid">${gen_rows}</div>
			`);
			gens_field.$wrapper.find("[data-add]").on("click", () => {
				frappe.new_doc("Generation", { model: frm.doc.name });
			});
			open_on_click(gens_field.$wrapper);

			// 2) Versiyalar
			const ver_rows = versions.length
				? versions
						.map((v) => {
							const main = v.is_main
								? `<span class="mh-badge mh-main">★ ${__("Is Main")}</span>`
								: "";
							return `
								<div class="mh-row" data-doctype="Model Version" data-name="${esc(v.name)}">
									<b>${esc(v.version_name)}</b>
									${v.engine ? `<span class="mh-muted">· ${esc(v.engine)}</span>` : ""}
									<span class="mh-muted">(${esc(gen_label[v.generation] || v.generation)})</span>
									${main}
								</div>
							`;
						})
						.join("")
				: empty;
			vers_field.$wrapper.html(`
				${MH_STYLE}
				<div class="mh-toolbar"><span class="mh-add" data-add="ver">+ ${__("Add")}</span></div>
				${ver_rows}
			`);
			vers_field.$wrapper.find("[data-add]").on("click", () => {
				if (!gens.length) {
					frappe.msgprint(__("Add a generation first."));
					return;
				}
				const defaults = gens.length === 1 ? { generation: gens[0].name } : {};
				frappe.new_doc("Model Version", defaults);
			});
			open_on_click(vers_field.$wrapper);

			// 3) Komplektatsiyalar
			const trim_chips = trims.length
				? trims
						.map(
							(t) =>
								`<span class="mh-chip" data-doctype="Trim" data-name="${esc(t.name)}">${esc(t.trim_name)}${t.model_version ? "" : " ⚠"}</span>`
						)
						.join("")
				: empty;
			trims_field.$wrapper.html(`
				${MH_STYLE}
				<div class="mh-toolbar"><span class="mh-add" data-add="trim">+ ${__("Add")}</span></div>
				<div class="mh-chips">${trim_chips}</div>
			`);
			trims_field.$wrapper.find("[data-add]").on("click", () => {
				frappe.new_doc("Trim", { model: frm.doc.name });
			});
			open_on_click(trims_field.$wrapper);
		});
	});
}
