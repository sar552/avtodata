"""Seed справочник/demo master data — Phase 1.

No production migration is needed (greenfield build), so this patch only
seeds enough lookup + catalog data to make the linked doctype system usable
and testable end-to-end.
"""

import frappe


def _get_or_create(doctype, name, values):
	if frappe.db.exists(doctype, name):
		return frappe.get_doc(doctype, name)
	doc = frappe.get_doc({"doctype": doctype, **values})
	doc.insert(ignore_permissions=True)
	return doc


def execute():
	_seed_brand_market_tiers()
	_seed_vehicle_classes()
	_seed_vehicle_segments()
	_seed_fuel_types()
	regions = _seed_regions()
	_seed_cities(regions)
	_seed_data_sources()
	_seed_technical_spec_definitions()
	_seed_brands_and_models()
	frappe.db.commit()


def _seed_brand_market_tiers():
	rows = [
		("budget", "Бюджетный", "Arzon", 10),
		("mass_market", "Массовый рынок", "Ommaviy bozor", 20),
		("premium", "Премиум", "Premium", 30),
		("luxury", "Люкс", "Lyuks", 40),
		("unset", "Не указано", "Belgilanmagan", 50),
	]
	for code, name_ru, name_uz, order in rows:
		_get_or_create(
			"Brand Market Tier",
			code,
			{
				"code": code,
				"name_ru": name_ru,
				"name_uz": name_uz,
				"display_order": order,
			},
		)


def _seed_vehicle_classes():
	rows = [
		("sedan", "Седан", "Sedan", 10),
		("hatchback", "Хэтчбек", "Xetchbek", 20),
		("suv", "Внедорожник", "Yo'ltanlamas", 30),
		("crossover", "Кроссовер", "Krossover", 40),
		("minivan", "Минивэн", "Minivan", 50),
		("pickup", "Пикап", "Pikap", 60),
	]
	for code, name_ru, name_uz, order in rows:
		_get_or_create(
			"Vehicle Class",
			code,
			{"code": code, "name_ru": name_ru, "name_uz": name_uz, "display_order": order},
		)


def _seed_vehicle_segments():
	rows = [
		("A", "Сегмент A (мини)", 10),
		("B", "Сегмент B (малый)", 20),
		("C", "Сегмент C (гольф-класс)", 30),
		("D", "Сегмент D (средний)", 40),
		("E", "Сегмент E (бизнес)", 50),
		("SUV", "Сегмент SUV", 60),
	]
	for code, name_ru, order in rows:
		_get_or_create(
			"Vehicle Segment",
			code,
			{"code": code, "name_ru": name_ru, "display_order": order},
		)


def _seed_fuel_types():
	rows = [
		("petrol", "Бензин", "Benzin", 10),
		("diesel", "Дизель", "Dizel", 20),
		("hybrid", "Гибрид", "Gibrid", 30),
		("electric", "Электро", "Elektr", 40),
		("gas", "Газ (СУГ/КПГ)", "Gaz (SUG/KPG)", 50),
	]
	for code, name_ru, name_uz, order in rows:
		_get_or_create(
			"Fuel Type",
			code,
			{"code": code, "name_ru": name_ru, "name_uz": name_uz, "display_order": order},
		)


def _seed_regions():
	rows = [
		("tashkent_city", "г. Ташкент", "Toshkent shahri", 10),
		("tashkent_region", "Ташкентская область", "Toshkent viloyati", 20),
		("andijan", "Андижанская область", "Andijon viloyati", 30),
		("fergana", "Ферганская область", "Farg'ona viloyati", 40),
		("namangan", "Наманганская область", "Namangan viloyati", 50),
		("sirdaryo", "Сырдарьинская область", "Sirdaryo viloyati", 60),
		("jizzax", "Джизакская область", "Jizzax viloyati", 70),
		("samarqand", "Самаркандская область", "Samarqand viloyati", 80),
		("bukhara", "Бухарская область", "Buxoro viloyati", 90),
		("navoiy", "Навоийская область", "Navoiy viloyati", 100),
		("qashqadaryo", "Кашкадарьинская область", "Qashqadaryo viloyati", 110),
		("surxondaryo", "Сурхандарьинская область", "Surxondaryo viloyati", 120),
		("khorezm", "Хорезмская область", "Xorazm viloyati", 130),
		("karakalpakstan", "Республика Каракалпакстан", "Qoraqalpog'iston Respublikasi", 140),
	]
	region_names = {}
	for code, name_ru, name_uz, order in rows:
		doc = _get_or_create(
			"Region",
			code,
			{"code": code, "name_ru": name_ru, "name_uz": name_uz, "display_order": order},
		)
		region_names[code] = doc.name
	return region_names


def _seed_cities(regions):
	rows = [
		("tashkent", "Ташкент", "Toshkent", regions["tashkent_city"]),
		("samarqand_city", "Самарканд", "Samarqand", regions["samarqand"]),
		("bukhara_city", "Бухара", "Buxoro", regions["bukhara"]),
		("andijan_city", "Андижан", "Andijon", regions["andijan"]),
		("fergana_city", "Фергана", "Farg'ona", regions["fergana"]),
		("nukus", "Нукус", "Nukus", regions["karakalpakstan"]),
		("urgench", "Ургенч", "Urganch", regions["khorezm"]),
	]
	for code, name_ru, name_uz, region in rows:
		_get_or_create(
			"City",
			code,
			{"code": code, "name_ru": name_ru, "name_uz": name_uz, "region": region},
		)


