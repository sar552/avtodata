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
// Avtomobil turlari: har turning o'z surati (public/images/vehicle_types).
// Kalit Vehicle Segment nomidan aniqlanadi (PC, SUV, LCV, MPV, Pick Up ...).
const VT_IMG = "/assets/avtodata/images/vehicle_types/";
const VEHICLE_TYPES = {
	sedan: { img: "sedan.webp", label: () => __("Passenger cars") },
	suv: { img: "suv.webp", label: () => __("Crossovers / SUV") },
	van: { img: "van.webp", label: () => __("Light commercial") },
	minivan: { img: "minivan.webp", label: () => __("Minivans") },
	pickup: { img: "pickup.webp", label: () => __("Pickups") },
};

const vehicle_type_key = (type) => {
	const t = String(type || "").toUpperCase().trim();
	if (!t || t === "—") return "unset";
	if (/PICK/.test(t)) return "pickup";
	// MINIVAN'da ham "VAN" bor — shuning uchun avval minivan tekshiriladi
	if (/MPV|MINIVAN|MICROVAN|SHUTTLE/.test(t)) return "minivan";
	if (/LCV|VAN|FURGON|TRUCK/.test(t)) return "van";
	if (/SUV|CROSS|OFFROAD|4WD/.test(t)) return "suv";
	if (/^PC$|PASSENGER|SEDAN|HATCH/.test(t)) return "sedan";
	return "other";
};

const initial = (s) => String(s || "?").trim().charAt(0).toUpperCase() || "?";

// Model surati; yo'q yoki yuklanmasa — model turining umumiy surati (xira)
const model_img = (src, vtype) => {
	const vt = VEHICLE_TYPES[vehicle_type_key(vtype)] || VEHICLE_TYPES.sedan;
	const generic = `<img class="sd-model-img generic" src="${VT_IMG}${vt.img}" alt="">`;
	return src ? `<img class="sd-model-img" src="${esc(src)}" alt="" loading="lazy" data-fbhtml="${esc(generic)}">` : generic;
};

// Brend logotipi; logotip bo'lmasa yoki yuklanmasa — bosh harf nishoni
const brand_logo = (logo, name, h = 20) => {
	const ini = `style="width:${h}px;height:${h}px;font-size:${Math.round(h * 0.48)}px"`;
	return logo
		? `<img class="sd-lg-img" src="${esc(logo)}" alt="${esc(name)}" title="${esc(name)}" loading="lazy" style="height:${h}px;max-width:${Math.round(h * 2.8)}px" data-fb="${esc(initial(name))}" data-fbc="sd-ini" data-fbs='${ini}'>`
		: `<span class="sd-ini" ${ini}>${esc(initial(name))}</span>`;
};

const SD_API = "avtodata.avtodata.page.sales_dashboard.sales_dashboard";

