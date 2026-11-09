import { useMemo, useRef, useState } from 'react'
import type { ComponentType, FormEvent, ReactNode, CSSProperties } from 'react'
import {
  ArrowDownToLine, ArrowUpFromLine, BarChart3, Bell, Box, Calculator, CalendarDays, Check, ChevronDown,
  CircleHelp, ClipboardList, CreditCard, DatabaseBackup, FileBarChart, FileText, Filter, HelpCircle, Home,
  LayoutGrid, LogOut, Menu, Package, Palette, Plus, Printer, ReceiptText, Search, Settings,
  ShieldCheck, ShoppingCart, SlidersHorizontal, Sparkles, Store, Tag, Trash2, TrendingUp, Truck, UserPlus,
  Users, WalletCards, X, Zap
} from 'lucide-react'
import { useAppStore, isAdmin } from './store'
import { PasswordField } from './components/PasswordField'
import { POS, Products, Inventory, Sales, Purchases, Customers, Suppliers, Expenses, Reports, UsersPage } from './components/BusinessPages'
import { Dashboard } from './components/Dashboard'
import { parseBackup, displayDate } from './lib/data'
import { download } from './lib/output'
import type { Business, Product } from './types'
import { CURRENCIES, currencyDefinition, formatMoney, formatNumber, parseMoney, setActiveCurrency } from './lib/money'
import logoUrl from '../logo.png'
import './help.css'

type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
type Page = 'dashboard' | 'pos' | 'products' | 'inventory' | 'sales' | 'purchases' | 'customers' | 'suppliers' | 'expenses' | 'reports' | 'users' | 'settings' | 'help' | 'about'

const nav: { id: Page; label: string; icon: Icon }[] = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: Home },
  { id: 'pos', label: 'نقطة البيع', icon: Calculator },
  { id: 'products', label: 'المنتجات', icon: Package },
  { id: 'inventory', label: 'المخزون', icon: Box },
  { id: 'sales', label: 'المبيعات', icon: ReceiptText },
  { id: 'purchases', label: 'المشتريات', icon: ClipboardList },
  { id: 'customers', label: 'العملاء والديون', icon: Users },
  { id: 'suppliers', label: 'الموردون', icon: Truck },
  { id: 'expenses', label: 'المصروفات', icon: WalletCards },
  { id: 'reports', label: 'التقارير', icon: FileBarChart },
]

function App() {
  const { setupComplete, business, users, sessionId, activeUser, logout, loadError } = useAppStore()
  setActiveCurrency(business.currency)
  const [page, setPage] = useState<Page>('dashboard')
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const [switchingUser, setSwitchingUser] = useState(false)
  const go = (next: Page) => { if (!isAdmin() && !['pos', 'sales', 'customers', 'help', 'about'].includes(next)) return; setPage(next); setShowMobileNav(false) }
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }

  if (loadError) return <main className="auth-page"><p role="alert">{loadError}</p></main>
  if (!setupComplete) return <SetupWizard />
  if (!sessionId || !users.some(u => u.id === sessionId && u.active)) return <AuthScreen switchingUser={switchingUser} />
  const shownPage = !isAdmin() && !['pos', 'sales', 'customers', 'help', 'about'].includes(page) ? 'pos' : page
  return <div className="app" dir="rtl" style={{ '--primary': business.primaryColor } as CSSProperties}>
    <Sidebar page={shownPage} onNavigate={go} open={showMobileNav} onClose={() => setShowMobileNav(false)} />
    <main className="main-shell">
      <header className="topbar">
        <div className="topbar-start"><button className="icon-button mobile-menu" onClick={() => setShowMobileNav(true)}><Menu size={20} /></button><div className="offline-pill"><span className="online-dot" /> يعمل بدون إنترنت</div></div>
        <div className="topbar-actions"><button className="btn secondary" onClick={() => { if (!window.confirm('تبديل المستخدم؟ ستُغلق أي فاتورة أو تعديلات لم تحفظها بعد.')) return; setSwitchingUser(true); logout(); setPage('dashboard'); setShowMobileNav(false); setToast('') }}><Users size={18} />تبديل المستخدم</button><button className="icon-button" title="تسجيل الخروج" aria-label="تسجيل الخروج" onClick={() => { setSwitchingUser(false); logout(); setPage('dashboard') }}><LogOut size={19} /></button><div className="top-user"><div className="avatar small">{activeUser.slice(0, 1)}</div><div><b>{activeUser}</b><small>{isAdmin() ? 'مدير النظام' : 'كاشير'}</small></div><ChevronDown size={15} /></div></div>
      </header>
      <div className="page-wrap">
        <PageHeader page={shownPage} onNavigate={go} />
        {shownPage === 'dashboard' && <Dashboard onNavigate={go} />}
        {shownPage === 'pos' && <POS notify={notify} />}
        {shownPage === 'products' && <Products notify={notify} />}
        {shownPage === 'inventory' && <Inventory notify={notify} />}
        {shownPage === 'sales' && <Sales />}
        {shownPage === 'purchases' && <Purchases notify={notify} />}
        {shownPage === 'customers' && <Customers notify={notify} />}
        {shownPage === 'suppliers' && <Suppliers notify={notify} />}
        {shownPage === 'expenses' && <Expenses notify={notify} />}
        {shownPage === 'reports' && <Reports />}
        {shownPage === 'users' && <UsersPage />}
        {shownPage === 'settings' && <SettingsPage notify={notify} />}
        {shownPage === 'help' && <Help />}
        {shownPage === 'about' && <About />}
      </div>
    </main>
    {toast && <div className="toast"><Check size={17} /> {toast}</div>}
  </div>
}

