"""Savdo analitikasi: barcha agregatsiya server tomonda, Market Entry
qatorlaridan (sana · brend · model · soni). Ikkita endpoint — sotuv
dashboardi va segment dashboardi. Hajm kichik (ming-o'n minglab qator),
shuning uchun bitta SQL + Python'da guruhlash yetarli.
"""

from collections import defaultdict

import frappe
from frappe.utils import cint, flt, getdate, nowdate

TIER_ORDER = ["luxury", "premium", "mass_market", "budget", "commercial", "unset"]


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


def _thin_last_month(rows):
	"""Ma'lumotning oxirgi oyi shubhali darajada kichikmi (masalan, sinov
	yozuvlari yoki hali kiritilmagan oy)? Oldingi 6 oy medianasining 10%
	idan kam bo'lsa — dashboard ogohlantirish chiqaradi, raqamlarni o'zgartirmaydi."""
	by_ym, n_by_ym = defaultdict(int), defaultdict(int)
	for r in rows:
		by_ym[r.ym] += r.qty
		n_by_ym[r.ym] += 1
	yms = sorted(by_ym)
	if len(yms) < 4:
		return None
	last, prev = yms[-1], sorted(by_ym[m] for m in yms[-7:-1])
	median = prev[len(prev) // 2]
	if median and by_ym[last] < median * 0.1:
		return {"ym": last, "qty": by_ym[last], "entries": n_by_ym[last], "typical": median, "prev_ym": yms[-2]}
	return None


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

	by_model = defaultdict(lambda: {"qty": 0, "label": "", "brand": "", "image": "", "logo": ""})
	for r in per:
		bm = by_model[r.model]
		bm["qty"] += r.qty
		bm["label"] = r.model_label
		bm["brand"] = r.brand_label
		bm["image"], bm["logo"] = r.image or "", r.logo or ""
	top_models = sorted(({"model": k, **v} for k, v in by_model.items()), key=lambda x: -x["qty"])[:15]

	by_brand = defaultdict(lambda: {"qty": 0, "label": "", "logo": ""})
	for r in per:
		by_brand[r.brand]["qty"] += r.qty
		by_brand[r.brand]["label"] = r.brand_label
		by_brand[r.brand]["logo"] = r.logo or ""
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
	agg = defaultdict(lambda: {"L": 0, "P": 0, "Y": 0, "label": "", "logo": ""})
	for r in dim:
		if r.ym in (L, P, Yp):
			a = agg[r.brand]
			a["label"], a["logo"] = r.brand_label, r.logo or ""
			a["L" if r.ym == L else "P" if r.ym == P else "Y"] += r.qty
	first_ym = {}
	for r in dim:
		if r.qty > 0 and (r.brand not in first_ym or r.ym < first_ym[r.brand]):
			first_ym[r.brand] = r.ym
	total_L = sum(a["L"] for a in agg.values())
	rating = [{"brand": b, **a} for b, a in agg.items() if a["L"] or a["P"] or a["Y"]]
	rating.sort(key=lambda x: -x["L"])
	prev_rank = {x["brand"]: i + 1 for i, x in enumerate(sorted(rating, key=lambda x: -x["P"]))}
	for i, x in enumerate(rating):
		x["rank"] = i + 1
		x["mom"] = _pct(x["L"], x["P"])
		x["yoy"] = _pct(x["L"], x["Y"])
		x["is_new"] = first_ym.get(x["brand"], L) > Yp
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
		"monthly": [{"ym": m, "qty": per_by_ym[m] if m in per_by_ym and from_ym <= m <= to_ym else None} for m in last12],
		"data_note": _thin_last_month(rows),
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
	year = f.get("year")
	if not year and f.get("focus_model"):
		# Model kartasidan kelinganda — modelning oxirgi sotuv yili
		focus_years = sorted({r.ym[:4] for r in rows if r.model == f["focus_model"]})
		year = focus_years[-1] if focus_years else None
	year = str(year or years[-1])
	year_data_months = sorted({r.ym for r in rows if r.ym.startswith(year)})
	if not year_data_months:
		return {"empty": True, "years": years}
	mode = f.get("period") or "ytd"
	ranges = {"q1": (1, 3), "q2": (4, 6), "q3": (7, 9), "q4": (10, 12), "h1": (1, 6), "h2": (7, 12), "year": (1, 12)}
	if mode in ranges:
		a, b = ranges[mode]
		period = [f"{year}-{m:02d}" for m in range(a, b + 1)]
	else:
		mode, period = "ytd", _months_between(f"{year}-01", year_data_months[-1])
	# Ma'lumot hali yo'q oylar (kelajak) bilan solishtirish noto'g'ri foiz beradi
	data_end = max(r.ym for r in rows)
	period = [m for m in period if m <= data_end] or period[:1]
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
	all_segments = {r.segment for r in rows}
	if f.get("segment") in all_segments and f["segment"] not in {x["segment"] for x in segments}:
		segments.append({"segment": f["segment"], "qty": 0})
	segment = f.get("segment") if f.get("segment") in all_segments else segments[0]["segment"]

	seg_rows = [r for r in rows if r.segment == segment]
	S = [r for r in seg_rows if r.ym in period]
	S_prev = [r for r in seg_rows if r.ym in prev_period]
	S_yoy = [r for r in seg_rows if r.ym in yoy_period]
	size = sum(r.qty for r in S)
	prev_size = sum(r.qty for r in S_prev)
	yoy_size = sum(r.qty for r in S_yoy)

	by_model = defaultdict(lambda: {"qty": 0, "label": "", "brand": "", "image": "", "logo": ""})
	for r in S:
		bm = by_model[r.model]
		bm["qty"] += r.qty
		bm["label"], bm["brand"], bm["image"] = r.model_label, r.brand_label, r.image or ""
		bm["logo"] = r.logo or ""
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
		fm = by_model.get(focus) or {"label": focus, "brand": "", "image": "", "logo": ""}
		focus_info = {
			"model": focus, "label": fm["label"], "brand": fm["brand"], "image": fm["image"], "logo": fm.get("logo") or "",
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

	by_brand = defaultdict(lambda: {"qty": 0, "label": "", "logo": ""})
	for r in S:
		by_brand[r.brand]["qty"] += r.qty
		by_brand[r.brand]["label"] = r.brand_label
		by_brand[r.brand]["logo"] = r.logo or ""
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
		"data_note": _thin_last_month(rows),
	}


# -------------------------------------------------------------- COMPARE TAB
@frappe.whitelist()
def get_compare_data(models=None):
	"""2–4 ta modelni yonma-yon solishtirish: karta ma'lumotlari, sotuv
	statistikasi, oylik dinamika va o'z segmentidagi ulush/o'rin."""
	if isinstance(models, str):
		models = frappe.parse_json(models)
	models = [m for m in (models or []) if m][:4]
	if not models:
		return {"models": [], "months": [], "series": [], "yearly": []}

	rows = _load_rows()
	by_ym = _sum_by(rows, "ym")
	seg_by_ym = defaultdict(lambda: defaultdict(int))
	seg_totals = defaultdict(int)
	model_seg_totals = defaultdict(lambda: defaultdict(int))
	for r in rows:
		if r.segment:
			seg_by_ym[r.segment][r.ym] += r.qty
			seg_totals[r.segment] += r.qty
			model_seg_totals[r.segment][r.model] += r.qty

	all_months = sorted(by_ym)
	if not all_months:
		return {"models": [], "months": [], "series": [], "yearly": []}
	last = all_months[-1]
	last12 = _months_between(_ym_shift(last, -11), last)
	years = sorted({m[:4] for m in all_months})
	prev_m, yoy_m = _ym_shift(last, -1), _ym_shift(last, -12)

	out, series, yearly = [], [], []
	for name in models:
		doc = frappe.db.get_value(
			"Model", name,
			["name", "model_name", "brand", "vehicle_segment", "vehicle_class", "fuel_type", "market_tier_override", "image", "is_active"],
			as_dict=True,
		)
		if not doc:
			continue
		brand = frappe.db.get_value("Vehicle Brand", doc.brand, ["brand_name", "market_tier", "logo"], as_dict=True) or {}
		mrows = [r for r in rows if r.model == name]
		m_by_ym = _sum_by(mrows, "ym")
		total = sum(m_by_ym.values())
		segment = f"{doc.vehicle_segment}-{doc.vehicle_class}" if doc.vehicle_segment and doc.vehicle_class else doc.vehicle_segment
		seg_rank = None
		if segment and model_seg_totals.get(segment):
			ranking = sorted(model_seg_totals[segment].items(), key=lambda x: -x[1])
			seg_rank = next((i + 1 for i, (mm, _) in enumerate(ranking) if mm == name), None)
		last_share = round(m_by_ym.get(last, 0) / seg_by_ym[segment][last] * 100, 1) if segment and seg_by_ym[segment].get(last) else None
		y12 = sum(m_by_ym.get(m, 0) for m in last12)
		y12_prev = sum(m_by_ym.get(_ym_shift(m, -12), 0) for m in last12)
		peak = max(m_by_ym.items(), key=lambda x: x[1]) if m_by_ym else None
		active_months = [m for m in all_months if m in m_by_ym]
		out.append({
			"model": name, "label": doc.model_name or name, "brand": brand.get("brand_name") or doc.brand,
			"image": doc.image or "", "logo": brand.get("logo") or "",
			"vtype": doc.vehicle_segment, "vclass": doc.vehicle_class, "segment": segment, "fuel": doc.fuel_type,
			"tier": doc.market_tier_override or brand.get("market_tier") or "", "tier_inherited": not doc.market_tier_override,
			"is_active": cint(doc.is_active),
			"total": total, "last": m_by_ym.get(last, 0), "mom": _pct(m_by_ym.get(last, 0), m_by_ym.get(prev_m, 0)),
			"yoy": _pct(m_by_ym.get(last, 0), m_by_ym.get(yoy_m, 0)),
			"last12": y12, "last12_growth": _pct(y12, y12_prev),
			"avg_month": round(total / len(active_months)) if active_months else 0,
			"peak": {"ym": peak[0], "qty": peak[1]} if peak else None,
			"first_month": active_months[0] if active_months else None,
			"segment_rank": seg_rank, "segment_size": model_seg_totals.get(segment) and len(model_seg_totals[segment]) or 0,
			"segment_share_last": last_share,
			"market_share_last": round(m_by_ym.get(last, 0) / by_ym[last] * 100, 2) if by_ym.get(last) else None,
		})
		series.append({"model": name, "label": f"{brand.get('brand_name') or doc.brand} {doc.model_name or name}", "values": [m_by_ym.get(m, 0) for m in last12]})
		yearly.append({"model": name, "values": [sum(q for ym, q in m_by_ym.items() if ym.startswith(y)) for y in years]})

	return {"models": out, "months": last12, "series": series, "years": years, "yearly": yearly, "last": last, "data_note": _thin_last_month(rows)}


@frappe.whitelist()
def get_model_segments():
	"""Solishtirish oynasidagi segment filtri uchun: faol modellar bor
	segmentlar va har birida nechta model borligi."""
	rows = frappe.db.sql(
		"""select vehicle_segment as vtype, vehicle_class as vclass, count(*) as n
		   from `tabModel` where is_active = 1 and ifnull(vehicle_segment, '') != ''
		   group by vehicle_segment, vehicle_class order by vehicle_segment, vehicle_class""",
		as_dict=True,
	)
	return [{"segment": f"{r.vtype}-{r.vclass}" if r.vclass else r.vtype, "vtype": r.vtype, "vclass": r.vclass or "", "count": r.n} for r in rows]


@frappe.whitelist()
def search_models(txt=None, exclude=None, segment=None):
	"""Solishtirish uchun model qidiruvi: brend/model nomi bo'yicha, ixtiyoriy
	segment cheklovi. Segment '{tur}-{klass}' yoki klassi yo'q bo'lsa faqat '{tur}'."""
	if isinstance(exclude, str):
		exclude = frappe.parse_json(exclude)
	filters = {"is_active": 1}
	if segment:
		# Tur nomida ham '-' bo'lishi mumkin — shuning uchun ma'lum turlar bilan solishtiramiz
		vtypes = sorted(frappe.get_all("Vehicle Segment", pluck="name"), key=len, reverse=True)
		vtype = next((v for v in vtypes if segment == v or segment.startswith(v + "-")), None)
		if vtype:
			filters["vehicle_segment"] = vtype
			vclass = segment[len(vtype) + 1 :]
			if vclass:
				filters["vehicle_class"] = vclass
		else:
			vtype, _, vclass = segment.partition("-")
			filters.update({"vehicle_segment": vtype, "vehicle_class": vclass})
	rows = frappe.get_all(
		"Model", filters=filters,
		or_filters=[["model_name", "like", f"%{txt}%"], ["brand", "like", f"%{txt}%"], ["name", "like", f"%{txt}%"]] if txt else None,
		fields=["name", "model_name", "brand", "vehicle_segment", "vehicle_class", "fuel_type", "image"],
		order_by="brand asc, model_name asc", limit_page_length=60,
	)
	exclude = set(exclude or [])
	return [r for r in rows if r.name not in exclude]


# ----------------------------------------------------------- PRICE RANGES
def _vat_adjust(amount, includes_vat, vat_percent, want_vat):
	"""Narxni so'ralgan QQS rejimiga keltiradi (valyuta konvertatsiya qilinmaydi)."""
	rate = 1 + flt(vat_percent) / 100
	amount = flt(amount)
	if want_vat and not cint(includes_vat):
		return amount * rate
	if not want_vat and cint(includes_vat):
		return amount / rate
	return amount


@frappe.whitelist()
def get_price_ranges(models=None, currency=None, with_vat=1, as_on=None, limit=8):
	"""Model narx diapazoni: har modelning faol komplektatsiyalari bo'yicha
	eng arzon—eng qimmat va o'rtacha narx.

	Har komplektatsiya uchun berilgan sanaga amal qiladigan oxirgi narx
	olinadi (valid_from <= as_on). Valyutalar aralashtirilmaydi — tanlangan
	valyutadagi narxlargina hisobga olinadi.
	"""
	if isinstance(models, str):
		models = frappe.parse_json(models)
	models = [m for m in (models or []) if m][: cint(limit) or 8]
	as_on = getdate(as_on) if as_on else getdate(nowdate())
	want_vat = cint(with_vat)

	# Asosiy valyuta — narxlari eng ko'p bo'lgani (tanlash kerak emas)
	cur_rows = frappe.db.sql(
		"""select currency, count(*) as n from `tabTrim Price`
		   where is_active = 1 group by currency order by n desc""",
		as_dict=True,
	)
	currencies = [r.currency for r in cur_rows]
	labels = {}
	if models:
		for m in frappe.get_all("Model", filters={"name": ["in", models]}, fields=["name", "model_name", "brand"]):
			labels[m.name] = m

	if not models or not currencies:
		return {
			"rows": [{"model": m, "label": (labels.get(m) or {}).get("model_name") or m,
			          "brand": (labels.get(m) or {}).get("brand") or "", "no_data": True} for m in models],
			"currencies": currencies, "currency": currency, "with_vat": want_vat,
			"as_on": str(as_on), "empty": not currencies, "other_prices": 0, "vat_mixed": False,
		}

	if currency not in currencies:
		currency = currencies[0]
	other_prices = sum(r.n for r in cur_rows if r.currency != currency)
	# QQS rejimi aralashmi? (ba'zi narx QQS bilan, ba'zisi QQSsiz kiritilgan)
	vat_modes = frappe.db.sql(
		"select distinct includes_vat from `tabTrim Price` where is_active = 1 and currency = %s",
		(currency,),
	)
	vat_mixed = len(vat_modes) > 1

	price_rows = frappe.db.sql(
		"""
		select tp.trim, tp.model, tp.amount, tp.includes_vat, tp.vat_percent, tp.valid_from
		from `tabTrim Price` tp
		inner join `tabTrim` t on t.name = tp.trim and t.is_active = 1
		where tp.is_active = 1 and tp.currency = %(cur)s and tp.valid_from <= %(as_on)s
		  and tp.model in %(models)s
		order by tp.trim asc, tp.valid_from desc, tp.modified desc
		""",
		{"cur": currency, "as_on": as_on, "models": models},
		as_dict=True,
	)

	latest = {}
	for r in price_rows:
		if r.trim not in latest:
			latest[r.trim] = r

	trim_counts = defaultdict(int)
	for t in frappe.get_all("Trim", filters={"model": ["in", models], "is_active": 1}, fields=["name", "model"]):
		trim_counts[t.model] += 1

	by_model = defaultdict(list)
	for trim, r in latest.items():
		price = _vat_adjust(r.amount, r.includes_vat, r.vat_percent, want_vat)
		by_model[r.model].append({"trim": trim, "price": price, "valid_from": str(r.valid_from)})

	rows = []
	for m in models:
		info = labels.get(m) or {}
		items = sorted(by_model.get(m, []), key=lambda x: x["price"])
		row = {
			"model": m, "label": info.get("model_name") or m, "brand": info.get("brand") or "",
			"trims_total": trim_counts.get(m, 0), "trims_priced": len(items), "items": items,
		}
		if items:
			row.update({
				"min": round(items[0]["price"]),
				"max": round(items[-1]["price"]),
				"avg": round(sum(x["price"] for x in items) / len(items)),
				"min_trim": items[0]["trim"], "max_trim": items[-1]["trim"],
				"last_date": max(x["valid_from"] for x in items),
			})
		else:
			row["no_data"] = True
		rows.append(row)

	return {
		"rows": rows, "currencies": currencies, "currency": currency,
		"with_vat": want_vat, "as_on": str(as_on), "other_prices": other_prices, "vat_mixed": vat_mixed,
	}
