// Copyright (c) 2026, AvtoData and contributors
// For license information, please see license.txt

const CALL_PATH = "avtodata.avtodata.doctype.market_document.market_document";

frappe.ui.form.on("Market Document", {
	refresh(frm) {
		frm.set_df_property("period_month", "read_only", frm.doc.status !== "Draft");
		frm.set_df_property("title", "read_only", frm.doc.status !== "Draft");

		if (frm.doc.__islocal) {
			return;
		}

		if (frm.doc.status === "Draft") {
			frm.add_custom_button(
				__("Publish"),
				() => {
					frappe.call({
						method: `${CALL_PATH}.publish_market_document`,
						args: { document_id: frm.doc.name },
						freeze: true,
					}).then(() => frm.reload_doc());
				},
				__("Actions")
			);
		}

		if (frm.doc.status === "Published") {
			frm.add_custom_button(
				__("Reopen"),
				() => {
					frappe.confirm(__("Return this document to Draft for editing?"), () => {
						frappe.call({
							method: `${CALL_PATH}.reopen_market_document`,
							args: { document_id: frm.doc.name },
							freeze: true,
						}).then(() => frm.reload_doc());
					});
				},
				__("Actions")
			);
		}

		frm.add_custom_button(
			__("Copy Document"),
			() => {
				frappe.prompt(
					[
						{
							fieldname: "period_month",
							fieldtype: "Date",
							label: __("New Period"),
							reqd: 1,
						},
					],
					(values) => {
						frappe.call({
							method: `${CALL_PATH}.copy_sales_document`,
							args: {
								source_id: frm.doc.name,
								period_month: values.period_month,
								title: "",
							},
							freeze: true,
						}).then((r) => {
							if (r.message && r.message.document) {
								frappe.set_route("Form", "Market Document", r.message.document.name);
							}
						});
					},
					__("Copy Document")
				);
			},
			__("Actions")
		);

		if (frm.doc.status === "Draft") {
			frm.add_custom_button(
				__("Delete Document"),
				() => {
					frappe.confirm(__("Remove this document? It will be excluded from reports."), () => {
						frappe.call({
							method: `${CALL_PATH}.soft_delete_sales_document`,
							args: { document_id: frm.doc.name },
							freeze: true,
						}).then(() => frappe.set_route("List", "Market Document"));
					});
				},
				__("Actions")
			);
		}
	},
});
