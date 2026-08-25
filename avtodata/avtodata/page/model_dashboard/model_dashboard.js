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
					fields: ["trim_name", "model"],
					filters: { is_active: 1 },
					order_by: "trim_name asc",
					limit_page_length: 0,
				},
			}),
		]).then(([brands_r, models_r, trims_r]) => {
			this.brands = brands_r.message || [];
			this.vehicles = models_r.message || [];
			this.trims_by_model = {};
			for (const t of trims_r.message || []) {
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
		if (this.active_brand) {
			this.render_models();
		} else {
			this.render_brands();
		}
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
							? `<img src="${esc(b.logo)}" loading="lazy">`
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
						const image = v.image ? `<img src="${esc(v.image)}" loading="lazy">` : "🚗";
						const meta = [v.vehicle_segment, v.vehicle_class]
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

		this.$body.off(".md").on("input.md", ".md-search", draw);
		this.$body.on("click.md", ".md-back", () => frappe.set_route("model-dashboard"));
		this.$body.on("click.md", ".md-model-card", function () {
			frappe.set_route("Form", "Model", $(this).data("name"));
		});
		draw();
	}
}