const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("ru-RU"));
const fmtk = (n) => (n == null ? "—" : Math.abs(n) >= 10000 ? (n / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " " + __("k") : fmt(n));
const compact = (v) => (v == null ? "—" : Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " " + __("mln") : fmtk(v));
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
		// Animatsiya xotirasi: har element (kalit bo'yicha) oxirgi holati —
		// qayta chizilganda ustun/bo'lak shu holatdan yangi qiymatga o'tadi.
		this._prev = {};
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
				.sd-hb.clickable .sd-hbar, .drv-brands .sd-drv, .drv-models .sd-drv { cursor: pointer; }
				.sd-hb.clickable .sd-hbar:hover .l, .drv-brands .sd-drv:hover > span:first-child, .drv-models .sd-drv:hover > span:first-child { color: var(--primary); font-weight: 600; }
				.sd-hbar { display: grid; grid-template-columns: minmax(96px, 32%) 1fr minmax(64px, auto); gap: 8px; align-items: center; font-size: 13px; padding: 1px 0; }
				.sd-hbar .l { overflow: hidden; min-width: 0; }
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
				.sd-card .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 10px 12px 0; }
				.sd-card .top small { display: flex; align-items: center; gap: 6px; min-height: 18px; color: var(--text-muted); font-size: 12px; text-transform: uppercase; }
				.sd-card-logo { height: 16px; max-width: 70px; object-fit: contain; }
				.sd-share { flex: 0 0 auto; white-space: nowrap; font-size: 12px; font-weight: 700; color: var(--text-color); background: var(--bg-color); border-radius: 6px; padding: 2px 7px; }
				.sd-card { position: relative; }
				.sd-card .img { height: 90px; display: grid; place-items: center; font-size: 30px; position: relative; }
				.sd-fb { font-size: 26px; line-height: 1; }
				.sd-focus .logo { height: 20px; max-width: 64px; object-fit: contain; vertical-align: -4px; margin-right: 6px; } .sd-card .img img { max-height: 90px; max-width: 100%; object-fit: contain; }
				.sd-card .qty { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 14px; } .sd-card .qty b { font-size: 16px; }
				.sd-card .foot { background: var(--primary); color: #fff; text-align: center; font-size: 12px; padding: 6px; }
				.sd-badge { border: 1px solid var(--border-color); border-radius: 6px; padding: 1px 8px; font-size: 11px; color: var(--text-muted); white-space: nowrap; }
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
				.rb-head { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: flex-start; }
				.rb-legend { display: flex; flex-wrap: wrap; gap: 18px; font-size: 13px; color: var(--text-color); margin: 10px 0 4px; }
				.rb-legend i { font-style: normal; margin-right: 6px; }
				.rb { display: flex; flex-direction: column; gap: 2px; }
				.rb-row { display: grid; grid-template-columns: minmax(130px, 200px) 54px minmax(0, 1fr) 54px; gap: 10px; align-items: center; padding: 5px 0; border-radius: 6px; }
				.rb.clickable .rb-row[data-i] { cursor: pointer; }
				.rb.clickable .rb-row[data-i]:hover { background: var(--bg-color); }
				.rb-name { min-width: 0; line-height: 1.25; }
				.rb-name b { display: block; font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--text-muted); text-transform: uppercase; }
				.rb-name span { display: block; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
				.rb-name small { color: var(--text-muted); font-size: 11.5px; }
				.rb-min, .rb-max { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
				.rb-min { text-align: right; color: var(--text-muted); }
				.rb-track { position: relative; height: 22px; }
				.rb-row[data-i] .rb-track::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 2px; transform: translateY(-50%); background: var(--border-color); border-radius: 2px; }
				.rb-gl { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--border-color); opacity: .7; }
				.rb-range { position: absolute; top: 50%; transform: translateY(-50%); height: 14px; min-width: 4px; border-radius: 6px; background: var(--rb-c, #1baf7a); }
				.rb-avg { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 2px; height: 18px; background: var(--card-bg); border-radius: 1px; }
				.rb-empty { grid-column: 2 / -1; color: var(--text-muted); font-size: 13px; }
				.rb-axis { border-top: 1px solid var(--border-color); margin-top: 4px; padding-top: 6px; }
				.rb-axis .rb-track { height: 14px; }
				.rb-axis .rb-track span { position: absolute; top: 0; transform: translateX(-50%); font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
				.rb-unit { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
				.rb-note { font-size: 12px; color: var(--text-muted); margin-top: 10px; }
				.rb-det { margin-top: 10px; font-size: 13px; }
				.rb-det summary { cursor: pointer; font-weight: 600; color: var(--text-color); }
				.rb-det[open] summary { margin-bottom: 8px; }
				.sd-donut { display: grid; gap: 20px; align-items: center; }
				.sd-donut > svg { display: block; }
				.sd-donut .lg svg { display: block; flex: 0 0 auto; }
				.sd-donut .lg { display: flex; flex-direction: column; justify-content: center; gap: 8px; font-size: 13.5px; min-width: 0; }
				.sd-donut .lg div { display: flex; gap: 10px; align-items: center; }
				.sd-donut .lg div > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
				@media (max-width: 1150px) { .sd-donut { grid-template-columns: 1fr !important; justify-items: center; } .sd-donut .lg { width: 100%; max-width: 420px; } }
				.sd-donut .lg i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; flex: 0 0 auto; }
				.sd-donut .lg b { font-variant-numeric: tabular-nums; } .sd-donut .lg small { color: var(--text-muted); font-variant-numeric: tabular-nums; min-width: 60px; text-align: right; }
				.sd-donut .lg div.click { cursor: pointer; } .sd-donut .lg div.click:hover b { color: var(--primary); }
				.sd-donut.clickable .sl { cursor: pointer; } .sd-donut.clickable .sl:hover { opacity: .82; }
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

				/* ---- jonli animatsiyalar: qiymatlar oldingi holatdan yangisiga o'tadi */
				.sd-root { position: relative; }
				.sd-body { transition: opacity .25s; }
				.sd-body.sd-busy { opacity: .55; pointer-events: none; }
				.sd-root.busy::before { content: ""; position: absolute; left: 0; top: 46px; height: 3px; width: 30%; border-radius: 3px; background: var(--primary); animation: sdSlide 1s ease-in-out infinite; z-index: 2; }
				@keyframes sdSlide { 0% { left: 0; } 50% { left: 70%; } 100% { left: 0; } }
				@keyframes sdUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
				@keyframes sdFade { from { opacity: 0; } to { opacity: 1; } }
				@keyframes sdPop { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: none; } }
				.sd-enter .sd-panel, .sd-enter .sd-kpi, .sd-enter .sd-cmp-card { animation: sdUp .55s cubic-bezier(.22, 1, .36, 1) both; }
				.sd-bars .bar { transition: height .85s cubic-bezier(.22, 1, .36, 1) var(--d, 0ms), opacity .15s; }
				.sd-bars .bar .val { animation: sdFade .4s .5s both; }
				.sd-hbar .bar, .sd-stack i, .sd-tier .p i { transition: width .85s cubic-bezier(.22, 1, .36, 1) var(--d, 0ms); }
				.sd-drv .track i, .rb-range { transition: left .85s cubic-bezier(.22, 1, .36, 1), width .85s cubic-bezier(.22, 1, .36, 1); }
				.sd-drv .track b { animation: sdFade .4s .45s both; }
				.sd-ring .sl { transition: stroke-dasharray 1s cubic-bezier(.22, 1, .36, 1), stroke-dashoffset 1s cubic-bezier(.22, 1, .36, 1), opacity .15s; }
				.sd-ring .pl { animation: sdFade .4s .7s both; pointer-events: none; }
				.sd-ch-anim .line-graph-path { transition: stroke-dashoffset 1.2s cubic-bezier(.33, 1, .68, 1); }
				.sd-ch-anim .region-fill { animation: sdFade .8s .6s both; }
				@media (prefers-reduced-motion: reduce) {
					.sd-body *, .sd-body *::before { animation: none !important; transition: none !important; }
				}

				/* ---- logotiplar va rasmlar */
				.sd-lg-img { object-fit: contain; vertical-align: middle; flex: 0 0 auto; }
				[data-theme="dark"] .sd-lg-img { background: #fff; border-radius: 5px; padding: 1px 3px; }
				.sd-ini { display: inline-grid; place-items: center; flex: 0 0 auto; border-radius: 7px; background: var(--bg-color); color: var(--text-muted); font-weight: 800; line-height: 1; }
				.sd-q { display: inline-grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; border: 2.5px solid var(--text-muted); color: var(--text-muted); font-size: 22px; font-weight: 700; }
				.sd-hbar .l { display: flex; align-items: center; gap: 6px; }
				.sd-hbar .l .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
				.sd-brand-cell { display: flex; align-items: center; gap: 10px; }
				.sd-brand-cell .lg { width: 58px; display: flex; justify-content: center; }
				.sd-model-cell small { display: flex; align-items: center; gap: 8px; color: var(--text-muted); }
				.sd-model-cell .mr { display: flex; align-items: center; gap: 10px; margin-top: 3px; }
				.sd-thumb { width: 84px; height: 44px; flex: 0 0 auto; display: grid; place-items: center; }

				/* ---- rasmli donut: chapda va o'ngda suratli ko'rsatkichlar, o'rtada halqa */
				.sd-pd { display: grid; grid-template-columns: minmax(0, 1fr) minmax(170px, 230px) minmax(0, 1fr); gap: 10px; align-items: center; }
				.sd-pd-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
				.sd-pd-it { text-align: center; border-radius: 10px; padding: 6px 4px; transition: background .2s, transform .2s; }
				.sd-enter .sd-pd-it { animation: sdPop .5s cubic-bezier(.22, 1, .36, 1) var(--d, 0ms) both; }
				.sd-donut.stack { justify-items: center; } .sd-donut.stack .lg { width: 100%; }
				.sd-model-img { max-width: 100%; max-height: 100%; object-fit: contain; }
				.sd-model-img.generic { opacity: .35; filter: grayscale(1); }
				.sd-thumb img { width: 100%; height: 100%; object-fit: contain; }
				.sd-mini img { max-width: 56px; max-height: 36px; object-fit: contain; }
				.sd-note { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--yellow-300, #f5c451); background: var(--bg-yellow, #fff8e1); color: var(--text-on-yellow, #7a5a00); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; font-size: 13.5px; }
				.sd-note b { font-weight: 700; }
				.sd-pd-it.click { cursor: pointer; } .sd-pd-it.click:hover { background: var(--bg-color); transform: translateY(-2px); }
				.sd-pd-it.zero { opacity: .55; }
				.sd-pd-it .pic { height: 64px; display: grid; place-items: center; }
				.sd-pd-it .pic img:not(.sd-lg-img) { max-height: 64px; max-width: min(150px, 100%); object-fit: contain; }
				.sd-pd-it .pv { font-size: 24px; font-weight: 800; line-height: 1.15; margin-top: 4px; font-variant-numeric: tabular-nums; }
				.sd-pd-it .pl { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12.5px; color: var(--text-muted); margin-top: 2px; }
				.sd-pd-it .pl i { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
				.sd-pd-it .pl span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
				.sd-pd.logos .pic { height: 46px; }
				.sd-pd-ring svg { display: block; width: 100%; height: auto; }
				.sd-pd-ring .sl { cursor: default; } .sd-pd.clickable .sd-pd-ring .sl[data-c] { cursor: pointer; } .sd-pd-ring .sl:hover { opacity: .82; }
				@media (max-width: 700px) { .sd-pd { grid-template-columns: 1fr 1fr; } .sd-pd-ring { grid-column: 1 / -1; order: -1; width: 100%; max-width: 230px; margin: 0 auto; } }
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
		// Sanalarni dastur o'zi qo'yganda (tayyor davr, grafikdan bosish) maydonning
		// change hodisasi baribir keladi — qiymat biz qo'ygan bilan bir xil bo'lsa e'tiborsiz.
		const custom_dates = () => {
			const a = this.F.from_date.get_value(), b = this.F.to_date.get_value();
			if (this._auto_dates && this._auto_dates.from === a && this._auto_dates.to === b) return;
			this._auto_dates = null;
			F.timespan.set_input("custom");
			reload_sales();
		};
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
		this.set_dates(from + "-01", moment(upto, "YYYY-MM").endOf("month").format("YYYY-MM-DD"));
	}

	// Oxirgi oy shubhali kichik bo'lsa (sinov yozuvi / kiritilmagan oy) — ogohlantirish
	data_note(n) {
		if (!n) return "";
		return `<div class="sd-note"><span>⚠️</span><span>${__("{0} looks incomplete: only {1} entries, {2} units (a typical month has about {3}). \"Last month\", MoM, rating and some percentages are computed from this month. Check the entries or wait until the month is fully entered.", [
			`<b>${mlabel(n.ym)}</b>`, n.entries, fmt(n.qty), fmt(n.typical),
		])} <a href="/app/market-entry?date=${encodeURIComponent(JSON.stringify(["Between", [n.ym + "-01", moment(n.ym, "YYYY-MM").endOf("month").format("YYYY-MM-DD")]]))}">${__("Show entries")}</a></span></div>`;
	}

	set_dates(from, to) {
		this._auto_dates = { from, to };
		this.F.from_date.set_input(from);
		this.F.to_date.set_input(to);
	}

	// Grafikdan bosilgan davrni filtrga qo'yadi (oy yoki yil)
	set_period(from_ym, to_ym) {
		const F = this.F;
		F.timespan.set_input("custom");
		this.set_dates(moment(from_ym, "YYYY-MM").startOf("month").format("YYYY-MM-DD"), moment(to_ym || from_ym, "YYYY-MM").endOf("month").format("YYYY-MM-DD"));
		this.load_sales();
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
		} else if (tab === "segments") {
			// Model kartasidan "Dashboardda ko'rish": segment + fokus-model oldindan qo'yiladi
			const ro = frappe.route_options;
			if (ro && (ro.segment || ro.focus_model)) {
				frappe.route_options = null;
				this._preset = { segment: ro.segment, focus_model: ro.focus_model };
			}
			this.load_segments();
		}
		else this.load_sales();
	}

	// ---------------------------------------------------------- helpers
	// Rasm yuklanmasa (fayl o'chgan, private, tashqi havola ishlamaydi) —
	// uni jimgina o'rinbosar bilan almashtiramiz, "buzilgan rasm" chiqmasin.
	fix_broken_images($root) {
		($root || this.$body).find("img[data-fbhtml]").on("error", function () {
			$(this).replaceWith($(this).attr("data-fbhtml"));
		});
		($root || this.$body).find("img[data-fb]").on("error", function () {
			const fb = $(this).attr("data-fb"), fbc = $(this).attr("data-fbc") || "sd-fb", fbs = $(this).attr("data-fbs") || "";
			$(this).replaceWith(fb ? `<span class="${frappe.utils.escape_html(fbc)}" ${fbs}>${frappe.utils.escape_html(fb)}</span>` : "");
		});
	}

	// Animatsiya: element oldingi holatidan (yoki `zero`dan) chiziladi,
	// animate() esa keyingi kadrda yakuniy holatni qo'yadi — CSS transition
	// qolganini bajaradi. Kalit — elementning barqaror nomi.
	from(key, zero) {
		return this._prev[key] || zero;
	}

	to(key, target) {
		return `data-to="${esc(target)}" data-k="${esc(key)}"`;
	}

	reduced_motion() {
		return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	}

	animate($root) {
		const $scope = $root || this.$body;
		const els = $scope.find("[data-to]").toArray();
		const apply = () => els.forEach((el) => {
			const target = el.getAttribute("data-to");
			if (target == null) return;
			el.style.cssText += ";" + target;
			this._prev[el.getAttribute("data-k")] = target;
			el.removeAttribute("data-to");
		});
		if (this.reduced_motion()) apply();
		else requestAnimationFrame(() => requestAnimationFrame(apply));
		this.count_up($scope);
	}

	// Raqamlar oldingi qiymatdan yangisiga "sanab" o'tadi
	count_up($scope) {
		const reduce = this.reduced_motion();
		$scope.find("[data-count]").each((_, el) => {
			const to = +el.getAttribute("data-count"), k = el.getAttribute("data-ck"), kind = el.getAttribute("data-f");
			el.removeAttribute("data-count");
			const show = kind === "p1" ? (v) => v.toFixed(1) + "%" : kind === "c" ? (v) => compact(v) : kind === "k" ? (v) => fmtk(v) : (v) => fmt(v);
			const from = k && this._prev[k] != null ? +this._prev[k] : 0;
			if (k) this._prev[k] = to;
			if (reduce || from === to) { el.textContent = show(to); return; }
			el.textContent = show(from);
			const t0 = performance.now(), D = 900;
			const step = (t) => {
				const p = Math.min((t - t0) / D, 1), e = 1 - Math.pow(1 - p, 3);
				el.textContent = show(p < 1 ? from + (to - from) * e : to);
				if (p < 1) requestAnimationFrame(step);
			};
			requestAnimationFrame(step);
		});
	}

	// Yangi ma'lumot kelguncha eski kontent xiralashadi (bo'sh "Yuklanmoqda" emas),
	// shunda sahifa sakramaydi va grafiklar eski holatdan yangisiga o'tadi.
	busy(on) {
		const has_content = this.$body.children(".sd-grid, .sd-kpis, .sd-cmp-slots").length > 0;
		if (on && !has_content) this.$body.html(`<div class="sd-empty">${__("Loading")}...</div>`);
		this.$body.toggleClass("sd-busy", !!on && has_content);
		this.$root.toggleClass("busy", !!on);
	}

	// Narx diapazoni grafigi: har model uchun eng arzon—eng qimmat
	// komplektatsiya ustuni, o'rtacha narx nuqtasi va aksiya rombi.
	// O'z bar-grafigi: qiymatlar doim ko'rinadi; o'lchov birligi bir marta
	// o'ng yuqorida yoziladi, raqamlarda takrorlanmaydi.
	bars(sel, labels, series, opts = {}) {
		const $el = this.$body.find(sel);
		if (!$el.length) return;
		if (!labels || !labels.length) { $el.html(`<div class="sd-empty">${__("No data")}</div>`); return; }
		const H = opts.height || 220;
		const all = series.flatMap((s) => s.values).filter((v) => v != null);
		const raw_max = Math.max(...all.map(Math.abs), 1);

		const scale = opts.unit ? 1 : raw_max >= 1e6 ? 1e6 : raw_max >= 10000 ? 1000 : 1;
		const measure = opts.measure || __("units");
		const caption = opts.unit || (scale === 1e6 ? `${__("mln")} ${measure}` : scale === 1000 ? `${__("thousands")} ${measure}` : measure);
		const num = (v) => (v / scale).toLocaleString("ru-RU", { maximumFractionDigits: v && scale > 1 && Math.abs(v / scale) < 100 ? 1 : 0 });

		const vertical = series.length > 1 || labels.length > 8;
		const head = vertical ? 1.28 : 1.13;
		const ticks = 4;
		const nice = (x) => { const p = Math.pow(10, Math.floor(Math.log10(x))); const n = x / p; return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10) * p; };
		const max = raw_max * head;
		const step = nice(max / ticks);
		const grid = [];
		for (let g = 0; g <= max + 1e-9; g += step) grid.push(g);

		const cols = labels.map((l, i) => `<div class="grp">${series.map((sr) => {
			const v = sr.values[i];
			if (v == null) return `<div class="bar none" title="${esc(l)}: ${__("no data")}"></div>`;
			const h = (Math.abs(v) / max) * 100;
			const inside = h > 92;
			const k = `${sel}|${sr.name}|${l}`;
			return `<div class="bar" style="--c:${sr.color};--d:${Math.min(i * 30, 450)}ms;${this.from(k, "height:0%")}" ${this.to(k, `height:${h.toFixed(2)}%`)} title="${esc(sr.name)} · ${esc(l)}: ${fmt(v)} ${esc(measure)}"><span class="val ${inside ? "in" : ""}">${num(v)}</span></div>`;
		}).join("")}</div>`).join("");

		$el.html(`<div class="sd-bars ${labels.length > 14 ? "dense" : ""} ${vertical ? "multi" : ""}" style="--h:${H}px">
			<div class="cap">${esc(caption)}</div>
			<div class="axis">${grid.map((g) => `<span style="bottom:${(g / max) * 100}%">${num(g)}</span>`).join("")}</div>
			<div><div class="plot">${grid.map((g) => `<div class="gl" style="bottom:${(g / max) * 100}%"></div>`).join("")}<div class="cols">${cols}</div></div>
			<div class="xl">${labels.map((l) => `<span title="${esc(l)}">${esc(l)}</span>`).join("")}</div></div>
			${series.length > 1 ? `<div class="sd-leg">${series.map((sr) => `<span><i style="background:${sr.color}"></i>${esc(sr.name)}</span>`).join("")}</div>` : ""}
		</div>`);
		if (opts.onclick) $el.find(".grp").each((i, g) => $(g).css("cursor", "pointer").on("click", () => opts.onclick(i)));
		this.animate($el);
	}

	// Halqa (SVG): har bo'lak — pathLength=100 li aylana chizig'i, shuning uchun
	// uzunlik va boshlanish nuqtasi foizda beriladi va CSS bilan silliq o'zgaradi.
	ring(sel, rows, total, g) {
		const { cx, cy, R, r } = g, rm = (R + r) / 2, sw = R - r;
		const gap = rows.filter((x) => x.value > 0).length > 1 ? 0.6 : 0;
		let acc = 0, slices = "", labels = "";
		rows.forEach((row, i) => {
			const frac = total ? row.value / total : 0, len = Math.max(frac * 100 - gap, 0);
			const color = row.color || SD_COLORS[i % SD_COLORS.length], k = `${sel}|ring|${row.label}`;
			slices += `<circle class="sl" data-i="${i}" ${row.click ? 'data-c="1"' : ""} cx="${cx}" cy="${cy}" r="${rm}" pathLength="100" fill="none" stroke="${color}" stroke-width="${sw}" transform="rotate(-90 ${cx} ${cy})"
				style="${this.from(k, "stroke-dasharray:0 100;stroke-dashoffset:0")}" ${this.to(k, `stroke-dasharray:${len.toFixed(3)} 100;stroke-dashoffset:${(-acc).toFixed(3)}`)}><title>${esc(row.label)}: ${fmt(row.value)} (${(frac * 100).toFixed(1)}%)</title></circle>`;
			if (frac >= 0.07 && g.labels !== false) {
				const am = -Math.PI / 2 + ((acc + frac * 50) / 100) * 2 * Math.PI;
				labels += `<text class="pl" x="${(cx + rm * Math.cos(am)).toFixed(1)}" y="${(cy + rm * Math.sin(am)).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${g.fs || 13}" font-weight="700" fill="#fff">${(frac * 100).toFixed(frac < 0.1 ? 1 : 0)}%</text>`;
			}
			acc += frac * 100;
		});
		return `<g class="sd-ring">${slices}${labels}</g>`;
	}

	// Oddiy donut + legenda (ixtiyoriy: har qatorda logotip — row.pic)
	donut(sel, rows, opts = {}) {
		const $el = this.$body.find(sel);
		if (!$el.length) return;
		const total = rows.reduce((a, r) => a + r.value, 0);
		if (!total) { $el.html(`<div class="sd-empty">${__("No records")}</div>`); return; }
		const W = 210, cx = 105, cy = 105;
		rows.forEach((row) => (row.click = !!opts.onclick));

		$el.html(`<div class="sd-donut ${opts.stack ? "stack" : ""}" style="grid-template-columns:${opts.stack ? "minmax(0, 1fr)" : `${W}px minmax(0, 1fr)`}">
			<svg viewBox="0 0 ${W} ${W}" style="width:${W}px;height:${W}px">${this.ring(sel, rows, total, { cx, cy, R: 98, r: 60 })}
				<text x="${cx}" y="${cy - 5}" text-anchor="middle" font-size="19" font-weight="700" fill="var(--text-color)" data-count="${total}" data-ck="${esc(sel)}|total" data-f="c">${compact(total)}</text>
				<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="12" fill="var(--text-muted)">${esc(opts.center || __("units"))}</text></svg>
			<div class="lg">${rows.map((row, i) => {
				const color = SD_COLORS[i % SD_COLORS.length];
				return `<div class="${opts.onclick ? "click" : ""}" data-i="${i}"><i style="background:${color}"></i>${row.pic || ""}<span title="${esc(row.label)}">${esc(row.label)}</span><small>${fmt(row.value)}</small><b>${((row.value / total) * 100).toFixed(1)}%</b></div>`;
			}).join("")}</div></div>`);
		if (opts.onclick) {
			$el.find(".sd-donut").addClass("clickable");
			$el.find("[data-i]").on("click", (e) => opts.onclick(+$(e.currentTarget).attr("data-i")));
		}
		this.fix_broken_images($el);
		this.animate($el);
	}

	// Rasmli donut: o'rtada halqa, ikki yonida surat/logotip + foiz + nom.
	// rows: { label, value, pic (html), click (bool), title }
	pic_donut(sel, rows, opts = {}) {
		const $el = this.$body.find(sel);
		if (!$el.length) return;
		const total = rows.reduce((a, r) => a + r.value, 0);
		if (!total) { $el.html(`<div class="sd-empty">${__("No records")}</div>`); return; }
		const item = (row, i) => {
			const color = row.color || SD_COLORS[i % SD_COLORS.length], p = (row.value / total) * 100;
			return `<div class="sd-pd-it ${row.click ? "click" : ""} ${row.value ? "" : "zero"}" data-i="${i}" style="--d:${120 + i * 70}ms" title="${esc(row.title || row.label)}: ${fmt(row.value)} ${__("units")}">
				<div class="pic">${row.pic || ""}</div>
				<div class="pv" data-count="${p.toFixed(3)}" data-ck="${esc(sel)}|pct|${esc(row.label)}" data-f="p1">${p.toFixed(1)}%</div>
				<div class="pl"><i style="background:${color}"></i><span>${esc(row.label)}</span></div>
			</div>`;
		};
		// Kattadan kichikka: chap va o'ng ustunga navbatma-navbat
		const left = rows.map((r, i) => (i % 2 ? "" : item(r, i))).join("");
		const right = rows.map((r, i) => (i % 2 ? item(r, i) : "")).join("");
		const S = 220, c = S / 2;
		$el.html(`<div class="sd-pd ${opts.logos ? "logos" : ""} ${opts.onclick ? "clickable" : ""}">
			<div class="sd-pd-col">${left}</div>
			<div class="sd-pd-ring"><svg viewBox="0 0 ${S} ${S}">${this.ring(sel, rows, total, { cx: c, cy: c, R: 104, r: 72, labels: false })}
				<text x="${c}" y="${c - 4}" text-anchor="middle" font-size="24" font-weight="800" fill="var(--text-color)" data-count="${total}" data-ck="${esc(sel)}|total">${fmt(total)}</text>
				<text x="${c}" y="${c + 18}" text-anchor="middle" font-size="12" fill="var(--text-muted)">${esc(opts.center || __("units"))}</text></svg></div>
			<div class="sd-pd-col">${right}</div>
		</div>`);
		if (opts.onclick) {
			$el.find(".sd-pd-it.click, .sl[data-c]").on("click", (e) => opts.onclick(+$(e.currentTarget).attr("data-i")));
		}
		this.fix_broken_images($el);
		this.animate($el);
	}

	// Frappe Charts o'ramchisi — bo'sh ma'lumotda yiqilmasin
	chart(sel, opts) {
		const el = this.$body.find(sel)[0];
		if (!el) return;
		el.innerHTML = "";
		const ds = (opts.data && opts.data.datasets) || [];
		const labels = (opts.data && opts.data.labels) || [];
		if (!ds.length || !labels.length) {
			el.innerHTML = `<div class="sd-empty">${__("No data")}</div>`;
			return;
		}
		const chart = new frappe.Chart(el, Object.assign({ colors: SD_COLORS, height: 230, animate: 0, truncateLegends: 1 }, opts));
		this.draw_lines(el);
		return chart;
	}

	// Chiziqli grafik: chiziqlar chapdan o'ngga "chizilib" chiqadi
	draw_lines(el, tries = 0) {
		if (this.reduced_motion()) return;
		const paths = el.querySelectorAll("path.line-graph-path");
		if (!paths.length) {
			if (tries < 3) setTimeout(() => this.draw_lines(el, tries + 1), 40);
			return;
		}
		el.classList.remove("sd-ch-anim");
		paths.forEach((p) => {
			const L = p.getTotalLength ? p.getTotalLength() : 0;
			if (!L) return;
			p.style.transition = "none";
			p.style.strokeDasharray = `${L} ${L}`;
			p.style.strokeDashoffset = L;
		});
		el.getBoundingClientRect();
		el.classList.add("sd-ch-anim");
		requestAnimationFrame(() => paths.forEach((p) => { p.style.transition = ""; p.style.strokeDashoffset = 0; }));
	}

	// Gorizontal reyting ro'yxati (TOP modellar / brendlar / segmentlar)
	hbars(rows, key, color, current, cls_extra = "") {
		if (!rows || !rows.length) return `<div class="sd-empty">${__("No data")}</div>`;
		const max = Math.max(...rows.map((r) => r.qty), 1);
		return (
			`<div class="sd-hb ${cls_extra}">` +
			rows
				.map((r, i) => {
					const k = `hb|${cls_extra}|${r[key]}`, w = ((r.qty / max) * 100).toFixed(2);
					return `<div class="sd-hbar ${r[key] === current ? "cur" : ""}" data-key="${esc(r[key])}"><span class="l"><span class="n">#${i + 1}</span>${r.pic || ""}<span class="t" title="${esc(r.label || r[key])}">${esc(r.label || r[key])}</span></span><div class="bar" style="--s:${color};--d:${Math.min(i * 35, 500)}ms;${this.from(k, "width:0%")}" ${this.to(k, `width:${w}%`)}></div><span class="val" data-count="${r.qty}" data-ck="${esc(k)}|n" data-f="k">${fmtk(r.qty)}</span></div>`;
				})
				.join("") +
			"</div>"
		);
	}

	// O'zgarish drayverlari: markazdan o'ngga (+) yoki chapga (−)
	drivers(rows) {
		if (!rows || !rows.length) return `<div class="sd-empty">${__("No comparable months")}</div>`;
		const max = Math.max(...rows.map((r) => Math.abs(r.delta)), 1);
		return rows
			.map((r) => {
				const w = (Math.abs(r.delta) / max) * 45, pos = r.delta >= 0, k = `drv|${r.brand || r.model || r.label}`;
				return `<div class="sd-drv" data-key="${esc(r.brand || r.model || "")}"><span>${esc(r.label)}</span><div class="track"><i style="background:${pos ? SD_COLORS[2] : SD_COLORS[6]};${this.from(k, "left:50%;width:0%")}" ${this.to(k, `left:${(pos ? 50 : 50 - w).toFixed(2)}%;width:${w.toFixed(2)}%`)}></i><b style="${w > 28 ? (pos ? `right:${(50 - w + 1).toFixed(2)}%;color:#fff` : `left:${(50 - w + 1).toFixed(2)}%;color:#fff`) : pos ? `left:${(50 + w + 1).toFixed(2)}%` : `right:${(50 + w + 1).toFixed(2)}%`}" class="${w > 28 ? "" : cls(r.delta)}">${r.delta > 0 ? "+" : ""}${fmtk(r.delta)}</b></div></div>`;
			})
			.join("");
	}

	range_bars(sel, rows, opts = {}) {
		const $el = this.$body.find(sel);
		if (!$el.length) return;
		const vals = rows.flatMap((r) => [r.max, r.min, r.avg]).filter((v) => v != null);
		if (!vals.length) { $el.html(`<div class="sd-empty">${__("No prices entered yet")}</div>`); return; }

		const raw_max = Math.max(...vals);
		const scale = raw_max >= 1e6 ? 1e6 : raw_max >= 10000 ? 1000 : 1;
		const num = (v) => (v / scale).toLocaleString("ru-RU", { maximumFractionDigits: Math.abs(v / scale) < 100 ? 1 : 0 });
		const nice = (x) => { const p = Math.pow(10, Math.floor(Math.log10(x))); const n = x / p; return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10) * p; };
		const max = raw_max * 1.06;
		const step = nice(max / 4);
		const ticks = [];
		for (let g = 0; g <= max + 1e-9; g += step) ticks.push(g);
		const pct = (v) => (v / max) * 100;

		// Har model — bitta qator: [nom] [eng arzon] [diapazon chizig'i] [eng qimmat]
		const body = rows.map((r, i) => {
			const name = `<div class="rb-name"><b>${esc(r.brand)}</b><span>${esc(r.label)}</span><small>${r.no_data ? __("No data") : `${r.trims_priced}/${r.trims_total} ${__("trims")}`}</small></div>`;
			if (r.no_data || r.min == null) {
				return `<div class="rb-row" data-i="${i}">${name}<div class="rb-empty">${__("No price entered")}</div></div>`;
			}
			const w = Math.max(pct(r.max) - pct(r.min), 0.6);
			const avg = r.avg != null && r.max !== r.min
				? `<span class="rb-avg" style="left:${pct(r.avg)}%" title="${__("Average price")}: ${fmt(r.avg)}"></span>`
				: "";
			return `<div class="rb-row" data-i="${i}">
				${name}
				<div class="rb-min">${num(r.min)}</div>
				<div class="rb-track" title="${esc(r.label)}: ${fmt(r.min)} — ${fmt(r.max)}">
					${ticks.map((g) => `<i class="rb-gl" style="left:${pct(g)}%"></i>`).join("")}
					<div class="rb-range" style="${this.from(`rb|${sel}|${r.model}`, `left:${pct(r.min).toFixed(2)}%;width:0%`)}" ${this.to(`rb|${sel}|${r.model}`, `left:${pct(r.min).toFixed(2)}%;width:${w.toFixed(2)}%`)}></div>${avg}
				</div>
				<div class="rb-max">${num(r.max)}</div>
			</div>`;
		}).join("");

		$el.html(`<div class="rb ${opts.onclick ? "clickable" : ""}">
			${body}
			<div class="rb-row rb-axis"><div></div><div></div><div class="rb-track">${ticks.map((g) => `<span style="left:${pct(g)}%">${num(g)}</span>`).join("")}</div><div class="rb-unit">${esc(opts.caption || "")}</div></div>
		</div>`);

		if (opts.onclick) {
			$el.find(".rb-row[data-i]").on("click", (e) => {
				const i = +$(e.currentTarget).attr("data-i");
				if (rows[i] && !rows[i].no_data) opts.onclick(i);
			});
		}
		this.animate($el);
	}

	// ---------------------------------------------------------- SALES TAB
	load_sales() {
		this.busy(true);
		this.sf = this.sales_filters();
		this.safe_call(`${SD_API}.get_sales_data`, { filters: this.sf }, (m) => this.render_sales(m));
	}

	// Barcha yuklashlar shu yerdan o'tadi: xato bo'lsa ekranda sababi ko'rinadi
	safe_call(method, args, render, sel) {
		const $target = sel ? this.$body.find(sel) : this.$body;
		// Birinchi marta (bo'sh ekranga) chizilganda paneller ketma-ket paydo bo'ladi
		const first = !sel && !this.$body.children(".sd-grid, .sd-kpis, .sd-cmp-slots").length;
		frappe.call({ method, args })
			.then((r) => {
				if (!sel) this.busy(false);
				try {
					render(r && r.message);
					if (first) {
						this.$body.addClass("sd-enter");
						setTimeout(() => this.$body.removeClass("sd-enter"), 900);
					}
				} catch (e) {
					console.error("[sales-dashboard]", e);
					$target.html(`<div class="sd-empty">${__("Could not draw this block")}<br><small>${frappe.utils.escape_html(e.message || e)}</small></div>`);
				}
			})
			.catch((e) => {
				if (!sel) this.busy(false);
				console.error("[sales-dashboard]", e);
				$target.html(`<div class="sd-empty">${__("Could not load data")}</div>`);
			});
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
		const fuel_tiles = k.fuel.map((x, i) => `<div class="sd-kpi click" style="--k:${SD_COLORS[i + 1]}" data-fuel="${esc(x.fuel)}"><div class="k">${__("Powertrain")}: ${esc(x.fuel)}</div><div class="v" data-count="${x.qty}" data-ck="kpi|fuel|${esc(x.fuel)}">${fmt(x.qty)}</div><div class="d">${__("Click to filter")}</div></div>`).join("");
		const tier_total = d.tiers.reduce((a, t) => a + t.qty, 0) || 1;

		this.$body.html(`
			${this.data_note(d.data_note)}
			<div class="sd-sub">${__("Data")}: ${mlabel(d.bounds.from)} — ${mlabel(d.bounds.to)} · ${__("Selected")}: ${mlabel(d.period.from)} — ${mlabel(d.period.to)}</div>
			<div class="sd-kpis">
				<div class="sd-kpi" style="--k:${SD_COLORS[2]}"><div class="k">${__("Sales, units")}</div><div class="v" data-count="${k.total}" data-ck="kpi|total">${fmt(k.total)}</div><div class="d"><b class="${cls(k.growth)}">${pct(k.growth)}</b> · ${k.comparable_months} ${__("comparable months to previous year")}</div></div>
				${fuel_tiles}
				<div class="sd-kpi" style="--k:${SD_COLORS[0]}"><div class="k">${__("Brands, count")}</div><div class="v" data-count="${k.brands}" data-ck="kpi|brands">${fmt(k.brands)}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[5]}"><div class="k">${__("Models, count")}</div><div class="v" data-count="${k.models}" data-ck="kpi|models">${fmt(k.models)}</div></div>
			</div>
			<div class="sd-grid"><div class="sd-panel c12"><h4>${__("Brand positioning")}</h4><div class="hint">${__("Period, type, segment and powertrain apply; brand and model do not narrow the share base. Click a tier to filter.")}${this.tier ? ` · <b>${__("Applied")}: ${esc(this.tier)}</b> (${__("click again to clear")})` : ""}</div>
				<div class="sd-stack">${d.tiers.map((t, i) => `<i style="background:${SD_COLORS[i]};${this.from(`stack|${t.tier}`, "width:0%")}" ${this.to(`stack|${t.tier}`, `width:${((t.qty / tier_total) * 100).toFixed(2)}%`)}></i>`).join("")}</div>
				<div class="sd-tiers">${d.tiers.map((t, i) => `<div class="sd-tier ${this.tier === t.tier ? "active" : ""}" data-tier="${esc(t.tier)}" style="--k:${SD_COLORS[i]}"><div class="t"><span>${esc(t.tier)}</span><span>${t.pct}%</span></div><div class="v"><span data-count="${t.qty}" data-ck="tier|qty|${esc(t.tier)}">${fmt(t.qty)}</span> <span class="m">${__("units")}</span></div><div class="m">${t.brands} ${__("brands")}</div><div class="p"><i style="${this.from(`tier|${t.tier}`, "width:0%")}" ${this.to(`tier|${t.tier}`, `width:${t.pct}%`)}></i></div></div>`).join("")}</div></div></div>
			<div class="sd-h">${__("Main market dynamics")}</div><div class="sd-hs">${__("Sales volume by years and months, market structure by vehicle types")}</div>
			<div class="sd-grid">
				<div class="sd-panel c6"><h4>${__("Yearly sales dynamics")}</h4><div class="hint">${__("Click a year to filter")}</div><div class="ch-year" style="margin-top:14px"></div></div>
				<div class="sd-panel c6"><h4>${__("Monthly sales dynamics")}</h4><div class="hint">${__("Last 12 months of the selected period")} · ${__("click a month to filter")}</div><div class="ch-month" style="margin-top:14px"></div></div>
				<div class="sd-panel c6"><h4>${__("Vehicle type share")}</h4><div class="hint">${__("Market structure: PC, SUV, LCV and other types")} · ${__("click to filter")}</div><div class="ch-type" style="margin-top:10px"></div></div>
				<div class="sd-panel c6"><h4>${__("Brand share")}</h4><div class="hint">${__("Market structure by brands")} · ${__("click to filter")}</div><div class="ch-brand-pie" style="margin-top:10px"></div></div>
				<div class="sd-panel c6"><h4>${__("Top-15 models")}</h4><div class="hint">${__("Sales leaders for the selected period")} · ${__("click to filter")}</div>${this.hbars(d.top_models.map((m) => ({ ...m, pic: brand_logo(m.logo, m.brand, 18) })), "model", SD_COLORS[2], this.sf.model, "clickable hb-models")}</div>
				<div class="sd-panel c6"><h4>${__("Top-10 brands")}</h4><div class="hint">${__("Sales leaders for the selected period")} · ${__("click to filter")}</div>${this.hbars(d.top_brands.map((b) => ({ ...b, pic: brand_logo(b.logo, b.label, 20) })), "brand", SD_COLORS[0], this.sf.brand, "clickable hb-brands")}</div>
			</div>
			<div class="sd-h">${__("MoM, YoY and change drivers")}</div><div class="sd-hs">${__("Same-period comparison and brand contribution to the change in sales volume")}</div>
			<div class="sd-grid">
				<div class="sd-panel c8"><h4>${d.yoy.year} vs ${d.yoy.year - 1} <span class="sd-badge">${d.yoy.comparable}/${d.yoy.total_months} ${__("months")}</span></h4><div class="hint">${__("Month-by-month comparison of the same periods")} · ${__("click a month to filter")}</div><div class="ch-yoy" style="margin-top:14px"></div></div>
				<div class="sd-panel"><h4>${__("Change drivers")} <span class="sd-badge">Δ ${d.drivers.total > 0 ? "+" : ""}${fmt(d.drivers.total)}</span></h4><div class="hint">${__("Brand contribution to the change in sales")} · ${d.drivers.months} ${__("comparable months")} · ${__("click to filter")}</div><div class="drv-brands">${this.drivers(d.drivers.rows)}</div></div>
			</div>
			<div class="sd-grid"><div class="sd-panel c12"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><h4>${__("Market share dynamics")}</h4><div class="hint">${__("Top-5 of the selected level; share is computed from the whole filtered market")}</div></div><div class="sd-seg sd-share-mode"><span data-m="month">${__("By months")}</span><span data-m="quarter">${__("By quarters")}</span><span data-m="year">${__("By years")}</span></div></div><div class="ch-share"></div></div></div>
			<div class="sd-grid"><div class="sd-panel c12"><h4>${__("Market rating")}</h4><div class="hint">${mlabel(d.rating.L)} · ${__("rating and share for the selected slice")} · MoM: ${mlabel(d.rating.L)} ${__("vs")} ${mlabel(d.rating.P)} · YoY: ${__("vs")} ${mlabel(d.rating.Y)}</div>
				<div style="overflow-x:auto"><table class="sd-table"><tr><th>#</th><th>${__("Brand")}</th><th class="num">${mlabel(d.rating.L)}</th><th class="num">${mlabel(d.rating.P)}</th><th class="num">${mlabel(d.rating.Y)}</th><th class="num">MoM</th><th class="num">YoY</th><th class="num">${__("Market share")}</th><th class="num">${__("Position")}</th></tr>
				${d.rating.rows.map((r) => `<tr class="click" data-brand="${esc(r.brand)}"><td>${r.rank}</td><td><div class="sd-brand-cell"><span class="lg">${brand_logo(r.logo, r.label, 26)}</span><b>${esc(r.label)}</b></div></td><td class="num">${fmt(r.L)}</td><td class="num">${fmt(r.P)}</td><td class="num">${fmt(r.Y)}</td><td class="num ${cls(r.mom)}">${pct(r.mom)}</td><td class="num ${cls(r.yoy)}">${r.Y ? pct(r.yoy) : r.is_new ? __("New") : "—"}</td><td class="num">${r.share}%</td><td class="num">#${r.rank} ${r.move > 0 ? `<span class="sd-up">▲${r.move}</span>` : r.move < 0 ? `<span class="sd-down">▼${-r.move}</span>` : "—"}</td></tr>`).join("")}
				</table></div></div></div>
			<div class="sd-h">${__("Model price range")}</div><div class="sd-hs">${__("From the most affordable to the most expensive trim")}</div>
			<div class="sd-grid"><div class="sd-panel c12 sd-prices"><div class="sd-empty">${__("Loading")}...</div></div></div>
		`);

		this.bars(".ch-year", d.yearly.map((y) => y.year), [{ name: __("Sales"), values: d.yearly.map((y) => y.qty), color: SD_COLORS[2] }], {
			onclick: (i) => this.set_period(`${d.yearly[i].year}-01`, `${d.yearly[i].year}-12`),
		});
		this.bars(".ch-month", d.monthly.map((m, i) => mshort(m.ym, i === 0)), [{ name: __("Sales"), values: d.monthly.map((m) => m.qty), color: SD_COLORS[5] }], { onclick: (i) => this.set_period(d.monthly[i].ym) });
		this.render_type_share(d.type_share);
		this.render_brand_pie(d.top_brands, k);
		this.bars(".ch-yoy", d.yoy.rows.map((r) => moment(r.ym, "YYYY-MM").format("MMM")), [
			{ name: String(d.yoy.year - 1), values: d.yoy.rows.map((r) => r.prev), color: getComputedStyle(this.$body[0]).getPropertyValue("--sd-bar-prev").trim() || "#a3acc2" },
			{ name: String(d.yoy.year), values: d.yoy.rows.map((r) => r.cur), color: SD_COLORS[0] },
		], { onclick: (i) => this.set_period(d.yoy.rows[i].ym) });
		this.render_share(d.share);
		this.load_prices(d.top_models.slice(0, 8).map((m) => m.model));

		// interaktivlik
		this.$body.find("[data-fuel]").on("click", (e) => F.fuel.set_value($(e.currentTarget).data("fuel")));
		this.$body.find(".hb-models .sd-hbar").on("click", (e) => F.model.set_value($(e.currentTarget).data("key")));
		this.$body.find(".hb-brands .sd-hbar").on("click", (e) => F.brand.set_value($(e.currentTarget).data("key")));
		this.$body.find(".drv-brands .sd-drv").on("click", (e) => { const b = $(e.currentTarget).data("key"); if (b) F.brand.set_value(b); });
		this.$body.find("[data-tier]").on("click", (e) => { const t = $(e.currentTarget).data("tier"); this.tier = this.tier === t ? undefined : t; this.load_sales(); });
		this.$body.find(".sd-table tr[data-brand]").on("click", (e) => F.brand.set_value($(e.currentTarget).data("brand")));
		this.$body.find(".sd-share-mode span").on("click", (e) => { this.share_mode = $(e.currentTarget).data("m"); this.render_share(d.share); });
		this.fix_broken_images();
		this.animate();
	}

	// Avtomobil turlari ulushi: har tur o'z surati bilan. Ma'lum turlar
	// ma'lumot bo'lmasa ham 0% bilan turadi — joylashuv filtrdan filtrga sakramaydi.
	render_type_share(type_share) {
		const rows = type_share.map((t) => {
			const key = vehicle_type_key(t.vtype), vt = VEHICLE_TYPES[key];
			return {
				key, vtype: t.vtype, value: t.qty, title: t.vtype, click: key !== "unset" && t.qty > 0,
				label: vt ? vt.label() : key === "unset" ? __("Not set") : t.vtype,
				pic: vt ? `<img src="${VT_IMG}${vt.img}" alt="${esc(t.vtype)}" loading="lazy">` : key === "unset" ? `<span class="sd-q">?</span>` : `<span class="sd-ini" style="width:44px;height:44px;font-size:20px">${esc(initial(t.vtype))}</span>`,
			};
		});
		// Bir xil turga tushgan bir nechta segment bo'lsa ham alohida qoladi (filtr aniq nom bilan ishlaydi)
		Object.keys(VEHICLE_TYPES).concat(["unset"]).forEach((key) => {
			if (rows.some((r) => r.key === key)) return;
			const vt = VEHICLE_TYPES[key];
			rows.push({ key, value: 0, click: false, label: vt ? vt.label() : __("Not set"), pic: vt ? `<img src="${VT_IMG}${vt.img}" alt="" loading="lazy">` : `<span class="sd-q">?</span>` });
		});
		// Rang turga bog'lanadi (tartibga emas), shunda filtr o'zgarganda ham rang o'zgarmaydi
		const order = ["sedan", "van", "suv", "minivan", "pickup", "unset"];
		rows.forEach((r) => { const j = order.indexOf(r.key); r.color = j >= 0 ? [SD_COLORS[0], SD_COLORS[1], SD_COLORS[5], "#14a3b8", "#8fb33a", SD_COLORS[3]][j] : SD_COLORS[6]; });
		this.pic_donut(".ch-type", rows, { center: __("vehicles"), onclick: (i) => { if (rows[i].click) this.F.vtype.set_value(rows[i].vtype); } });
	}

	// Brendlar ulushi: TOP-6 brend logotiplari bilan + qolganlari "Prochie"
	render_brand_pie(top_brands, k) {
		const top = top_brands.slice(0, 6);
		const rest = k.total - top.reduce((a, b) => a + b.qty, 0);
		const rows = top.map((b, i) => ({ brand: b.brand, label: b.label, value: b.qty, click: true, color: SD_COLORS[i], pic: brand_logo(b.logo, b.label, 38) }));
		if (rest > 0) {
			const n = Math.max(k.brands - top.length, 0);
			rows.push({ label: __("Other"), value: rest, click: false, color: "#a3acc2", pic: `<span class="sd-ini" style="width:38px;height:38px;font-size:14px">${n ? "+" + n : "…"}</span>` });
		}
		this.pic_donut(".ch-brand-pie", rows, { logos: true, center: __("vehicles"), onclick: (i) => { if (rows[i].brand) this.F.brand.set_value(rows[i].brand); } });
	}

	// Narx bloki: dashboard filtrlaridagi TOP modellar bo'yicha
	load_prices(models, sel = ".sd-prices") {
		this.safe_call(`${SD_API}.get_price_ranges`, { models, currency: this.price_currency, with_vat: this.price_vat == null ? 1 : this.price_vat }, (m) => this.render_prices(m, sel), sel);
	}

	render_prices(d, sel = ".sd-prices") {
		const $p = this.$body.find(sel);
		if (!$p.length || !d) return;
		if (!d.currencies.length) {
			$p.html(`<h4>${__("Model price range")}</h4><div class="sd-empty">${__("No prices entered yet")} — <a href="/app/trim-price/new">${__("add the first price")}</a></div>`);
			return;
		}
		const scaled = d.rows.some((r) => (r.max || 0) >= 1e6);
		// Tanlagich faqat tanlashga narsa bo'lganda chiqadi: bir nechta valyuta
		// yoki QQS rejimi aralash bo'lsa. Aks holda ortiqcha boshqaruv bo'lmaydi.
		const multi_cur = d.currencies.length > 1;
		const needs_picker = multi_cur || d.vat_mixed;
		let picker = "";
		if (needs_picker) {
			this.price_currency = d.currency;
			this.price_vat = d.with_vat;
			const opts = [];
			d.currencies.forEach((c) => [1, 0].forEach((v) => opts.push({
				v: `${c}|${v}`,
				l: multi_cur ? `${c} · ${v ? __("with VAT") : __("without VAT")}` : v ? __("with VAT") : __("without VAT"),
			})));
			const cur_val = `${d.currency}|${d.with_vat}`;
			picker = `<div><div class="hint" style="margin-bottom:3px">${multi_cur ? __("Currency and VAT") : __("VAT")}</div>
				<select class="form-control input-sm rb-cur" style="width:auto">${opts.map((o) => `<option value="${o.v}" ${o.v === cur_val ? "selected" : ""}>${esc(o.l)}</option>`).join("")}</select></div>`;
		}
		const priced = d.rows.filter((r) => !r.no_data);

		$p.html(`
			<div class="rb-head">
				<div><h4>${__("Model price range")}</h4><div class="hint">${__("From the most affordable to the most expensive trim as of {0}", [d.as_on])}</div></div>
				${picker}
			</div>
			<div class="rb-legend">
				<span><i style="color:${SD_COLORS[2]}">▬</i>${__("Minimum — maximum")}</span>
				<span><i style="color:var(--text-muted)">│</i>${__("Average price")}</span>
			</div>
			<div class="rb-chart" style="--rb-c:${SD_COLORS[2]}"></div>
			<div class="rb-note">${__("Scale")}: ${scaled ? __("mln") + " " : ""}${esc(d.currency)} · ${d.with_vat ? __("with VAT") : __("without VAT")}. ${__("The range covers active trims with a price.")}${d.other_prices ? " " + __("{0} prices in other currencies are not shown.", [d.other_prices]) : ""}</div>
			${priced.length ? `<details class="rb-det"><summary>${__("Exact prices and trim coverage")}</summary>
				<div style="overflow-x:auto"><table class="sd-table"><tr><th>${__("Model")}</th><th class="num">${__("Trims with a price")}</th><th>${__("Cheapest")}</th><th class="num">${__("Minimum")}</th><th>${__("Most expensive")}</th><th class="num">${__("Maximum")}</th><th class="num">${__("Average price")}</th><th class="num">${__("Price date")}</th></tr>
				${priced.map((r) => `<tr><td><small style="color:var(--text-muted)">${esc(r.brand)}</small><br><b>${esc(r.label)}</b></td><td class="num">${r.trims_priced} / ${r.trims_total}</td><td>${esc(this.trim_label(r.min_trim, r.model))}</td><td class="num">${fmt(r.min)}</td><td>${esc(this.trim_label(r.max_trim, r.model))}</td><td class="num">${fmt(r.max)}</td><td class="num">${fmt(r.avg)}</td><td class="num">${esc(r.last_date)}</td></tr>`).join("")}
				</table></div></details>` : ""}
		`);

		$p.find(".rb-cur").on("change", (e) => {
			const [c, v] = $(e.currentTarget).val().split("|");
			this.price_currency = c;
			this.price_vat = cint(v);
			this.load_prices(d.rows.map((r) => r.model), sel);
		});
		this.range_bars(`${sel} .rb-chart`, d.rows, { caption: `${scaled ? __("mln") + " " : ""}${d.currency}`, onclick: sel === ".sd-prices" ? (i) => this.F.model.set_value(d.rows[i].model) : null });
	}

	trim_label(trim, model) {
		return trim && model && trim.startsWith(model + "-") ? trim.slice(model.length + 1) : trim || "";
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
		this.busy(true);
		const F = this.F, preset = this._preset;
		this._preset = null;
		const seg = preset ? preset.segment : F.g_segment.get_value();
		if (this._last_seg !== seg) this.top_limit = 10;
		this._last_seg = seg;
		// Oldindan qo'yilgan modelda yilni server tanlaydi (modelning oxirgi sotuv yili)
		this.gf = preset
			? { segment: seg || undefined, focus_model: preset.focus_model || undefined, period: F.g_period.get_value() || "ytd" }
			: Object.assign({}, this.gf, { segment: seg || undefined, year: F.g_year.get_value() || undefined, period: F.g_period.get_value() || "ytd" });
		this.safe_call(`${SD_API}.get_segment_data`, { filters: this.gf }, (m) => this.render_segments(m));
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
		const img = (src) => model_img(src, d.segment);
		const months12 = d.monthly_totals;

		this.$body.html(`
			${this.data_note(d.data_note)}
			<div class="sd-sub" style="margin-top:0;display:flex;justify-content:space-between;align-items:center"><span>${__("Period")}: ${mlabel(d.period.from)} — ${mlabel(d.period.to)} · <span class="sd-badge">${d.period.with_data}/${d.period.months} ${__("months with data")}</span></span><span class="sd-btn sd-print">${__("Print / PDF")}</span></div>
			<div class="sd-kpis">
				<div class="sd-kpi" style="--k:${SD_COLORS[0]}"><div class="k">${__("Segment size")}</div><div class="v" data-count="${k.size}" data-ck="seg|size">${fmt(k.size)}</div><div class="d">${mlabel(d.period.from)} — ${mlabel(d.period.to)}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[4]}"><div class="k">${__("vs previous period")}</div><div class="v ${cls(k.prev_pct)}">${pct(k.prev_pct)}</div><div class="d">${__("was")} ${fmt(k.prev_size)} ${__("units")}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[6]}"><div class="k">${__("Year over year · YoY")}</div><div class="v ${cls(k.yoy_pct)}">${pct(k.yoy_pct)}</div><div class="d">${__("comparable period")}: ${fmt(k.yoy_size)} ${__("units")}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[2]}"><div class="k">${__("Slice leader")}</div><div class="v">${esc(k.leader ? k.leader.label : "—")}</div><div class="d">${k.leader ? `${fmt(k.leader.qty)} ${__("units")} · ${k.leader_share}% ${__("of the market")}` : ""}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[1]}"><div class="k">${__("Participants")}</div><div class="v">${k.brands} / ${k.models}</div><div class="d">${__("brands / models with sales")}</div></div>
				<div class="sd-kpi" style="--k:${SD_COLORS[5]}"><div class="k">${__("Last month")}</div><div class="v" data-count="${k.last}" data-ck="seg|last">${fmt(k.last)}</div><div class="d">${mlabel(k.last_ym)} · <b class="${cls(k.mom)}">${pct(k.mom)}</b> MoM</div></div>
			</div>
			<div class="sd-grid">
				<div class="sd-panel"><div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><div><h4>${__("Focus model")}</h4><div class="hint">${__("Sales, share and position")}</div></div><select class="form-control input-sm sd-focus-sel" style="width:auto">${d.ranking.map((m) => `<option value="${esc(m.model)}" ${fo && m.model === fo.model ? "selected" : ""}>#${m.rank} · ${esc(m.brand)} ${esc(m.label)}</option>`).join("")}</select></div>
					${fo ? `<div class="sd-focus"><div class="img">${img(fo.image)}</div><div><small style="text-transform:uppercase;color:var(--text-muted)">${fo.logo ? `<img class="logo" src="${esc(fo.logo)}" alt="${esc(fo.brand)}" data-fb="">` : ""}${esc(fo.brand)}</small><div style="font-size:18px;font-weight:700">${esc(fo.label)}</div><span class="sd-badge">#${fo.rank} ${__("for the period")}</span></div></div>
					<div class="ch-focus" style="margin-top:12px"></div><div class="ch-focus-share" style="margin-top:10px"></div>
					<div class="sd-stats"><div><span>${__("Sales for the period")}</span><b>${fmt(fo.period_qty)} ${__("units")}</b></div><div><span>${__("Market share")}</span><b>${fo.share}%</b></div><div><span>${__("Last month")}</span><b>${fmt(fo.last)} ${__("units")}</b></div><div><span>MoM</span><b class="${cls(fo.mom)}">${pct(fo.mom)}</b></div><div><span>YoY</span><b class="${cls(fo.yoy)}">${pct(fo.yoy)}</b></div></div>` : `<div class="sd-empty">${__("No records")}</div>`}
				</div>
				<div class="sd-panel c8"><h4>${__("Segment rating")} · ${__("Top models")} <span class="sd-badge">${Math.min(this.top_limit, d.ranking.length)} / ${d.ranking.length}</span></h4><div class="hint">${__("Click a card to change the focus")}</div>
					<div class="sd-cards">${d.ranking.slice(0, this.top_limit).map((m, i) => `<div class="sd-card ${fo && m.model === fo.model ? "first" : ""}" data-model="${esc(m.model)}"><div class="top"><div><small>#${m.rank} ${brand_logo(m.logo, m.brand, 16)}</small><b>${esc(m.label)}</b></div><span class="sd-share">${m.share}%</span></div><div class="img">${img(m.image)}</div><div class="qty"><span>${__("Sales")}</span><b>${fmt(m.qty)} ${__("units")}</b></div><div class="foot">${m.move > 0 ? `▲ ${m.move} ${__("positions")}` : m.move < 0 ? `▼ ${-m.move} ${__("positions")}` : __("Position unchanged")}</div></div>`).join("")}</div>
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
				<div class="sd-panel"><h4>${__("Growth diagnostics")}</h4><div class="hint">${__("Change drivers MoM")} · ${mlabel(d.drivers.from)} → ${mlabel(d.drivers.to)} · ${__("click to focus")}</div><div class="drv-models">${this.drivers(d.drivers.rows)}</div></div>
				<div class="sd-panel"><h4>${__("Segment comparison")}</h4><div class="hint">${__("Click a row to open the segment")}</div>${this.hbars(d.segments, "segment", SD_COLORS[0], d.segment, "clickable hb-seg")}</div>
			</div>
			<div class="sd-grid"><div class="sd-panel c12"><div style="display:flex;justify-content:space-between"><div><h4>${__("Full model rating")}</h4><div class="hint">${d.ranking.length} ${__("models")}</div></div><span class="sd-btn sd-toggle-rank">${__("Show full rating")}</span></div>
				<div class="sd-rank" style="display:none;overflow-x:auto;margin-top:8px"><table class="sd-table"><tr><th>#</th><th>${__("Brand / model")}</th><th class="num">${__("Sales")}</th><th class="num">${__("Market share")}</th><th class="num">${__("Last month")}</th><th class="num">MoM</th><th class="num">YoY</th><th class="num">${__("Movement")}</th></tr>
				${d.ranking.map((m) => `<tr class="click" data-model="${esc(m.model)}"><td>#${m.rank}</td><td><div class="sd-model-cell"><small>${brand_logo(m.logo, m.brand, 16)}${esc(m.brand)}</small><div class="mr"><span class="sd-thumb">${model_img(m.image, d.segment)}</span><b>${esc(m.label)}</b></div></div></td><td class="num">${fmt(m.qty)}</td><td class="num">${m.share}%</td><td class="num">${fmt(m.last)}</td><td class="num ${cls(m.mom)}">${pct(m.mom)}</td><td class="num ${cls(m.yoy)}">${pct(m.yoy)}</td><td class="num">${m.move > 0 ? `<span class="sd-up">▲${m.move}</span>` : m.move < 0 ? `<span class="sd-down">▼${-m.move}</span>` : "0"}</td></tr>`).join("")}
				</table></div></div></div>
			<div class="sd-h">${__("Model price range")}</div><div class="sd-hs">${__("Segment")} ${esc(d.segment)} · ${__("top models by sales")}</div>
			<div class="sd-grid"><div class="sd-panel c12 sd-prices-seg"><div class="sd-empty">${__("Loading")}...</div></div></div>
		`);

		this.load_prices(d.ranking.slice(0, 8).map((m) => m.model), ".sd-prices-seg");
		this.fix_broken_images();

		if (fo) {
			const fm = d.focus_monthly.filter((m) => m.qty != null);
			this.bars(".ch-focus", fm.map((m) => moment(m.ym, "YYYY-MM").format("MMM")), [{ name: __("Sales, units"), values: fm.map((m) => m.qty), color: SD_COLORS[0] }], { height: 150 });
			this.bars(".ch-focus-share", fm.map((m) => moment(m.ym, "YYYY-MM").format("MMM")), [{ name: __("Market share, %"), values: fm.map((m) => m.share), color: SD_COLORS[3] }], { height: 110, unit: "%" });
		}
		this.bars(".ch-seg-months", months12.map((m) => moment(m.ym, "YYYY-MM").format("MMM")), [{ name: __("Sales"), values: months12.map((m) => m.qty), color: SD_COLORS[0] }], { height: 230 });
		this.donut(".ch-brand-share", d.brand_share.slice(0, 6).map((b) => ({ label: b.label, value: b.qty, pic: brand_logo(b.logo, b.label, 18) })).concat(d.brand_share.length > 6 ? [{ label: __("Other"), value: d.brand_share.slice(6).reduce((a, b) => a + b.qty, 0) }] : []), { stack: true });
		this.chart(".ch-brand-dyn", { type: "line", height: 220, data: { labels: d.brand_dynamics.months.map(mlabel), datasets: d.brand_dynamics.series.map((s) => ({ name: s.label, values: s.values.map((v) => v || 0) })) }, lineOptions: { dotSize: 3 }, tooltipOptions: { formatTooltipY: (v) => v + "%" } });

		this.$body.find(".sd-focus-sel").on("change", (e) => { this.gf.focus_model = $(e.currentTarget).val(); this.load_segments(); });
		this.$body.find(".sd-card, .sd-rank tr[data-model]").on("click", (e) => { this.gf.focus_model = $(e.currentTarget).data("model"); this.load_segments(); });
		this.$body.find(".sd-load-more").on("click", () => { this.top_limit = Math.min(50, this.top_limit + 10); this.render_segments(d); });
		this.$body.find(".hb-seg .sd-hbar").on("click", (e) => F.g_segment.set_value($(e.currentTarget).data("key")));
		this.$body.find(".drv-models .sd-drv").on("click", (e) => { const m = $(e.currentTarget).data("key"); if (m) { this.gf.focus_model = m; this.load_segments(); } });
		this.$body.find(".sd-toggle-rank").on("click", (e) => { const $r = this.$body.find(".sd-rank"); $r.toggle(); $(e.currentTarget).text($r.is(":visible") ? __("Hide rating") : __("Show full rating")); });
		this.$body.find(".sd-print").on("click", () => window.print());
		this.fix_broken_images();
		this.animate();
	}

	// -------------------------------------------------------- COMPARE TAB
	load_compare() {
		this.busy(true);
		this.safe_call(`${SD_API}.get_compare_data`, { models: this.compare_models }, (m) => this.render_compare(m));
	}

	set_compare(models) {
		this.compare_models = models.slice(0, 4);
		// URL'ni yangilaymiz (ulashish uchun), lekin yuklashni marshrutga
		// tayanmasdan o'zimiz chaqiramiz — bir xil marshrutda on_page_show ishlamaydi.
		const path = ["app", "sales-dashboard", "compare"].concat(this.compare_models.length ? [this.compare_models.map(encodeURIComponent).join(",")] : []).join("/");
		history.replaceState(null, "", "/" + path);
		this.load_compare();
	}

	// Model tanlash oynasi: segment filtri birinchi (bazaviy) model segmentiga
	// o'rnatilgan holda ochiladi — to'g'ridan-to'g'ri analoglar. Filtrni boshqa
	// segmentga yoki "Barcha segmentlar"ga o'zgartirib, istalgan model qo'shiladi.
	pick_model() {
		const base_segment = this.compare_models.length ? this._base_segment : null;
		const ALL = "__all__";
		let ready = false; // segmentlar kelguncha filtr o'zgarishi yuklamaydi
		const dlg = new frappe.ui.Dialog({
			title: __("Add model"),
			fields: [
				{ fieldname: "segment", fieldtype: "Select", label: __("Segment"), options: [{ value: ALL, label: __("All segments") }], default: ALL, change: () => ready && load() },
				{ fieldname: "col", fieldtype: "Column Break" },
				{ fieldname: "txt", fieldtype: "Data", label: __("Search brand or model") },
				{ fieldname: "sec", fieldtype: "Section Break" },
				{ fieldname: "hint", fieldtype: "HTML" },
				{ fieldname: "list", fieldtype: "HTML" },
			],
		});
		const $list = dlg.get_field("list").$wrapper, $hint = dlg.get_field("hint").$wrapper;
		const seg_value = () => { const v = dlg.get_value("segment"); return v && v !== ALL ? v : null; };

		const draw_hint = () => {
			const seg = seg_value();
			$hint.html(`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--text-muted);margin-bottom:8px">
				${seg ? `<span>${__("Showing models of segment")} <b style="color:var(--text-color)">${esc(seg)}</b>${seg === base_segment ? ` · ${__("same as the base model")}` : ""}</span>` : `<span>${__("Showing all segments")}</span>`}
				${seg ? `<span class="sd-btn sd-pick-all">${__("Show all segments")}</span>` : ""}
				${base_segment && seg !== base_segment ? `<span class="sd-btn sd-pick-base">${__("Back to segment")} ${esc(base_segment)}</span>` : ""}
			</div>`);
			$hint.find(".sd-pick-all").on("click", () => dlg.set_value("segment", ALL));
			$hint.find(".sd-pick-base").on("click", () => dlg.set_value("segment", base_segment));
		};

		let seq = 0;
		const load = () => {
			draw_hint();
			const my = ++seq;
			frappe.call({ method: `${SD_API}.search_models`, args: { txt: dlg.get_value("txt"), exclude: this.compare_models, segment: seg_value() } }).then((r) => {
				if (my !== seq) return; // eskirgan javob
				const rows = r.message || [];
				$list.html(rows.length ? `<div style="max-height:360px;overflow:auto">${rows.map((m) => {
					const seg = m.vehicle_segment && m.vehicle_class ? m.vehicle_segment + "-" + m.vehicle_class : m.vehicle_segment;
					return `<div class="sd-hbar" style="grid-template-columns:56px 1fr auto;cursor:pointer;padding:4px 0" data-name="${esc(m.name)}"><div style="height:36px;display:grid;place-items:center"><span style="width:56px;height:36px;display:grid;place-items:center" class="sd-mini">${model_img(m.image, m.vehicle_segment)}</span></div><div><b>${esc(m.brand)}</b> ${esc(m.model_name)}<div style="font-size:12px;color:var(--text-muted)">${[seg, m.fuel_type].filter(Boolean).map(esc).join(" · ")}${base_segment && seg && seg !== base_segment ? ` · <span style="color:var(--sd-down, #b3261e)">${__("other segment")}</span>` : ""}</div></div><span class="sd-btn">+</span></div>`;
				}).join("")}</div>` : `<div class="sd-empty">${__("Models not found")}${seg_value() ? ` · <a href="#" class="sd-pick-all-link">${__("Show all segments")}</a>` : ""}</div>`);
				this.fix_broken_images($list);
				$list.find(".sd-pick-all-link").on("click", (e) => { e.preventDefault(); dlg.set_value("segment", ALL); });
				$list.find("[data-name]").on("click", (e) => { dlg.hide(); this.set_compare(this.compare_models.concat([$(e.currentTarget).data("name")])); });
			});
		};

		// Segmentlar ro'yxati — "PC-B · 8 ta model"; bazaviy segment tepada va tanlangan
		frappe.call({ method: `${SD_API}.get_model_segments` }).then((r) => {
			const segs = r.message || [];
			const opts = [{ value: ALL, label: __("All segments") }].concat(
				segs.map((s) => ({ value: s.segment, label: `${s.segment} · ${s.count} ${__("models")}${s.segment === base_segment ? " ★" : ""}` }))
			);
			const f = dlg.get_field("segment");
			f.df.options = opts;
			f.refresh();
			ready = true;
			dlg.set_value("segment", base_segment && segs.some((s) => s.segment === base_segment) ? base_segment : ALL).then(load);
		});

		let timer = null;
		dlg.fields_dict.txt.$input.on("input", () => { clearTimeout(timer); timer = setTimeout(load, 250); });
		dlg.show();
		$list.html(`<div class="sd-empty">${__("Loading")}...</div>`);
	}

	render_compare(d) {
		const models = d.models || [];
		this._base_segment = models.length ? models[0].segment : null;
		const slots = models.map((m, i) => `
			<div class="sd-cmp-card ${i === 0 ? "base" : ""}">
				<span class="rm" data-rm="${esc(m.model)}" title="${__("Remove")}">✕</span>
				${i === 0 ? `<span class="base-badge">✓ ${__("Base model")}</span>` : ""}
				<div class="img">${model_img(m.image, m.vtype)}</div>
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
			${this.data_note(d.data_note)}
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
		this.fix_broken_images();
		this.$body.find("[data-add]").on("click", () => this.pick_model());
		this.$body.find("[data-rm]").on("click", (e) => this.set_compare(this.compare_models.filter((m) => m !== $(e.currentTarget).data("rm"))));
		this.$body.find(".sd-cmp-clear").on("click", () => this.set_compare([]));
		this.$body.find(".sd-cmp-diff").on("change", (e) => { this.cmp_only_diff = e.currentTarget.checked; this.render_compare(d); });
		this.$body.find(".sd-cmp-print").on("click", () => window.print());
		this.$body.find(".sd-cmp-copy").on("click", () => frappe.utils.copy_to_clipboard(window.location.href));
		this.animate();
	}
}
