frappe.pages["model-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Model Dashboard"),
		single_column: true,
	});
	wrapper.model_dashboard = new ModelDashboard(wrapper, page);
};

frappe.pages["model-dashboard"].on_page_show = function (wrapper) {
	wrapper.model_dashboard && wrapper.model_dashboard.handle_route();
};

class ModelDashboard {
	constructor(wrapper, page) {
		this.page = page;
		this.$main = $(wrapper).find(".layout-main-section");
		this.brands = [];
		this.vehicles = [];
		this.trims_by_model = {};
		this.loaded = false;
		this.active_brand = null;
		this.active_model = null;
		this.active_tier = null;

		this.$main.html(`
			<style>
				.md-toolbar {
					display: flex;
					gap: 10px;
					align-items: center;
					padding: 0 0 15px;
					flex-wrap: wrap;
				}
				.md-search {
					max-width: 280px;
					flex: 0 0 auto;
				}
				.md-back {
					display: inline-flex;
					align-items: center;
					gap: 5px;
					cursor: pointer;
					color: var(--text-muted);
					font-size: var(--text-sm);
					border: 1px solid var(--border-color);
					border-radius: 999px;
					padding: 4px 14px;
					background: var(--card-bg);
					white-space: nowrap;
				}
				.md-back:hover {
					color: var(--text-color);
					box-shadow: var(--shadow-sm);
				}
				.md-chips {
					display: flex;
					gap: 8px;
					flex: 1;
					min-width: 0;
					overflow-x: auto;
					padding-bottom: 4px;
					scrollbar-width: thin;
				}
				.md-chip {
					border: 1px solid var(--border-color);
					border-radius: 999px;
					padding: 4px 14px;
					cursor: pointer;
					font-size: var(--text-sm);
					background: var(--card-bg);
					flex: 0 0 auto;
					white-space: nowrap;
				}
				.md-chip.active {
					background: var(--primary);
					color: #fff;
					border-color: var(--primary);
				}
				.md-tier-badge {
					display: inline-block;
					margin-top: 6px;
					padding: 2px 10px;
					border-radius: 999px;
					border: 1px solid var(--border-color);
					font-size: var(--text-sm);
					color: var(--text-muted);
				}
				.md-crumb-brand {
					font-size: var(--text-lg);
					font-weight: 600;
				}
				.md-crumb-count {
					color: var(--text-muted);
					font-size: var(--text-sm);
				}
				.md-grid {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
					gap: 16px;
				}
				.md-brand-grid {
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
					gap: 16px;
				}
				.md-card {
					background: var(--card-bg);
					border: 1px solid var(--border-color);
					border-radius: var(--border-radius-lg);
					overflow: hidden;
					cursor: pointer;
					transition: transform 0.15s, box-shadow 0.15s;
				}
				.md-card:hover {
					transform: translateY(-3px);
					box-shadow: var(--shadow-md);
				}
				.md-brand-logo {
					height: 110px;
					display: flex;
					align-items: center;
					justify-content: center;
					background: var(--bg-color);
					font-size: 40px;
					font-weight: 700;
					color: var(--text-muted);
				}
				.md-brand-logo img {
					max-width: 70%;
					max-height: 80%;
					object-fit: contain;
				}
				.md-brand-info {
					padding: 12px 15px;
					text-align: center;
				}
				.md-brand-name {
					font-size: var(--text-lg);
					font-weight: 600;
				}
				.md-meta {
					color: var(--text-muted);
					font-size: var(--text-sm);
					margin-top: 3px;
				}
				.md-count-badge {
					display: inline-block;
					margin-top: 8px;
					padding: 2px 10px;
					border-radius: 999px;
					background: var(--bg-color);
					font-size: var(--text-sm);
					color: var(--text-color);
				}
				.md-image {
					height: 160px;
					background: var(--bg-color);
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 48px;
				}
				.md-image img {
					width: 100%;
					height: 100%;
					object-fit: contain;
				}
				.md-info {
					padding: 12px 15px;
				}
				.md-model {
					font-size: var(--text-lg);
					font-weight: 600;
					margin-bottom: 6px;
				}
				.md-empty {
					padding: 40px;
					text-align: center;
					color: var(--text-muted);
				}
				.md-hero {
					display: flex;
					flex-wrap: wrap;
					gap: 0;
					border: 1px solid var(--border-color);
					border-radius: var(--border-radius-lg);
					overflow: hidden;
					background: var(--card-bg);
					margin-bottom: 20px;
				}
				.md-hero-img {
					flex: 1 1 380px;
					min-height: 320px;
					background: var(--bg-color);
					display: flex;
					align-items: center;
					justify-content: center;
					font-size: 80px;
				}
				.md-hero-img img {
					width: 100%;
					height: 100%;
					object-fit: contain;
				}
				.md-hero-info {
					flex: 1 1 380px;
					padding: 28px 30px;
				}
				.md-kicker {
					color: var(--primary);
					font-size: var(--text-sm);
					font-weight: 600;
					letter-spacing: 0.08em;
					text-transform: uppercase;
					margin-bottom: 6px;
				}
				.md-hero-title {
					font-size: 26px;
					font-weight: 700;
					display: flex;
					align-items: center;
					gap: 10px;
					margin-bottom: 4px;
				}
				.md-active-badge {
					font-size: var(--text-sm);
					font-weight: 500;
					padding: 2px 10px;
					border-radius: 999px;
					background: var(--bg-green);
					color: var(--text-on-green);
				}
				.md-hero-sub {
					color: var(--text-muted);
					font-size: var(--text-sm);
					margin-bottom: 18px;
				}
				.md-tiles {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 12px;
				}
				.md-tile {
					border: 1px solid var(--border-color);
					border-radius: var(--border-radius-lg);
					padding: 12px 15px;
					background: var(--card-bg);
				}
				.md-tile.md-tile-wide {
					grid-column: 1 / -1;
				}
				.md-tile-label {
					color: var(--text-muted);
					font-size: var(--text-sm);
					letter-spacing: 0.06em;
					text-transform: uppercase;
					margin-bottom: 4px;
				}
				.md-tile-value {
					font-weight: 600;
				}
				.md-section-title {
					font-size: var(--text-xl);
					font-weight: 700;
					margin: 6px 0 2px;
				}
				.md-toolbar .md-dash-btn {
					margin-left: auto;
				}
				.md-trims-head {
					display: flex;
					justify-content: space-between;
					align-items: flex-end;
					gap: 12px;
					flex-wrap: wrap;
					margin-bottom: 10px;
				}
				.md-price-range {
					font-size: var(--text-md);
					font-weight: 600;
				}
				.md-price-range small {
					color: var(--text-muted);
					font-weight: 400;
				}
				.md-trim-table-wrap {
					border: 1px solid var(--border-color);
					border-radius: var(--border-radius-lg);
					background: var(--card-bg);
					overflow-x: auto;
				}
				.md-trim-table {
					width: 100%;
					border-collapse: collapse;
					font-size: 14px;
				}
				.md-trim-table th {
					text-align: left;
					font-size: 12px;
					letter-spacing: 0.05em;
					text-transform: uppercase;
					color: var(--text-muted);
					font-weight: 600;
					padding: 10px 16px;
					border-bottom: 1px solid var(--border-color);
					white-space: nowrap;
				}
				.md-trim-table td {
					padding: 12px 16px;
					border-bottom: 1px solid var(--border-color);
					vertical-align: middle;
				}
				.md-trim-table tr:last-child td {
					border-bottom: 0;
				}
				.md-trim-table .num {
					text-align: right;
					font-variant-numeric: tabular-nums;
					white-space: nowrap;
				}
				.md-trim-table .md-trim-name {
					font-weight: 600;
				}
				.md-trim-table .md-main-price {
					font-weight: 700;
					font-size: 15px;
				}
				.md-trim-table .md-cur {
					color: var(--text-muted);
					font-size: 12px;
					margin-left: 3px;
				}
				.md-trim-table .md-muted {
					color: var(--text-muted);
				}
				.md-trim-table tr.md-click {
					cursor: pointer;
				}
				.md-trim-table tr.md-click:hover td {
					background: var(--bg-color);
				}
				.md-vat-badge {
					display: inline-block;
					padding: 1px 8px;
					border-radius: 999px;
					border: 1px solid var(--border-color);
					font-size: 12px;
					color: var(--text-muted);
					white-space: nowrap;
				}
			</style>
			<div class="md-body"><div class="md-empty">${__("Loading")}...</div></div>
		`);
		this.$body = this.$main.find(".md-body");

		this.load();
	}

