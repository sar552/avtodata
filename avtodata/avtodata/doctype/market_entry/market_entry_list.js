frappe.listview_settings["Market Entry"] = {
	add_fields: ["sales_quantity"],
	onload(listview) {
		listview.page.add_inner_button(__("Quick entry"), () => frappe.set_route("sales-entry"));
	},
};
