//! Native validation and authorization for the local authoritative snapshot.
//! The webview is treated as untrusted input even though the application is offline.
use crate::dashboard::SessionIdentity;
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};

const MAX_STATE_BYTES: usize = 32 * 1024 * 1024;
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

fn object<'a>(value: &'a Value, message: &str) -> Result<&'a Map<String, Value>, String> {
    value.as_object().ok_or_else(|| message.into())
}
fn array<'a>(value: &'a Value, key: &str) -> Result<&'a Vec<Value>, String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("بيانات {key} غير صالحة"))
}
fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("الحقل {key} غير صالح"))
}
fn integer(value: &Value, key: &str, allow_negative: bool) -> Result<i64, String> {
    let number = value
        .get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("الحقل {key} غير صالح"))?;
    if number.abs() > MAX_SAFE_INTEGER || (!allow_negative && number < 0) {
        return Err(format!("الحقل {key} خارج النطاق المسموح"));
    }
    Ok(number)
}
fn positive(value: &Value, key: &str) -> Result<i64, String> {
    let number = integer(value, key, false)?;
    if number == 0 {
        Err(format!("الحقل {key} يجب أن يكون أكبر من صفر"))
    } else {
        Ok(number)
    }
}
fn checked_add(left: i64, right: i64) -> Result<i64, String> {
    left.checked_add(right)
        .filter(|n| n.abs() <= MAX_SAFE_INTEGER)
        .ok_or_else(|| "تجاوزت العملية النطاق الرقمي الآمن".into())
}
fn checked_mul(left: i64, right: i64) -> Result<i64, String> {
    left.checked_mul(right)
        .filter(|n| n.abs() <= MAX_SAFE_INTEGER)
        .ok_or_else(|| "تجاوزت العملية النطاق الرقمي الآمن".into())
}
fn unique_ids(rows: &[Value], label: &str) -> Result<(), String> {
    let mut ids = HashSet::new();
    for row in rows {
        let id = text(row, "id")?;
        if id.is_empty() || !ids.insert(id) {
            return Err(format!("معرّف مكرر أو فارغ في {label}"));
        }
    }
    Ok(())
}
fn valid_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

pub fn parse_and_validate_state(state_json: &str) -> Result<Value, String> {
    if state_json.len() > MAX_STATE_BYTES {
        return Err("حجم بيانات التطبيق يتجاوز الحد الآمن".into());
    }
    let state: Value = serde_json::from_str(state_json)
        .map_err(|_| "بيانات التطبيق ليست JSON صالحة".to_string())?;
    validate_state(&state)?;
    Ok(state)
}