def _seed_data_sources():
	rows = [
		("official_dealer", "Официальный дилер", "Rasmiy diler orqali beriladigan hisobot."),
		("customs_stat", "Таможенная статистика", "Import bo'yicha bojxona statistikasi."),
		("market_survey", "Рыночный опрос", "Bozorni kuzatish/so'rovnoma natijalari."),
	]
	for code, name_ru, description in rows:
		_get_or_create(
			"Data Source",
			code,
			{"code": code, "name_ru": name_ru, "description": description},
		)


def _seed_technical_spec_definitions():
	rows = [
		{
			"code": "curb_weight",
			"name_ru": "Снаряжённая масса",
			"category": "Габариты и масса",
			"applies_to": "model",
			"data_type": "number",
			"unit": "кг",
			"comparison_direction": "lower_better",
			"display_precision": 0,
			"display_order": 10,
		},
		{
			"code": "engine_volume",
			"name_ru": "Объём двигателя",
			"category": "Объёмы",
			"applies_to": "model",
			"data_type": "number",
			"unit": "л",
			"comparison_direction": "neutral",
			"display_precision": 1,
			"display_order": 10,
		},
		{
			"code": "power_hp",
			"name_ru": "Мощность двигателя",
			"category": "Динамика и эффективность",
			"applies_to": "model",
			"data_type": "number",
			"unit": "л.с.",
			"comparison_direction": "higher_better",
			"display_precision": 0,
			"display_order": 10,
		},
		{
			"code": "fuel_consumption_combined",
			"name_ru": "Расход топлива (комб.)",
			"category": "Динамика и эффективность",
			"applies_to": "model",
			"data_type": "number",
			"unit": "л/100км",
			"comparison_direction": "lower_better",
			"display_precision": 1,
			"display_order": 20,
		},
		{
			"code": "trunk_volume",
			"name_ru": "Объём багажника",
			"category": "Объёмы",
			"applies_to": "trim",
			"data_type": "number",
			"unit": "л",
			"comparison_direction": "higher_better",
			"display_precision": 0,
			"display_order": 20,
		},
	]
	for row in rows:
		_get_or_create("Technical Spec Definition", row["code"], row)


def _seed_brands_and_models():
	brands = [
		{
			"brand_name": "Chevrolet",
			"country": "United States",
			"market_tier": "mass_market",
			"models": [
				("Cobalt", "sedan", "B", "petrol"),
				("Onix", "sedan", "B", "petrol"),
				("Tracker", "crossover", "C", "petrol"),
			],
		},
		{
			"brand_name": "Kia",
			"country": "Korea, Republic of",
			"market_tier": "mass_market",
			"models": [
				("K5", "sedan", "D", "petrol"),
				("Sportage", "crossover", "C", "petrol"),
			],
		},
		{
			"brand_name": "Hyundai",
			"country": "Korea, Republic of",
			"market_tier": "mass_market",
			"models": [
				("Sonata", "sedan", "D", "petrol"),
				("Tucson", "crossover", "C", "hybrid"),
			],
		},
		{
			"brand_name": "Toyota",
			"country": "Japan",
			"market_tier": "mass_market",
			"models": [
				("Camry", "sedan", "D", "hybrid"),
				("Land Cruiser Prado", "suv", "SUV", "diesel"),
			],
		},
		{
			"brand_name": "Lada",
			"country": "Russian Federation",
			"market_tier": "budget",
			"models": [
				("Granta", "sedan", "B", "petrol"),
				("Niva Travel", "suv", "SUV", "petrol"),
			],
		},
		{
			"brand_name": "BYD",
			"country": "China",
			"market_tier": "mass_market",
			"models": [
				("Song Plus", "crossover", "C", "electric"),
			],
		},
		{
			"brand_name": "Mercedes-Benz",
			"country": "Germany",
			"market_tier": "premium",
			"models": [
				("E-Class", "sedan", "E", "petrol"),
			],
		},
	]

	trims = ["Standard", "Comfort", "Luxury"]

	for brand_row in brands:
		brand_doc = _get_or_create(
			"Vehicle Brand",
			brand_row["brand_name"],
			{
				"brand_name": brand_row["brand_name"],
				"country": brand_row["country"],
				"market_tier": brand_row["market_tier"],
			},
		)
		for model_name, vehicle_class, segment, fuel_type in brand_row["models"]:
			model_doc = _get_or_create(
				"Model",
				f"{brand_doc.name}-{model_name}",
				{
					"model_name": model_name,
					"brand": brand_doc.name,
					"vehicle_class": vehicle_class,
					"vehicle_segment": segment,
					"fuel_type": fuel_type,
				},
			)
			for trim_name in trims[:2]:
				_get_or_create(
					"Trim",
					f"{model_doc.name}-{trim_name}",
					{"trim_name": trim_name, "model": model_doc.name},
				)
