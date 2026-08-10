frappe.pages["model-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Model Dashboard"),
		single_column: true,
	});

	const $main = $(wrapper).find(".layout-main-section");
	$main.html(`
		<style>
			.vg-toolbar {
				display: flex;
				gap: 8px;
				align-items: center;
				padding: 0 0 15px;
			}
			.vg-search {
				max-width: 260px;
				flex: 0 0 auto;
			}
			.vg-brands {
				display: flex;
				gap: 8px;
				flex: 1;
				min-width: 0;
				overflow-x: auto;
				padding-bottom: 4px;
				scrollbar-width: thin;
			}
			.vg-brand-chip {
				border: 1px solid var(--border-color);
				border-radius: 999px;
				padding: 4px 14px;
				cursor: pointer;
				font-size: var(--text-sm);
				background: var(--card-bg);
				flex: 0 0 auto;
				white-space: nowrap;
			}
			.vg-brand-chip.active {
				background: var(--primary);
				color: #fff;
				border-color: var(--primary);
			}
			.vg-grid {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
				gap: 16px;
			}
			.vg-card {
				background: var(--card-bg);
				border: 1px solid var(--border-color);
				border-radius: var(--border-radius-lg);
				overflow: hidden;
				cursor: pointer;
				transition: transform 0.15s, box-shadow 0.15s;
			}
			.vg-card:hover {
				transform: translateY(-3px);
				box-shadow: var(--shadow-md);
			}
			.vg-image {
				height: 160px;
				background: var(--bg-color);
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 48px;
			}
			.vg-image img {
				width: 100%;
				height: 100%;
				object-fit: contain;
			}
			.vg-info {
				padding: 12px 15px;
			}
			.vg-model {
				font-size: var(--text-lg);
				font-weight: 600;
				margin-bottom: 6px;
			}
			.vg-meta {
				color: var(--text-muted);
				font-size: var(--text-sm);
				margin-top: 2px;
			}
			.vg-empty {
				padding: 40px;
				text-align: center;
				color: var(--text-muted);
			}
		</style>
		<div class="vg-toolbar">
			<input type="search" class="form-control vg-search" placeholder="${__("Search model...")}">
			<div class="vg-brands"></div>
		</div>
		<div class="vg-grid"></div>
	`);

	let vehicles = [];
	let trims_by_model = {};
	let active_brand = null;

	const render = () => {
		const query = ($main.find(".vg-search").val() || "").toLowerCase();
		const rows = vehicles.filter((v) => {
			if (active_brand && v.brand !== active_brand) return false;
			const haystack = `${v.model_name} ${v.brand} ${(trims_by_model[v.name] || []).join(" ")}`;
			if (query && !haystack.toLowerCase().includes(query)) return false;
			return true;
		});

		if (!rows.length) {
			$main.find(".vg-grid").html(`<div class="vg-empty">${__("No vehicles found")}</div>`);
			return;
		}

		$main.find(".vg-grid").html(
			rows
				.map((v) => {
					const image = v.image
						? `<img src="${frappe.utils.escape_html(v.image)}">`
						: "🚗";
					const meta = [v.vehicle_segment, v.vehicle_class, v.fuel_type]
						.filter(Boolean)
						.map(frappe.utils.escape_html)
						.join(" · ");
					const trims = trims_by_model[v.name] || [];
					const trims_line = trims.length
						? `<div class="vg-meta vg-trims">${__("Trims")}: ${trims
								.map(frappe.utils.escape_html)
								.join(", ")}</div>`
						: "";
					return `
						<div class="vg-card" data-name="${frappe.utils.escape_html(v.name)}">
							<div class="vg-image">${image}</div>
							<div class="vg-info">
								<div class="vg-model">${frappe.utils.escape_html(v.model_name || v.name)}</div>
								<div class="vg-meta">${frappe.utils.escape_html(v.brand || "")}</div>
								<div class="vg-meta">${meta}</div>
								${trims_line}
							</div>
						</div>
					`;
				})
				.join("")
		);
	};

	const render_brand_chips = () => {
		const brands = [...new Set(vehicles.map((v) => v.brand).filter(Boolean))].sort();
		$main.find(".vg-brands").html(
			brands
				.map(
					(b) =>
						`<span class="vg-brand-chip" data-brand="${frappe.utils.escape_html(b)}">${frappe.utils.escape_html(b)}</span>`
				)
				.join("")
		);
	};

	$main.on("input", ".vg-search", render);
	$main.on("click", ".vg-brand-chip", function () {
		const brand = $(this).data("brand");
		active_brand = active_brand === brand ? null : brand;
		$main.find(".vg-brand-chip").removeClass("active");
		if (active_brand) $(this).addClass("active");
		render();
	});
	$main.on("click", ".vg-card", function () {
		frappe.set_route("Form", "Model", $(this).data("name"));
	});

	Promise.all([
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
					"image",
				],
				filters: { is_active: 1 },
				order_by: "brand asc, model_name asc",
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
	]).then(([models_r, trims_r]) => {
		vehicles = models_r.message || [];
		trims_by_model = {};
		for (const t of trims_r.message || []) {
			(trims_by_model[t.model] = trims_by_model[t.model] || []).push(t.trim_name);
		}
		render_brand_chips();
		render();
	});
};
