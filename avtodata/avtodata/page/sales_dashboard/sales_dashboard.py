"""Savdo analitikasi: barcha agregatsiya server tomonda, Market Entry
qatorlaridan (sana · brend · model · soni). Ikkita endpoint — sotuv
dashboardi va segment dashboardi. Hajm kichik (ming-o'n minglab qator),
shuning uchun bitta SQL + Python'da guruhlash yetarli.
"""

from collections import defaultdict

import frappe
from frappe.utils import cint

TIER_ORDER = ["luxury", "premium", "mass_market", "budget", "unset"]


def _ym_shift(ym, n):
	y, m = int(ym[:4]), int(ym[5:7])
	idx = y * 12 + (m - 1) + n
	return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


def _months_between(a, b):
	out, cur = [], a
	while cur <= b:
		out.append(cur)
		cur = _ym_shift(cur, 1)
	return out


def _pct(cur, prev):
	if not prev:
		return None
	return round((cur - prev) / prev * 100, 1)


def _load_rows():
	rows = frappe.db.sql(
		"""
		select e.date, e.brand, e.model,
		       e.sales_quantity as qty,
		       m.model_name, m.vehicle_segment as vtype, m.vehicle_class as vclass,
		       m.fuel_type as fuel, m.image,
		       coalesce(nullif(m.market_tier_override, ''), b.market_tier) as tier,
		       b.brand_name, b.logo
		from `tabMarket Entry` e
		left join `tabModel` m on m.name = e.model
		left join `tabVehicle Brand` b on b.name = e.brand
		where e.date is not null and e.model is not null
		""",
		as_dict=True,
	)
	for r in rows:
		r.ym = r.date.strftime("%Y-%m")
		r.qty = cint(r.qty)
		r.segment = f"{r.vtype}-{r.vclass}" if r.vtype and r.vclass else (r.vtype or None)
		r.brand_label = r.brand_name or r.brand
		r.model_label = r.model_name or r.model
	return rows


def _sum_by(rows, key):
	out = defaultdict(int)
	for r in rows:
		out[r.get(key)] += r.qty
	return out


def _parse(filters):
	if isinstance(filters, str):
		filters = frappe.parse_json(filters)
	return filters or {}


def _options(rows):
	brands, models, vtypes, segments, fuels = {}, {}, set(), set(), set()
	for r in rows:
		brands[r.brand] = r.brand_label
		models.setdefault(r.brand, {})[r.model] = r.model_label
		if r.vtype:
			vtypes.add(r.vtype)
		if r.segment:
			segments.add(r.segment)
		if r.fuel:
			fuels.add(r.fuel)
	return {
		"brands": sorted(({"value": k, "label": v} for k, v in brands.items()), key=lambda x: x["label"]),
		"models": {b: sorted(({"value": k, "label": v} for k, v in ms.items()), key=lambda x: x["label"]) for b, ms in models.items()},
		"vtypes": sorted(vtypes),
		"segments": sorted(segments),
		"fuels": sorted(fuels),
	}