fn validate_state(state: &Value) -> Result<(), String> {
    object(state, "بيانات التطبيق غير صالحة")?;
    let users = array(state, "users")?;
    unique_ids(users, "المستخدمين")?;
    let mut usernames = HashSet::new();
    let mut active_admin = false;
    for user in users {
        let username = text(user, "username")?.trim().to_lowercase();
        let role = text(user, "role")?;
        if username.is_empty()
            || !usernames.insert(username)
            || !matches!(role, "admin" | "cashier")
        {
            return Err("بيانات المستخدمين أو الصلاحيات غير صالحة".into());
        }
        if !valid_hex(text(user, "salt")?, 32) || !valid_hex(text(user, "hash")?, 64) {
            return Err("بيانات اعتماد أحد المستخدمين غير صالحة".into());
        }
        let active = user
            .get("active")
            .and_then(Value::as_bool)
            .ok_or("حالة المستخدم غير صالحة")?;
        active_admin |= active && role == "admin";
    }
    if !users.is_empty() && !active_admin {
        return Err("يجب إبقاء حساب مدير نشط واحد على الأقل".into());
    }

    let products = array(state, "products")?;
    unique_ids(products, "المنتجات")?;
    for product in products {
        for key in [
            "cost",
            "price",
            "wholesalePrice",
            "stock",
            "minStock",
            "expiryWarningDays",
        ] {
            integer(product, key, false)?;
        }
        let track_inventory = product
            .get("trackInventory")
            .and_then(Value::as_bool)
            .ok_or("إعداد تتبع المخزون غير صالح")?;
        let track_batches = product
            .get("trackBatches")
            .and_then(Value::as_bool)
            .ok_or("إعداد تتبع الدفعات غير صالح")?;
        let track_expiry = product
            .get("trackExpiry")
            .and_then(Value::as_bool)
            .ok_or("إعداد تتبع الصلاحية غير صالح")?;
        if track_batches && !track_inventory || track_expiry && !track_batches {
            return Err("إعدادات تتبع المخزون غير متناسقة".into());
        }
    }

    let batches = array(state, "batches")?;
    unique_ids(batches, "الدفعات")?;
    for batch in batches {
        integer(batch, "quantity", false)?;
        integer(batch, "unitCost", false)?;
    }

    let sales = array(state, "sales")?;
    unique_ids(sales, "المبيعات")?;
    for sale in sales {
        let total = integer(sale, "total", false)?;
        let paid = integer(sale, "paid", false)?;
        if paid > total {
            return Err("المبلغ المدفوع يتجاوز إجمالي الفاتورة".into());
        }
        if let Some(lines) = sale.get("lines").and_then(Value::as_array) {
            if lines.is_empty() {
                return Err("الفاتورة لا تحتوي أصنافاً".into());
            }
            let mut subtotal = 0i64;
            let mut items = 0i64;
            for line in lines {
                let qty = positive(line, "qty")?;
                let price = integer(line, "price", false)?;
                integer(line, "cost", false)?;
                subtotal = checked_add(subtotal, checked_mul(qty, price)?)?;
                items = checked_add(items, qty)?;
            }
            let discount = integer(sale, "discount", false)?;
            if discount > subtotal
                || subtotal - discount != total
                || integer(sale, "items", false)? != items
            {
                return Err("إجمالي الفاتورة أو الخصم أو الكميات غير متناسقة".into());
            }
        }
    }

    let purchases = array(state, "purchases")?;
    unique_ids(purchases, "المشتريات")?;
    for purchase in purchases {
        let total = integer(purchase, "total", false)?;
        if integer(purchase, "paid", false)? > total {
            return Err("مدفوعات المشتريات تتجاوز الإجمالي".into());
        }
        if let Some(lines) = purchase.get("lines").and_then(Value::as_array) {
            let mut calculated = 0i64;
            for line in lines {
                calculated = checked_add(
                    calculated,
                    checked_mul(positive(line, "qty")?, integer(line, "cost", false)?)?,
                )?;
            }
            if calculated != total {
                return Err("إجمالي فاتورة المشتريات غير متناسق".into());
            }
        }
    }

    for key in ["customers", "suppliers"] {
        let rows = array(state, key)?;
        unique_ids(rows, key)?;
        for row in rows {
            integer(row, "balance", false)?;
            integer(row, "purchases", false)?;
        }
    }
    for key in [
        "saleReturns",
        "expenses",
        "movements",
        "inventoryLosses",
        "supplierReturns",
        "auditEvents",
        "payments",
        "fiscalYears",
    ] {
        unique_ids(array(state, key)?, key)?;
    }
    Ok(())
}

fn root_unchanged_except(old: &Value, new: &Value, allowed: &[&str]) -> Result<(), String> {
    let old = object(old, "الحالة القديمة غير صالحة")?;
    let new = object(new, "الحالة الجديدة غير صالحة")?;
    let allowed: HashSet<&str> = allowed.iter().copied().collect();
    if old.keys().collect::<HashSet<_>>() != new.keys().collect::<HashSet<_>>() {
        return Err("لا يمكن تغيير بنية بيانات التطبيق".into());
    }
    for (key, old_value) in old {
        if !allowed.contains(key.as_str()) && new.get(key) != Some(old_value) {
            return Err(format!("لا يملك الكاشير صلاحية تغيير {key}"));
        }
    }
    Ok(())
}
fn same_except(old: &Value, new: &Value, except: &[&str]) -> bool {
    let (Some(old), Some(new)) = (old.as_object(), new.as_object()) else {
        return false;
    };
    let mut old = old.clone();
    let mut new = new.clone();
    for key in except {
        old.remove(*key);
        new.remove(*key);
    }
    old == new
}
fn active_user_is(new: &Value, identity: &SessionIdentity) -> bool {
    new.get("activeUser").and_then(Value::as_str) == Some(identity.name.as_str())
}

pub fn authorize_transition(
    old: &Value,
    new: &Value,
    identity: &SessionIdentity,
) -> Result<(), String> {
    if identity.role == "admin" {
        return Ok(());
    }
    if identity.role != "cashier" || !active_user_is(new, identity) {
        return Err("الجلسة أو صلاحية المستخدم غير صالحة".into());
    }
    if validate_cashier_sale(old, new, identity).is_ok() {
        return Ok(());
    }
    Err("لا يملك الكاشير صلاحية تنفيذ هذا التغيير أو أن بيانات العملية غير متناسقة".into())
}

