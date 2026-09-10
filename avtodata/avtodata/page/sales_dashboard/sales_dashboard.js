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
// Zich grafikda: faqat oy nomi; yil — birinchi ustunda va har yanvarda.
const mshort = (ym, force_year) => moment(ym, "YYYY-MM").format(force_year || ym.slice(5) === "01" ? "MMM YY" : "MMM");
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
		this.top_limit = 10;
		this.compare_models = [];
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
				.sd-hbar { display: grid; grid-template-columns: minmax(96px, 32%) 1fr minmax(64px, auto); gap: 8px; align-items: center; font-size: 13px; padding: 1px 0; }
				.sd-hbar .l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
				.sd-hbar .n { color: var(--text-muted); font-size: 11px; margin-right: 4px; }
				.sd-hbar .bar { height: 13px; border-radius: 3px; background: var(--s, var(--primary)); min-width: 2px; }
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
				.sd-bars { --n: 12; position: relative; display: grid; grid-template-columns: auto 1fr; gap: 6px; padding-top: 18px; }
				.sd-bars .cap { position: absolute; top: 0; right: 0; font-size: 11px; color: var(--text-muted); letter-spacing: .04em; }
				.sd-bars .axis { position: relative; height: var(--h, 220px); font-size: 11px; color: var(--text-muted); min-width: 30px; }
				.sd-bars .axis span { position: absolute; right: 4px; transform: translateY(-50%); white-space: nowrap; font-variant-numeric: tabular-nums; }
				.sd-bars .plot { position: relative; height: var(--h, 220px); border-bottom: 1px solid var(--border-color); }
				.sd-bars .gl { position: absolute; left: 0; right: 0; border-top: 1px solid var(--border-color); opacity: .6; }
				.sd-bars .cols { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 4%; padding: 0 1%; }
				.sd-bars .grp { flex: 1; display: flex; align-items: flex-end; justify-content: center; gap: 3px; height: 100%; min-width: 0; }
				.sd-bars .bar { position: relative; flex: 1; max-width: 46px; border-radius: 4px 4px 0 0; background: var(--c); min-height: 1px; transition: opacity .15s; }
				.sd-bars .bar:hover { opacity: .8; }
				.sd-bars .bar.none { background: repeating-linear-gradient(45deg, var(--border-color) 0 4px, transparent 4px 8px); height: 100% !important; opacity: .5; }
				.sd-bars .bar .val { position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%); font-size: 11px; font-weight: 600; white-space: nowrap; color: var(--text-color); padding-bottom: 3px; line-height: 1; }
				.sd-bars.multi .bar .val, .sd-bars.dense .bar .val { font-size: 10px; letter-spacing: -.02em; }
				.sd-bars .bar .val.in { bottom: auto; top: 5px; color: #fff; padding: 0; }
				.sd-bars .xl { display: flex; gap: 4%; padding: 4px 1% 0; font-size: 11px; color: var(--text-muted); }
				.sd-bars .xl span { flex: 1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
				.sd-bars.dense .xl span { font-size: 10px; }
				.sd-leg { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--text-muted); margin-top: 8px; } .sd-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
				.sd-more { display: flex; justify-content: center; margin-top: 10px; }
				.sd-donut { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 18px; align-items: center; }
				.sd-donut svg { width: 170px; height: 170px; display: block; }
				.sd-donut .lg { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
				.sd-donut .lg div { display: grid; grid-template-columns: 12px 1fr auto auto; gap: 8px; align-items: center; }
				.sd-donut .lg i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
				.sd-donut .lg b { font-variant-numeric: tabular-nums; } .sd-donut .lg small { color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 60px; text-align: right; }
				.sd-donut .lg div.click { cursor: pointer; } .sd-donut .lg div.click:hover b { color: var(--primary); }
				.sd-cmp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 10px; }
				.sd-cmp-kpi { border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; }
				.sd-cmp-kpi .k { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
				.sd-cmp-kpi .v { font-size: 18px; font-weight: 700; } .sd-cmp-kpi .v.win::after { content: " 🏆"; font-size: 13px; }
				.sd-cmp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
				.sd-cmp-mini { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; background: var(--card-bg); }
				.sd-cmp-mini h5 { margin: 0 0 2px; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 6px; } .sd-cmp-mini h5 i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
				.sd-cmp-mini .sub { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
				.sd-win-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
				.sd-win-row span { border: 1px solid var(--border-color); border-radius: 6px; padding: 2px 6px; font-size: 11px; display: flex; flex-direction: column; align-items: center; min-width: 38px; }
				.sd-win-row span b { font-size: 12px; }
				.sd-share-line { display: grid; grid-template-columns: 1fr; gap: 6px; }
				.sd-share-line .r { display: grid; grid-template-columns: 150px 1fr 60px; gap: 8px; align-items: center; font-size: 13px; }
				.sd-share-line .r .t { height: 14px; border-radius: 4px; background: var(--bg-color); overflow: hidden; } .sd-share-line .r .t i { display: block; height: 100%; }
				.sd-cmp-slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
				.sd-cmp-card { border: 1px solid var(--border-color); border-radius: 12px; background: var(--card-bg); padding: 12px 14px; position: relative; min-height: 250px; }
				.sd-cmp-card.base { border-color: var(--primary); }
				.sd-cmp-card .rm { position: absolute; top: 8px; right: 10px; cursor: pointer; color: var(--text-muted); font-size: 16px; }
				.sd-cmp-card .base-badge { display: inline-block; font-size: 11px; color: var(--primary); border: 1px solid var(--primary); border-radius: 999px; padding: 0 8px; margin-bottom: 6px; }
				.sd-cmp-card .img { height: 110px; display: grid; place-items: center; font-size: 40px; } .sd-cmp-card .img img { max-height: 110px; max-width: 100%; object-fit: contain; }
				.sd-cmp-card .brand { font-size: 12px; text-transform: uppercase; color: var(--text-muted); margin-top: 6px; } .sd-cmp-card .name { font-size: 18px; font-weight: 700; }
				.sd-cmp-card .meta { font-size: 13px; color: var(--text-muted); margin-top: 6px; line-height: 1.5; }
				.sd-cmp-add { border: 2px dashed var(--border-color); border-radius: 12px; min-height: 250px; display: grid; place-items: center; cursor: pointer; color: var(--text-muted); text-align: center; }
				.sd-cmp-add:hover { border-color: var(--primary); color: var(--primary); }
				.sd-cmp-add b { display: block; font-size: 28px; }
				.sd-cmp-table td.best { color: var(--sd-up); font-weight: 700; } .sd-cmp-table td.worst { color: var(--sd-down); }
				.sd-cmp-table th.m { text-align: right; } .sd-cmp-table td:first-child { color: var(--text-muted); }
				.sd-btn { cursor: pointer; border: 1px solid var(--border-color); border-radius: 8px; padding: 5px 12px; font-size: var(--text-sm); background: var(--card-bg); }
			</style>
			<div class="sd-tabs">
				<span class="sd-tab" data-tab="sales">${__("Sales Dashboard")}</span>
				<span class="sd-tab" data-tab="segments">${__("Market Segments")}</span>
				<span class="sd-tab" data-tab="compare">${__("Model Comparison")}</span>
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
			this.top_limit = 10;
			if (frappe.get_route()[1] === "compare") { this.set_compare([]); return; }
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
		const route = frappe.get_route();
		const tab = ["segments", "compare"].includes(route[1]) ? route[1] : "sales";
		this.$root.find(".sd-tab").removeClass("active").filter(`[data-tab=${tab}]`).addClass("active");
		this.show_filters(tab);
		if (tab === "compare") {
			if (route[2]) this.compare_models = decodeURIComponent(route[2]).split(",").filter(Boolean).slice(0, 4);
			this.load_compare();
		} else if (tab === "segments") this.load_segments();
		else this.load_sales();
	}

	// ---------------------------------------------------------- helpers
	// O'z donut'i: foizlar doim ko'rinadi (segment ichida yoki legendada).
	donut(sel, rows, opts = {}) {
		const $el = this.$body.find(sel);
		if (!$el.length) return;
		const total = rows.reduce((a, r) => a + r.value, 0);
		if (!total) { $el.html(`<div class="sd-empty">${__("No records")}</div>`); return; }
		const cx = 85, cy = 85, R = 80, r = 50;
		let a0 = -Math.PI / 2, paths = "", labels = "";
		rows.forEach((row, i) => {
			const frac = row.value / total, a1 = a0 + frac * 2 * Math.PI, big = frac > 0.5 ? 1 : 0;
			const P = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`;
			const color = SD_COLORS[i % SD_COLORS.length];
			paths += frac >= 0.999
				? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${color}" stroke-width="${R - r}"><title>${esc(row.label)}: ${fmt(row.value)}</title></circle>`
				: `<path d="M${P(R, a0)} A${R} ${R} 0 ${big} 1 ${P(R, a1)} L${P(r, a1)} A${r} ${r} 0 ${big} 0 ${P(r, a0)} Z" fill="${color}" stroke="var(--card-bg)" stroke-width="2"><title>${esc(row.label)}: ${fmt(row.value)} (${(frac * 100).toFixed(1)}%)</title></path>`;
			if (frac >= 0.07) { const am = (a0 + a1) / 2, lx = cx + ((R + r) / 2) * Math.cos(am), ly = cy + ((R + r) / 2) * Math.sin(am); labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="#fff">${(frac * 100).toFixed(frac < 0.1 ? 1 : 0)}%</text>`; }
			a0 = a1;
		});
		$el.html(`<div class="sd-donut"><svg viewBox="0 0 170 170">${paths}${labels}<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text-color)">${fmtk(total)}</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${esc(opts.center || __("units"))}</text></svg>
			<div class="lg">${rows.map((row, i) => `<div class="${opts.onclick ? "click" : ""}" data-i="${i}"><i style="background:${SD_COLORS[i % SD_COLORS.length]}"></i><span>${esc(row.label)}</span><small>${fmt(row.value)}</small><b>${(row.value / total * 100).toFixed(1)}%</b></div>`).join("")}</div></div>`);
		if (opts.onclick) $el.find(".lg div").on("click", (e) => opts.onclick(+$(e.currentTarget).data("i")));
	}
	// O'z bar-grafigi: qiymatlar doim ustun tepasida ko'rinadi (Frappe Charts'da
	// doimiy yorliq yo'q). series: [{name, values:[n|null], color}], labels: [..]
	bars(sel, labels, series, opts = {}) {
		const $el = this.$body.find(sel);
		if (!$el.length) return;
		const H = opts.height || 220;
		const all = series.flatMap((s) => s.values).filter((v) => v != null);
		const raw_max = Math.max(...all.map(Math.abs), 1);

		// O'lchov birligi bir marta — grafikning o'ng yuqorisida; raqamlarda
		// "тыс." takrorlanmaydi (bir-birining ustiga chiqib ketardi).
		const scale = opts.unit ? 1 : raw_max >= 1e6 ? 1e6 : raw_max >= 10000 ? 1000 : 1;
		const measure = opts.measure || __("units");
		const caption = opts.unit || (scale === 1e6 ? `${__("mln")} ${measure}` : scale === 1000 ? `${__("thousands")} ${measure}` : measure);
		const num = (v) => (v / scale).toLocaleString("ru-RU", { maximumFractionDigits: v && scale > 1 && Math.abs(v / scale) < 100 ? 1 : 0 });

		// "Chiroyli" o'q qadamlari: 0 / 100 / 200 ... (119,3 kabi emas)
		const vertical = series.length > 1 || labels.length > 8;
		const head = vertical ? 1.28 : 1.13;
		const ticks = 4;
		// Shkala tepasi ma'lumotga qarab (ustunlar baland bo'lsin), belgilar esa
		// "chiroyli" qadamda (0 / 150 / 300 ...), shu sababdan 119,3 kabi son yo'q.
		const nice = (x) => { const p = Math.pow(10, Math.floor(Math.log10(x))); const n = x / p; return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10) * p; };
		const max = raw_max * head;
		const step = nice(max / ticks);
		const grid = [];
		for (let g = 0; g <= max + 1e-9; g += step) grid.push(g);

		const cols = labels.map((l, i) => `<div class="grp">${series.map((s) => {
			const v = s.values[i];
			if (v == null) return `<div class="bar none" title="${esc(l)}: ${__("no data")}"></div>`;
			const h = (Math.abs(v) / max) * 100;
			const inside = h > 92;
			return `<div class="bar" style="--c:${s.color};height:${h}%" title="${esc(s.name)} · ${esc(l)}: ${fmt(v)} ${esc(measure)}"><span class="val ${inside ? "in" : ""}">${num(v)}</span></div>`;
		}).join("")}</div>`).join("");

		$el.html(`<div class="sd-bars ${labels.length > 14 ? "dense" : ""} ${vertical ? "multi" : ""}" style="--h:${H}px">
			<div class="cap">${esc(caption)}</div>
			<div class="axis">${grid.map((g) => `<span style="bottom:${(g / max) * 100}%">${num(g)}</span>`).join("")}</div>
			<div><div class="plot">${grid.map((g) => `<div class="gl" style="bottom:${(g / max) * 100}%"></div>`).join("")}<div class="cols">${cols}</div></div>
			<div class="xl">${labels.map((l) => `<span title="${esc(l)}">${esc(l)}</span>`).join("")}</div></div>
			${series.length > 1 ? `<div class="sd-leg">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : ""}
		</div>`);
		if (opts.onclick) $el.find(".grp").each((i, g) => $(g).css("cursor", "pointer").on("click", () => opts.onclick(i)));
	}
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
				<div class="sd-panel"><h4>${__("Yearly sales dynamics")}</h4><div class="hint">${__("Click a year to filter")}</div><div class="ch-year" style="margin-top:14px"></div></div>
				<div class="sd-panel"><h4>${__("Monthly sales dynamics")}</h4><div class="hint">${__("Last 12 months of the selected period")}</div><div class="ch-month" style="margin-top:14px"></div></div>
				<div class="sd-panel"><h4>${__("Top-15 models")}</h4><div class="hint">${__("Sales leaders for the selected period")}</div>${this.hbars(d.top_models, "model", SD_COLORS[2])}</div>
				<div class="sd-panel c6"><h4>${__("Vehicle type share")}</h4><div class="hint">${__("Market structure: PC, SUV, LCV and other types")} · ${__("click to filter")}</div><div class="ch-type" style="margin-top:10px"></div></div>
				<div class="sd-panel c6"><h4>${__("Top-10 brands")}</h4><div class="hint">${__("Sales leaders for the selected period")}</div>${this.hbars(d.top_brands, "brand", SD_COLORS[0])}</div>
			</div>
			<div class="sd-h">${__("MoM, YoY and change drivers")}</div><div class="sd-hs">${__("Same-period comparison and brand contribution to the change in sales volume")}</div>
			<div class="sd-grid">
				<div class="sd-panel c8"><h4>${d.yoy.year} vs ${d.yoy.year - 1} <span class="sd-badge">${d.yoy.comparable}/${d.yoy.total_months} ${__("months")}</span></h4><div class="hint">${__("Month-by-month comparison of the same periods")}</div><div class="ch-yoy" style="margin-top:14px"></div></div>
				<div class="sd-panel"><h4>${__("Change drivers")} <span class="sd-badge">Δ ${d.drivers.total > 0 ? "+" : ""}${fmt(d.drivers.total)}</span></h4><div class="hint">${__("Brand contribution to the change in sales")} · ${d.drivers.months} ${__("comparable months")}</div>${this.drivers(d.drivers.rows)}</div>
			</div>
			<div class="sd-grid"><div class="sd-panel c12"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><h4>${__("Market share dynamics")}</h4><div class="hint">${__("Top-5 of the selected level; share is computed from the whole filtered market")}</div></div><div class="sd-seg sd-share-mode"><span data-m="month">${__("By months")}</span><span data-m="quarter">${__("By quarters")}</span><span data-m="year">${__("By years")}</span></div></div><div class="ch-share"></div></div></div>
			<div class="sd-grid"><div class="sd-panel c12"><h4>${__("Market rating")}</h4><div class="hint">${mlabel(d.rating.L)} · ${__("rating and share for the selected slice")} · MoM: ${mlabel(d.rating.L)} ${__("vs")} ${mlabel(d.rating.P)} · YoY: ${__("vs")} ${mlabel(d.rating.Y)}</div>
				<div style="overflow-x:auto"><table class="sd-table"><tr><th>#</th><th>${__("Brand")}</th><th class="num">${mlabel(d.rating.L)}</th><th class="num">${mlabel(d.rating.P)}</th><th class="num">${mlabel(d.rating.Y)}</th><th class="num">MoM</th><th class="num">YoY</th><th class="num">${__("Market share")}</th><th class="num">${__("Position")}</th></tr>
				${d.rating.rows.map((r) => `<tr class="click" data-brand="${esc(r.brand)}"><td>${r.rank}</td><td><b>${esc(r.label)}</b></td><td class="num">${fmt(r.L)}</td><td class="num">${fmt(r.P)}</td><td class="num">${fmt(r.Y)}</td><td class="num ${cls(r.mom)}">${pct(r.mom)}</td><td class="num ${cls(r.yoy)}">${r.Y ? pct(r.yoy) : __("New")}</td><td class="num">${r.share}%</td><td class="num">#${r.rank} ${r.move > 0 ? `<span class="sd-up">▲${r.move}</span>` : r.move < 0 ? `<span class="sd-down">▼${-r.move}</span>` : "—"}</td></tr>`).join("")}
				</table></div></div></div>
		`);

		this.bars(".ch-year", d.yearly.map((y) => y.year), [{ name: __("Sales"), values: d.yearly.map((y) => y.qty), color: SD_COLORS[2] }], {
			onclick: (i) => { const y = d.yearly[i].year; F.timespan.set_input("custom"); F.from_date.set_input(`${y}-01-01`); F.to_date.set_input(`${y}-12-31`); this.load_sales(); },
		});
		this.bars(".ch-month", d.monthly.map((m, i) => mshort(m.ym, i === 0)), [{ name: __("Sales"), values: d.monthly.map((m) => m.qty), color: SD_COLORS[5] }]);
		this.donut(".ch-type", d.type_share.map((t) => ({ label: t.vtype, value: t.qty })), { onclick: (i) => { if (d.type_share[i].vtype !== "—") F.vtype.set_value(d.type_share[i].vtype); } });
		this.bars(".ch-yoy", d.yoy.rows.map((r) => moment(r.ym, "YYYY-MM").format("MMM")), [
			{ name: String(d.yoy.year - 1), values: d.yoy.rows.map((r) => r.prev), color: getComputedStyle(this.$body[0]).getPropertyValue("--sd-bar-prev").trim() || "#a3acc2" },
			{ name: String(d.yoy.year), values: d.yoy.rows.map((r) => r.cur), color: SD_COLORS[0] },
		]);
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
		if (this._last_seg !== F.g_segment.get_value()) this.top_limit = 10;
		this._last_seg = F.g_segment.get_value();
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
		const months12 = d.monthly_totals;

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
					<div class="ch-focus" style="margin-top:12px"></div><div class="ch-focus-share" style="margin-top:10px"></div>
					<div class="sd-stats"><div><span>${__("Sales for the period")}</span><b>${fmt(fo.period_qty)} ${__("units")}</b></div><div><span>${__("Market share")}</span><b>${fo.share}%</b></div><div><span>${__("Last month")}</span><b>${fmt(fo.last)} ${__("units")}</b></div><div><span>MoM</span><b class="${cls(fo.mom)}">${pct(fo.mom)}</b></div><div><span>YoY</span><b class="${cls(fo.yoy)}">${pct(fo.yoy)}</b></div></div>` : `<div class="sd-empty">${__("No records")}</div>`}
				</div>
				<div class="sd-panel c8"><h4>${__("Segment rating")} · ${__("Top models")} <span class="sd-badge">${Math.min(this.top_limit, d.ranking.length)} / ${d.ranking.length}</span></h4><div class="hint">${__("Click a card to change the focus")}</div>
					<div class="sd-cards">${d.ranking.slice(0, this.top_limit).map((m, i) => `<div class="sd-card ${fo && m.model === fo.model ? "first" : ""}" data-model="${esc(m.model)}"><div class="top"><div><small>#${m.rank} · ${esc(m.brand)}</small><b>${esc(m.label)}</b></div><span class="sd-badge">${m.share}%</span></div><div class="img">${img(m.image)}</div><div class="qty"><span>${__("Sales")}</span><b>${fmt(m.qty)} ${__("units")}</b></div><div class="foot">${m.move > 0 ? `▲ ${m.move} ${__("positions")}` : m.move < 0 ? `▼ ${-m.move} ${__("positions")}` : __("Position unchanged")}</div></div>`).join("")}</div>
					${d.ranking.length > this.top_limit && this.top_limit < 50 ? `<div class="sd-more"><span class="sd-btn sd-load-more">${__("Show 10 more")} (${Math.min(10, Math.min(50, d.ranking.length) - this.top_limit)})</span></div>` : ""}
				</div>
			</div>
			<div class="sd-grid">
				<div class="sd-panel c8"><div style="display:flex;justify-content:space-between"><div><h4>${__("Segment dynamics")}</h4><div class="hint">${__("Total sales by months")} · ${d.year}</div></div><b style="font-size:18px">${fmt(k.size)} ${__("units")}</b></div>
					<div class="ch-seg-months" style="margin-top:14px"></div></div>
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
			this.bars(".ch-focus", fm.map((m) => moment(m.ym, "YYYY-MM").format("MMM")), [{ name: __("Sales, units"), values: fm.map((m) => m.qty), color: SD_COLORS[0] }], { height: 150 });
			this.bars(".ch-focus-share", fm.map((m) => moment(m.ym, "YYYY-MM").format("MMM")), [{ name: __("Market share, %"), values: fm.map((m) => m.share), color: SD_COLORS[3] }], { height: 110, unit: "%" });
		}
		this.bars(".ch-seg-months", months12.map((m) => moment(m.ym, "YYYY-MM").format("MMM")), [{ name: __("Sales"), values: months12.map((m) => m.qty), color: SD_COLORS[0] }], { height: 230 });
		this.donut(".ch-brand-share", d.brand_share.slice(0, 6).map((b) => ({ label: b.label, value: b.qty })).concat(d.brand_share.length > 6 ? [{ label: __("Other"), value: d.brand_share.slice(6).reduce((a, b) => a + b.qty, 0) }] : []));
		this.chart(".ch-brand-dyn", { type: "line", height: 220, data: { labels: d.brand_dynamics.months.map(mlabel), datasets: d.brand_dynamics.series.map((s) => ({ name: s.label, values: s.values.map((v) => v || 0) })) }, lineOptions: { dotSize: 3 }, tooltipOptions: { formatTooltipY: (v) => v + "%" } });

		this.$body.find(".sd-focus-sel").on("change", (e) => { this.gf.focus_model = $(e.currentTarget).val(); this.load_segments(); });
		this.$body.find(".sd-card, .sd-rank tr[data-model]").on("click", (e) => { this.gf.focus_model = $(e.currentTarget).data("model"); this.load_segments(); });
		this.$body.find(".sd-load-more").on("click", () => { this.top_limit = Math.min(50, this.top_limit + 10); this.render_segments(d); });
		this.$body.find(".sd-hbar[data-key]").on("click", (e) => F.g_segment.set_value($(e.currentTarget).data("key")));
		this.$body.find(".sd-toggle-rank").on("click", (e) => { const $r = this.$body.find(".sd-rank"); $r.toggle(); $(e.currentTarget).text($r.is(":visible") ? __("Hide rating") : __("Show full rating")); });
		this.$body.find(".sd-print").on("click", () => window.print());
	}

	// -------------------------------------------------------- COMPARE TAB
	load_compare() {
		this.$body.html(`<div class="sd-empty">${__("Loading")}...</div>`);
		frappe.call({ method: `${SD_API}.get_compare_data`, args: { models: this.compare_models }, error: () => this.$body.html(`<div class="sd-empty">${__("Could not load comparison data")}</div>`) }).then((r) => r && this.render_compare(r.message));
	}

	set_compare(models) {
		this.compare_models = models.slice(0, 4);
		// URL'ni yangilaymiz (ulashish uchun), lekin yuklashni marshrutga
		// tayanmasdan o'zimiz chaqiramiz — bir xil marshrutda on_page_show ishlamaydi.
		const path = ["app", "sales-dashboard", "compare"].concat(this.compare_models.length ? [this.compare_models.map(encodeURIComponent).join(",")] : []).join("/");
		history.replaceState(null, "", "/" + path);
		this.load_compare();
	}

	pick_model() {
		const base = this.compare_models.length ? this.compare_models[0] : null;
		const dlg = new frappe.ui.Dialog({
			title: __("Add model"),
			fields: [
				{ fieldname: "mode", fieldtype: "Select", label: __("Selection mode"), default: base ? "analog" : "all",
				  options: [{ value: "analog", label: __("Direct analogs (same segment)") }, { value: "all", label: __("Full catalog") }] },
				{ fieldname: "txt", fieldtype: "Data", label: __("Search brand or model") },
				{ fieldname: "list", fieldtype: "HTML" },
			],
		});
		const $list = dlg.get_field("list").$wrapper;
		const load = () => {
			const mode = dlg.get_value("mode");
			frappe.call({ method: `${SD_API}.search_models`, args: { txt: dlg.get_value("txt"), exclude: this.compare_models, segment: mode === "analog" && this._base_segment || null } }).then((r) => {
				const rows = r.message || [];
				$list.html(rows.length ? `<div style="max-height:360px;overflow:auto">${rows.map((m) => `<div class="sd-hbar" style="grid-template-columns:48px 1fr auto;cursor:pointer" data-name="${esc(m.name)}"><div style="height:34px;display:grid;place-items:center">${m.image ? `<img src="${esc(m.image)}" style="max-height:34px;max-width:48px;object-fit:contain">` : "🚗"}</div><div><b>${esc(m.brand)}</b> ${esc(m.model_name)}<div style="font-size:12px;color:var(--text-muted)">${[m.vehicle_segment && m.vehicle_class ? m.vehicle_segment + "-" + m.vehicle_class : m.vehicle_segment, m.fuel_type].filter(Boolean).map(esc).join(" · ")}</div></div><span class="sd-btn">+</span></div>`).join("")}</div>` : `<div class="sd-empty">${__("Models not found")}</div>`);
				$list.find("[data-name]").on("click", (e) => { dlg.hide(); this.set_compare(this.compare_models.concat([$(e.currentTarget).data("name")])); });
			});
		};
		let timer = null;
		dlg.fields_dict.txt.$input.on("input", () => { clearTimeout(timer); timer = setTimeout(load, 250); });
		dlg.fields_dict.mode.$input.on("change", load);
		dlg.show();
		load();
	}

	render_compare(d) {
		const models = d.models || [];
		this._base_segment = models.length ? models[0].segment : null;
		const slots = models.map((m, i) => `
			<div class="sd-cmp-card ${i === 0 ? "base" : ""}">
				<span class="rm" data-rm="${esc(m.model)}" title="${__("Remove")}">✕</span>
				${i === 0 ? `<span class="base-badge">✓ ${__("Base model")}</span>` : ""}
				<div class="img">${m.image ? `<img src="${esc(m.image)}">` : "🚗"}</div>
				<div class="brand">${esc(m.brand)}</div><div class="name">${esc(m.label)}</div>
				<div class="meta">${esc(m.vtype || "—")}${m.vclass ? " · " + esc(m.segment) : ""}<br>${esc(m.fuel || __("Powertrain not set"))}<br>${esc(m.tier || "—")}${m.tier && m.tier_inherited ? " · " + __("Inherited from brand") : ""}</div>
				<div class="meta" style="margin-top:8px">${__("Segment rank")}: <b>${m.segment_rank ? "#" + m.segment_rank : "—"}</b> ${m.segment_size ? __("of") + " " + m.segment_size : ""}</div>
			</div>`);
		for (let i = models.length; i < 4; i++) slots.push(`<div class="sd-cmp-add" data-add="1"><div><b>+</b>${__("Add model")}<div style="font-size:12px">${__("Position")} ${i + 1}</div></div></div>`);

		// Ko'rsatkichlar jadvali — har qatorda eng yaxshi / eng yomon belgilanadi
		const metrics = [
			{ key: "last", label: __("Sales last month"), fmt: fmt, dir: 1 },
			{ key: "mom", label: "MoM", fmt: (v) => pct(v), dir: 1 },
			{ key: "yoy", label: "YoY", fmt: (v) => pct(v), dir: 1 },
			{ key: "last12", label: __("Sales, last 12 months"), fmt: fmt, dir: 1 },
			{ key: "last12_growth", label: __("Growth, last 12 months"), fmt: (v) => pct(v), dir: 1 },
			{ key: "total", label: __("Sales, all time"), fmt: fmt, dir: 1 },
			{ key: "avg_month", label: __("Average per month"), fmt: fmt, dir: 1 },
			{ key: "peak", label: __("Peak month"), fmt: (v) => (v ? `${fmt(v.qty)} · ${mlabel(v.ym)}` : "—"), val: (v) => (v ? v.qty : null), dir: 1 },
			{ key: "segment_share_last", label: __("Segment share, last month"), fmt: (v) => (v == null ? "—" : v + "%"), dir: 1 },
			{ key: "market_share_last", label: __("Market share, last month"), fmt: (v) => (v == null ? "—" : v + "%"), dir: 1 },
			{ key: "segment_rank", label: __("Segment rank"), fmt: (v) => (v ? "#" + v : "—"), dir: -1 },
			{ key: "first_month", label: __("On the market since"), fmt: (v) => (v ? mlabel(v) : "—"), val: (v) => (v ? -moment(v, "YYYY-MM").valueOf() : null), dir: 1 },
		];
		const only_diff = this.cmp_only_diff;
		const lead_months = models.map((_, i) => d.months.filter((_, mi) => { const vals = d.series.map((sr) => sr.values[mi]); return vals[i] === Math.max(...vals) && vals[i] > 0; }).length);
		const table_rows = metrics.map((mt) => {
			const raw = models.map((m) => m[mt.key]);
			const nums = raw.map((v) => (mt.val ? mt.val(v) : typeof v === "number" ? v : null));
			const valid = nums.filter((v) => v != null);
			const best = valid.length > 1 ? (mt.dir > 0 ? Math.max(...valid) : Math.min(...valid)) : null;
			const worst = valid.length > 1 ? (mt.dir > 0 ? Math.min(...valid) : Math.max(...valid)) : null;
			if (only_diff && valid.length && valid.every((v) => v === valid[0])) return "";
			return `<tr><td>${mt.label}</td>${raw.map((v, i) => `<td class="num ${nums[i] != null && nums[i] === best && best !== worst ? "best" : nums[i] != null && nums[i] === worst && best !== worst ? "worst" : ""}">${mt.fmt(v)}</td>`).join("")}</tr>`;
		}).join("");

		this.$body.html(`
			<div class="sd-sub" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span>${__("Compare two to four models by common indicators; the first model sets the segment for direct analogs.")}</span>
				<span><span class="sd-btn sd-cmp-copy">${__("Copy link")}</span> <span class="sd-btn sd-cmp-print">${__("Print / PDF")}</span> ${models.length ? `<span class="sd-btn sd-cmp-clear">${__("Clear")}</span>` : ""}</span></div>
			<div class="sd-h" style="margin-top:0">${__("Selected models")} <span class="sd-badge">${models.length} ${__("of")} 4</span></div>
			<div class="sd-cmp-slots">${slots.join("")}</div>
			${models.length >= 2 ? `
			<div class="sd-grid" style="margin-top:14px"><div class="sd-panel c12"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><h4>${__("Sales indicators")}</h4><div class="hint">${__("Best value is green, worst is red · data as of")} ${mlabel(d.last)}</div></div><label style="font-size:13px;cursor:pointer"><input type="checkbox" class="sd-cmp-diff" ${only_diff ? "checked" : ""}> ${__("Only differences")}</label></div>
				<div style="overflow-x:auto"><table class="sd-table sd-cmp-table"><tr><th>${__("Indicator")}</th>${models.map((m) => `<th class="m">${esc(m.brand)} ${esc(m.label)}</th>`).join("")}</tr>${table_rows}</table></div></div></div>
			<div class="sd-h">${__("Head-to-head")}</div><div class="sd-hs">${__("Who leads on each indicator, last 12 months")} · ${mlabel(d.months[0])} — ${mlabel(d.months[d.months.length - 1])}</div>
			<div class="sd-cmp-kpis">${[
				{ k: __("Sales, last 12 months"), f: (m) => m.last12, fmt: fmt },
				{ k: __("Growth, last 12 months"), f: (m) => m.last12_growth, fmt: (v) => pct(v) },
				{ k: __("Sales last month"), f: (m) => m.last, fmt: fmt },
				{ k: __("Segment share, last month"), f: (m) => m.segment_share_last, fmt: (v) => (v == null ? "—" : v + "%") },
				{ k: __("Months as leader"), f: (m, i) => lead_months[i], fmt: (v) => v + " / " + d.months.length },
			].map((x) => { const vals = models.map(x.f); const best = Math.max(...vals.filter((v) => v != null)); const wi = vals.indexOf(best); return `<div class="sd-cmp-kpi"><div class="k">${x.k}</div><div class="v ${vals.filter((v) => v === best).length === 1 ? "win" : ""}">${wi >= 0 ? esc(models[wi].label) : "—"}</div><div class="sd-muted" style="font-size:12px;color:var(--text-muted)">${x.fmt(best)}</div></div>`; }).join("")}</div>
			<div class="sd-h">${__("Sales dynamics of models")}</div><div class="sd-hs">${__("Last 12 months, each model on its own scale · the leader of each month is marked below")}</div>
			<div class="sd-cmp-grid">${d.series.map((sr, i) => `<div class="sd-cmp-mini"><h5><i style="background:${SD_COLORS[i]}"></i>${esc(sr.label)}</h5><div class="sub">${fmt(models[i].last12)} ${__("units")} · ${__("avg")} ${fmt(Math.round(models[i].last12 / d.months.length))}/${__("mo")} · ${__("peak")} ${fmt(Math.max(...sr.values))}</div><div class="ch-cmp-mini" data-i="${i}"></div></div>`).join("")}</div>
			<div class="sd-grid" style="margin-top:12px"><div class="sd-panel c12"><h4>${__("Monthly leader")}</h4><div class="hint">${__("Which model sold the most in each month")}</div><div class="sd-win-row">${d.months.map((m, mi) => { const vals = d.series.map((sr) => sr.values[mi]); const best = Math.max(...vals); const wi = vals.indexOf(best); return `<span style="border-color:${SD_COLORS[wi]}" title="${esc(d.series[wi].label)}: ${fmt(best)}"><small>${mlabel(m)}</small><b style="color:${SD_COLORS[wi]}">${esc(models[wi].label)}</b><small>${fmtk(best)}</small></span>`; }).join("")}</div></div></div>
			<div class="sd-grid"><div class="sd-panel c6"><h4>${__("Share among selected models")}</h4><div class="hint">${__("Last 12 months")}</div><div class="ch-cmp-share" style="margin-top:8px"></div></div>
			<div class="sd-panel c6"><h4>${__("Sales by years")}</h4><div class="hint">${__("Full history")}</div><div class="ch-cmp-years" style="margin-top:14px"></div></div></div>`
			: `<div class="sd-empty">${models.length ? __("Add at least one more model to compare.") : __("Add two to four models to compare.")}</div>`}
		`);

		if (models.length >= 2) {
			d.series.forEach((sr, i) => this.bars(`.ch-cmp-mini[data-i=${i}]`, d.months.map((m) => moment(m, "YYYY-MM").format("MMM")), [{ name: sr.label, values: sr.values, color: SD_COLORS[i] }], { height: 150 }));
			this.donut(".ch-cmp-share", d.series.map((sr, i) => ({ label: sr.label, value: sr.values.reduce((a, b) => a + b, 0) })));
			this.bars(".ch-cmp-years", d.years, d.yearly.map((y, i) => ({ name: d.series[i].label, values: y.values, color: SD_COLORS[i] })), { height: 220 });
		}
		this.$body.find("[data-add]").on("click", () => this.pick_model());
		this.$body.find("[data-rm]").on("click", (e) => this.set_compare(this.compare_models.filter((m) => m !== $(e.currentTarget).data("rm"))));
		this.$body.find(".sd-cmp-clear").on("click", () => this.set_compare([]));
		this.$body.find(".sd-cmp-diff").on("change", (e) => { this.cmp_only_diff = e.currentTarget.checked; this.render_compare(d); });
		this.$body.find(".sd-cmp-print").on("click", () => window.print());
		this.$body.find(".sd-cmp-copy").on("click", () => frappe.utils.copy_to_clipboard(window.location.href));
	}
}
