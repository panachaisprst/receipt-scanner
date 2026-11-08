const messages = {
  en: {
    demo: 'Prototype', workspace: 'Your expense workspace', heading: 'Receipts into expenses.',
    intro: 'Scan a receipt, capture the details, and see your spending add up.',
    running: 'Running total', count: n => `${n} saved ${n === 1 ? 'expense' : 'expenses'}`,
    scanStep: '01 / Capture', scan: 'Scan a receipt', scanCopy: 'Upload one receipt photo or try a sample below.',
    drop: 'Drop a receipt photo here', formats: 'JPG, PNG or WebP · up to 4 MB', choose: 'Choose photo',
    try: 'Try the simulated scan', sample1: 'Thai receipt', sample2: 'Unreadable date',
    notice: 'Cover personal details before uploading. Photos are sent to Google Gemini to read the receipt. Expenses are saved in this browser.',
    ledgerStep: '02 / Track', expenses: 'Your expenses', ledgerCopy: 'Saved purchases, newest first.',
    empty: 'No expenses yet', emptyCopy: 'Try a sample receipt to see how a scan becomes an expense.',
    footer: 'Expenses stored in this browser', cancel: 'Cancel', save: 'Save expense',
    shop: 'Shop name', date: 'Purchase date', amount: 'Total paid (THB)', remove: 'Delete', edit: 'Edit',
    editing: 'Edit expense', reviewing: 'Review receipt', deleting: 'Delete expense?',
    manual: 'Gemini could not read this receipt right now. Enter the details here, or close this form and upload it again to retry.',
    missing: 'Gemini left one or more fields blank. Fill in the missing details to save.',
    sampleMissing: 'The sample has an unreadable date. Fill it in to save.',
    configuration: 'Gemini is temporarily unavailable. You can still enter the details manually.',
    quota: 'Gemini reached its usage limit. Enter the details manually or try again later.',
    deletingCopy: shop => `Remove ${shop} from your expenses and running total?`,
    duplicate: shop => `Already saved · ${shop}`, saved: (shop, amount) => `Saved · ${shop} · ${amount}`,
    updated: 'Expense updated.', removed: 'Expense deleted.',
    processing: 'Reading receipt…', badFile: 'Choose a valid JPG, PNG or WebP image up to 4 MB.',
    single: 'Choose one photo at a time.', storage: 'This browser could not save the expense. Try again.',
    invalid: 'Enter a shop name, a valid purchase date, and an amount in THB.', photoAlt: 'Uploaded receipt preview',
  },
  th: {
    demo: 'ต้นแบบ', workspace: 'พื้นที่บันทึกค่าใช้จ่าย', heading: 'สแกนใบเสร็จ บันทึกค่าใช้จ่าย',
    intro: 'อัปโหลดใบเสร็จ เก็บรายละเอียด และดูยอดใช้จ่ายสะสมได้ในที่เดียว',
    running: 'ยอดใช้จ่ายสะสม', count: n => `บันทึกแล้ว ${n} รายการ`,
    scanStep: '01 / สแกน', scan: 'สแกนใบเสร็จ', scanCopy: 'อัปโหลดรูปใบเสร็จหนึ่งรูป หรือลองใช้ตัวอย่างด้านล่าง',
    drop: 'ลากรูปใบเสร็จมาวางที่นี่', formats: 'JPG, PNG หรือ WebP · ไม่เกิน 4 MB', choose: 'เลือกรูป',
    try: 'ทดลองสแกนด้วยตัวอย่าง', sample1: 'ใบเสร็จภาษาไทย', sample2: 'อ่านวันที่ไม่ได้',
    notice: 'ปิดบังข้อมูลส่วนตัวก่อนอัปโหลด รูปจะถูกส่งให้ Google Gemini อ่านใบเสร็จ ส่วนรายการค่าใช้จ่ายจะบันทึกไว้ในเบราว์เซอร์นี้',
    ledgerStep: '02 / ติดตาม', expenses: 'ค่าใช้จ่ายของคุณ', ledgerCopy: 'รายการที่บันทึกไว้ เรียงจากวันที่ซื้อล่าสุด',
    empty: 'ยังไม่มีค่าใช้จ่าย', emptyCopy: 'ลองสแกนใบเสร็จตัวอย่างเพื่อดูวิธีบันทึกรายการ',
    footer: 'บันทึกรายการไว้ในเบราว์เซอร์นี้', cancel: 'ยกเลิก', save: 'บันทึกค่าใช้จ่าย',
    shop: 'ชื่อร้านค้า', date: 'วันที่ซื้อ', amount: 'ยอดชำระ (บาท)', remove: 'ลบ', edit: 'แก้ไข',
    editing: 'แก้ไขค่าใช้จ่าย', reviewing: 'ตรวจสอบใบเสร็จ', deleting: 'ลบค่าใช้จ่ายนี้หรือไม่?',
    manual: 'ขณะนี้ Gemini อ่านใบเสร็จไม่ได้ คุณสามารถกรอกรายละเอียดเอง หรือปิดแบบฟอร์มแล้วอัปโหลดอีกครั้ง',
    missing: 'Gemini อ่านรายละเอียดได้ไม่ครบ โปรดกรอกช่องที่ว่างก่อนบันทึก',
    sampleMissing: 'ใบเสร็จตัวอย่างอ่านวันที่ไม่ได้ โปรดกรอกวันที่ซื้อก่อนบันทึก',
    configuration: 'ขณะนี้ยังใช้ Gemini ไม่ได้ คุณสามารถกรอกรายละเอียดเองได้',
    quota: 'Gemini ถึงขีดจำกัดการใช้งานแล้ว โปรดกรอกรายละเอียดเองหรือลองใหม่ภายหลัง',
    deletingCopy: shop => `นำรายการ ${shop} ออกจากรายการค่าใช้จ่ายและยอดสะสมหรือไม่?`,
    duplicate: shop => `บันทึกไว้แล้ว · ${shop}`, saved: (shop, amount) => `บันทึกแล้ว · ${shop} · ${amount}`,
    updated: 'แก้ไขค่าใช้จ่ายแล้ว', removed: 'ลบค่าใช้จ่ายแล้ว',
    processing: 'กำลังอ่านใบเสร็จ…', badFile: 'กรุณาเลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 4 MB',
    single: 'กรุณาเลือกครั้งละหนึ่งรูป', storage: 'เบราว์เซอร์บันทึกค่าใช้จ่ายไม่ได้ โปรดลองอีกครั้ง',
    invalid: 'กรุณากรอกชื่อร้าน วันที่ซื้อ และยอดชำระเป็นบาทให้ถูกต้อง', photoAlt: 'ตัวอย่างรูปใบเสร็จที่อัปโหลด',
  },
};