function Sidebar({ page, onNavigate, open, onClose }: { page: Page; onNavigate: (p: Page) => void; open: boolean; onClose: () => void }) {
  const business = useAppStore((s) => s.business)
  return <><div className={`sidebar-overlay ${open ? 'show' : ''}`} onClick={onClose} /><aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><div className="brand-mark"><img src={logoUrl} alt="سوق الضنية المركزي" /></div><div><strong>سوق الضنية</strong><span>الكاشير والمحاسبة</span></div><button className="icon-button close-sidebar" onClick={onClose}><X size={18} /></button></div>
    <div className="business-mini"><div className="business-logo">{business.logo ? <img src={business.logo} /> : <Store size={19} />}</div><div><b>{business.name}</b><small>{business.type}</small></div></div>
    <div className="nav-label">الرئيسية</div>
    <nav>{nav.slice(0, 2).filter(item => isAdmin() || item.id === 'pos').map((item) => <NavItem key={item.id} item={item} active={page === item.id} onNavigate={onNavigate} />)}</nav>
    <div className="nav-label">إدارة النشاط</div>
    <nav>{nav.slice(2).filter(item => isAdmin() || ['sales', 'customers'].includes(item.id)).map((item) => <NavItem key={item.id} item={item} active={page === item.id} onNavigate={onNavigate} />)}</nav>
    <div className="nav-label">النظام</div>
    <nav>
      {isAdmin() && <NavItem item={{ id: 'users', label: 'المستخدمون والصلاحيات', icon: ShieldCheck }} active={page === 'users'} onNavigate={onNavigate} />}
      {isAdmin() && <NavItem item={{ id: 'settings', label: 'الإعدادات', icon: Settings }} active={page === 'settings'} onNavigate={onNavigate} />}
      <NavItem item={{ id: 'help', label: 'مركز المساعدة', icon: CircleHelp }} active={page === 'help'} onNavigate={onNavigate} />
      <NavItem item={{ id: 'about', label: 'حول النظام', icon: Sparkles }} active={page === 'about'} onNavigate={onNavigate} />
    </nav>
    <div className="sidebar-footer"><div className="backup-hint"><DatabaseBackup size={18} /><div><b>نسخة احتياطية</b><span>بيانات محلية بالكامل</span></div><ArrowUpFromLine size={15} /></div><div className="version">سوق الضنية <span>v1.2.0</span></div></div>
  </aside></>
}

