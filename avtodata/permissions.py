"""Action-level permission checks for RPCs that aren't plain CRUD.

Frappe's per-DocType permission grid (read/write/create/delete) already
covers ordinary CRUD. A few actions in this app are transitions, not CRUD
(publish/reopen a document, activate a user, change someone's role) and need
an explicit role check instead — this module is the one place that maps
those actions to the roles allowed to perform them.
"""

import frappe
from frappe import _

PERMISSION_ROLE_MAP = {
	"sales.manage": {"AvtoData Admin", "AvtoData Dispatcher"},
	"sales.publish": {"AvtoData Admin", "AvtoData Dispatcher"},
	"users.manage": {"AvtoData Admin"},
	"roles.manage": {"AvtoData Admin"},
}


def require_permission(key):
	roles = set(frappe.get_roles())
	if "System Manager" in roles:
		return
	if not roles & PERMISSION_ROLE_MAP[key]:
		frappe.throw(_("You are not permitted to perform this action."), frappe.PermissionError)