const samples = {
  complete: { fingerprint: 'sample:complete', shop: 'ร้านกาแฟริมทาง', date: '2026-11-06', satang: 9500 },
  incomplete: { fingerprint: 'sample:incomplete', shop: 'ร้านข้าวแกงป้าศรี', date: '', satang: 6500 },
};

const storageKey = 'receipt-scanner.demo.expenses.v1';
const languageKey = 'receipt-scanner.demo.language';
const $ = id => document.getElementById(id);
const dialog = $('dialog');
const form = $('edit-form');
let expenses = readExpenses();
let language = readStorage(languageKey) === 'en' ? 'en' : 'th';
let active = null;
let busy = false;
let status = null;

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readExpenses() {
  try {
    const saved = JSON.parse(readStorage(storageKey) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function t(key, ...args) {
  const value = messages[language][key];
  return typeof value === 'function' ? value(...args) : value;
}

function money(satang) {
  return '฿' + new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(satang / 100);
}

function setStatus(key, ...args) {
  status = key ? { key, args } : null;
  $('status').hidden = !status;
  $('status').textContent = status ? t(status.key, ...status.args) : '';
}

function element(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function renderLedger() {
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  $('total').textContent = money(expenses.reduce((sum, expense) => sum + expense.satang, 0));
  $('count').textContent = t('count', expenses.length);
  $('empty').hidden = expenses.length > 0;

  $('list').replaceChildren(...sorted.map(expense => {
    const row = element('li', '', 'row');
    const date = element('time', expense.date);
    date.dateTime = expense.date;
    const actions = element('div', '', 'row-actions');
    for (const [action, mode] of [['edit', 'edit'], ['remove', 'delete']]) {
      const button = element('button', t(action));
      button.type = 'button';
      button.setAttribute('aria-label', `${t(action)} · ${expense.shop}`);
      button.addEventListener('click', () => { if (!busy) openDialog(mode, expense); });
      actions.append(button);
    }
    row.append(element('strong', expense.shop), element('span', money(expense.satang), 'amount'), date, actions);
    return row;
  }));
}

function renderLanguage() {
  document.documentElement.lang = language;
  document.querySelectorAll('[data-t]').forEach(node => { node.textContent = t(node.dataset.t); });
  document.querySelectorAll('[data-label]').forEach(node => node.setAttribute('aria-label', t(node.dataset.label)));
  document.querySelectorAll('[data-lang]').forEach(node => node.setAttribute('aria-pressed', node.dataset.lang === language));
  renderLedger();
  if (status) setStatus(status.key, ...status.args);
}

function persist(next) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    setStatus('storage');
    return false;
  }
  expenses = next;
  renderLedger();
  return true;
}

function addExpense(fields) {
  expenses = readExpenses();
  const existing = expenses.find(expense => expense.fingerprint === fields.fingerprint);
  if (existing) {
    renderLedger();
    setStatus('duplicate', existing.shop);
    return true;
  }
  const expense = { ...fields, id: crypto.randomUUID(), createdAt: Date.now() };
  if (!persist([...expenses, expense])) return false;
  setStatus('saved', expense.shop, money(expense.satang));
  return true;
}

function openDialog(mode, fields, { url = null, sample = false, note = 'missing' } = {}) {
  active = { mode, fields, url, sample };
  const isDelete = mode === 'delete';
  $('dialog-title').textContent = t(isDelete ? 'deleting' : mode === 'edit' ? 'editing' : 'reviewing');
  $('dialog-copy').textContent = isDelete ? t('deletingCopy', fields.shop) : mode === 'scan' ? t(sample ? 'sampleMissing' : note) : '';
  $('preview').replaceChildren();
  $('preview').hidden = !url && !sample;
  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = t('photoAlt');
    $('preview').append(image);
  } else if (sample) {
    $('preview').append(element('pre', `${fields.shop}\nวันที่  ▓▓ / ▓▓ / ▓▓▓▓\nยอดชำระ  ${money(fields.satang)}`));
  }
  form.hidden = isDelete;
  $('delete-actions').hidden = !isDelete;
  form.elements.shop.value = fields.shop ?? '';
  form.elements.date.value = fields.date ?? '';
  form.elements.amount.value = fields.satang == null ? '' : (fields.satang / 100).toFixed(2);
  dialog.showModal();
  if (mode === 'scan') (sample ? form.elements.date : form.elements.shop).focus();
  if (isDelete) $('keep').focus();
}

dialog.addEventListener('close', () => {
  if (active?.url) URL.revokeObjectURL(active.url);
  $('preview').replaceChildren();
  active = null;
});

for (const id of ['close', 'cancel', 'keep']) $(id).addEventListener('click', () => dialog.close());

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!active) return;
  const shop = form.elements.shop.value.trim();
  const date = form.elements.date.value;
  const satang = Math.round(form.elements.amount.valueAsNumber * 100);
  if (!shop || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isSafeInteger(satang) || satang < 0) {
    setStatus('invalid');
    if (!shop) form.elements.shop.focus();
    return;
  }
  const fields = { ...active.fields, shop, date, satang };
  if (active.mode === 'scan') {
    if (addExpense(fields)) dialog.close();
  } else if (persist(readExpenses().map(expense => expense.id === fields.id ? fields : expense))) {
    dialog.close();
    setStatus('updated');
  }
});