pub fn authorize_first_admin(old: &Value, new: &Value) -> Result<(), String> {
    if !array(old, "users")?.is_empty() {
        return Err("تم إنشاء حساب المدير بالفعل".into());
    }
    let initial_setup = old.get("setupComplete").and_then(Value::as_bool) == Some(false);
    if initial_setup {
        root_unchanged_except(
            old,
            new,
            &[
                "business",
                "setupComplete",
                "users",
                "activeUser",
                "fiscalYears",
            ],
        )?;
        if new.get("setupComplete").and_then(Value::as_bool) != Some(true)
            || text(&new["business"], "name")?.trim().is_empty()
            || array(new, "fiscalYears")?.is_empty()
        {
            return Err("Business details and a fiscal year are required during setup".into());
        }
    } else {
        root_unchanged_except(old, new, &["users", "activeUser"])?;
    }
    let users = array(new, "users")?;
    if users.len() != 1
        || text(&users[0], "role")? != "admin"
        || users[0].get("active") != Some(&Value::Bool(true))
        || text(new, "activeUser")? != text(&users[0], "name")?
    {
        return Err("يجب إنشاء حساب مدير نشط واحد".into());
    }
    Ok(())
}

fn validate_cashier_sale(
    old: &Value,
    new: &Value,
    identity: &SessionIdentity,
) -> Result<(), String> {
    root_unchanged_except(
        old,
        new,
        &[
            "sales",
            "products",
            "batches",
            "movements",
            "customers",
            "activeUser",
        ],
    )?;
    let old_sales = array(old, "sales")?;
    let new_sales = array(new, "sales")?;
    if new_sales.len() != old_sales.len() + 1 || new_sales[1..] != old_sales[..] {
        return Err("إضافة الفاتورة غير صالحة".into());
    }
    let sale = &new_sales[0];
    if text(sale, "cashier")? != identity.name
        || !matches!(text(sale, "method")?, "نقدي" | "بطاقة" | "تحويل" | "صك")
    {
        return Err("بيانات الكاشير أو طريقة الدفع غير صالحة".into());
    }
    let lines = sale
        .get("lines")
        .and_then(Value::as_array)
        .ok_or("تفاصيل الفاتورة مطلوبة")?;
    let old_products = array(old, "products")?;
    let new_products = array(new, "products")?;
    if old_products.len() != new_products.len() {
        return Err("قائمة المنتجات تغيرت".into());
    }
    let product_by_id: HashMap<&str, &Value> = old_products
        .iter()
        .map(|p| Ok((text(p, "id")?, p)))
        .collect::<Result<_, String>>()?;
    let old_batches = array(old, "batches")?;
    let new_batches = array(new, "batches")?;
    if old_batches.len() != new_batches.len() {
        return Err("قائمة الدفعات تغيرت".into());
    }
    let batch_by_id: HashMap<&str, &Value> = old_batches
        .iter()
        .map(|b| Ok((text(b, "id")?, b)))
        .collect::<Result<_, String>>()?;
    let mut quantities: HashMap<&str, i64> = HashMap::new();
    let mut batch_quantities: HashMap<&str, i64> = HashMap::new();
    let mut subtotal = 0i64;
    let mut item_count = 0i64;
    let mut expected_movements = 0usize;
    for line in lines {
        let product_id = text(line, "productId")?;
        if quantities.contains_key(product_id) {
            return Err("المنتج مكرر داخل الفاتورة".into());
        }
        let product = product_by_id.get(product_id).ok_or("المنتج غير موجود")?;
        if text(product, "status")? != "active" {
            return Err("المنتج متوقف".into());
        }
        let qty = positive(line, "qty")?;
        quantities.insert(product_id, qty);
        if integer(line, "price", false)? != integer(product, "price", false)?
            || text(line, "name")? != text(product, "name")?
            || text(line, "unit")? != text(product, "unit")?
        {
            return Err("تم تغيير سعر أو بيانات المنتج داخل الفاتورة".into());
        }
        subtotal = checked_add(
            subtotal,
            checked_mul(qty, integer(product, "price", false)?)?,
        )?;
        item_count = checked_add(item_count, qty)?;
        let track_inventory = product
            .get("trackInventory")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let track_batches = product
            .get("trackBatches")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if track_inventory && integer(product, "stock", false)? < qty {
            return Err("الكمية المطلوبة تتجاوز المخزون".into());
        }
        if track_batches {
            let allocations = line
                .get("batchAllocations")
                .and_then(Value::as_array)
                .ok_or("توزيع الدفعات مطلوب")?;
            let mut allocated = 0i64;
            let mut cost_total = 0i64;
            for allocation in allocations {
                let batch_id = text(allocation, "batchId")?;
                let quantity = positive(allocation, "quantity")?;
                let batch = batch_by_id.get(batch_id).ok_or("دفعة غير موجودة")?;
                if text(batch, "productId")? != product_id
                    || integer(batch, "unitCost", false)? != integer(allocation, "unitCost", false)?
                {
                    return Err("بيانات تخصيص الدفعة غير صالحة".into());
                }
                let used = batch_quantities.entry(batch_id).or_default();
                *used = checked_add(*used, quantity)?;
                if *used > integer(batch, "quantity", false)? {
                    return Err("الكمية تتجاوز الدفعة المتاحة".into());
                }
                allocated = checked_add(allocated, quantity)?;
                cost_total = checked_add(
                    cost_total,
                    checked_mul(quantity, integer(batch, "unitCost", false)?)?,
                )?;
            }
            if allocated != qty || integer(line, "cost", false)? != (cost_total + qty / 2) / qty {
                return Err("تكلفة أو كمية تخصيص الدفعات غير صحيحة".into());
            }
            expected_movements += allocations.len();
        } else {
            if integer(line, "cost", false)? != integer(product, "cost", false)? {
                return Err("تكلفة المنتج داخل الفاتورة غير صحيحة".into());
            }
            if track_inventory {
                expected_movements += 1;
            }
        }
    }
    let discount = integer(sale, "discount", false)?;
    let total = integer(sale, "total", false)?;
    let paid = integer(sale, "paid", false)?;
    if discount > subtotal
        || total != subtotal - discount
        || paid > total
        || integer(sale, "items", false)? != item_count
    {
        return Err("الحساب النهائي للفاتورة غير صحيح".into());
    }
    let expected_status = if paid == total {
        "مدفوعة"
    } else if paid > 0 {
        "جزئية"
    } else {
        "آجلة"
    };
    if text(sale, "status")? != expected_status {
        return Err("حالة الدفع غير صحيحة".into());
    }

    for (before, after) in old_products.iter().zip(new_products) {
        if !same_except(before, after, &["stock"]) {
            return Err("تم تعديل بيانات منتج دون صلاحية".into());
        }
        let qty = quantities.get(text(before, "id")?).copied().unwrap_or(0);
        let expected = integer(before, "stock", false)?
            - if before.get("trackInventory") == Some(&Value::Bool(true)) {
                qty
            } else {
                0
            };
        if integer(after, "stock", false)? != expected {
            return Err("رصيد المخزون بعد البيع غير صحيح".into());
        }
    }
    for (before, after) in old_batches.iter().zip(new_batches) {
        if !same_except(before, after, &["quantity"]) {
            return Err("تم تعديل بيانات دفعة دون صلاحية".into());
        }
        let expected = integer(before, "quantity", false)?
            - batch_quantities
                .get(text(before, "id")?)
                .copied()
                .unwrap_or(0);
        if integer(after, "quantity", false)? != expected {
            return Err("رصيد الدفعة بعد البيع غير صحيح".into());
        }
    }

    let customer_id = sale.get("customerId").and_then(Value::as_str).unwrap_or("");
    let old_customers = array(old, "customers")?;
    let new_customers = array(new, "customers")?;
    if old_customers.len() != new_customers.len() {
        return Err("قائمة العملاء تغيرت".into());
    }
    let mut customer_found = customer_id.is_empty();
    for (before, after) in old_customers.iter().zip(new_customers) {
        if text(before, "id")? == customer_id {
            customer_found = true;
            if !same_except(before, after, &["balance", "purchases", "lastPurchase"])
                || integer(after, "balance", false)?
                    != checked_add(integer(before, "balance", false)?, total - paid)?
                || integer(after, "purchases", false)?
                    != checked_add(integer(before, "purchases", false)?, total)?
                || after.get("lastPurchase") != sale.get("date")
            {
                return Err("حساب العميل بعد البيع غير صحيح".into());
            }
        } else if before != after {
            return Err("تم تعديل عميل غير مرتبط بالفاتورة".into());
        }
    }
    if !customer_found || customer_id.is_empty() && paid != total {
        return Err("البيع الآجل يتطلب عميلاً صالحاً".into());
    }

    let old_movements = array(old, "movements")?;
    let new_movements = array(new, "movements")?;
    if new_movements.len() != old_movements.len() + expected_movements
        || new_movements[expected_movements..] != old_movements[..]
    {
        return Err("حركات المخزون بعد البيع غير متناسقة".into());
    }
    let sale_id = text(sale, "id")?;
    let mut moved: HashMap<&str, i64> = HashMap::new();
    for movement in &new_movements[..expected_movements] {
        if text(movement, "reason")? != sale_id || movement.get("date") != sale.get("date") {
            return Err("مرجع حركة المخزون غير صحيح".into());
        }
        let product_id = text(movement, "productId")?;
        let amount = integer(movement, "amount", true)?;
        if amount >= 0 || !quantities.contains_key(product_id) {
            return Err("كمية حركة المخزون غير صحيحة".into());
        }
        let movement_total = checked_add(moved.get(product_id).copied().unwrap_or(0), amount)?;
        moved.insert(product_id, movement_total);
    }
    for (product_id, qty) in quantities {
        let product = product_by_id[product_id];
        if product.get("trackInventory") == Some(&Value::Bool(true))
            && moved.get(product_id).copied().unwrap_or(0) != -qty
        {
            return Err("مجموع حركات المخزون لا يطابق الفاتورة".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_state() -> Value {
        serde_json::json!({
            "business": {}, "setupComplete": true, "lastBackup": null, "activeUser": "مدير",
            "users": [{"id":"u1","name":"مدير","username":"admin","salt":"0123456789abcdef0123456789abcdef","hash":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","role":"admin","active":true}],
            "products": [], "customers": [], "suppliers": [], "sales": [], "saleReturns": [], "expenses": [], "purchases": [], "movements": [], "batches": [], "inventoryLosses": [], "supplierReturns": [], "auditEvents": [], "payments": [], "fiscalYears": []
        })
    }

    #[test]
    fn rejects_tampered_sale_totals() {
        let mut state = base_state();
        state["sales"] = serde_json::json!([{"id":"s","total":1,"paid":1,"items":1,"discount":0,"lines":[{"productId":"p","qty":1,"price":2,"cost":1}]}]);
        assert!(validate_state(&state).is_err());
    }

    #[test]
    fn rejects_cashier_admin_changes() {
        let old = base_state();
        let mut new = old.clone();
        new["business"] = serde_json::json!({"name":"tampered"});
        new["activeUser"] = "كاشير".into();
        let identity = SessionIdentity {
            id: "c".into(),
            hash: "h".into(),
            name: "كاشير".into(),
            role: "cashier".into(),
        };
        assert!(authorize_transition(&old, &new, &identity).is_err());
    }

    #[test]
    fn rejects_cashier_customer_and_payment_changes() {
        let old = base_state();
        let identity = SessionIdentity {
            id: "c".into(),
            hash: "h".into(),
            name: "كاشير".into(),
            role: "cashier".into(),
        };
        let mut customer_change = old.clone();
        customer_change["activeUser"] = "كاشير".into();
        customer_change["customers"] =
            serde_json::json!([{"id":"c1","name":"عميل","balance":0,"purchases":0}]);
        assert!(authorize_transition(&old, &customer_change, &identity).is_err());

        let mut payment_change = old.clone();
        payment_change["activeUser"] = "كاشير".into();
        payment_change["payments"] =
            serde_json::json!([{"id":"p1","kind":"customer","partyId":"c1","amount":1}]);
        assert!(authorize_transition(&old, &payment_change, &identity).is_err());
    }

    #[test]
    fn authorizes_complete_first_run_setup() {
        let mut old = base_state();
        old["setupComplete"] = Value::Bool(false);
        old["business"] = serde_json::json!({"name":"Old"});
        old["activeUser"] = Value::String(String::new());
        old["users"] = serde_json::json!([]);
        old["fiscalYears"] = serde_json::json!([]);

        let mut new = old.clone();
        new["setupComplete"] = Value::Bool(true);
        new["business"] = serde_json::json!({"name":"Dukkan"});
        new["activeUser"] = Value::String("Admin".into());
        new["users"] = serde_json::json!([{
            "id":"u1", "name":"Admin", "username":"admin",
            "salt":"0123456789abcdef0123456789abcdef",
            "hash":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "role":"admin", "active":true
        }]);
        new["fiscalYears"] = serde_json::json!([{"id":"fy1"}]);

        assert!(authorize_first_admin(&old, &new).is_ok());

        let mut tampered = new;
        tampered["products"] = serde_json::json!([{"id":"unexpected"}]);
        assert!(authorize_first_admin(&old, &tampered).is_err());
    }
}
