frappe.pages["sales-entry"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Sales Entry"), single_column: true });
	wrapper.sales_entry = new SalesEntry(wrapper, page);
};

frappe.pages["sales-entry"].on_page_show = function (wrapper) {
	wrapper.sales_entry && wrapper.sales_entry.refresh_list();
};

const SE_API = "avtodata.avtodata.page.sales_entry.sales_entry";
// Int uchun frappe.format() HTML qaytaradi — bu yerda sof raqam kerak.
const n = (v) => cint(v).toLocaleString("ru-RU");
const esc = (v) => frappe.utils.escape_html(String(v == null ? "" : v));

class SalesEntry {
	constructor(wrapper, page) {
		this.page = page;
		this.$main = $(wrapper).find(".layout-main-section");
		this.rows = [];
		this.$root = $(`
			<style>
				.se-wrap { font-size: 14px; max-width: 1120px; }
				.se-lbl { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 5px; }
				.se-top { display: flex; flex-wrap: wrap; gap: 12px; align-items: stretch; margin-bottom: 14px; }
				.se-card { border: 1px solid var(--border-color); border-radius: 10px; background: var(--card-bg); padding: 10px 14px; }
				.se-card.date { min-width: 200px; }
				.se-card.stat { min-width: 150px; display: flex; flex-direction: column; justify-content: center; }
				.se-card.stat .v { font-size: 26px; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; }
				.se-card.stat .u { font-size: 12px; color: var(--text-muted); font-weight: 500; margin-left: 3px; }
				.se-panel { border: 1px solid var(--border-color); border-radius: 12px; background: var(--card-bg); padding: 14px 16px; }
				.se-form { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(180px, 1.25fr) minmax(140px, 1fr) 110px auto; gap: 12px; align-items: end; }
				@media (max-width: 860px) { .se-form { grid-template-columns: 1fr 1fr; } }
				.se-form .btn-save { height: 32px; padding: 0 20px; font-weight: 600; }
				.se-hint { font-size: 12px; color: var(--text-muted); margin-top: 10px; display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
				.se-hint kbd { border: 1px solid var(--border-color); border-bottom-width: 2px; border-radius: 4px; padding: 0 5px; font-size: 11px; background: var(--bg-color); }
				.se-warn { margin-top: 10px; font-size: 13px; border-radius: 8px; padding: 7px 11px; display: none;
					color: var(--text-color); background: var(--bg-color); border: 1px solid var(--border-color); border-left: 3px solid var(--yellow-500, #eda100); }
				.se-list { margin-top: 18px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--card-bg); overflow: hidden; }
				.se-list h4 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin: 0; padding: 12px 16px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); }
				.se-table { width: 100%; border-collapse: collapse; font-size: 14px; }
				.se-table th { text-align: left; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); padding: 8px 16px; border-bottom: 1px solid var(--border-color); font-weight: 700; }
				.se-table td { padding: 9px 16px; border-bottom: 1px solid var(--border-color); }
				.se-table tr:last-child td { border-bottom: 0; }
				.se-table td.num, .se-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
				.se-table td.idx { color: var(--text-muted); width: 46px; }
				.se-table tr:hover td { background: var(--bg-color); }
				.se-table .repeat { cursor: pointer; } .se-table .repeat:hover { color: var(--primary); }
				.se-table .qty { cursor: pointer; font-weight: 600; } .se-table .qty:hover { color: var(--primary); }
				.se-table .del { cursor: pointer; color: var(--text-muted); width: 40px; text-align: center; } .se-table .del:hover { color: var(--red-500, #b3261e); }
				.se-fresh td { animation: se-flash 1.4s ease-out; }
				@keyframes se-flash { from { background: var(--bg-green, #e3f5ea); } to { background: transparent; } }
				.se-empty { padding: 28px; text-align: center; color: var(--text-muted); }
			</style>
			<div class="se-wrap">
				<div class="se-top">
					<div class="se-card date"><div class="se-lbl">${__("Date")}</div><div class="f-date"></div></div>
					<div class="se-card stat"><div class="se-lbl">${__("Total for the date")}</div><div class="v"><span class="t-qty">0</span><span class="u">${__("units")}</span></div></div>
					<div class="se-card stat"><div class="se-lbl">${__("Rows")}</div><div class="v t-rows">0</div></div>
				</div>
				<div class="se-panel">
					<div class="se-form">
						<div><div class="se-lbl">${__("Brand")}</div><div class="f-brand"></div></div>
						<div><div class="se-lbl">${__("Model")}</div><div class="f-model"></div></div>
						<div><div class="se-lbl">${__("Trim")}</div><div class="f-trim"></div></div>
						<div><div class="se-lbl">${__("Quantity")}</div><div class="f-qty"></div></div>
						<div><button class="btn btn-primary btn-sm btn-save">${__("Save")}</button></div>
					</div>
					<div class="se-warn"></div>
					<div class="se-hint">
						<span>${__("Brand stays after saving — enter models one after another")}</span>
						<span><kbd>Enter</kbd> ${__("in the quantity field saves the row")}</span>
						<span><kbd>Esc</kbd> ${__("clears the row")}</span>
					</div>
				</div>
				<div class="se-list"></div>
			</div>
		`).appendTo(this.$main);

		this.make_fields();
		this.refresh_list();
	}