# ---------------------------------------------------------------- SALES TAB
@frappe.whitelist()
def get_sales_data(filters=None):
	f = _parse(filters)
	rows = _load_rows()
	if not rows:
		return {"empty": True}

	all_yms = sorted({r.ym for r in rows})
	bounds = {"from": all_yms[0], "to": all_yms[-1]}
	from_ym = f.get("from") or bounds["from"]
	to_ym = f.get("to") or bounds["to"]

	def match(r):
		return (
			(not f.get("brand") or r.brand == f["brand"])
			and (not f.get("model") or r.model == f["model"])
			and (not f.get("vtype") or r.vtype == f["vtype"])
			and (not f.get("segment") or r.segment == f["segment"])
			and (not f.get("fuel") or r.fuel == f["fuel"])
			and (not f.get("tier") or (r.tier or "unset") == f["tier"])
		)

	dim = [r for r in rows if match(r)]
	per = [r for r in dim if from_ym <= r.ym <= to_ym]
	dim_by_ym = _sum_by(dim, "ym")
	period_months = _months_between(from_ym, to_ym)
	months_with_data = sorted({r.ym for r in per})

	total = sum(r.qty for r in per)

	# Solishtirma o'sish: davr oylari vs o'tgan yilning shu oylari
	cur_c, prev_c, n_c = 0, 0, 0
	for m in months_with_data:
		pm = _ym_shift(m, -12)
		if pm in dim_by_ym:
			cur_c += dim_by_ym[m]
			prev_c += dim_by_ym[pm]
			n_c += 1

	tiers = defaultdict(lambda: {"qty": 0, "brands": set()})
	for r in per:
		t = tiers[r.tier or "unset"]
		t["qty"] += r.qty
		if r.qty > 0:
			t["brands"].add(r.brand)
	tier_list = [
		{"tier": k, "qty": v["qty"], "pct": round(v["qty"] / total * 100, 1) if total else 0, "brands": len(v["brands"])}
		for k, v in tiers.items()
	]
	tier_list.sort(key=lambda x: (TIER_ORDER.index(x["tier"].lower().replace(" ", "_")) if x["tier"].lower().replace(" ", "_") in TIER_ORDER else 99, -x["qty"]))

	by_year = _sum_by(per, "ym")
	yearly = defaultdict(int)
	for ym, q in by_year.items():
		yearly[ym[:4]] += q

	last12 = _months_between(_ym_shift(to_ym, -11), to_ym)
	per_by_ym = _sum_by(per, "ym")

	by_model = defaultdict(lambda: {"qty": 0, "label": "", "brand": ""})
	for r in per:
		bm = by_model[r.model]
		bm["qty"] += r.qty
		bm["label"] = r.model_label
		bm["brand"] = r.brand_label
	top_models = sorted(({"model": k, **v} for k, v in by_model.items()), key=lambda x: -x["qty"])[:15]

	by_brand = defaultdict(lambda: {"qty": 0, "label": ""})
	for r in per:
		by_brand[r.brand]["qty"] += r.qty
		by_brand[r.brand]["label"] = r.brand_label
	top_brands = sorted(({"brand": k, **v} for k, v in by_brand.items()), key=lambda x: -x["qty"])[:10]

	type_share = sorted(({"vtype": k or "—", "qty": v} for k, v in _sum_by(per, "vtype").items()), key=lambda x: -x["qty"])

	# YoY: davrning oxirgi yili oylari vs o'tgan yil
	year = to_ym[:4]
	yoy = []
	for m in [x for x in period_months if x.startswith(year)]:
		pm = _ym_shift(m, -12)
		yoy.append({"ym": m, "cur": per_by_ym.get(m, 0), "prev": dim_by_ym.get(pm)})
	comparable = [x["ym"] for x in yoy if x["prev"] is not None and x["ym"] in per_by_ym]

	drivers, total_delta = [], 0
	if comparable:
		prev_set = {_ym_shift(m, -12) for m in comparable}
		cur_set = set(comparable)
		cur_b, prev_b, labels = defaultdict(int), defaultdict(int), {}
		for r in dim:
			labels[r.brand] = r.brand_label
			if r.ym in cur_set:
				cur_b[r.brand] += r.qty
			elif r.ym in prev_set:
				prev_b[r.brand] += r.qty
		for b in set(cur_b) | set(prev_b):
			d = cur_b[b] - prev_b[b]
			total_delta += d
			drivers.append({"brand": b, "label": labels[b], "delta": d})
		drivers.sort(key=lambda x: -abs(x["delta"]))
		drivers = drivers[:8]

	# Ulush dinamikasi: TOP-5 brend, oyma-oy soni (foizni klient hisoblaydi)
	top5 = [b["brand"] for b in top_brands[:5]]
	share_series = {b: defaultdict(int) for b in top5}
	for r in per:
		if r.brand in share_series:
			share_series[r.brand][r.ym] += r.qty
	share = {
		"months": months_with_data,
		"totals": [per_by_ym.get(m, 0) for m in months_with_data],
		"series": [{"brand": b, "label": by_brand[b]["label"], "values": [share_series[b].get(m, 0) for m in months_with_data]} for b in top5],
	}

	# Reyting: oxirgi oy L, oldingi oy P, o'tgan yil Y
	L = months_with_data[-1] if months_with_data else to_ym
	P, Yp = _ym_shift(L, -1), _ym_shift(L, -12)
	agg = defaultdict(lambda: {"L": 0, "P": 0, "Y": 0, "label": ""})
	for r in dim:
		if r.ym in (L, P, Yp):
			a = agg[r.brand]
			a["label"] = r.brand_label
			a["L" if r.ym == L else "P" if r.ym == P else "Y"] += r.qty
	total_L = sum(a["L"] for a in agg.values())
	rating = [{"brand": b, **a} for b, a in agg.items() if a["L"] or a["P"] or a["Y"]]
	rating.sort(key=lambda x: -x["L"])
	prev_rank = {x["brand"]: i + 1 for i, x in enumerate(sorted(rating, key=lambda x: -x["P"]))}
	for i, x in enumerate(rating):
		x["rank"] = i + 1
		x["mom"] = _pct(x["L"], x["P"])
		x["yoy"] = _pct(x["L"], x["Y"])
		x["share"] = round(x["L"] / total_L * 100, 2) if total_L else 0
		x["move"] = prev_rank.get(x["brand"], i + 1) - (i + 1)

	return {
		"bounds": bounds,
		"period": {"from": from_ym, "to": to_ym},
		"options": _options(rows),
		"kpi": {
			"total": total,
			"growth": _pct(cur_c, prev_c),
			"comparable_months": n_c,
			"fuel": sorted(({"fuel": k, "qty": v} for k, v in _sum_by(per, "fuel").items() if k), key=lambda x: -x["qty"])[:3],
			"brands": len({r.brand for r in per if r.qty > 0}),
			"models": len({r.model for r in per if r.qty > 0}),
		},
		"tiers": tier_list,
		"yearly": [{"year": y, "qty": yearly[y]} for y in sorted(yearly)],
		"monthly": [{"ym": m, "qty": per_by_ym.get(m, 0)} for m in last12],
		"top_models": top_models,
		"top_brands": top_brands,
		"type_share": type_share,
		"yoy": {"year": year, "rows": yoy, "comparable": len(comparable), "total_months": len(yoy)},
		"drivers": {"rows": drivers, "total": total_delta, "months": len(comparable)},
		"share": share,
		"rating": {"rows": rating, "L": L, "P": P, "Y": Yp},
	}


