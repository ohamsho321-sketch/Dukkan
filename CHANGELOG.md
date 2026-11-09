# سجل التغييرات

## v1.2.0 — 2026-11-09

- فرض جلسة Tauri أصلية على حفظ بيانات سطح المكتب والعمليات الحساسة.
- إضافة تحقق Rust للأسعار والكميات والخصومات والإجماليات والمخزون وحركات الدفعات.
- تطبيق صلاحيات دقيقة للكاشير وقفل مؤقت بعد محاولات الدخول الفاشلة.
- تشديد SQLite وفحص ملفات الأسرار وقواعد البيانات قبل بناء الإصدار.
- إضافة تتبع الدفعات والصلاحية والإتلاف والإرجاع للمورد والسنوات المالية.
- توسيع اختبارات الحسابات والمخزون والفواتير والواجهة وقاعدة البيانات.

## v1.0.0 — 2026-09-11

> أول إصدار قابل للتثبيت من Dukkan.

- تجهيز بنية تطبيق Dukkan المكتبي باستخدام React وTypeScript وTauri وSQLite.
- إضافة واجهة عربية RTL أولية للتطوير والاختبار.
- توفير Windows Installer بصيغة NSIS مع اختبار تثبيت وتشغيل على Windows نظيف.
- إضافة النسخ الاحتياطي والاسترجاع المحلي بصيغة JSON.
- إضافة مركز مساعدة عربي يعمل دون اتصال.

## Unreleased

لا توجد تغييرات غير منشورة.
- إضافة مخطط SQLite ومواصفات المشروع العربية.
- إضافة توثيق المساهمة والأمان وقواعد السلوك.

## v1.1.0 — Dashboard refresh — 2026-10-27

- Arabic soft-glass dashboard with exact millime analytics, historical batch costs, period comparisons, local charts and actionable insights.
- Per-user layouts, business presets, simple/advanced modes, offline Arabic font and guide.
- Native dashboard session checks, financial/permission regression tests and browser checks.
- Website refreshed to match the blue and gold logo, with dashboard features and guide.
- No transaction schema or backup-format change. Published after native tests, Windows build, and automated installer/launch smoke check.