	make_fields() {
		const mk = (sel, df) => {
			const c = frappe.ui.form.make_control({
				df: Object.assign({ fieldname: sel.slice(3) }, df),
				parent: this.$root.find(sel)[0], render_input: true, only_input: true,
			});
			c.refresh();
			return c;
		};
		this.date = mk(".f-date", { fieldtype: "Date", change: () => this.refresh_list() });
		this.date.set_value(frappe.datetime.get_today());

		this.brand = mk(".f-brand", { fieldtype: "Link", options: "Vehicle Brand", placeholder: __("Select brand"),
			change: () => { if (this.model.get_value()) this.model.set_value(""); this.check_dup(); } });
		this.model = mk(".f-model", { fieldtype: "Link", options: "Model", placeholder: __("Select model"),
			get_query: () => ({ filters: this.brand.get_value() ? { brand: this.brand.get_value(), is_active: 1 } : { is_active: 1 } }),
			change: () => {
				const m = this.model.get_value();
				if (m && !this.brand.get_value()) frappe.db.get_value("Model", m, "brand").then((r) => r.message && this.brand.set_value(r.message.brand));
				if (this.trim.get_value()) this.trim.set_value("");
				this.check_dup();
				if (m) setTimeout(() => this.qty.$input.focus().select(), 60);
			} });
		this.trim = mk(".f-trim", { fieldtype: "Link", options: "Trim", placeholder: __("No trim"),
			get_query: () => ({ filters: this.model.get_value() ? { model: this.model.get_value() } : {} }),
			change: () => this.check_dup() });
		this.qty = mk(".f-qty", { fieldtype: "Int", placeholder: "0" });

		this.qty.$input.on("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); this.save(); } });
		this.$root.on("keydown", (e) => { if (e.key === "Escape") this.reset(true); });
		this.$root.find(".btn-save").on("click", () => this.save());
		setTimeout(() => this.brand.$input && this.brand.$input.focus(), 250);
	}

	values() {
		return { date: this.date.get_value(), brand: this.brand.get_value(), model: this.model.get_value(), trim: this.trim.get_value() || null, sales_quantity: this.qty.get_value() };
	}

	// Xuddi shu sana+model+komplektatsiya allaqachon kiritilganini oldindan aytadi
	check_dup() {
		const v = this.values(), $w = this.$root.find(".se-warn");
		if (!v.model) return $w.hide();
		const hit = this.rows.find((r) => r.model === v.model && (r.trim || null) === v.trim);
		if (hit) $w.html(`⚠ ${__("Already entered for this date")}: <b>${n(hit.sales_quantity)}</b> ${__("units")} — ${__("saving will offer to add to it")}`).show();
		else $w.hide();
	}

	reset(all) {
		if (all) this.brand.set_value("");
		this.model.set_value("");
		this.trim.set_value("");
		this.qty.set_value(0);
		this.$root.find(".se-warn").hide();
		setTimeout(() => (all ? this.brand : this.model).$input.focus(), 60);
	}

	save(mode) {
		const v = this.values();
		if (!v.date) return frappe.show_alert({ message: __("Select a date"), indicator: "orange" });
		if (!v.model) { frappe.show_alert({ message: __("Select a model"), indicator: "orange" }); return this.model.$input.focus(); }
		const qty = cint(v.sales_quantity);
		if (qty < 0) { frappe.show_alert({ message: __("Sales quantity cannot be negative."), indicator: "red" }); return this.qty.$input.focus(); }

		frappe.call({ method: `${SE_API}.quick_save`, args: Object.assign({}, v, { sales_quantity: qty, mode }) }).then((r) => {
			const res = r.message;
			if (!res) return;
			if (res.status === "duplicate") return this.ask_duplicate(res.existing, qty);
			frappe.show_alert({ message: res.status === "updated" ? __("Row updated") : __("Row added"), indicator: "green" });
			this.fresh = res.entry.name;
			this.reset(false);
			this.refresh_list();
		});
	}

	ask_duplicate(existing, qty) {
		const d = new frappe.ui.Dialog({
			title: __("Row already exists"),
			fields: [{ fieldtype: "HTML", options: `<div style="font-size:14px;line-height:1.6">${__("A row for this date and model already exists: {0} units.", [`<b>${n(existing.sales_quantity)}</b>`])}<br>${__("Add {0} to it, or create a separate row?", [`<b>${n(qty)}</b>`])}</div>` }],
			primary_action_label: __("Add to existing"),
			primary_action: () => { d.hide(); this.save("add"); },
			secondary_action_label: __("Create separate row"),
			secondary_action: () => { d.hide(); this.save("new"); },
		});
		d.show();
	}

	refresh_list() {
		const date = this.date && this.date.get_value();
		if (!date) return;
		frappe.call({ method: `${SE_API}.get_entries`, args: { date } }).then((r) => {
			const d = r.message || { rows: [], total: 0, count: 0, shown: 0 };
			this.rows = d.rows;
			this.check_dup();
			this.$root.find(".t-qty").text(n(d.total));
			this.$root.find(".t-rows").text(n(d.count));
			const $l = this.$root.find(".se-list");
			if (!d.rows.length) return $l.html(`<div class="se-empty">${__("No rows for this date yet — enter the first one above")}</div>`);

			$l.html(`<h4>${__("Rows for {0}", [frappe.datetime.str_to_user(date)])}</h4><div style="overflow-x:auto"><table class="se-table">
				<tr><th class="idx">#</th><th>${__("Brand")}</th><th>${__("Model")}</th><th>${__("Trim")}</th><th class="num">${__("Quantity")}</th><th></th></tr>
				${d.rows.map((row, i) => `<tr class="${this.fresh === row.name ? "se-fresh" : ""}" data-name="${esc(row.name)}">
					<td class="idx">${i + 1}</td>
					<td class="repeat">${esc(row.brand)}</td>
					<td class="repeat"><b>${esc(row.model_label || row.model)}</b></td>
					<td>${row.trim ? esc(row.trim) : "—"}</td>
					<td class="num qty" title="${__("Click to edit")}">${n(row.sales_quantity)}</td>
					<td class="del" title="${__("Delete")}">✕</td></tr>`).join("")}
			</table></div>${d.shown < d.count ? `<div class="se-empty">${__("Showing last {0} of {1} rows", [d.shown, d.count])}</div>` : ""}`);
			this.fresh = null;

			$l.find(".del").on("click", (e) => {
				const name = $(e.currentTarget).closest("tr").data("name");
				frappe.confirm(__("Delete this row?"), () => frappe.call({ method: `${SE_API}.delete_entry`, args: { name } }).then(() => { frappe.show_alert({ message: __("Row deleted"), indicator: "orange" }); this.refresh_list(); }));
			});
			$l.find(".qty").on("click", (e) => {
				const name = $(e.currentTarget).closest("tr").data("name");
				const row = this.rows.find((x) => x.name === name);
				frappe.prompt({ fieldtype: "Int", label: __("Quantity"), fieldname: "q", default: row.sales_quantity },
					(vals) => frappe.call({ method: `${SE_API}.update_qty`, args: { name, sales_quantity: vals.q } }).then(() => { frappe.show_alert({ message: __("Row updated"), indicator: "green" }); this.refresh_list(); }),
					__("Edit quantity"), __("Save"));
			});
			$l.find(".repeat").on("click", (e) => {
				const row = this.rows.find((x) => x.name === $(e.currentTarget).closest("tr").data("name"));
				this.brand.set_value(row.brand);
				setTimeout(() => { this.model.set_value(row.model); this.trim.set_value(row.trim || ""); setTimeout(() => this.qty.$input.focus().select(), 120); }, 120);
			});
		});
	}
}
