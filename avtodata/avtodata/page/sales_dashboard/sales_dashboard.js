frappe.pages["sales-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Sales Analytics"),
		single_column: true,
	});
	$(wrapper).find(".container").css({ "max-width": "100%", "padding-left": "28px", "padding-right": "28px" });
	wrapper.sales_dashboard = new SalesDashboard(wrapper, page);
};

frappe.pages["sales-dashboard"].on_page_show = function (wrapper) {
	wrapper.sales_dashboard && wrapper.sales_dashboard.handle_route();
};

const SD_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948"];
const SD_API = "avtodata.avtodata.page.sales_dashboard.sales_dashboard";

const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("ru-RU"));
const fmtk = (n) => (n == null ? "—" : Math.abs(n) >= 10000 ? (n / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " " + __("k") : fmt(n));
const pct = (v, digits = 1) => (v == null ? "—" : (v > 0 ? "+" : "") + v.toLocaleString("ru-RU", { maximumFractionDigits: digits }) + "%");
const cls = (v) => (v == null ? "" : v > 0 ? "sd-up" : v < 0 ? "sd-down" : "");
const mlabel = (ym) => moment(ym, "YYYY-MM").format("MMM YY");
const esc = (s) => frappe.utils.escape_html(String(s == null ? "" : s));

class SalesDashboard {
	constructor(wrapper, page) {
		this.page = page;
		this.$main = $(wrapper).find(".layout-main-section");
		// .page-form (filtr paneli) shu bo'limning ichida turadi — uni o'chirmaslik uchun
		// o'z konteynerimizni qo'shamiz, .html() bilan hammasini almashtirmaymiz.
		this.$root = $('<div class="sd-root"></div>').appendTo(this.$main);
		this.sf = {};
		this.gf = {};
		this.share_mode = "month";
		this.$root.html(`
			<style>
				.sd-body { font-size: 14px; --sd-up: #1a7f4b; --sd-down: #b3261e; --sd-bar-prev: #a3acc2; }
				[data-theme="dark"] .sd-body { --sd-up: #6fd39a; --sd-down: #f28b84; --sd-bar-prev: #5b647a; }
				.sd-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
				.sd-tab { border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 18px; font-size: 15px; cursor: pointer; background: var(--card-bg); font-weight: 500; }
				.sd-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }
				.sd-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; align-items: end; padding: 12px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--card-bg); margin-bottom: 14px; }
				.sd-filters label { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 3px; }
				.sd-filters select, .sd-filters input { width: 100%; }
				.sd-sub { color: var(--text-muted); font-size: var(--text-sm); margin: -8px 0 12px; }
				.sd-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 14px; }
				.sd-kpi { border: 1px solid var(--border-color); border-top: 3px solid var(--k, var(--primary)); border-radius: 10px; padding: 10px 14px; background: var(--card-bg); }
				.sd-kpi.click { cursor: pointer; } .sd-kpi.click:hover { box-shadow: var(--shadow-sm); }
				.sd-kpi .k { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
				.sd-kpi .v { font-size: 30px; font-weight: 700; margin: 2px 0; }
				.sd-kpi .d { font-size: 13px; color: var(--text-muted); }
				.sd-up { color: var(--sd-up); } .sd-down { color: var(--sd-down); }
				.sd-h { font-size: 20px; font-weight: 700; margin: 18px 0 2px; }
				.sd-hs { color: var(--text-muted); font-size: 14px; margin-bottom: 10px; }
				.sd-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; margin-bottom: 12px; }
				.sd-panel { grid-column: span 4; border: 1px solid var(--border-color); border-radius: 10px; padding: 12px 14px; background: var(--card-bg); min-width: 0; }
				.sd-panel.c6 { grid-column: span 6; } .sd-panel.c8 { grid-column: span 8; } .sd-panel.c12 { grid-column: span 12; }
				@media (max-width: 900px) { .sd-panel, .sd-panel.c6, .sd-panel.c8 { grid-column: span 12; } }
				.sd-panel h4 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 2px; }
				.sd-panel .hint { font-size: 13px; color: var(--text-muted); margin-bottom: 8px; }
				.sd-hbar { display: grid; grid-template-columns: minmax(110px, 30%) 1fr 80px; gap: 8px; align-items: center; font-size: 14px; padding: 4px 0; }
				.sd-hbar .n { color: var(--text-muted); font-size: 11px; margin-right: 4px; }
				.sd-hbar .bar { height: 18px; border-radius: 4px; background: var(--s, var(--primary)); min-width: 2px; }
				.sd-hbar .val { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
				.sd-hbar.cur .l { font-weight: 700; }
				.sd-drv { display: grid; grid-template-columns: minmax(100px, 28%) 1fr; gap: 8px; align-items: center; font-size: 14px; padding: 3px 0; }
				.sd-drv .track { position: relative; height: 20px; }
				.sd-drv .track i { position: absolute; top: 0; height: 20px; border-radius: 4px; }
				.sd-drv .track b { position: absolute; top: 0; line-height: 20px; font-size: 12px; }
				.sd-tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
				.sd-tier { border: 1px solid var(--border-color); border-left: 3px solid var(--k); border-radius: 8px; padding: 10px 12px; cursor: pointer; }
				.sd-tier:hover { box-shadow: var(--shadow-sm); } .sd-tier.active { outline: 2px solid var(--k); }
				.sd-tier .t { display: flex; justify-content: space-between; font-weight: 600; font-size: var(--text-sm); }
				.sd-tier .v { font-size: 22px; font-weight: 700; }
				.sd-tier .m { font-size: 12px; color: var(--text-muted); }
				.sd-tier .p { height: 5px; border-radius: 3px; background: var(--bg-color); margin-top: 6px; overflow: hidden; } .sd-tier .p i { display: block; height: 100%; background: var(--k); }
				.sd-stack { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 12px; background: var(--bg-color); }
				.sd-table { width: 100%; border-collapse: collapse; font-size: 14px; }
				.sd-table th { text-align: left; font-size: 12px; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); padding: 6px 8px; border-bottom: 1px solid var(--border-color); }
				.sd-table td { padding: 9px 8px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
				.sd-table td.num, .sd-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
				.sd-table tr.click { cursor: pointer; } .sd-table tr.click:hover td { background: var(--bg-color); }
				.sd-seg { display: inline-flex; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
				.sd-seg span { padding: 4px 12px; font-size: var(--text-sm); cursor: pointer; } .sd-seg span.on { background: var(--primary); color: #fff; }
				.sd-vbars { display: flex; align-items: flex-end; gap: 6px; height: 210px; padding-top: 18px; }
				.sd-vbars .col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; min-width: 0; }
				.sd-vbars .col .b { width: 100%; border-radius: 5px 5px 0 0; background: var(--primary); } .sd-vbars .col.none .b { background: var(--border-color); height: 100% !important; opacity: .6; }
				.sd-vbars .col .v { font-size: 12px; font-weight: 600; margin-bottom: 3px; white-space: nowrap; } .sd-vbars .col .l { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
				.sd-focus { display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: center; margin-bottom: 8px; }
				.sd-focus .img { width: 96px; height: 64px; border-radius: 8px; background: var(--bg-color); display: grid; place-items: center; overflow: hidden; font-size: 26px; } .sd-focus .img img { width: 100%; height: 100%; object-fit: contain; }
				.sd-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
				.sd-card { border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; background: var(--card-bg); }
				.sd-card.first { border-color: var(--primary); }
				.sd-card .top { display: flex; justify-content: space-between; padding: 10px 12px 0; } .sd-card .top small { display: block; color: var(--text-muted); font-size: 12px; text-transform: uppercase; }
				.sd-card .img { height: 90px; display: grid; place-items: center; font-size: 30px; } .sd-card .img img { max-height: 90px; max-width: 100%; object-fit: contain; }
				.sd-card .qty { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 14px; } .sd-card .qty b { font-size: 16px; }
				.sd-card .foot { background: var(--primary); color: #fff; text-align: center; font-size: 12px; padding: 6px; }
				.sd-badge { border: 1px solid var(--border-color); border-radius: 999px; padding: 1px 8px; font-size: 11px; color: var(--text-muted); }
				.sd-stats { font-size: 14px; } .sd-stats div { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed var(--border-color); } .sd-stats b { font-variant-numeric: tabular-nums; }
				.sd-empty { padding: 40px; text-align: center; color: var(--text-muted); }
				.sd-btn { cursor: pointer; border: 1px solid var(--border-color); border-radius: 8px; padding: 5px 12px; font-size: var(--text-sm); background: var(--card-bg); }
			</style>
			<div class="sd-tabs">
				<span class="sd-tab" data-tab="sales">${__("Sales Dashboard")}</span>
				<span class="sd-tab" data-tab="segments">${__("Market Segments")}</span>
			</div>
			<div class="sd-body"><div class="sd-empty">${__("Loading")}...</div></div>
		`);
		this.$body = this.$root.find(".sd-body");
		this.$root.on("click", ".sd-tab", (e) => frappe.set_route("sales-dashboard", $(e.currentTarget).data("tab")));
		this.bounds = null;
		this.setup_filters();
	}

	// Standart Frappe filtr-paneli (hisobotlardagi kabi): Link maydonlar,
	// tayyor davrlar va sana oralig'i.
	setup_filters() {
		const F = (this.F = {});
		const add = (df) => (F[df.fieldname] = this.page.add_field(df));
		const reload_sales = () => this.load_sales();
		const reload_seg = () => { this.gf.focus_model = undefined; this.load_segments(); };

		add({ fieldname: "brand", label: __("Brand"), fieldtype: "Link", options: "Vehicle Brand", change: () => { F.model.set_input(""); reload_sales(); } });
		add({ fieldname: "model", label: __("Model"), fieldtype: "Link", options: "Model", get_query: () => (F.brand.get_value() ? { filters: { brand: F.brand.get_value() } } : {}), change: reload_sales });
		add({ fieldname: "vtype", label: __("Vehicle type"), fieldtype: "Link", options: "Vehicle Segment", change: reload_sales });
		add({ fieldname: "segment", label: __("Segment"), fieldtype: "Select", options: [""], change: reload_sales });
		add({ fieldname: "fuel", label: __("Powertrain"), fieldtype: "Link", options: "Fuel Type", change: reload_sales });
		add({ fieldname: "timespan", label: __("Timespan"), fieldtype: "Select", default: "all",
			options: [["all", __("All time")], ["last_month", __("Last month")], ["last_3", __("Last 3 months")], ["last_6", __("Last 6 months")], ["last_12", __("Last 12 months")], ["ytd", __("Year to date")], ["last_year", __("Last year")], ["custom", __("Custom")]].map(([value, label]) => ({ value, label })),
			change: () => { if (F.timespan.get_value() !== "custom") { this.apply_timespan(); reload_sales(); } } });
		const custom_dates = () => { F.timespan.set_input("custom"); reload_sales(); };
		add({ fieldname: "from_date", label: __("From date"), fieldtype: "Date", change: custom_dates });
		add({ fieldname: "to_date", label: __("To date"), fieldtype: "Date", change: custom_dates });

		add({ fieldname: "g_segment", label: __("Segment"), fieldtype: "Select", options: [""], change: reload_seg });
		add({ fieldname: "g_year", label: __("Year"), fieldtype: "Select", options: [""], change: reload_seg });
		add({ fieldname: "g_period", label: __("Period"), fieldtype: "Select", default: "ytd",
			options: [["ytd", __("Year to date")], ["q1", "Q1"], ["q2", "Q2"], ["q3", "Q3"], ["q4", "Q4"], ["h1", __("First half-year")], ["h2", __("Second half-year")], ["year", __("Full year")]].map(([value, label]) => ({ value, label })),
			change: reload_seg });

		this.page.set_secondary_action(__("Reset filters"), () => {
			["brand", "model", "vtype", "segment", "fuel", "from_date", "to_date", "g_segment"].forEach((k) => F[k].set_input(""));
			F.timespan.set_input("all");
			F.g_period.set_input("ytd");
			this.gf = {};
			this.tier = undefined;
			this.handle_route();
		});
	}

	show_filters(tab) {
		const sales = ["brand", "model", "vtype", "segment", "fuel", "timespan", "from_date", "to_date"];
		Object.entries(this.F).forEach(([k, c]) => c.$wrapper.toggle(sales.includes(k) ? tab === "sales" : tab === "segments"));
	}

	// Tayyor davr -> sana oralig'i (ma'lumotning oxirgi oyidan hisoblanadi)
	apply_timespan() {
		const F = this.F, ts = F.timespan.get_value() || "all";
		if (!this.bounds) return;
		const to = this.bounds.to, shift = (ym, n) => moment(ym, "YYYY-MM").add(n, "months").format("YYYY-MM");
		let from = this.bounds.from, upto = to;
		if (ts === "last_month") from = to;
		else if (ts === "last_3") from = shift(to, -2);
		else if (ts === "last_6") from = shift(to, -5);
		else if (ts === "last_12") from = shift(to, -11);
		else if (ts === "ytd") from = to.slice(0, 4) + "-01";
		else if (ts === "last_year") { from = String(+to.slice(0, 4) - 1) + "-01"; upto = String(+to.slice(0, 4) - 1) + "-12"; }
		F.from_date.set_input(from + "-01");
		F.to_date.set_input(moment(upto, "YYYY-MM").endOf("month").format("YYYY-MM-DD"));
	}

	sales_filters() {
		const F = this.F, f = { brand: F.brand.get_value(), model: F.model.get_value(), vtype: F.vtype.get_value(), segment: F.segment.get_value(), fuel: F.fuel.get_value(), tier: this.tier };
		const iso = (v) => (!v ? "" : /^\d{4}-\d{2}-\d{2}/.test(v) ? v : frappe.datetime.user_to_str(v));
		const a = iso(F.from_date.get_value()), b = iso(F.to_date.get_value());
		if (a) f.from = a.slice(0, 7);
		if (b) f.to = b.slice(0, 7);
		Object.keys(f).forEach((k) => { if (!f[k]) delete f[k]; });
		return f;
	}

	set_select_options(control, options, keep) {
		control.df.options = options;
		control.refresh();
		control.set_input(keep && options.some((o) => (o.value ?? o) === keep) ? keep : options.length ? (options[0].value ?? options[0]) : "");
	}

	handle_route() {
		const tab = frappe.get_route()[1] === "segments" ? "segments" : "sales";
		this.$root.find(".sd-tab").removeClass("active").filter(`[data-tab=${tab}]`).addClass("active");
		this.show_filters(tab);
		tab === "segments" ? this.load_segments() : this.load_sales();
	}

	// ---------------------------------------------------------- helpers
	chart(sel, opts) {
		const el = this.$body.find(sel)[0];
		if (!el) return;
		el.innerHTML = "";
		return new frappe.Chart(el, Object.assign({ colors: SD_COLORS, height: 230, animate: 0, truncateLegends: 1 }, opts));
	}
	hbars(rows, key, color, current) {
		const max = Math.max(...rows.map((r) => r.qty), 1);
		return rows
			.map((r, i) => `<div class="sd-hbar ${r[key] === current ? "cur" : ""}" data-key="${esc(r[key])}"><span class="l"><span class="n">#${i + 1}</span>${esc(r.label || r[key])}</span><div class="bar" style="width:${(r.qty / max) * 100}%;--s:${color}"></div><span class="val">${fmtk(r.qty)}</span></div>`)
			.join("");
	}
	drivers(rows) {
		if (!rows.length) return `<div class="sd-empty">${__("No comparable months")}</div>`;
		const max = Math.max(...rows.map((r) => Math.abs(r.delta)), 1);
		return rows
			.map((r) => {
				const w = (Math.abs(r.delta) / max) * 45, pos = r.delta >= 0;
				return `<div class="sd-drv"><span>${esc(r.label)}</span><div class="track"><i style="left:${pos ? 50 : 50 - w}%;width:${w}%;background:${pos ? SD_COLORS[2] : SD_COLORS[6]}"></i><b style="${pos ? `left:${50 + w + 1}%` : `right:${50 + w + 1}%`}" class="${cls(r.delta)}">${r.delta > 0 ? "+" : ""}${fmtk(r.delta)}</b></div></div>`;
			})
			.join("");
	}
	select(name, label, options, value, all_label) {
		return `<div><label>${label}</label><select class="form-control input-sm" data-f="${name}">${all_label === "" ? "" : `<option value="">${all_label || __("All")}</option>`}${options.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></div>`;
	}

	// ---------------------------------------------------------- SALES TAB
	load_sales() {
		this.$body.html(`<div class="sd-empty">${__("Loading")}...</div>`);
		this.sf = this.sales_filters();
		frappe.call({ method: `${SD_API}.get_sales_data`, args: { filters: this.sf } }).then((r) => this.render_sales(r.message));
	}

	render_sales(d) {
		if (!d || d.empty) {
			this.$body.html(`<div class="sd-empty">${__("No sales entries yet")}</div>`);
			return;
		}
		const o = d.options, F = this.F;
		this.bounds = d.bounds;
		const seg_opts = [{ value: "", label: __("All segments") }].concat(o.segments.map((v) => ({ value: v, label: v })));
		if (JSON.stringify(F.segment.df.options) !== JSON.stringify(seg_opts)) { F.segment.df.options = seg_opts; F.segment.refresh(); }
		F.segment.set_input(this.sf.segment || "");
		if (!F.from_date.get_value() && !F.to_date.get_value()) this.apply_timespan();
		const k = d.kpi;
		const fuel_tiles = k.fuel.map((x, i) => `<div class="sd-kpi click" style="--k:${SD_COLORS[i + 1]}" data-fuel="${esc(x.fuel)}"><div class="k">${__("Powertrain")}: ${esc(x.fuel)}</div><div class="v">${fmt(x.qty)}</div><div class="d">${__("Click to filter")}</div></div>`).join("");
		const tier_total = d.tiers.reduce((a, t) => a + t.qty, 0) || 1;

		this.$body.html(`
			<div class="sd-sub">${__("Data")}: ${mlabel(d.bounds.from)} — ${mlabel(d.bounds.to)} · ${__("Selected")}: ${mlabel(d.period.from)} — ${mlabel(d.period.to)}</div>
			<div class="sd-kpis">
				<div class="sd-kpi" style="--k:${SD_COLORS[2]}"><div class="k">${__("Sales, units")}</div><div class="v">${fmt(k.total)}</div><div class="d"><b class="${cls(k.growth)}">${pct(k.growth)}</b> · ${k.comparable_months} ${__("comparable months to previous year")}</div></div>
				${fuel_tiles}
				<div class="sd-kpi" style="--k:${SD_COLORS[0]}"><div class="k">${__("Brands, count")}</div><div class="v">${fmt(k.brands)}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[5]}"><div class="k">${__("Models, count")}</div><div class="v">${fmt(k.models)}</div></div>
			</div>
			<div class="sd-grid"><div class="sd-panel c12"><h4>${__("Brand positioning")}</h4><div class="hint">${__("Period, type, segment and powertrain apply; brand and model do not narrow the share base. Click a tier to filter.")}${this.tier ? ` · <b>${__("Applied")}: ${esc(this.tier)}</b> (${__("click again to clear")})` : ""}</div>
				<div class="sd-stack">${d.tiers.map((t, i) => `<i style="width:${(t.qty / tier_total) * 100}%;background:${SD_COLORS[i]}"></i>`).join("")}</div>
				<div class="sd-tiers">${d.tiers.map((t, i) => `<div class="sd-tier ${this.tier === t.tier ? "active" : ""}" data-tier="${esc(t.tier)}" style="--k:${SD_COLORS[i]}"><div class="t"><span>${esc(t.tier)}</span><span>${t.pct}%</span></div><div class="v">${fmt(t.qty)} <span class="m">${__("units")}</span></div><div class="m">${t.brands} ${__("brands")}</div><div class="p"><i style="width:${t.pct}%"></i></div></div>`).join("")}</div></div></div>
			<div class="sd-h">${__("Main market dynamics")}</div><div class="sd-hs">${__("Sales volume by years and months, market structure by vehicle types")}</div>
			<div class="sd-grid">
				<div class="sd-panel"><h4>${__("Yearly sales dynamics")}</h4><div class="hint">${__("Click a year to filter")}</div><div class="ch-year"></div></div>
				<div class="sd-panel"><h4>${__("Monthly sales dynamics")}</h4><div class="hint">${__("Last 12 months of the selected period")}</div><div class="ch-month"></div></div>
				<div class="sd-panel"><h4>${__("Top-15 models")}</h4><div class="hint">${__("Sales leaders for the selected period")}</div>${this.hbars(d.top_models, "model", SD_COLORS[2])}</div>
				<div class="sd-panel"><h4>${__("Vehicle type share")}</h4><div class="hint">${__("Market structure: PC, SUV, LCV and other types")}</div><div class="ch-type"></div></div>
				<div class="sd-panel c8"><h4>${__("Top-10 brands")}</h4><div class="hint">${__("Sales leaders for the selected period")}</div>${this.hbars(d.top_brands, "brand", SD_COLORS[0])}</div>
			</div>
			<div class="sd-h">${__("MoM, YoY and change drivers")}</div><div class="sd-hs">${__("Same-period comparison and brand contribution to the change in sales volume")}</div>
			<div class="sd-grid">
				<div class="sd-panel c8"><h4>${d.yoy.year} vs ${d.yoy.year - 1} <span class="sd-badge">${d.yoy.comparable}/${d.yoy.total_months} ${__("months")}</span></h4><div class="hint">${__("Month-by-month comparison of the same periods")}</div><div class="ch-yoy"></div></div>
				<div class="sd-panel"><h4>${__("Change drivers")} <span class="sd-badge">Δ ${d.drivers.total > 0 ? "+" : ""}${fmt(d.drivers.total)}</span></h4><div class="hint">${__("Brand contribution to the change in sales")} · ${d.drivers.months} ${__("comparable months")}</div>${this.drivers(d.drivers.rows)}</div>
			</div>
			<div class="sd-grid"><div class="sd-panel c12"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><h4>${__("Market share dynamics")}</h4><div class="hint">${__("Top-5 of the selected level; share is computed from the whole filtered market")}</div></div><div class="sd-seg sd-share-mode"><span data-m="month">${__("By months")}</span><span data-m="quarter">${__("By quarters")}</span><span data-m="year">${__("By years")}</span></div></div><div class="ch-share"></div></div></div>
			<div class="sd-grid"><div class="sd-panel c12"><h4>${__("Market rating")}</h4><div class="hint">${mlabel(d.rating.L)} · ${__("rating and share for the selected slice")} · MoM: ${mlabel(d.rating.L)} ${__("vs")} ${mlabel(d.rating.P)} · YoY: ${__("vs")} ${mlabel(d.rating.Y)}</div>
				<div style="overflow-x:auto"><table class="sd-table"><tr><th>#</th><th>${__("Brand")}</th><th class="num">${mlabel(d.rating.L)}</th><th class="num">${mlabel(d.rating.P)}</th><th class="num">${mlabel(d.rating.Y)}</th><th class="num">MoM</th><th class="num">YoY</th><th class="num">${__("Market share")}</th><th class="num">${__("Position")}</th></tr>
				${d.rating.rows.map((r) => `<tr class="click" data-brand="${esc(r.brand)}"><td>${r.rank}</td><td><b>${esc(r.label)}</b></td><td class="num">${fmt(r.L)}</td><td class="num">${fmt(r.P)}</td><td class="num">${fmt(r.Y)}</td><td class="num ${cls(r.mom)}">${pct(r.mom)}</td><td class="num ${cls(r.yoy)}">${r.Y ? pct(r.yoy) : __("New")}</td><td class="num">${r.share}%</td><td class="num">#${r.rank} ${r.move > 0 ? `<span class="sd-up">▲${r.move}</span>` : r.move < 0 ? `<span class="sd-down">▼${-r.move}</span>` : "—"}</td></tr>`).join("")}
				</table></div></div></div>
		`);

		const year_chart = this.chart(".ch-year", { type: "line", isNavigable: 1, data: { labels: d.yearly.map((y) => y.year), datasets: [{ name: __("Sales"), values: d.yearly.map((y) => y.qty) }] }, lineOptions: { regionFill: 1, dotSize: 5 }, colors: [SD_COLORS[2]], tooltipOptions: { formatTooltipY: fmt } });
		year_chart && year_chart.parent.addEventListener("data-select", (e) => {
			const y = d.yearly[e.index] && d.yearly[e.index].year;
			if (!y) return;
			F.timespan.set_input("custom");
			F.from_date.set_input(`${y}-01-01`);
			F.to_date.set_input(`${y}-12-31`);
			this.load_sales();
		});
		this.chart(".ch-month", { type: "line", data: { labels: d.monthly.map((m) => mlabel(m.ym)), datasets: [{ name: __("Sales"), values: d.monthly.map((m) => m.qty) }] }, lineOptions: { regionFill: 1, dotSize: 4 }, colors: [SD_COLORS[5]], axisOptions: { xAxisMode: "tick" }, tooltipOptions: { formatTooltipY: fmt } });
		this.chart(".ch-type", { type: "donut", data: { labels: d.type_share.map((t) => t.vtype), datasets: [{ values: d.type_share.map((t) => t.qty) }] }, height: 260 });
		this.chart(".ch-yoy", { type: "bar", data: { labels: d.yoy.rows.map((r) => moment(r.ym, "YYYY-MM").format("MMM")), datasets: [{ name: String(d.yoy.year - 1), values: d.yoy.rows.map((r) => r.prev || 0) }, { name: String(d.yoy.year), values: d.yoy.rows.map((r) => r.cur) }] }, colors: [getComputedStyle(this.$body[0]).getPropertyValue("--sd-bar-prev").trim() || "#a3acc2", SD_COLORS[0]], barOptions: { spaceRatio: 0.4 }, tooltipOptions: { formatTooltipY: fmt } });
		this.render_share(d.share);

		// interaktivlik
		this.$body.find("[data-fuel]").on("click", (e) => F.fuel.set_value($(e.currentTarget).data("fuel")));
		this.$body.find("[data-tier]").on("click", (e) => { const t = $(e.currentTarget).data("tier"); this.tier = this.tier === t ? undefined : t; this.load_sales(); });
		this.$body.find(".sd-table tr[data-brand]").on("click", (e) => F.brand.set_value($(e.currentTarget).data("brand")));
		this.$body.find(".sd-share-mode span").on("click", (e) => { this.share_mode = $(e.currentTarget).data("m"); this.render_share(d.share); });
	}

	render_share(share) {
		this.$body.find(".sd-share-mode span").removeClass("on").filter(`[data-m=${this.share_mode}]`).addClass("on");
		const key = (ym) => this.share_mode === "year" ? ym.slice(0, 4) : this.share_mode === "quarter" ? ym.slice(0, 4) + " Q" + (Math.floor((+ym.slice(5, 7) - 1) / 3) + 1) : mlabel(ym);
		const groups = [];
		share.months.forEach((m, i) => { const k = key(m); let g = groups.find((x) => x.k === k); if (!g) { g = { k, total: 0, s: share.series.map(() => 0) }; groups.push(g); } g.total += share.totals[i]; share.series.forEach((s, j) => (g.s[j] += s.values[i])); });
		this.chart(".ch-share", { type: "line", height: 260, data: { labels: groups.map((g) => g.k), datasets: share.series.map((s, j) => ({ name: s.label, values: groups.map((g) => (g.total ? Math.round((g.s[j] / g.total) * 1000) / 10 : 0)) })) }, lineOptions: { hideDots: groups.length > 30 ? 1 : 0, dotSize: 3 }, axisOptions: { xAxisMode: "tick" }, tooltipOptions: { formatTooltipY: (v) => v + "%" } });
	}

	// -------------------------------------------------------- SEGMENTS TAB
	load_segments() {
		this.$body.html(`<div class="sd-empty">${__("Loading")}...</div>`);
		const F = this.F;
		this.gf = Object.assign({}, this.gf, { segment: F.g_segment.get_value() || undefined, year: F.g_year.get_value() || undefined, period: F.g_period.get_value() || "ytd" });
		frappe.call({ method: `${SD_API}.get_segment_data`, args: { filters: this.gf } }).then((r) => this.render_segments(r.message));
	}

	render_segments(d) {
		if (!d || d.empty) {
			this.$body.html(`<div class="sd-empty">${__("No sales entries with a segment yet")}</div>`);
			return;
		}
		const k = d.kpi, fo = d.focus, F = this.F;
		const seg_opts = d.segments.map((x) => ({ value: x.segment, label: `${x.segment} · ${fmt(x.qty)} ${__("units")}` }));
		if (JSON.stringify(F.g_segment.df.options) !== JSON.stringify(seg_opts)) this.set_select_options(F.g_segment, seg_opts, d.segment); else F.g_segment.set_input(d.segment);
		const year_opts = d.years.map((y) => ({ value: y, label: y }));
		if (JSON.stringify(F.g_year.df.options) !== JSON.stringify(year_opts)) this.set_select_options(F.g_year, year_opts, d.year); else F.g_year.set_input(d.year);
		const img = (src, big) => (src ? `<img src="${esc(src)}" loading="lazy">` : "🚗");
		const months12 = d.monthly_totals, max_m = Math.max(...months12.map((m) => m.qty || 0), 1);

		this.$body.html(`
			<div class="sd-sub" style="margin-top:0;display:flex;justify-content:space-between;align-items:center"><span>${__("Period")}: ${mlabel(d.period.from)} — ${mlabel(d.period.to)} · <span class="sd-badge">${d.period.with_data}/${d.period.months} ${__("months with data")}</span></span><span class="sd-btn sd-print">${__("Print / PDF")}</span></div>
			<div class="sd-kpis">
				<div class="sd-kpi" style="--k:${SD_COLORS[0]}"><div class="k">${__("Segment size")}</div><div class="v">${fmt(k.size)}</div><div class="d">${mlabel(d.period.from)} — ${mlabel(d.period.to)}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[4]}"><div class="k">${__("vs previous period")}</div><div class="v ${cls(k.prev_pct)}">${pct(k.prev_pct)}</div><div class="d">${__("was")} ${fmt(k.prev_size)} ${__("units")}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[6]}"><div class="k">${__("Year over year · YoY")}</div><div class="v ${cls(k.yoy_pct)}">${pct(k.yoy_pct)}</div><div class="d">${__("comparable period")}: ${fmt(k.yoy_size)} ${__("units")}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[2]}"><div class="k">${__("Slice leader")}</div><div class="v">${esc(k.leader ? k.leader.label : "—")}</div><div class="d">${k.leader ? `${fmt(k.leader.qty)} ${__("units")} · ${k.leader_share}% ${__("of the market")}` : ""}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[1]}"><div class="k">${__("Participants")}</div><div class="v">${k.brands} / ${k.models}</div><div class="d">${__("brands / models with sales")}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[5]}"><div class="k">${__("Last month")}</div><div class="v">${fmt(k.last)}</div><div class="d">${mlabel(k.last_ym)} · <b class="${cls(k.mom)}">${pct(k.mom)}</b> MoM</div></div>
			</div>
			<div class="sd-grid">
				<div class="sd-panel"><div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><h4>${__("Focus model")}</h4><div class="hint">${__("Sales, share and position")}</div></div><select class="form-control input-sm sd-focus-sel" style="width:auto">${d.ranking.map((m) => `<option value="${esc(m.model)}" ${fo && m.model === fo.model ? "selected" : ""}>#${m.rank} · ${esc(m.brand)} ${esc(m.label)}</option>`).join("")}</select></div>
					${fo ? `<div class="sd-focus"><div class="img">${img(fo.image)}</div><div><small style="text-transform:uppercase;color:var(--text-muted)">${esc(fo.brand)}</small><div style="font-size:18px;font-weight:700">${esc(fo.label)}</div><span class="sd-badge">#${fo.rank} ${__("for the period")}</span></div></div>
					<div class="ch-focus"></div><div class="ch-focus-share"></div>
					<div class="sd-stats"><div><span>${__("Sales for the period")}</span><b>${fmt(fo.period_qty)} ${__("units")}</b></div><div><span>${__("Market share")}</span><b>${fo.share}%</b></div><div><span>${__("Last month")}</span><b>${fmt(fo.last)} ${__("units")}</b></div><div><span>MoM</span><b class="${cls(fo.mom)}">${pct(fo.mom)}</b></div><div><span>YoY</span><b class="${cls(fo.yoy)}">${pct(fo.yoy)}</b></div></div>` : `<div class="sd-empty">${__("No records")}</div>`}
				</div>
				<div class="sd-panel c8"><h4>${__("Segment rating")} · ${__("Top-3 models")}</h4><div class="hint">${__("Click a card to change the focus")}</div>
					<div class="sd-cards">${d.top3.map((m, i) => `<div class="sd-card ${i === 0 ? "first" : ""}" data-model="${esc(m.model)}"><div class="top"><div><small>#${m.rank} · ${esc(m.brand)}</small><b>${esc(m.label)}</b></div><span class="sd-badge">${m.share}%</span></div><div class="img">${img(m.image)}</div><div class="qty"><span>${__("Sales")}</span><b>${fmt(m.qty)} ${__("units")}</b></div><div class="foot">${m.move > 0 ? `▲ ${m.move} ${__("positions")}` : m.move < 0 ? `▼ ${-m.move} ${__("positions")}` : __("Position unchanged")}</div></div>`).join("")}</div>
				</div>
			</div>
			<div class="sd-grid">
				<div class="sd-panel c8"><div style="display:flex;justify-content:space-between"><div><h4>${__("Segment dynamics")}</h4><div class="hint">${__("Total sales by months")} · ${d.year}</div></div><b style="font-size:18px">${fmt(k.size)} ${__("units")}</b></div>
					<div class="sd-vbars">${months12.map((m) => `<div class="col ${m.qty == null ? "none" : ""}"><span class="v">${m.qty == null ? "" : fmt(m.qty)}</span><div class="b" style="height:${m.qty == null ? 100 : ((m.qty || 0) / max_m) * 100}%"></div><span class="l">${moment(m.ym, "YYYY-MM").format("MMM")}</span></div>`).join("")}</div></div>
				<div class="sd-panel"><h4>${__("Segment structure")}</h4><div class="hint">${__("Market share by brands")}</div><div class="ch-brand-share"></div></div>
			</div>
			<div class="sd-grid">
				<div class="sd-panel"><h4>${__("Brand share dynamics")}</h4><div class="hint">${__("Top-5 brands · percent of segment by months")}</div><div class="ch-brand-dyn"></div></div>
				<div class="sd-panel"><h4>${__("Growth diagnostics")}</h4><div class="hint">${__("Change drivers MoM")} · ${mlabel(d.drivers.from)} → ${mlabel(d.drivers.to)}</div>${this.drivers(d.drivers.rows)}</div>
				<div class="sd-panel"><h4>${__("Segment comparison")}</h4><div class="hint">${__("Click a row to open the segment")}</div>${this.hbars(d.segments, "segment", SD_COLORS[0], d.segment)}</div>
			</div>
			<div class="sd-grid"><div class="sd-panel c12"><div style="display:flex;justify-content:space-between"><div><h4>${__("Full model rating")}</h4><div class="hint">${d.ranking.length} ${__("models")}</div></div><span class="sd-btn sd-toggle-rank">${__("Show full rating")}</span></div>
				<div class="sd-rank" style="display:none;overflow-x:auto;margin-top:8px"><table class="sd-table"><tr><th>#</th><th>${__("Brand / model")}</th><th class="num">${__("Sales")}</th><th class="num">${__("Market share")}</th><th class="num">${__("Last month")}</th><th class="num">MoM</th><th class="num">YoY</th><th class="num">${__("Movement")}</th></tr>
				${d.ranking.map((m) => `<tr class="click" data-model="${esc(m.model)}"><td>#${m.rank}</td><td><small style="color:var(--text-muted)">${esc(m.brand)}</small><br><b>${esc(m.label)}</b></td><td class="num">${fmt(m.qty)}</td><td class="num">${m.share}%</td><td class="num">${fmt(m.last)}</td><td class="num ${cls(m.mom)}">${pct(m.mom)}</td><td class="num ${cls(m.yoy)}">${pct(m.yoy)}</td><td class="num">${m.move > 0 ? `<span class="sd-up">▲${m.move}</span>` : m.move < 0 ? `<span class="sd-down">▼${-m.move}</span>` : "0"}</td></tr>`).join("")}
				</table></div></div></div>
		`);

		if (fo) {
			const fm = d.focus_monthly.filter((m) => m.qty != null);
			this.chart(".ch-focus", { type: "bar", height: 190, data: { labels: fm.map((m) => moment(m.ym, "YYYY-MM").format("MMM")), datasets: [{ name: __("Sales, units"), values: fm.map((m) => m.qty || 0) }] }, colors: [SD_COLORS[0]], barOptions: { spaceRatio: 0.3 }, tooltipOptions: { formatTooltipY: fmt } });
			this.chart(".ch-focus-share", { type: "line", height: 150, data: { labels: fm.map((m) => moment(m.ym, "YYYY-MM").format("MMM")), datasets: [{ name: __("Market share, %"), values: fm.map((m) => m.share || 0) }] }, colors: [SD_COLORS[3]], lineOptions: { dotSize: 3 }, tooltipOptions: { formatTooltipY: (v) => v + "%" } });
		}
		this.chart(".ch-brand-share", { type: "donut", height: 240, data: { labels: d.brand_share.map((b) => b.label), datasets: [{ values: d.brand_share.map((b) => b.qty) }] } });
		this.chart(".ch-brand-dyn", { type: "line", height: 220, data: { labels: d.brand_dynamics.months.map(mlabel), datasets: d.brand_dynamics.series.map((s) => ({ name: s.label, values: s.values.map((v) => v || 0) })) }, lineOptions: { dotSize: 3 }, tooltipOptions: { formatTooltipY: (v) => v + "%" } });

		this.$body.find(".sd-focus-sel").on("change", (e) => { this.gf.focus_model = $(e.currentTarget).val(); this.load_segments(); });
		this.$body.find(".sd-card, .sd-rank tr[data-model]").on("click", (e) => { this.gf.focus_model = $(e.currentTarget).data("model"); this.load_segments(); });
		this.$body.find(".sd-hbar[data-key]").on("click", (e) => F.g_segment.set_value($(e.currentTarget).data("key")));
		this.$body.find(".sd-toggle-rank").on("click", (e) => { const $r = this.$body.find(".sd-rank"); $r.toggle(); $(e.currentTarget).text($r.is(":visible") ? __("Hide rating") : __("Show full rating")); });
		this.$body.find(".sd-print").on("click", () => window.print());
	}
}
