-- ============================================================================
--  ملف 09: كتالوج الأنظمة والمعدات — تكييف · مدني ومعماري · سباكة
--
--  منقول من نموذج جولة الفحص الذي يعرفه الفريق: ثلاث مجموعات، ستة عشر
--  نظامًا، تسع وسبعون معدة. جدول assets هو المرجع الوحيد للأصول، فتُضاف
--  إليه بدل كتالوج ثانٍ في الواجهة ينحرف عنه مع الوقت.
-- ============================================================================

alter table assets add column if not exists system_key text;
alter table assets add column if not exists system_ar  text;
alter table assets add column if not exists system_en  text;

comment on column assets.system_key is 'النظام الذي تنتمي إليه المعدة — مفتاح التجميع في جولة الفحص';

create index if not exists assets_system_idx on assets (category, system_key, sort);

insert into assets (code, name_ar, name_en, category, system_key, system_ar, system_en, sort) values
  ('MC-01', 'وحدة معالجة الهواء (AHU)', 'AHU', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 1),
  ('MC-02', 'وحدة ملف المروحة (FCU)', 'FCU', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 2),
  ('MC-03', 'وحدات منفصلة (Split Units)', 'Split Units', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 3),
  ('MC-04', 'وحدات مدمجة (Package Units)', 'Package Units', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 4),
  ('MC-05', 'وحدات المكثف (Condensing Units)', 'Condensing Units', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 5),
  ('MC-06', 'مجاري وصاج الهواء (Ducts)', 'Ducts', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 6),
  ('MC-07', 'مخارج ومداخل الهواء', 'Air Outlets & Inlets', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 7),
  ('MC-08', 'دنابر الهواء (Dampers)', 'Dampers', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 8),
  ('MC-09', 'فلاتر الهواء (Filters)', 'Filters', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 9),
  ('MC-10', 'ملفات التبريد (Cooling Coils)', 'Cooling Coils', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 10),
  ('MC-11', 'الضواغط (Compressors)', 'Compressors', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 11),
  ('MC-12', 'لوحات التحكم والترموستات', 'Controls & Thermostats', 'hvac', 'HVAC', 'نظام التكييف المركزي (HVAC)', 'HVAC System', 12),
  ('MC-13', 'خطوط التبريد وأنظمة الضغط', 'Refrigerant Lines & Pressure Systems', 'hvac', 'Refrigeration', 'نظام التبريد (Refrigeration)', 'Refrigeration System', 13),
  ('MC-14', 'الثلاجات وغرف التبريد', 'Refrigerators', 'hvac', 'Refrigeration', 'نظام التبريد (Refrigeration)', 'Refrigeration System', 14),
  ('MC-15', 'مراوح التهوية والشفط', 'Ventilation & Exhaust Fans', 'hvac', 'Ventilation', 'نظام التهوية والشفط (Ventilation)', 'Ventilation System', 15),
  ('MC-16', 'مضخات المياه المبردة', 'Chilled Water Pumps', 'hvac', 'Chilled Water', 'نظام المياه المبردة (Chilled Water)', 'Chilled Water System', 16),
  ('MC-17', 'مبردات المياه (Water Coolers)', 'Water Coolers', 'hvac', 'Water Cooling', 'نظام تبريد المياه (Water Cooling)', 'Water Cooling System', 17),
  ('MC-18', 'المحركات الميكانيكية (Motors)', 'Motors', 'hvac', 'Mechanical', 'الأنظمة الميكانيكية (Mechanical)', 'Mechanical Systems', 18),
  ('MC-19', 'السيور والبكرات (Belts & Pulleys)', 'Belts & Pulleys', 'hvac', 'Mechanical', 'الأنظمة الميكانيكية (Mechanical)', 'Mechanical Systems', 19),
  ('CV-01', 'الجدران والحوائط', 'Walls', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 20),
  ('CV-02', 'الأسقف', 'Ceilings', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 21),
  ('CV-03', 'الأعمال والإنشاءات المعدنية', 'Metal Works', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 22),
  ('CV-04', 'الشقوق والعيوب السطحية', 'Cracks & Surface Defects', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 23),
  ('CV-05', 'الأرضيات', 'Floors', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 24),
  ('CV-06', 'أعمال العزل', 'Insulation', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 25),
  ('CV-07', 'السلالم والدرج', 'Stairs', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 26),
  ('CV-08', 'النوافذ والشبابيك', 'Windows', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 27),
  ('CV-09', 'الأبواب الرئيسية والفرعية', 'Doors', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 28),
  ('CV-10', 'الأعمال الزجاجية', 'Glass', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 29),
  ('CV-11', 'القواطع الجدارية', 'Partitions', 'civil', 'Civil & Architectural', 'الأعمال المدنية والمعمارية', 'Civil & Architectural Works', 30),
  ('CV-12', 'أعمال السيليكون والفواصل', 'Silicone Works', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 31),
  ('CV-13', 'أعمال النجارة العامة', 'Carpentry Works', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 32),
  ('CV-14', 'الخزائن الخشبية والدواليب', 'Wooden Cabinets & Cupboards', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 33),
  ('CV-15', 'الرفوف والطاولات والأسطح الثابتة', 'Shelves, Tables & Fixed Counters', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 34),
  ('CV-16', 'الأبواب والإطارات الخشبية', 'Wooden Doors & Frames', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 35),
  ('CV-17', 'المفصلات والمقابض والأقفال', 'Hinges, Handles & Locks', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 36),
  ('CV-18', 'الأسقف المستعارة', 'Suspended Ceilings', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 37),
  ('CV-19', 'أعمال البلاط والسيراميك', 'Tiles', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 38),
  ('CV-20', 'أعمال الدهانات والتطليء', 'Paintwork', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 39),
  ('CV-21', 'الواجهات الخارجية', 'Facades', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 40),
  ('CV-22', 'أعمال اللياسة والديكورات الجبسية', 'Plaster & Gypsum Works', 'civil', 'Architectural', 'الأعمال المعمارية والتشطيبات', 'Architectural & Finishing Works', 41),
  ('CV-23', 'الأسقف العلوية والسطح', 'Roofs', 'civil', 'Civil', 'الأعمال المدنية والإنشائية', 'Civil & Structural Works', 42),
  ('CV-24', 'الممرات والمشايات والأرصفة', 'Walkways & Pavements', 'civil', 'Civil', 'الأعمال المدنية والإنشائية', 'Civil & Structural Works', 43),
  ('CV-25', 'تصريف مياه الأمطار بالموقع', 'Stormwater Drainage', 'civil', 'Civil', 'الأعمال المدنية والإنشائية', 'Civil & Structural Works', 44),
  ('CV-26', 'الأعمال والمنشآت الخرسانية', 'Concrete Works', 'civil', 'Civil', 'الأعمال المدنية والإنشائية', 'Civil & Structural Works', 45),
  ('CV-27', 'العزل المائي للأسطح', 'Waterproofing', 'civil', 'Civil', 'الأعمال المدنية والإنشائية', 'Civil & Structural Works', 46),
  ('CV-28', 'العزل الحراري', 'Thermal Insulation', 'civil', 'Civil', 'الأعمال المدنية والإنشائية', 'Civil & Structural Works', 47),
  ('CV-29', 'المزاريب وأنابيب التصريف', 'Gutters & Downpipes', 'civil', 'Civil', 'الأعمال المدنية والإنشائية', 'Civil & Structural Works', 48),
  ('PL-01', 'خزانات المياه الرئيسية والفرعية', 'Water Tanks', 'plumbing', 'Water Supply', 'أنظمة تغذية المياه (Water Supply)', 'Water Supply Systems', 49),
  ('PL-02', 'مضخات المياه', 'Pumps', 'plumbing', 'Water Supply', 'أنظمة تغذية المياه (Water Supply)', 'Water Supply Systems', 50),
  ('PL-03', 'شبكات وخطوط المياه', 'Water Networks', 'plumbing', 'Water Supply', 'أنظمة تغذية المياه (Water Supply)', 'Water Supply Systems', 51),
  ('PL-04', 'المحابس والبلوف', 'Valves', 'plumbing', 'Water Supply', 'أنظمة تغذية المياه (Water Supply)', 'Water Supply Systems', 52),
  ('PL-05', 'منظمات وصمامات ضغط المياه', 'Water Pressure Regulators', 'plumbing', 'Water Supply', 'أنظمة تغذية المياه (Water Supply)', 'Water Supply Systems', 53),
  ('PL-06', 'عدادات قياس المياه', 'Water Meters', 'plumbing', 'Water Supply', 'أنظمة تغذية المياه (Water Supply)', 'Water Supply Systems', 54),
  ('PL-07', 'ردادات عدم الرجوع', 'Check Valves', 'plumbing', 'Water Supply', 'أنظمة تغذية المياه (Water Supply)', 'Water Supply Systems', 55),
  ('PL-08', 'عوامات الخزانات', 'Tank Float Valves', 'plumbing', 'Water Supply', 'أنظمة تغذية المياه (Water Supply)', 'Water Supply Systems', 56),
  ('PL-09', 'شبكات الصرف الصحي', 'Sewage Networks', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 57),
  ('PL-10', 'غرف التفتيش', 'Inspection Chambers', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 58),
  ('PL-11', 'الصفايات الأرضية', 'Floor Drains', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 59),
  ('PL-12', 'نقاط تسليك الصرف والصيانة', 'Drainage Cleaning & Access Points', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 60),
  ('PL-13', 'أنابيب تهوية خطوط الصرف', 'Drainage Vent Pipes', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 61),
  ('PL-14', 'مصايد الدهون', 'Grease Traps', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 62),
  ('PL-15', 'مضخات رفع مياه الصرف', 'Sewage Lift Pumps', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 63),
  ('PL-16', 'مصايد الرائحة', 'Traps', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 64),
  ('PL-17', 'مصفاة واغطية الأرضيات', 'Floor Strainers', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 65),
  ('PL-18', 'صفايات المزاريب والأسطح', 'Roof Drains', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 66),
  ('PL-19', 'شبكات تصريف مياه السيول', 'Stormwater Drainage Networks', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 67),
  ('PL-20', 'مضخات تصريف مياه الأمطار', 'Stormwater Drainage Pumps', 'plumbing', 'Drainage', 'أنظمة الصرف الصحي (Drainage)', 'Drainage Systems', 68),
  ('PL-21', 'المغاسل وأحواض الغسيل', 'Wash Basins', 'plumbing', 'Sanitary', 'القطع والأدوات الصحية (Sanitary)', 'Sanitary Fixtures', 69),
  ('PL-22', 'كراسي الحمامات والدورات', 'Toilets', 'plumbing', 'Sanitary', 'القطع والأدوات الصحية (Sanitary)', 'Sanitary Fixtures', 70),
  ('PL-23', 'خلاطات المياه والصنابير', 'Mixers / Faucets', 'plumbing', 'Sanitary', 'القطع والأدوات الصحية (Sanitary)', 'Sanitary Fixtures', 71),
  ('PL-24', 'الشطافات والمحابس الملحقة', 'Bidet Sprays', 'plumbing', 'Sanitary', 'القطع والأدوات الصحية (Sanitary)', 'Sanitary Fixtures', 72),
  ('PL-25', 'إكسسوارات وقطع الأدوات الصحية', 'Sanitary Accessories & Fixtures', 'plumbing', 'Sanitary', 'القطع والأدوات الصحية (Sanitary)', 'Sanitary Fixtures', 73),
  ('PL-26', 'السخانات المركزية', 'Central Water Heaters', 'plumbing', 'Water Heating', 'أنظمة تسخين المياه (Water Heating)', 'Water Heating Systems', 74),
  ('PL-27', 'السخانات الفردية', 'Water Heaters', 'plumbing', 'Water Heating', 'أنظمة تسخين المياه (Water Heating)', 'Water Heating Systems', 75),
  ('PL-28', 'فلاتر ومنقيات المياه', 'Water Filters', 'plumbing', 'Water Treatment', 'أنظمة معالجة المياه (Water Treatment)', 'Water Treatment Systems', 76),
  ('PL-29', 'أنظمة ومحطات معالجة المياه', 'Water Treatment Systems', 'plumbing', 'Water Treatment', 'أنظمة معالجة المياه (Water Treatment)', 'Water Treatment Systems', 77),
  ('PL-30', 'مضخات تدوير المياه الساخنة', 'Hot Water Circulation Pumps', 'plumbing', 'Hot Water', 'أنظمة تدوير المياه الساخنة', 'Hot Water Circulation Systems', 78),
  ('PL-31', 'توصيلات وشبكات جميع الأنظمة', 'All Pipe Connections & Fittings', 'plumbing', 'All Systems', 'توصيلات وشبكات جميع الأنظمة', 'All Pipe Connections & Fittings', 79)
on conflict (code) do update
  set name_ar = excluded.name_ar, name_en = excluded.name_en,
      category = excluded.category, system_key = excluded.system_key,
      system_ar = excluded.system_ar, system_en = excluded.system_en,
      sort = excluded.sort;
