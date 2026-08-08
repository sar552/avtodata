import frappe


def get_effective_market_tier(model_name):
	"""Model-level override wins; otherwise fall back to the brand's tier.

	Deliberately not stored on the Model record — computing it live avoids the
	staleness bug the source app's cached-field approach was prone to.
	"""
	override, brand = frappe.db.get_value("Model", model_name, ["market_tier_override", "brand"])
	if override:
		return override
	return frappe.db.get_value("Vehicle Brand", brand, "market_tier")
