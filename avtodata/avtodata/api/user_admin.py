"""Curated user/role administration endpoints.

Deliberately not implemented as raw DocPerm `write` access on the core User
and Role doctypes — that would let an AvtoData Admin edit any field on a
User, including ticking the System Manager checkbox on themselves. These
endpoints expose only the two actions the app actually needs: activating an
account, and assigning/removing one of AvtoData's own roles.
"""

import frappe
from frappe import _

from avtodata.permissions import require_permission

AVTODATA_ROLES = {
	"AvtoData Admin",
	"AvtoData Dispatcher",
	"AvtoData Reviewer",
	"AvtoData Viewer",
}


@frappe.whitelist()
def activate_user(user, enabled=1):
	require_permission("users.manage")
	frappe.db.set_value("User", user, "enabled", int(enabled))
	return {"user": user, "enabled": int(enabled)}


@frappe.whitelist()
def assign_avtodata_role(user, role):
	require_permission("roles.manage")
	_validate_avtodata_role(role)
	user_doc = frappe.get_doc("User", user)
	if not any(r.role == role for r in user_doc.roles):
		user_doc.append("roles", {"role": role})
		user_doc.save(ignore_permissions=True)
	return {"user": user, "roles": [r.role for r in user_doc.roles]}


@frappe.whitelist()
def remove_avtodata_role(user, role):
	require_permission("roles.manage")
	_validate_avtodata_role(role)
	user_doc = frappe.get_doc("User", user)
	user_doc.roles = [r for r in user_doc.roles if r.role != role]
	user_doc.save(ignore_permissions=True)
	return {"user": user, "roles": [r.role for r in user_doc.roles]}


def _validate_avtodata_role(role):
	if role not in AVTODATA_ROLES:
		frappe.throw(_("{0} is not an AvtoData role.").format(role), frappe.PermissionError)