$('confirm-delete').addEventListener('click', () => {
  if (active && persist(readExpenses().filter(expense => expense.id !== active.fields.id))) {
    dialog.close();
    setStatus('removed');
  }
});

async function extractReceipt(file) {
  try {
    const response = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'content-type': file.type },
      body: file,
    });
    const result = await response.json();
    if (response.ok) return { fields: result, note: 'missing' };
    const note = ['configuration', 'quota'].includes(result.error) ? result.error : 'manual';
    return { fields: {}, note };
  } catch {
    return { fields: {}, note: 'manual' };
  }
}

async function upload(file) {
  if (busy || !file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
    setStatus('badFile');
    return;
  }
  busy = true;
  $('pick').disabled = true;
  setStatus('processing');
  let url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    const [digest] = await Promise.all([crypto.subtle.digest('SHA-256', await file.arrayBuffer()), image.decode()]);
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const existing = readExpenses().find(expense => expense.fingerprint === fingerprint);
    if (existing) {
      setStatus('duplicate', existing.shop);
      return;
    }
    const { fields, note } = await extractReceipt(file);
    if (fields.shop && fields.date && Number.isSafeInteger(fields.satang)) {
      addExpense({ fingerprint, ...fields });
      return;
    }
    setStatus(null);
    openDialog('scan', { fingerprint, ...fields }, { url, note });
    url = null;
  } catch {
    setStatus('badFile');
  } finally {
    if (url) URL.revokeObjectURL(url);
    busy = false;
    $('pick').disabled = false;
  }
}

$('pick').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', () => {
  upload($('file').files[0]);
  $('file').value = '';
});
$('drop').addEventListener('dragover', event => {
  event.preventDefault();
  $('drop').classList.add('drag');
});
$('drop').addEventListener('dragleave', () => $('drop').classList.remove('drag'));
$('drop').addEventListener('drop', event => {
  event.preventDefault();
  $('drop').classList.remove('drag');
  if (event.dataTransfer.files.length === 1) upload(event.dataTransfer.files[0]);
  else setStatus('single');
});

document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  const sample = samples[button.dataset.sample];
  const existing = readExpenses().find(expense => expense.fingerprint === sample.fingerprint);
  if (existing) setStatus('duplicate', existing.shop);
  else if (sample.date) addExpense(sample);
  else openDialog('scan', sample, { sample: true });
}));

document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => {
  language = button.dataset.lang;
  try { localStorage.setItem(languageKey, language); } catch { /* The current language still applies. */ }
  renderLanguage();
}));
window.addEventListener('storage', event => {
  if (event.key === storageKey) {
    expenses = readExpenses();
    renderLedger();
  }
});

renderLanguage();