	load() {
		Promise.all([
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Vehicle Brand",
					fields: ["name", "brand_name", "country", "logo", "market_tier"],
					filters: { is_active: 1 },
					order_by: "brand_name asc",
					limit_page_length: 0,
				},
			}),
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Model",
					fields: [
						"name",
						"model_name",
						"brand",
						"vehicle_segment",
						"vehicle_class",
						"fuel_type",
						"market_tier_override",
						"image",
					],
					filters: { is_active: 1 },
					order_by: "model_name asc",
					limit_page_length: 0,
				},
			}),
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Trim",
					fields: ["name", "trim_name", "model"],
					filters: { is_active: 1 },
					order_by: "trim_name asc",
					limit_page_length: 0,
				},
			}),
		]).then(([brands_r, models_r, trims_r]) => {
			this.brands = brands_r.message || [];
			this.vehicles = models_r.message || [];
			this.trims_by_model = {};
			this.trim_docs_by_model = {};
			for (const t of trims_r.message || []) {
				(this.trim_docs_by_model[t.model] = this.trim_docs_by_model[t.model] || []).push(t);
				(this.trims_by_model[t.model] = this.trims_by_model[t.model] || []).push(
					t.trim_name
				);
			}
			this.loaded = true;
			this.handle_route();
		});
	}

	handle_route() {
		if (!this.loaded) return;
		const route = frappe.get_route();
		this.active_brand = route[1] || null;
		this.active_model = route[2] || null;
		if (this.active_model) {
			this.render_model_detail();
		} else if (this.active_brand) {
			this.render_models();
		} else {
			this.render_brands();
		}
	}

	// Rasm yuklanmasa — o'rinbosar bilan almashtiramiz (private/o'chgan fayl)
	fix_broken_images() {
		this.$body.find("img[data-fb]").on("error", function () {
			$(this).replaceWith(`<span>${frappe.utils.escape_html($(this).attr("data-fb") || "")}</span>`);
		});
	}

	model_count(brand) {
		return this.vehicles.filter((v) => v.brand === brand).length;
	}

	tier_label(code) {
		if (!code) return "";
		return code
			.split("_")
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");
	}

	render_brands() {
		const esc = frappe.utils.escape_html;
		const tiers = [...new Set(this.brands.map((b) => b.market_tier).filter(Boolean))].sort();
		this.$body.html(`
			<div class="md-toolbar">
				<input type="search" class="form-control md-search" placeholder="${__("Search brand...")}">
				<div class="md-chips">
					${tiers
						.map(
							(t) =>
								`<span class="md-chip ${t === this.active_tier ? "active" : ""}" data-tier="${esc(t)}">${esc(this.tier_label(t))}</span>`
						)
						.join("")}
				</div>
			</div>
			<div class="md-brand-grid"></div>
		`);

		const draw = () => {
			const query = (this.$body.find(".md-search").val() || "").toLowerCase();
			const rows = this.brands.filter((b) => {
				if (this.active_tier && b.market_tier !== this.active_tier) return false;
				return (
					!query || `${b.brand_name} ${b.country || ""}`.toLowerCase().includes(query)
				);
			});
			if (!rows.length) {
				this.$body
					.find(".md-brand-grid")
					.html(`<div class="md-empty">${__("No brands found")}</div>`);
				return;
			}
			this.$body.find(".md-brand-grid").html(
				rows
					.map((b) => {
						const logo = b.logo
							? `<img src="${esc(b.logo)}" loading="lazy" data-fb="${esc((b.brand_name || "?")[0])}">`
							: esc((b.brand_name || "?")[0]);
						const count = this.model_count(b.name);
						const tier_line = b.market_tier
							? `<div><span class="md-tier-badge">${esc(this.tier_label(b.market_tier))}</span></div>`
							: "";
						return `
							<div class="md-card md-brand-card" data-brand="${esc(b.name)}">
								<div class="md-brand-logo">${logo}</div>
								<div class="md-brand-info">
									<div class="md-brand-name">${esc(b.brand_name || b.name)}</div>
									<div class="md-meta">${esc(b.country || "")}</div>
									${tier_line}
									<span class="md-count-badge">${count} ${__("models")}</span>
								</div>
							</div>
						`;
					})
					.join("")
			);
		};

		const me = this;
		this.$body.off(".md").on("input.md", ".md-search", draw);
		this.$body.on("click.md", ".md-chip", function () {
			const tier = $(this).data("tier");
			me.active_tier = me.active_tier === tier ? null : tier;
			me.$body.find(".md-chip").removeClass("active");
			if (me.active_tier) $(this).addClass("active");
			draw();
		});
		this.fix_broken_images();
		this.$body.on("click.md", ".md-brand-card", function () {
			frappe.set_route("model-dashboard", $(this).data("brand"));
		});
		draw();
	}

	render_models() {
		const esc = frappe.utils.escape_html;
		const brand = this.brands.find((b) => b.name === this.active_brand);
		const brand_label = brand ? brand.brand_name || brand.name : this.active_brand;
		const count = this.model_count(this.active_brand);

		this.$body.html(`
			<div class="md-toolbar">
				<span class="md-back">← ${__("Brands")}</span>
				<span class="md-crumb-brand">${esc(brand_label)}</span>
				<span class="md-crumb-count">${count} ${__("models")}</span>
				<input type="search" class="form-control md-search" placeholder="${__("Search model...")}">
			</div>
			<div class="md-grid"></div>
		`);

		const draw = () => {
			const query = (this.$body.find(".md-search").val() || "").toLowerCase();
			const rows = this.vehicles.filter((v) => {
				if (v.brand !== this.active_brand) return false;
				const trims = this.trims_by_model[v.name] || [];
				const haystack = `${v.model_name} ${trims.join(" ")}`;
				return !query || haystack.toLowerCase().includes(query);
			});
			if (!rows.length) {
				this.$body
					.find(".md-grid")
					.html(`<div class="md-empty">${__("No vehicles found")}</div>`);
				return;
			}
			this.$body.find(".md-grid").html(
				rows
					.map((v) => {
						const image = v.image ? `<img src="${esc(v.image)}" loading="lazy" data-fb="🚗">` : "🚗";
						const meta = [v.vehicle_segment, v.vehicle_class, v.fuel_type]
							.filter(Boolean)
							.map(esc)
							.join(" · ");
						const trims = this.trims_by_model[v.name] || [];
						const trims_line = trims.length
							? `<div class="md-meta">${__("Trims")}: ${trims.map(esc).join(", ")}</div>`
							: "";
						return `
							<div class="md-card md-model-card" data-name="${esc(v.name)}">
								<div class="md-image">${image}</div>
								<div class="md-info">
									<div class="md-model">${esc(v.model_name || v.name)}</div>
									<div class="md-meta">${meta}</div>
									${trims_line}
								</div>
							</div>
						`;
					})
					.join("")
			);
		};

		const me = this;
		this.$body.off(".md").on("input.md", ".md-search", draw);
		this.$body.on("click.md", ".md-back", () => frappe.set_route("model-dashboard"));
		this.fix_broken_images();
		this.$body.on("click.md", ".md-model-card", function () {
			frappe.set_route("model-dashboard", me.active_brand, $(this).data("name"));
		});
		draw();
	}

	render_model_detail() {
		const esc = frappe.utils.escape_html;
		const v = this.vehicles.find((x) => x.name === this.active_model);
		if (!v) {
			this.$body.html(`<div class="md-empty">${__("No vehicles found")}</div>`);
			return;
		}
		const brand = this.brands.find((b) => b.name === v.brand);
		const brand_label = brand ? brand.brand_name || brand.name : v.brand;
		const trims = this.trims_by_model[v.name] || [];

		const tier_code = v.market_tier_override || (brand && brand.market_tier) || "";
		let tier_text = "—";
		if (tier_code) {
			tier_text = this.tier_label(tier_code);
			if (!v.market_tier_override) {
				tier_text += ` · ${__("Inherited from brand")}`;
			}
		}
		const image = v.image ? `<img src="${esc(v.image)}" data-fb="🚗">` : "🚗";
		const tile = (label, value, wide) => `
			<div class="md-tile ${wide ? "md-tile-wide" : ""}">
				<div class="md-tile-label">${label}</div>
				<div class="md-tile-value">${value || "—"}</div>
			</div>
		`;

		const segment = v.vehicle_segment && v.vehicle_class ? `${v.vehicle_segment}-${v.vehicle_class}` : v.vehicle_segment || "";

		this.$body.html(`
			<div class="md-toolbar">
				<span class="md-back">← ${esc(brand_label)}</span>
				<span class="md-crumb-count">${esc(brand_label)} / ${esc(v.model_name || v.name)}</span>
				<button class="btn btn-primary btn-sm md-dash-btn" ${segment ? "" : `disabled title="${__("Set the vehicle segment of this model first")}"`}>
					${frappe.utils.icon("dashboard", "sm")} ${__("View in dashboard")}
				</button>
			</div>
			<div class="md-hero">
				<div class="md-hero-img">${image}</div>
				<div class="md-hero-info">
					<div class="md-kicker">${__("Model Card")}</div>
					<div class="md-hero-title">
						${esc(brand_label)} ${esc(v.model_name || v.name)}
						<span class="md-active-badge">${__("Active")}</span>
					</div>
					<div class="md-hero-sub">${__("Key product parameters and available trims.")}</div>
					<div class="md-tiles">
						${tile(__("Vehicle Brand"), esc(brand_label))}
						${tile(__("Vehicle Class"), esc(v.vehicle_class || ""))}
						${tile(__("Vehicle Segment"), esc(v.vehicle_segment || ""))}
						${tile(__("Fuel Type"), esc(v.fuel_type || ""))}
						${tile(__("Market Tier"), esc(tier_text), true)}
					</div>
				</div>
			</div>
			<div class="md-trims-head">
				<div>
					<div class="md-section-title">${__("Trims and prices")}</div>
					<div class="md-crumb-count">${trims.length} ${__("records")}</div>
				</div>
				<div class="md-price-range"></div>
			</div>
			<div class="md-trims">${trims.length ? `<div class="md-empty">${__("Loading")}...</div>` : `<div class="md-empty">${__("No records")}</div>`}</div>
		`);

		this.fix_broken_images();
		this.$body.off(".md").on("click.md", ".md-back", () => {
			frappe.set_route("model-dashboard", v.brand);
		});
		// Segment dashboardi shu model segmenti va fokus-modeli bilan ochiladi
		this.$body.on("click.md", ".md-dash-btn", () => {
			if (!segment) return;
			frappe.route_options = { segment, focus_model: v.name };
			frappe.set_route("sales-dashboard", "segments");
		});
		if (trims.length) this.load_trim_prices(v);
	}

	// Har komplektatsiyaning amaldagi narxi: bugungacha kuchga kirgan eng
	// oxirgi faol narx (har valyuta alohida). QQS bilan va QQSsiz ikkalasi ko'rsatiladi.
	load_trim_prices(v) {
		const model = v.name;
		frappe
			.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Trim Price",
					fields: ["name", "trim", "currency", "amount", "includes_vat", "vat_percent", "valid_from"],
					filters: { model, is_active: 1 },
					order_by: "valid_from desc, modified desc",
					limit_page_length: 0,
				},
			})
			.then((r) => {
				if (this.active_model !== model) return; // foydalanuvchi boshqa sahifaga o'tib ketgan
				this.render_trim_prices(v, r.message || []);
			})
			.catch(() => {
				this.$body.find(".md-trims").html(`<div class="md-empty">${__("Could not load data")}</div>`);
			});
	}

	render_trim_prices(v, prices) {
		const esc = frappe.utils.escape_html;
		const today = frappe.datetime.get_today();
		const trims = this.trim_docs_by_model[v.name] || [];

		// trim -> valyuta -> amaldagi narx (kelajakdagi narx faqat boshqasi bo'lmasa)
		const current = {}, history = {};
		for (const p of prices) {
			history[p.trim] = (history[p.trim] || 0) + 1;
			const by_cur = (current[p.trim] = current[p.trim] || {});
			// Ro'yxat yangidan eskiga: saqlangani hali kuchga kirmagan bo'lsa, almashtirib boramiz —
			// natijada kuchdagi eng oxirgi narx, u bo'lmasa eng yaqin kelajakdagi narx qoladi.
			const have = by_cur[p.currency];
			if (!have || have.valid_from > today) by_cur[p.currency] = p;
		}

		const rate = (p) => 1 + (flt(p.vat_percent) || 0) / 100;
		const net = (p) => (cint(p.includes_vat) ? flt(p.amount) / rate(p) : flt(p.amount));
		const gross = (p) => (cint(p.includes_vat) ? flt(p.amount) : flt(p.amount) * rate(p));
		const money = (n, cur) => `${format_number(Math.round(n), null, 0)}<span class="md-cur">${esc(cur)}</span>`;
		const can_create = frappe.model.can_create("Trim Price");

		const rows = [];
		trims.forEach((t) => {
			const list = Object.values(current[t.name] || {});
			if (!list.length) {
				rows.push({ t, p: null, sort: Infinity });
				return;
			}
			list.forEach((p) => rows.push({ t, p, sort: gross(p) }));
		});
		// Arzondan qimmatga; narxi yo'qlar oxirida
		rows.sort((a, b) => a.sort - b.sort || a.t.trim_name.localeCompare(b.t.trim_name));

		// Yuqorida diapazon (asosiy valyuta bo'yicha, QQS bilan)
		const priced = rows.filter((x) => x.p);
		if (priced.length) {
			const cur = priced[0].p.currency, same = priced.filter((x) => x.p.currency === cur).map((x) => gross(x.p));
			const lo = Math.min(...same), hi = Math.max(...same);
			this.$body.find(".md-price-range").html(
				`<small>${__("Price range, with VAT")}:</small> ${lo === hi ? money(lo, cur) : `${money(lo, cur)} — ${money(hi, cur)}`}`
			);
		}

		const body = rows
			.map(({ t, p }, i) => {
				if (!p) {
					return `<tr>
						<td class="md-muted">${i + 1}</td>
						<td class="md-trim-name">${esc(t.trim_name)}</td>
						<td colspan="5" class="md-muted">${__("No price entered")}${
							can_create ? ` · <a href="#" class="md-add-price" data-trim="${esc(t.name)}">${__("add price")}</a>` : ""
						}</td>
					</tr>`;
				}
				const vat = `${cint(p.includes_vat) ? __("incl.") : __("excl.")} ${flt(p.vat_percent)}%`;
				const future = p.valid_from > today;
				return `<tr class="md-click" data-price="${esc(p.name)}" title="${__("Open price")}">
					<td class="md-muted">${i + 1}</td>
					<td class="md-trim-name">${esc(t.trim_name)}</td>
					<td class="num md-main-price">${money(gross(p), p.currency)}</td>
					<td class="num">${money(net(p), p.currency)}</td>
					<td><span class="md-vat-badge">${__("VAT")} ${esc(vat)}</span></td>
					<td class="num ${future ? "" : "md-muted"}">${frappe.datetime.str_to_user(p.valid_from)}${future ? ` · ${__("upcoming")}` : ""}</td>
					<td class="num md-muted">${history[t.name] || 0}</td>
				</tr>`;
			})
			.join("");

		this.$body.find(".md-trims").html(`
			<div class="md-trim-table-wrap"><table class="md-trim-table">
				<thead><tr>
					<th>#</th>
					<th>${__("Trim")}</th>
					<th class="num">${__("Price with VAT")}</th>
					<th class="num">${__("Price without VAT")}</th>
					<th>${__("VAT")}</th>
					<th class="num">${__("Valid from")}</th>
					<th class="num">${__("Price records")}</th>
				</tr></thead>
				<tbody>${body}</tbody>
			</table></div>
		`);

		this.$body.find(".md-trims tr[data-price]").on("click", (e) => {
			frappe.set_route("Form", "Trim Price", $(e.currentTarget).attr("data-price"));
		});
		this.$body.find(".md-add-price").on("click", (e) => {
			e.preventDefault();
			frappe.new_doc("Trim Price", { trim: $(e.currentTarget).attr("data-trim"), model: v.name });
		});
	}
}
