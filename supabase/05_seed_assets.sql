-- ============================================================================
--  ملف 05: الأصول الكهربائية الأربعة والعشرون
--  مصدرها: PROJECT-SPEC.md §6 — نموذج QA-02-EL
-- ============================================================================

insert into assets (code, name_ar, name_en, category, sort) values
  ('EL-01', 'لوحة التوزيع الرئيسية',            'Main Distribution Board (MDB)',      'electrical',  1),
  ('EL-02', 'لوحات التوزيع الفرعية',            'Sub-Distribution Boards (SMDB)',     'electrical',  2),
  ('EL-03', 'القواطع الكهربائية',               'Circuit Breakers',                   'electrical',  3),
  ('EL-04', 'كوابل القدرة والتوصيلات',          'Power Cables & Wiring',              'electrical',  4),
  ('EL-05', 'نظام التأريض',                     'Earthing System',                    'electrical',  5),
  ('EL-06', 'أنظمة الإضاءة والمفاتيح',          'Lighting & Switches',                'electrical',  6),
  ('EL-07', 'نظام التغذية غير المنقطعة',        'UPS Systems',                        'electrical',  7),
  ('EL-08', 'المولدات الاحتياطية',              'Emergency Generators',               'electrical',  8),
  ('EL-09', 'مفاتيح التحويل التلقائي',          'Automatic Transfer Switches (ATS)',  'electrical',  9),
  ('EL-10', 'قضبان التوزيع العمومية',           'Busbars',                            'electrical', 10),
  ('EL-11', 'لوحات التحكم بالتكييف',            'HVAC Control Panels',                'electrical', 11),
  ('EL-12', 'محولات الجهد',                     'Transformers',                       'electrical', 12),
  ('EL-13', 'لوحات تحكم المضخات',               'Pump Control Panels',                'electrical', 13),
  ('EL-14', 'بطاريات المولدات والشواحن',        'Batteries & Chargers',               'electrical', 14),
  ('EL-15', 'وحدات إضاءة الطوارئ',              'Emergency Lighting Units',           'electrical', 15),
  ('EL-16', 'أنظمة إنذار الحريق الكهربائية',    'Fire Alarm Electrical Panels',       'electrical', 16),
  ('EL-17', 'لوحات تحكم المصاعد',               'Elevator Power Panels',              'electrical', 17),
  ('EL-18', 'مكثفات تحسين معامل القدرة',        'Power Factor Capacitors',            'electrical', 18),
  ('EL-19', 'عوازل ومفاتيح القطع',              'Isolator Switches',                  'electrical', 19),
  ('EL-20', 'مقابس ومآخذ التيار',               'Power Sockets & Outlets',            'electrical', 20),
  ('EL-21', 'أنظمة مانعات الصواعق',             'Lightning Protection',               'electrical', 21),
  ('EL-22', 'لوحات التحكم بالتهوية',            'Ventilation Control Panels',         'electrical', 22),
  ('EL-23', 'عدادات الطاقة الكلية',             'Energy Meters',                      'electrical', 23),
  ('EL-24', 'أجهزة المراقبة والتحكم باللوحات',  'Panel Monitoring Devices',           'electrical', 24)
on conflict (code) do update
  set name_ar = excluded.name_ar,
      name_en = excluded.name_en,
      sort    = excluded.sort;