# -------------------------------------------------------------- SEGMENT TAB
@frappe.whitelist()
def get_segment_data(filters=None):
	f = _parse(filters)
	rows = [r for r in _load_rows() if r.segment]
	if not rows:
		return {"empty": True}

	years = sorted({r.ym[:4] for r in rows})
	year = str(f.get("year") or years[-1])
	year_data_months = sorted({r.ym for r in rows if r.ym.startswith(year)})
	if not year_data_months:
		return {"empty": True, "years": years}
	mode = f.get("period") or "ytd"
	ranges = {"q1": (1, 3), "q2": (4, 6), "q3": (7, 9), "q4": (10, 12), "h1": (1, 6), "h2": (7, 12), "year": (1, 12)}
	if mode in ranges:
		a, b = ranges[mode]
		period = [f"{year}-{m:02d}" for m in range(a, b + 1)]
	else:
		mode, period = "ytd", year_data_months
	n = len(period)
	prev_period = [_ym_shift(period[0], -n + i) for i in range(n)]
	yoy_period = [_ym_shift(m, -12) for m in period]

	in_period = [r for r in rows if r.ym in period]
	seg_totals = _sum_by(in_period, "segment")
	segments = sorted(({"segment": k, "qty": v} for k, v in seg_totals.items()), key=lambda x: -x["qty"])
	if not segments:
		# Tanlangan davrda ma'lumot yo'q — selektor uchun yilning segmentlarini 0 bilan beramiz
		year_segments = _sum_by([r for r in rows if r.ym.startswith(year)], "segment")
		segments = sorted(({"segment": k, "qty": 0} for k in year_segments), key=lambda x: x["segment"])
	if not segments:
		return {"empty": True, "years": years}
	segment = f.get("segment") if f.get("segment") in {x["segment"] for x in segments} else segments[0]["segment"]

	seg_rows = [r for r in rows if r.segment == segment]
	S = [r for r in seg_rows if r.ym in period]
	S_prev = [r for r in seg_rows if r.ym in prev_period]
	S_yoy = [r for r in seg_rows if r.ym in yoy_period]
	size = sum(r.qty for r in S)
	prev_size = sum(r.qty for r in S_prev)
	yoy_size = sum(r.qty for r in S_yoy)

	by_model = defaultdict(lambda: {"qty": 0, "label": "", "brand": "", "image": ""})
	for r in S:
		bm = by_model[r.model]
		bm["qty"] += r.qty
		bm["label"], bm["brand"], bm["image"] = r.model_label, r.brand_label, r.image or ""
	ranking = sorted(({"model": k, **v} for k, v in by_model.items()), key=lambda x: -x["qty"])
	leader = ranking[0] if ranking else None

	last, prev_m = period[-1], _ym_shift(period[-1], -1)
	seg_by_ym = _sum_by(seg_rows, "ym")
	last_qty, prev_qty = seg_by_ym.get(last, 0), seg_by_ym.get(prev_m, 0)

	# Fokus-model
	focus = f.get("focus_model") or (leader["model"] if leader else None)
	focus_rows = [r for r in seg_rows if r.model == focus]
	focus_by_ym = _sum_by(focus_rows, "ym")
	months12 = [f"{year}-{m:02d}" for m in range(1, 13)]
	data_months = set(year_data_months)
	focus_monthly = [
		{"ym": m, "qty": focus_by_ym.get(m, 0) if m in data_months else None,
		 "share": round(focus_by_ym.get(m, 0) / seg_by_ym[m] * 100, 1) if m in data_months and seg_by_ym.get(m) else None}
		for m in months12
	]
	f_period = sum(focus_by_ym.get(m, 0) for m in period)
	f_yoy = sum(focus_by_ym.get(m, 0) for m in yoy_period)
	focus_info = None
	if focus:
		fm = by_model.get(focus) or {"label": focus, "brand": "", "image": ""}
		focus_info = {
			"model": focus, "label": fm["label"], "brand": fm["brand"], "image": fm["image"],
			"period_qty": f_period, "share": round(f_period / size * 100, 1) if size else 0,
			"last": focus_by_ym.get(last, 0), "mom": _pct(focus_by_ym.get(last, 0), focus_by_ym.get(prev_m, 0)),
			"yoy": _pct(f_period, f_yoy),
			"rank": next((i + 1 for i, x in enumerate(ranking) if x["model"] == focus), None),
		}

	prev_rank = {x["model"]: i + 1 for i, x in enumerate(sorted(({"model": k, "qty": v} for k, v in _sum_by(S_prev, "model").items()), key=lambda x: -x["qty"]))}
	model_last = _sum_by([r for r in seg_rows if r.ym == last], "model")
	model_prev = _sum_by([r for r in seg_rows if r.ym == prev_m], "model")
	model_yoy = _sum_by(S_yoy, "model")
	for i, x in enumerate(ranking):
		x["rank"] = i + 1
		x["share"] = round(x["qty"] / size * 100, 1) if size else 0
		x["last"] = model_last.get(x["model"], 0)
		x["mom"] = _pct(x["last"], model_prev.get(x["model"], 0))
		x["yoy"] = _pct(x["qty"], model_yoy.get(x["model"], 0))
		x["move"] = (prev_rank.get(x["model"], i + 1) - (i + 1)) if prev_rank else 0

	monthly_totals = [{"ym": m, "qty": seg_by_ym.get(m, 0) if m in data_months else None} for m in months12]

	by_brand = defaultdict(lambda: {"qty": 0, "label": ""})
	for r in S:
		by_brand[r.brand]["qty"] += r.qty
		by_brand[r.brand]["label"] = r.brand_label
	brand_share = sorted(({"brand": k, **v} for k, v in by_brand.items()), key=lambda x: -x["qty"])
	top5 = [b["brand"] for b in brand_share[:5]]
	bs = {b: defaultdict(int) for b in top5}
	for r in S:
		if r.brand in bs:
			bs[r.brand][r.ym] += r.qty
	brand_dynamics = {
		"months": period,
		"series": [{"brand": b, "label": by_brand[b]["label"],
		            "values": [round(bs[b].get(m, 0) / seg_by_ym[m] * 100, 1) if seg_by_ym.get(m) else None for m in period]} for b in top5],
	}

	drivers = sorted(
		({"model": k, "label": by_model[k]["label"] if k in by_model else k, "delta": model_last.get(k, 0) - model_prev.get(k, 0)}
		 for k in set(model_last) | set(model_prev)),
		key=lambda x: -abs(x["delta"]),
	)[:8]

	return {
		"years": years, "year": year, "period": {"from": period[0], "to": period[-1], "months": n, "mode": mode, "with_data": len([m for m in period if m in data_months])},
		"segments": segments, "segment": segment,
		"kpi": {
			"size": size, "prev_size": prev_size, "prev_pct": _pct(size, prev_size),
			"yoy_size": yoy_size, "yoy_pct": _pct(size, yoy_size),
			"leader": leader, "leader_share": round(leader["qty"] / size * 100, 1) if leader and size else 0,
			"brands": len({r.brand for r in S if r.qty > 0}), "models": len({r.model for r in S if r.qty > 0}),
			"last": last_qty, "last_ym": last, "mom": _pct(last_qty, prev_qty),
		},
		"focus": focus_info, "focus_monthly": focus_monthly,
		"top3": ranking[:3], "ranking": ranking,
		"monthly_totals": monthly_totals,
		"brand_share": brand_share, "brand_dynamics": brand_dynamics,
		"drivers": {"rows": drivers, "from": prev_m, "to": last},
	}