function ScaleIcon() { return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v17M5 20h14M4 7h16M7 7l-3 6a3 3 0 0 0 6 0L7 7Zm10 0-3 6a3 3 0 0 0 6 0l-3-6Z" /></svg> }
function NavItem({ item, active, onNavigate }: { item: { id: Page; label: string; icon: Icon }; active: boolean; onNavigate: (p: Page) => void }) { const Icon = item.icon; return <button className={`nav-item ${active ? 'active' : ''}`} onClick={() => onNavigate(item.id)}><Icon size={18} strokeWidth={active ? 2.4 : 1.8} /><span>{item.label}</span></button> }

function PageHeader({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  const info: Record<Page, [string, string]> = { dashboard: ['لوحة التحكم', 'ملخص نشاطك اليوم'], pos: ['نقطة البيع', 'أنشئ فاتورة جديدة بسرعة وسهولة'], products: ['المنتجات', 'أدر منتجاتك وأسعارك ومخزونك'], inventory: ['المخزون', 'تابع الكميات وحركات المخزون'], sales: ['المبيعات والمرتجعات', 'فواتير البيع والمرتجعات الموثقة'], purchases: ['المشتريات', 'تابع التوريدات وفواتير الموردين'], customers: ['العملاء والديون', 'إدارة العملاء وكشوف الحساب'], suppliers: ['الموردون', 'تابع الموردين ومستحقاتهم'], expenses: ['المصروفات', 'سجل وتابع مصروفات نشاطك'], reports: ['التقارير', 'أرقام واضحة تساعدك على اتخاذ القرار'], users: ['المستخدمون والصلاحيات', 'تحكم في وصول فريقك للنظام'], settings: ['الإعدادات', 'خصص سوق الضنية ليتناسب مع نشاطك'], help: ['مركز المساعدة', 'دليل شامل لاستخدام جميع أقسام البرنامج'], about: ['حول النظام', 'برنامج سوق الضنية المركزي ومصدره المفتوح'] }
  const [title, subtitle] = info[page]
  return <div className="page-header"><div><div className="eyebrow">الرئيسية <span>/</span> {title.replace('، طارق 👋', '')}</div><h1>{title}</h1><p>{subtitle}</p></div>{page === 'dashboard' && <div className="header-actions"><span>{new Date().toLocaleDateString('ar-LY')}</span><button className="btn primary" onClick={() => onNavigate('pos')}><Plus size={18} /> عملية بيع جديدة</button></div>}</div>
}

function SettingsPage({ notify }: { notify: (m: string) => void }) {
  const s = useAppStore(), [draft, setDraft] = useState(s.business), [error, setError] = useState(''), [pending, setPending] = useState(''), [closingYearId, setClosingYearId] = useState(''), [reviewed, setReviewed] = useState(false)
  const nextYear = new Date().getFullYear(), [fiscal, setFiscal] = useState({ name: `السنة المالية ${nextYear}`, startDate: `${nextYear}-01-01`, endDate: `${nextYear}-12-31` })
  const input = useRef<HTMLInputElement>(null)
  const save = async (e: FormEvent) => { e.preventDefault(); try { await s.updateBusiness(draft); setError(''); notify('تم حفظ بيانات النشاط') } catch (e) { setError(e instanceof Error ? e.message : 'تعذر الحفظ') } }
  const backup = async () => { try { download(s.backup(), 'Souk-Al-Dannyeh-Backup-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json'); await s.markBackup(); notify('تم تجهيز النسخة الاحتياطية للتنزيل') } catch (e) { setError(e instanceof Error ? e.message : 'تعذر التنزيل') } }
  const restore = async (file?: File) => {
    if (!file) return
    try { if (file.size > 25 * 1024 * 1024) throw new Error('حجم النسخة يتجاوز 25 ميجابايت'); const text = await file.text(); parseBackup(text); setPending(text); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : 'النسخة غير صالحة') }
    finally { if (input.current) input.current.value = '' }
  }
  const addFiscal = async (e: FormEvent) => { e.preventDefault(); try { await s.addFiscalYear(fiscal.name, fiscal.startDate, fiscal.endDate); setError(''); notify('تمت إضافة السنة المالية') } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إضافة السنة المالية') } }
  return <div className="page-content settings-page"><form className="form-grid" onSubmit={save}>
    <label>اسم النشاط<input required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
    <label>نوع النشاط<select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>{Array.from(new Set([draft.type, 'متجر تجزئة', 'جملة وتجزئة', 'مطعم ومقهى', 'خدمات'])).map(t => <option key={t}>{t}</option>)}</select></label>
    <label>رقم الهاتف<input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} /></label>
    <label>العنوان<input value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} /></label>
    <label>الرقم الضريبي<input value={draft.taxNumber} onChange={e => setDraft({ ...draft, taxNumber: e.target.value })} /></label>
    <label>اللون الرئيسي<input type="color" value={draft.primaryColor} onChange={e => setDraft({ ...draft, primaryColor: e.target.value })} /></label>
    <label>عملة السجلات<select value={currencyDefinition(draft.currency).code} onChange={e => setDraft({ ...draft, currency: e.target.value })}>{Object.values(CURRENCIES).filter(c => c.code !== 'LYD' || currencyDefinition(draft.currency).code === 'LYD').map(c => <option key={c.code} value={c.code}>{c.label} ({c.code})</option>)}</select></label>
    <p className="full info-note">تغيير العملة يغيّر طريقة الإدخال والعرض فقط ولا يحوّل مبالغ السجلات السابقة. خذ نسخة احتياطية قبل تغييرها بعد بدء العمل.</p>
    <LogoUpload value={draft.logo} onChange={logo => setDraft({ ...draft, logo })} />
    <div className="full"><button className="btn primary" type="submit"><Check size={18} />حفظ التغييرات</button></div>
  </form><h2>السنة المالية</h2><p>تُربط المبيعات والمشتريات والمصروفات والدفعات تلقائياً بالسنة المفتوحة التي يغطي نطاقها تاريخ العملية.</p>
  <div className="table-card"><table><thead><tr><th>الاسم</th><th>البداية</th><th>النهاية</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>{s.fiscalYears.map(y => <tr key={y.id}><td>{y.name}</td><td>{displayDate(y.startDate)}</td><td>{displayDate(y.endDate)}</td><td>{y.status === 'open' ? 'مفتوحة' : y.status === 'locked' ? 'مقفلة مؤقتاً' : 'مغلقة نهائياً'}</td><td>{y.status !== 'closed' && <div className="toolbar-actions"><button type="button" className="small-action" onClick={() => void s.setFiscalYearStatus(y.id, y.status === 'open' ? 'locked' : 'open').catch(e => setError(e instanceof Error ? e.message : 'تعذر تغيير الحالة'))}>{y.status === 'open' ? 'قفل مؤقت' : 'إعادة فتح'}</button><button type="button" className="small-action" onClick={() => { setReviewed(false); setClosingYearId(y.id) }}>إنهاء السنة</button></div>}</td></tr>)}</tbody></table></div>
  <form className="form-grid" onSubmit={addFiscal}><label>اسم السنة<input required value={fiscal.name} onChange={e => setFiscal({ ...fiscal, name: e.target.value })} /></label><label>تاريخ البداية<input type="date" required value={fiscal.startDate} onChange={e => setFiscal({ ...fiscal, startDate: e.target.value })} /></label><label>تاريخ النهاية<input type="date" required value={fiscal.endDate} onChange={e => setFiscal({ ...fiscal, endDate: e.target.value })} /></label><div><button className="btn secondary" type="submit"><Plus size={18} />إضافة سنة مالية</button></div></form>
  <h2>النسخ الاحتياطي</h2><p>آخر نسخة: {s.lastBackup ? displayDate(s.lastBackup) : 'لم تنشأ نسخة بعد'}</p><div className="toolbar-actions"><button className="btn secondary" onClick={backup}><DatabaseBackup size={18} />إنشاء نسخة</button><button className="btn secondary" onClick={() => input.current?.click()}><ArrowUpFromLine size={18} />استرجاع</button><input ref={input} type="file" hidden accept=".json,application/json" onChange={e => void restore(e.target.files?.[0])} /></div>{error && <p role="alert" className="form-error">{error}</p>}
  {pending && <Modal title="تأكيد استرجاع النسخة" onClose={() => setPending('')}><div className="dialog-body"><p>سيتم استبدال بيانات النشاط الحالية ببيانات النسخة المحددة. حسابات المستخدمين الحالية ستبقى كما هي.</p><button className="btn secondary" onClick={() => void backup()}>تنزيل نسخة من البيانات الحالية</button><button className="btn primary" onClick={async () => { try { await s.restoreBackup(pending); setDraft(useAppStore.getState().business); setPending(''); notify('تم استرجاع البيانات') } catch (e) { setError(e instanceof Error ? e.message : 'تعذر الاسترجاع'); setPending('') } }}>تأكيد الاسترجاع</button></div></Modal>}
  {closingYearId && (() => { const y = s.fiscalYears.find(x => x.id === closingYearId); if (!y) return null; const inYear = (date: string) => date.slice(0, 10) >= y.startDate && date.slice(0, 10) <= y.endDate; const salesRows = s.sales.filter(x => x.fiscalYearId === y.id || (!x.fiscalYearId && inYear(x.date))), sales = salesRows.reduce((n, x) => n + x.total, 0), cost = salesRows.reduce((n, x) => n + (x.lines || []).reduce((a, l) => a + l.qty * l.cost, 0), 0), expenses = s.expenses.filter(x => x.fiscalYearId === y.id || (!x.fiscalYearId && inYear(x.date))).reduce((n, x) => n + x.amount, 0), losses = s.inventoryLosses.filter(x => inYear(x.date)).reduce((n, x) => n + x.totalCost, 0); return <Modal title={`إنهاء ${y.name}`} onClose={() => setClosingYearId('')}><div className="dialog-body"><p>راجع الملخص قبل الإقفال. ستستمر كميات المخزون وديون العملاء ومستحقات الموردين في السنة التالية تلقائياً.</p><div className="summary-strip"><div><span>المبيعات</span><b>{formatMoney(sales)}</b></div><div><span>تكلفة البضاعة</span><b>{formatMoney(cost)}</b></div><div><span>المصروفات والخسائر</span><b>{formatMoney(expenses + losses)}</b></div><div><span>الربح التقديري</span><b>{formatMoney(sales - cost - expenses - losses)}</b></div></div><label className="confirm-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /> راجعت المخزون وأرصدة العملاء والموردين وأفهم أن الإغلاق النهائي لا يمكن التراجع عنه.</label><button className="btn primary" disabled={!reviewed} onClick={async () => { try { download(s.backup(), `Dukkan-Pre-Close-${y.endDate}.json`, 'application/json'); await s.markBackup(); const next = await s.closeFiscalYear(y.id); setClosingYearId(''); setReviewed(false); notify(`تم إقفال السنة وفتح ${next.name}`) } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إقفال السنة'); setClosingYearId('') } }}>إنشاء نسخة وإقفال السنة</button></div></Modal> })()}</div>
}
function AuthScreen({ switchingUser = false }: { switchingUser?: boolean }) {
  const s = useAppStore(), legacy = s.users.length === 0
  const [name, setName] = useState(s.activeUser), [username, setUsername] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return
    setError(''); setBusy(true)
    try { if (legacy) { if (password !== confirm) throw new Error('كلمتا المرور غير متطابقتين'); await s.createAdmin(name, username, password) } else await s.login(username, password) }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تسجيل الدخول') } finally { setBusy(false) }
  }
  return <main className="auth-page" dir="rtl"><div className="auth-panel"><h1>{s.business.name || 'Dukkan'}</h1><h2>{legacy ? 'تعيين حساب المدير' : switchingUser ? 'تبديل المستخدم' : 'تسجيل الدخول'}</h2>{switchingUser && !legacy && <p>اختر المستخدم وأدخل كلمة مروره للمتابعة دون إغلاق البرنامج.</p>}{legacy && <p>الإصدار السابق لم يحفظ كلمة المرور. أنشئ حساب المدير لحماية الدخول مع الاحتفاظ ببيانات نشاطك.</p>}<form onSubmit={submit} className="form-grid">
  {legacy && <label className="full">الاسم<input required value={name} onChange={e => setName(e.target.value)} /></label>}
  <label className="full">اسم المستخدم{switchingUser && !legacy ? <select required value={username} onChange={e => { setUsername(e.target.value); setPassword(''); setError('') }}><option value="">اختر المستخدم</option>{s.users.filter(u => u.active).map(u => <option key={u.id} value={u.username}>{u.name} — {u.username}</option>)}</select> : <input required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} />}</label>
  <div className="full"><PasswordField id="login-password" label="كلمة المرور" value={password} onChange={setPassword} /></div>
  {legacy && <div className="full"><PasswordField id="login-confirm" label="تأكيد كلمة المرور" value={confirm} onChange={setConfirm} /></div>}
  {error && <p className="form-error full" role="alert">{error}</p>}<button className="btn primary full" type="submit" disabled={busy}>{busy ? 'جارٍ التحقق' : legacy ? 'حفظ حساب المدير' : 'دخول'}</button>
  </form></div></main>
}

const helpArticles = [
  { category: 'لوحة النشاط', title: 'كيف أقرأ لوحة النشاط الجديدة؟', steps: ['اختر فترة التقرير من اللوحة؛ المبيعات والمصروفات والدفعات تتبع هذه الفترة، بينما الديون والمخزون أرصدة حالية لجميع الفترات.', 'مجمل الربح هو المبيعات بعد الخصم ناقص تكلفة البضاعة المحفوظة عند البيع. نتيجة التشغيل تخصم المصروفات وخسائر الإتلاف أيضاً؛ الربح ليس النقد المتاح.', 'إذا كانت تفاصيل التكلفة القديمة ناقصة يظهر الربح غير متاح، ولا تُختلق أرقام بديلة.', 'المقارنة مع الفترة السابقة المساوية في عدد الأيام؛ نسبة النمو لا تحسب عندما تكون مبيعات الفترة السابقة صفراً.', 'استخدم الوضع البسيط للملخص السريع والمتقدم للمصروفات والمنتجات والمخزون والرؤى.', 'من تخصيص اختر قالب النشاط والمؤشرات والأقسام وترتيبها والفترة الافتراضية. تحفظ الإعدادات لهذا المستخدم على الجهاز ولا تدخل في نسخة المعاملات الاحتياطية.', 'تنبيهات المخزون والصلاحية والأرصدة تفتح الأقسام المرتبطة. لا يصف النظام الديون بالمتأخرة لأن تواريخ الاستحقاق غير مسجلة.', 'اللوحة للمدير فقط، وتعمل دون اتصال بالإنترنت.'] },
  { category: 'البداية', title: 'البدء وإعداد النشاط', steps: ['عند التشغيل الأول أدخل اسم النشاط ونوعه ورقم الهاتف والعنوان؛ الرقم الضريبي اختياري.', 'اختر اللون الرئيسي وأضف شعار المحل، ثم راجع العملة والخانات العشرية.', 'أنشئ حساب المدير بكلمة مرور قوية من 8 أحرف على الأقل، ثم احتفظ ببيانات الدخول في مكان آمن.', 'ابدأ بإضافة التصنيفات والمنتجات والموردين، وبعدها سجّل الكميات الافتتاحية أو المشتريات.'] },
  { category: 'الرئيسية', title: 'لوحة التحكم', steps: ['تعرض ملخص المبيعات والأرباح والفواتير وحالة المخزون.', 'استخدم تنبيهات المخزون لمعرفة الأصناف التي قاربت على النفاد.', 'إذا كنت تتتبع الصلاحية، راجع الدفعات المنتهية أو القريبة من الانتهاء والكمية والقيمة المعرضة للخطر.', 'راجع المؤشرات يوميًا، ثم افتح التقارير للحصول على تفاصيل أوسع.', 'زر «عملية بيع جديدة» ينقلك مباشرة إلى نقطة البيع.'] },
  { category: 'المبيعات', title: 'نقطة البيع وإنشاء فاتورة', steps: ['ابحث عن المنتج بالاسم أو SKU أو الباركود، ثم اضغط عليه لإضافته إلى السلة.', 'عدّل الكمية من السلة وتأكد من السعر والإجمالي قبل الحفظ.', 'اختر العميل عند البيع الآجل، وحدد طريقة الدفع والمبلغ المدفوع.', 'أكمل البيع؛ يحفظ النظام الفاتورة ويخصم الكميات من المخزون تلقائيًا.', 'إذا لم تكفِ الكمية، يمنع النظام بيع كمية أكبر من المتوفر.'] },
  { category: 'المنتجات', title: 'المنتجات والتصنيفات والباركود', steps: ['أضف اسم المنتج والتصنيف والوحدة وSKU أو الباركود وسعر الشراء وسعر البيع.', 'اجعل SKU والباركود مميزين لكل منتج لتجنب الالتباس عند البحث والبيع.', 'حدّد كمية التنبيه المناسبة حتى يظهر الصنف في تنبيهات النقص مبكرًا.', 'لمحل الملابس: أنشئ منتجًا مستقلًا لكل تركيبة موديل ولون ومقاس، مثل «قميص أسود — M».', 'راجع سعر الشراء والبيع قبل الحفظ لأنهما يؤثران في قيمة المخزون وحساب الربح.'] },
  { category: 'المخزون', title: 'المخزون وحركات التسوية', steps: ['تعرض صفحة المخزون الكمية الحالية وحالة كل صنف وسجل الحركات.', 'استخدم تسوية المخزون عند الجرد أو التلف أو الفقد أو المرتجع، واختر إضافة أو سحب.', 'اكتب سببًا واضحًا لكل تسوية، مثل «جرد شهري» أو «تالف» أو «مرتجع فاتورة».', 'التوريدات ترفع المخزون والمبيعات تخفضه تلقائيًا؛ لا تكرر تعديل الكمية يدويًا.', 'نفّذ جردًا دوريًا وقارن الكمية الفعلية بالكمية المسجلة.'] },
  { category: 'المخزون', title: 'تفعيل الدفعات وتواريخ الصلاحية', steps: ['من صفحة المنتجات أضف منتجًا جديدًا أو عدّل منتجًا مخزنيًا.', 'فعّل «تتبع الدفعات»، ثم فعّل «تتبع الصلاحية» إذا كان المنتج محدود العمر.', 'حدد عدد أيام التنبيه المناسب، مثل 7 أو 30 يومًا.', 'للمنتج الذي يحتوي مخزونًا قديمًا: صفّر رصيده أولًا بجرد موثق، ثم فعّل الدفعات وأدخله من فاتورة شراء.', 'لا تظهر حقول الدفعة والصلاحية للمنتجات التي لا تحتاج إليها.'] },
  { category: 'المشتريات', title: 'استلام بضاعة برقم دفعة', steps: ['أنشئ فاتورة شراء واختر منتجًا مفعّلًا له تتبع الدفعات.', 'أدخل رقم الدفعة والكمية وتكلفة الوحدة، ثم تاريخ الإنتاج إن كان معروفًا.', 'أدخل تاريخ الانتهاء للمنتجات التي تتبع الصلاحية؛ يمنع النظام تاريخ إنتاج بعد الانتهاء.', 'كل استلام يبقى مرتبطًا بفاتورته ومورده حتى لو تكرر رقم الدفعة في استلام آخر.', 'بعد الحفظ راجع تبويب «الدفعات» في صفحة المخزون.'] },
  { category: 'المخزون', title: 'FEFO والبيع الآمن للمنتجات محدودة الصلاحية', steps: ['يعرض POS الكمية الصالحة للبيع فقط ولا يحتسب الكمية المنتهية ضمن المتاح.', 'عند البيع يختار النظام تلقائيًا الدفعة الأقرب انتهاءً أولًا وفق FEFO.', 'إذا احتاجت الكمية إلى أكثر من دفعة، يوزعها النظام ويحفظ أثر كل دفعة وتكلفتها.', 'يمنع النظام بيع المخزون المنتهي حتى لو ظل موجودًا في السجلات.', 'لا تتخلص من منتج منتهي خارج النظام؛ سجّل الإتلاف حتى تبقى الخسارة قابلة للتتبع.'] },
  { category: 'المخزون', title: 'إتلاف دفعة أو إرجاعها إلى المورد', steps: ['افتح «المخزون»، ثم تبويب «الدفعات»، واضغط «إجراء» أمام الدفعة المطلوبة.', 'اختر تسوية كمية أو إتلاف منتهي أو إتلاف تالف أو إرجاع إلى المورد.', 'أدخل الكمية والسبب بوضوح، ثم أكد العملية؛ هذه الإجراءات متاحة للمدير فقط.', 'الإتلاف يسجل حركة مخزون وخسارة بالتكلفة التاريخية، ولا يحذف الدفعة بصمت.', 'إرجاع المورد يخفض المخزون والمبلغ المستحق ويظهر في كشف حساب المورد وسجل التدقيق.'] },
  { category: 'المبيعات', title: 'المبيعات والفواتير', steps: ['تعرض الصفحة جميع الفواتير مع العميل والإجمالي والمدفوع والحالة وطريقة الدفع.', 'استخدم البحث والتصفية للوصول إلى فاتورة أو فترة معينة.', 'حالة «مدفوعة» تعني سداد كامل القيمة، و«جزئية» تعني وجود مبلغ متبقٍ.', 'عند مراجعة اختلاف، طابق الفاتورة مع حركة المخزون وكشف حساب العميل.'] },
  { category: 'المشتريات', title: 'المشتريات والتوريدات', steps: ['أضف المورد أولًا حتى تتمكن من ربط التوريد بحسابه.', 'أنشئ عملية شراء، واختر المورد والأصناف والكميات وتكلفة الوحدة.', 'أدخل المبلغ المدفوع بدقة؛ يسجل النظام المتبقي ضمن مستحقات المورد.', 'عند الحفظ، تزداد كميات المنتجات وتُحدّث تكلفة الشراء.', 'راجع الأصناف والكميات قبل التأكيد لأن التوريد يؤثر مباشرة في المخزون والحسابات.'] },
  { category: 'العملاء', title: 'العملاء والبيع الآجل والدفعات', steps: ['أضف اسم العميل ورقم هاتفه وملاحظاته لتسهيل التعرف عليه.', 'اختر العميل في نقطة البيع إذا كانت الفاتورة آجلة أو مدفوعة جزئيًا.', 'يظهر المتبقي تلقائيًا في رصيد العميل وكشف حسابه.', 'عند استلام دفعة لاحقة، افتح العميل وسجّل الدفعة؛ لا تسجلها كمبيعات جديدة.', 'راجع كشف الحساب مع العميل دوريًا، وتأكد من توثيق كل دفعة.'] },
  { category: 'الموردون', title: 'الموردون ومستحقاتهم', steps: ['سجّل بيانات المورد قبل إدخال مشترياته.', 'كل شراء غير مدفوع بالكامل يزيد المبلغ المستحق للمورد.', 'سجّل دفعات المورد من صفحته حتى ينخفض الرصيد ويظهر السجل صحيحًا.', 'طابق رصيد المورد مع فواتيره وإيصالات الدفع بصورة دورية.'] },
  { category: 'المصروفات', title: 'تسجيل المصروفات', steps: ['سجّل الإيجار والكهرباء والنقل والرواتب والصيانة وأي تكلفة تشغيلية أخرى.', 'اختر التصنيف الصحيح، واكتب وصفًا واضحًا والمبلغ والتاريخ.', 'لا تسجل شراء البضاعة كمصروف؛ أدخله في المشتريات حتى يتحدث المخزون.', 'راجع المصروفات في التقارير لمعرفة أثرها في صافي نتيجة النشاط.'] },
  { category: 'التقارير', title: 'التقارير وفهم الأرقام', steps: ['اختر الفترة الزمنية المطلوبة قبل الاعتماد على النتائج.', 'المبيعات هي قيمة الفواتير، بينما الربح يعتمد على سعر البيع وتكلفة الدفعات الفعلية.', 'راجع تقارير خسائر المخزون ومرتجعات الموردين وسجل التدقيق إلى جانب الديون والمصروفات.', 'قيمة المنتج المتتبع بالدفعات تُحسب من الكمية والتكلفة التاريخية لكل دفعة.', 'دقة التقرير تعتمد على تسجيل كل عملية بيع وشراء ودفعة ومصروف وإتلاف في وقتها.'] },
  { category: 'الإدارة', title: 'المستخدمون والصلاحيات', steps: ['يدخل المدير إلى «المستخدمون والصلاحيات» لإضافة حساب جديد.', 'حساب المدير يدير البيانات والإعدادات والمخزون والمستخدمين، بينما الكاشير يصل إلى مهام البيع المسموح بها.', 'أنشئ حسابًا مستقلًا لكل موظف ولا تشارك كلمة مرور المدير.', 'عند توقف موظف عن العمل، عطّل حسابه بدل استخدامه من موظف آخر.', 'استخدم «تبديل المستخدم» لتسليم الوردية دون إغلاق البرنامج.'] },
  { category: 'الإدارة', title: 'الإعدادات وتخصيص النظام', steps: ['عدّل اسم النشاط ونوعه والهاتف والعنوان والرقم الضريبي والشعار واللون الرئيسي.', 'راجع البيانات قبل حفظها لأنها تظهر ضمن هوية النشاط ومخرجات النظام.', 'إعدادات الإدارة والنسخ الاحتياطي متاحة للمدير حفاظًا على البيانات.'] },
  { category: 'الإدارة', title: 'السنة المالية وإنهاء السنة ببساطة', steps: ['من «الإعدادات» أنشئ سنة مالية باسم واضح وحدد تاريخ البداية والنهاية.', 'يربط النظام المبيعات والمشتريات والمصروفات والدفعات تلقائياً بالسنة المفتوحة التي تحتوي تاريخ العملية.', 'استخدم القفل المؤقت عندما تريد مراجعة الأرقام دون السماح بعمليات جديدة، ويمكنك إعادة فتح السنة بعد ذلك.', 'عند نهاية السنة اضغط «إنهاء السنة» وراجع ملخص المبيعات وتكلفة البضاعة والمصروفات والخسائر والربح التقديري.', 'راجع كميات المخزون وديون العملاء ومستحقات الموردين، ثم فعّل مربع التأكيد.', 'ينشئ النظام نسخة احتياطية قبل الإقفال، يغلق السنة نهائياً ويفتح السنة التالية تلقائياً.', 'يستمر المخزون وديون العملاء ومستحقات الموردين في السنة الجديدة، بينما تبقى فواتير وتقارير السنة السابقة محفوظة.', 'الإغلاق النهائي لا يمكن التراجع عنه من الواجهة؛ لا تنفذه قبل إنهاء المراجعة وحفظ النسخة الاحتياطية في مكان آمن.', 'يمكنك اختيار سنة مالية محددة من صفحة التقارير لعرض نتائجها.'] },
  { category: 'الحماية', title: 'إنشاء نسخة احتياطية', steps: ['اذهب إلى «الإعدادات» واضغط «إنشاء نسخة».', 'سيُنزل ملف باسم قريب من Dukkan-Backup-YYYY-MM-DD.json في مجلد التنزيلات.', 'أنشئ نسخة يومية أو أسبوعية حسب حجم العمل، وانسخها إلى قرص خارجي أو تخزين سحابي موثوق.', 'النسخة تشمل بيانات النشاط ولا تتضمن كلمات مرور المستخدمين. لا تعدّل ملف JSON يدويًا.'] },
  { category: 'الحماية', title: 'استرجاع نسخة احتياطية بأمان', steps: ['أنشئ نسخة من البيانات الحالية أولًا حتى تتمكن من الرجوع إليها.', 'من «الإعدادات» اضغط «استرجاع» واختر ملف النسخة بصيغة JSON.', 'يراجع النظام صلاحية الملف، ثم يعرض رسالة تأكيد قبل استبدال بيانات النشاط.', 'بعد التأكيد، راجع اسم النشاط وعدة منتجات وفواتير وأرصدة للتأكد من اكتمال الاستعادة.', 'الاسترجاع لا يستبدل حسابات المستخدمين الحالية.'] },
  { category: 'الحماية', title: 'كيف يعمل Dukkan دون إنترنت؟', steps: ['تطبيق سطح المكتب يحفظ بيانات النشاط محليًا في SQLite داخل جهازك.', 'لا يحتاج البيع أو الشراء أو المخزون أو التقارير إلى اتصال بالإنترنت.', 'لا تغلق البرنامج أو الجهاز أثناء ظهور عملية حفظ قيد التنفيذ.', 'أنشئ نسخة احتياطية دورية واحفظها في قرص خارجي أو مكان آمن منفصل عن الجهاز.', 'الاتصال بالإنترنت مطلوب فقط إذا اخترت تنزيل تحديث جديد، وليس لتشغيل النشاط.'] },
  { category: 'المبيعات', title: 'مرتجع مبيعات موثق', steps: ['افتح صفحة «المبيعات والمرتجعات» وابحث عن الفاتورة الأصلية.', 'اضغط «تسجيل مرتجع» وحدد كمية كل صنف وسبب الإرجاع.', 'يعيد النظام الكمية إلى المخزون والدفعة الأصلية، ويمنع إرجاع كمية أكبر من المباعة.', 'يحسب النظام أثر الخصم، وما يرد نقداً، وما يحسم من رصيد العميل.', 'المرتجعات متاحة للمدير وتظهر في التقارير وكشف حساب العميل.'] },
  { category: 'إرشادات', title: 'نصائح لمحل الملابس', steps: ['استخدم رمزًا منظمًا يجمع الموديل واللون والمقاس، مثل SH-BLK-M.', 'أدخل كل مقاس ولون كمنتج منفصل لتعرف الكمية المتاحة بدقة.', 'اجعل التصنيفات واضحة مثل رجالي ونسائي وأطفال وأحذية وإكسسوارات.', 'استخدم تنبيه المخزون للمقاسات السريعة النفاد، وراجع أفضل الموديلات من التقارير.', 'سجّل المرتجعات والاستبدالات فورًا حتى لا تظهر قطعة غير موجودة فعليًا.'] },
  { category: 'الحماية', title: 'العمل دون إنترنت وحماية البيانات', steps: ['يعمل Dukkan محليًا دون الحاجة إلى اتصال دائم بالإنترنت.', 'حافظ على الجهاز وحساب نظام التشغيل بكلمة مرور، ولا تمنح الوصول لغير المصرح لهم.', 'النسخة الاحتياطية مسؤولية المدير؛ احتفظ بأكثر من نسخة واختبر الاسترجاع دوريًا.', 'لا تغلق البرنامج أثناء حفظ عملية، وتحقق من ظهور رسالة النجاح قبل الانتقال.'] },
]
function Help() {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('الكل')
  const categories = ['الكل', ...Array.from(new Set(helpArticles.map(a => a.category)))]
  const normalized = q.trim().toLocaleLowerCase('ar')
  const articles = helpArticles.filter(a => (category === 'الكل' || a.category === category) && !normalized || (category === 'الكل' || a.category === category) && (a.title + a.category + a.steps.join(' ')).toLocaleLowerCase('ar').includes(normalized))
  return <div className="page-content help-page">
    <div className="help-intro"><div><span><CircleHelp size={17} /> دليل سوق الضنية</span><h2>كيف يمكننا مساعدتك؟</h2><p>اختر قسمًا أو ابحث عن المهمة التي تريد تنفيذها. يعمل هذا الدليل بالكامل دون إنترنت.</p></div><div className="search-box help-main-search"><Search size={18} /><input aria-label="بحث في المساعدة" value={q} onChange={e => setQ(e.target.value)} placeholder="مثال: إضافة منتج، بيع آجل، استرجاع نسخة..." /></div></div>
    <div className="help-filter" aria-label="تصنيفات المساعدة">{categories.map(c => <button key={c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <p className="help-count">{articles.length ? `${articles.length} موضوعًا متاحًا` : 'لا توجد نتيجة مطابقة. جرّب كلمة أخرى أو اختر «الكل».'}</p>
    <div className="help-list">{articles.map((a, index) => <details className="help-detail" key={a.title} open={articles.length === 1}><summary><span className="help-number">{String(index + 1).padStart(2, '0')}</span><span><small>{a.category}</small><b>{a.title}</b></span><ChevronDown size={19} /></summary><div className="help-detail-body"><ol>{a.steps.map(step => <li key={step}>{step}</li>)}</ol></div></details>)}</div>
  </div>
}

function About() {
  return <div className="page-content about-page">
    <section className="about-hero"><div className="about-logo"><img src={logoUrl} alt="شعار سوق الضنية المركزي" /></div><div><span>نظام كاشير ومحاسبة محلي</span><h2>سوق الضنية المركزي</h2><p>برنامج عربي لإدارة المبيعات والمخزون والمشتريات والعملاء والموردين والمصاريف والتقارير من مكان واحد، حتى دون اتصال بالإنترنت.</p></div></section>
    <div className="about-grid">
      <section className="about-section"><Store size={25} /><h3>مهمة النظام</h3><p>تحويل العمل اليومي في المحل إلى سجلات واضحة ومترابطة، وتقليل الأخطاء في الحساب والمخزون والديون، وتقديم أرقام مفهومة تساعد صاحب النشاط على اتخاذ قرار أفضل.</p></section>
      <section className="about-section"><ShieldCheck size={25} /><h3>الخصوصية والاستقلال</h3><p>يعمل البرنامج محليًا بالكامل. تبقى إدارة النسخ الاحتياطية بيد صاحب النشاط ليحافظ على بياناته وينقلها عند الحاجة.</p></section>
      <section className="about-section"><Users size={25} /><h3>لمن صُمم؟</h3><p>للمتاجر والمشروعات الصغيرة، ولأصحاب الأعمال الذين يريدون نظامًا عربيًا مباشرًا لا يثقل يومهم بالتعقيد، مع صلاحيات مناسبة للمدير والكاشير.</p></section>
      <section className="about-section"><Sparkles size={25} /><h3>رؤية التطوير</h3><p>أن تكون التقنية قريبة من الناس، مفهومة لهم، ومساندة لرزقهم؛ أداة تختصر الوقت وتحفظ الحقوق وتساعد النشاط الصغير على التنظيم والنمو بثقة.</p></section>
    </div>
    <section className="developer-message"><div className="developer-name"><span>مبني على المشروع المفتوح المصدر</span><strong>Dukkan</strong><small>© Tarek Elomami — MIT License</small></div><blockquote>خُصص هذا الإصدار لسوق الضنية المركزي مع الحفاظ على إشعار الترخيص ونَسب المشروع الأصلي. البيانات محلية ولا يوجد أي ربط سحابي أو ربط بمتجر إلكتروني.</blockquote></section>
    <footer className="about-footer"><b>سوق الضنية المركزي v1.2.0</b><span>Windows 10/11 • يعمل بلا إنترنت</span></footer>
  </div>
}

function SetupHelp() {
  const dialog = useRef<HTMLDialogElement>(null)
  return <div className="setup-help">
    <button type="button" className="setup-help-link" onClick={() => dialog.current?.showModal()}>تحتاج مساعدة؟ <span>دليل الاستخدام يعمل بدون إنترنت</span></button>
    <dialog ref={dialog} className="setup-help-dialog" aria-labelledby="setup-help-title">
      <div className="modal-head"><h2 id="setup-help-title">مساعدة إعداد النشاط</h2><button type="button" className="icon-button" aria-label="إغلاق المساعدة" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      <div className="setup-help-body">
        <ol>
          <li><b>بيانات النشاط:</b> أدخل اسم النشاط ونوعه وبيانات الاتصال. الرقم الضريبي اختياري.</li>
          <li><b>الهوية:</b> اختر اللون الرئيسي لنشاطك.</li>
          <li><b>إعدادات النظام:</b> راجع العملة واللغة والخانات العشرية.</li>
          <li><b>حساب المدير:</b> راجع بيانات المستخدم ثم اضغط «ابدأ باستخدام Dukkan» لإنهاء الإعداد.</li>
        </ol>
        <p>اضغط «متابعة» أسفل الشاشة للانتقال إلى الخطوة التالية، أو «رجوع» لمراجعة الخطوة السابقة. إغلاق المساعدة لا يغيّر البيانات التي أدخلتها.</p>
        <button type="button" className="btn primary" onClick={() => dialog.current?.close()}>العودة إلى الإعداد</button>
      </div>
    </dialog>
  </div>
}

function LogoUpload({ value, onChange }: { value: string; onChange: (logo: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const upload = async (file?: File) => {
    if (!file) return
    setError('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('اختر صورة PNG أو JPG أو WebP لا يتجاوز حجمها 5 ميجابايت.')
      if (input.current) input.current.value = ''
      return
    }
    setLoading(true)
    const url = URL.createObjectURL(file)
    try {
      const picture = new Image()
      picture.src = url
      await picture.decode()
      const scale = Math.min(1, 256 / Math.max(picture.naturalWidth, picture.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image conversion unavailable')
      context.drawImage(picture, 0, 0, canvas.width, canvas.height)
      onChange(canvas.toDataURL('image/png'))
    } catch {
      setError('تعذر قراءة الصورة. اختر ملف صورة صالحاً وحاول مجدداً.')
    } finally {
      URL.revokeObjectURL(url)
      setLoading(false)
      if (input.current) input.current.value = ''
    }
  }
  return <div className="logo-upload">
    <span>شعار النشاط</span>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void upload(event.target.files?.[0])} />
    <button type="button" className="upload-box" disabled={loading} onClick={() => input.current?.click()}><ArrowUpFromLine size={17} />{loading ? 'جارٍ تحميل الشعار' : value ? 'تغيير الشعار' : 'رفع الشعار'}</button>
    {value && <div className="logo-upload-preview"><img src={value} alt="شعار النشاط" /><button type="button" className="icon-button" aria-label="إزالة الشعار" disabled={loading} onClick={() => { onChange(''); setError('') }}><Trash2 size={17} /></button></div>}
    {error && <p className="logo-upload-error" role="alert">{error}</p>}
  </div>
}


function SetupWizard() {
  const { completeSetup } = useAppStore()
  const [step, setStep] = useState(1)
  const [business, setBusiness] = useState<Business>({ name: 'سوق الضنية المركزي', type: 'جملة وتجزئة', phone: '', address: 'الضنية، لبنان', taxNumber: '', logo: '', primaryColor: '#15803d', currency: 'USD' })
  const [user, setUser] = useState({ name: '', username: 'admin', password: '', confirm: '' })
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const update = (key: keyof Business, value: string) => setBusiness(b => ({ ...b, [key]: value }))
  const next = () => { if (step === 1 && !business.name.trim()) { setError('أدخل اسم النشاط'); return } setError(''); setStep(s => Math.min(4, s + 1)) }
  const finish = async () => {
    if (busy) return
    if (user.password !== user.confirm) { setError('كلمتا المرور غير متطابقتين'); return }
    setBusy(true); setError('')
    try { await completeSetup(business, user) } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إكمال الإعداد') } finally { setBusy(false) }
  }
  const currency = currencyDefinition(business.currency)
  return <div className="setup-page" dir="rtl" style={{ '--primary': business.primaryColor } as CSSProperties}>
    <div className="setup-sidebar"><div className="setup-brand"><div className="brand-mark"><img src={logoUrl} alt="سوق الضنية المركزي" /></div><span>سوق الضنية المركزي</span></div><div className="setup-side-copy"><span>برنامج المحل المحلي</span><h2>كل شيء في مكان واحد.</h2><p>الكاشير والمخزون والمشتريات والديون والتقارير، بلا إنترنت.</p></div><div className="setup-quote"><span>“</span><p>مصمم للعمل على Windows 10 وحفظ البيانات محلياً على جهاز المحل.</p></div><div className="setup-side-footer">نسخة محلية وآمنة <span>•</span> v1.2.0</div></div>
    <div className="setup-content"><div className="setup-top"><span>إعداد النشاط</span><span>الخطوة {step} من 4</span></div><div className="setup-progress"><i style={{ width: `${step * 25}%` }} /></div><div className="setup-form">
      {step === 1 && <><span className="step-kicker">الخطوة الأولى</span><h1>بيانات سوق الضنية</h1><p>يمكنك قبول البيانات الجاهزة أو تعديلها.</p><div className="form-grid setup-grid"><label className="full">اسم النشاط<input autoFocus value={business.name} onChange={e => update('name', e.target.value)} /></label><label>نوع النشاط<select value={business.type} onChange={e => update('type', e.target.value)}><option>جملة وتجزئة</option><option>متجر تجزئة</option><option>خدمات</option></select></label><label>رقم الهاتف<input value={business.phone} onChange={e => update('phone', e.target.value)} /></label><label className="full">العنوان<input value={business.address} onChange={e => update('address', e.target.value)} /></label><label className="full">الرقم الضريبي <small className="optional">اختياري</small><input value={business.taxNumber} onChange={e => update('taxNumber', e.target.value)} /></label></div></>}
      {step === 2 && <><span className="step-kicker">الخطوة الثانية</span><h1>الهوية الخضراء</h1><p>اللون الأخضر جاهز ويمكنك إضافة شعار المحل.</p><div className="identity-preview"><div className="preview-sidebar"><div className="preview-logo">{business.logo ? <img src={business.logo} alt="شعار النشاط" /> : <img src={logoUrl} alt="سوق الضنية" />}</div><span>{business.name}</span><small>لوحة التحكم</small><small>نقطة البيع</small><small>المنتجات</small></div><div className="preview-content"><div className="preview-topline" /><h3>أهلاً بك 👋</h3><div className="preview-cards"><i /><i /><i /></div></div></div><div className="color-row"><label>اللون الرئيسي<div className="color-options">{['#15803d', '#166534', '#0f766e', '#2563eb'].map(c => <button type="button" key={c} style={{ background: c }} className={business.primaryColor === c ? 'picked' : ''} onClick={() => update('primaryColor', c)} />)}</div></label><LogoUpload value={business.logo} onChange={logo => update('logo', logo)} /></div></>}
      {step === 3 && <><span className="step-kicker">الخطوة الثالثة</span><h1>العملة</h1><p>اختر عملة السجلات قبل إدخال الأسعار.</p><div className="form-grid"><label className="full">العملة<select value={currency.code} onChange={e => update('currency', e.target.value)}>{Object.values(CURRENCIES).filter(c => c.code !== 'LYD').map(c => <option value={c.code} key={c.code}>{c.label} ({c.code})</option>)}</select></label></div><div className="system-settings"><div><span className="setting-leading">{currency.symbol}</span><div><b>{currency.label}</b><small>{currency.decimals ? `${currency.decimals} خانات عشرية` : 'من دون خانات عشرية'}</small></div><Check size={18} className="setting-check" /></div><div><span className="setting-leading">ع</span><div><b>واجهة عربية RTL</b><small>كل العمليات تعمل بلا إنترنت</small></div><Check size={18} className="setting-check" /></div></div><div className="info-note"><Sparkles size={18} /><span>المبالغ تحفظ بدقة ثابتة. تغيير رمز العملة لاحقاً لا يحوّل السجلات القديمة تلقائياً.</span></div></>}
      {step === 4 && <><span className="step-kicker">الخطوة الأخيرة</span><h1>حساب المدير</h1><p>هذا الحساب يحمي الإعدادات والمرتجعات والنسخ الاحتياطي.</p><div className="form-grid setup-grid"><label className="full">اسم المستخدم<input value={user.username} onChange={e => setUser({ ...user, username: e.target.value })} /></label><label className="full">الاسم الظاهر<input value={user.name} onChange={e => setUser({ ...user, name: e.target.value })} /></label><PasswordField id="setup-password" label="كلمة المرور" value={user.password} onChange={password => setUser({ ...user, password })} /><PasswordField id="setup-confirm" label="تأكيد كلمة المرور" value={user.confirm} onChange={confirm => setUser({ ...user, confirm })} /></div><div className="security-note"><ShieldCheck size={19} /><span>تُحفظ بصمة كلمة المرور محلياً. استخدم 8 أحرف على الأقل.</span></div></>}
    </div>{error && <p role="alert" className="form-error">{error}</p>}<div className="setup-actions"><button className="btn text-btn" onClick={() => step > 1 && setStep(step - 1)}>{step > 1 ? 'رجوع' : ''}</button><button className="btn primary setup-next" disabled={busy} onClick={step === 4 ? () => void finish() : next}>{step === 4 ? 'ابدأ باستخدام البرنامج' : 'متابعة'} <ArrowDownToLine size={17} /></button></div><SetupHelp /></div>
  </div>
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose}><X size={18} /></button></div>{children}</div></div> }

export default App
