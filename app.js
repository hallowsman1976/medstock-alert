/* ============================================================
   MedStock Alert — Frontend Application
   File: app.js
   ============================================================ */

'use strict';

// ── App State ─────────────────────────────────────────────
const App = {
  token:       null,
  user:        null,
  currentPage: 'dashboard',
  scanner:     null,
  scanCB:      null,
  drugsList:   [],
  activeTable: null,
};

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('ms_token');
  const user  = JSON.parse(localStorage.getItem('ms_user') || 'null');

  if (token && user) {
    App.token = token;
    App.user  = user;
    showApp();
    navigateTo('dashboard');
  } else {
    showLogin();
  }

  // Clock
  updateClock();
  setInterval(updateClock, 1000);
});

function updateClock() {
  const el = document.getElementById('currentDateTime');
  if (el) el.textContent = new Date().toLocaleString('th-TH');
}

// ── Visibility ────────────────────────────────────────────
function showLogin() {
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('appView').classList.add('hidden');
  setTimeout(() => document.getElementById('loginUsername')?.focus(), 100);
}

function showApp() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');

  // User info
  const u = App.user;
  document.getElementById('sidebarUser').textContent = u.fullName || u.username;
  document.getElementById('sidebarRole').textContent = roleLabel(u.role);
  document.getElementById('userAvatar').textContent  = (u.fullName || u.username)[0].toUpperCase();

  // Show settings nav for admin
  if (u.role === 'admin') {
    document.getElementById('navSettings').classList.remove('hidden');
  }
}

// ── AUTH ──────────────────────────────────────────────────
async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!username || !password) return Swal.fire('แจ้งเตือน','กรุณากรอก Username และ Password','warning');

  showLoading('กำลังเข้าสู่ระบบ...');
  const res = await api('login', { username, password });
  hideLoading();

  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');

  App.token = res.data.token;
  App.user  = res.data.userInfo;
  localStorage.setItem('ms_token', App.token);
  localStorage.setItem('ms_user',  JSON.stringify(App.user));
  showApp();
  navigateTo('dashboard');
}

function logout() {
  Swal.fire({ title:'ออกจากระบบ?', icon:'question',
    showCancelButton:true, confirmButtonText:'ออกจากระบบ', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#dc2626'
  }).then(r => {
    if (!r.isConfirmed) return;
    App.token = null; App.user = null;
    localStorage.removeItem('ms_token');
    localStorage.removeItem('ms_user');
    destroyTable();
    showLogin();
  });
}

function togglePw() {
  const el = document.getElementById('loginPassword');
  el.type = el.type === 'password' ? 'text' : 'password';
}

// ── ROUTER ────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: '🏠 Dashboard', drugs: '💊 ทะเบียนยา',
  receive: '📥 รับยาเข้าคลัง', dispense: '📤 เบิกจ่ายยา',
  lots: '📦 Lot คงคลัง', expiry: '⚠️ แจ้งเตือนหมดอายุ',
  transactions: '📋 ประวัติการเคลื่อนไหว',
  reports: '📊 รายงาน', settings: '⚙️ ตั้งค่าระบบ',
};

async function navigateTo(page) {
  if (page === 'settings' && App.user?.role !== 'admin') {
    return Swal.fire('แจ้งเตือน','ไม่มีสิทธิ์เข้าถึงหน้านี้','warning');
  }

  destroyTable();
  closeSidebar();

  // Hide all sections
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`page${capitalize(page)}`).classList.remove('hidden');

  // Update nav active state
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;
  App.currentPage = page;

  const loaders = {
    dashboard:    loadDashboard,
    drugs:        loadDrugs,
    receive:      loadReceive,
    dispense:     loadDispense,
    lots:         loadLots,
    expiry:       loadExpiry,
    transactions: loadTransactions,
    reports:      loadReports,
    settings:     loadSettings,
  };
  if (loaders[page]) await loaders[page]();
}

// ── API CALL ──────────────────────────────────────────────
async function api(action, payload = {}) {
  try {
    if (App.token) payload.token = App.token;
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
      redirect: 'follow',
    });
    const json = await res.json();
    // Auto-logout on session expiry
    if (!json.success && json.message?.includes('Session หมดอายุ')) {
      localStorage.removeItem('ms_token'); localStorage.removeItem('ms_user');
      showLogin(); Swal.fire('Session หมดอายุ','กรุณาเข้าสู่ระบบใหม่','warning');
    }
    return json;
  } catch(e) {
    return { success: false, message: 'เชื่อมต่อ Server ไม่ได้: ' + e.message, data: null };
  }
}

// ── DASHBOARD ─────────────────────────────────────────────
async function loadDashboard() {
  const el = document.getElementById('pageDashboard');
  el.innerHTML = skeletonCards(8) + '<div class="mt-4">' + skeletonTable() + '</div>';

  const res = await api('getDashboard');
  if (!res.success) return showErr(el, res.message);

  const d = res.data;
  if (d.expired > 0 || d.expiry7 > 0) {
    document.getElementById('alertBadge').classList.remove('hidden');
  }

  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
    ${statCard('💊','ชนิดยาทั้งหมด', d.totalDrugs, 'text-blue-600','bg-blue-50')}
    ${statCard('📦','Lot คงคลัง', d.totalLots, 'text-indigo-600','bg-indigo-50')}
    ${statCard('⚠️','ใกล้หมดอายุ 180 วัน', d.expiry180, 'text-slate-600','bg-slate-50')}
    ${statCard('📉','Stock ต่ำกว่าขั้นต่ำ', d.lowStock, 'text-purple-600','bg-purple-50')}
  </div>

  <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
    ${alertCard('⬇️','≤ 90 วัน', d.expiry90,'badge-low','90')}
    ${alertCard('🔵','≤ 60 วัน', d.expiry60,'badge-medium','60')}
    ${alertCard('🟡','≤ 30 วัน', d.expiry30,'badge-high','30')}
    ${alertCard('🟠','≤ 7 วัน',  d.expiry7, 'badge-critical','7')}
    ${alertCard('🔴','หมดอายุแล้ว', d.expired,'badge-expired','0')}
  </div>

  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
      <h3 class="font-semibold text-slate-700 text-sm">การเคลื่อนไหวล่าสุด</h3>
      <button onclick="navigateTo('transactions')" class="text-blue-600 text-xs hover:underline">ดูทั้งหมด →</button>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="bg-slate-50">
          <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500">วันที่</th>
          <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500">ประเภท</th>
          <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500">ชื่อยา</th>
          <th class="px-3 py-2 text-right text-xs font-semibold text-slate-500">จำนวน</th>
          <th class="px-3 py-2 text-left text-xs font-semibold text-slate-500">ผู้ดำเนินการ</th>
        </tr></thead>
        <tbody>
          ${d.recentTransactions.length === 0
            ? `<tr><td colspan="5" class="text-center py-6 text-slate-400">ยังไม่มีรายการ</td></tr>`
            : d.recentTransactions.map(t => `
              <tr class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-3 py-2 text-slate-500 whitespace-nowrap">${thaiDate(t.TransDate)}</td>
                <td class="px-3 py-2">${typeBadge(t.Type)}</td>
                <td class="px-3 py-2 font-medium text-slate-700">${esc(t.DrugName)}</td>
                <td class="px-3 py-2 text-right font-semibold">${fmtNum(t.Qty)} ${esc(t.Unit)}</td>
                <td class="px-3 py-2 text-slate-500">${esc(t.CreatedBy)}</td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function statCard(icon, label, value, textCls, bgCls) {
  return `<div class="stat-card">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-xs text-slate-500 font-medium mb-1">${label}</p>
        <p class="text-2xl font-bold ${textCls}">${fmtNum(value)}</p>
      </div>
      <div class="w-10 h-10 ${bgCls} rounded-xl flex items-center justify-center text-xl">${icon}</div>
    </div>
  </div>`;
}

function alertCard(icon, label, value, badge, days) {
  return `<div class="stat-card cursor-pointer hover:scale-105" onclick="navigateTo('expiry')">
    <div class="text-center">
      <div class="text-2xl mb-1">${icon}</div>
      <p class="text-2xl font-bold text-slate-700">${fmtNum(value)}</p>
      <p class="text-xs text-slate-500 mt-1">${label}</p>
    </div>
  </div>`;
}

// ── DRUGS ─────────────────────────────────────────────────
async function loadDrugs() {
  const el = document.getElementById('pageDrugs');
  el.innerHTML = `
  <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
    <div class="flex gap-2 flex-wrap">
      ${App.user.role === 'admin' ? `<button onclick="openDrugModal()" class="btn btn-primary btn-sm">➕ เพิ่มยา</button>` : ''}
      <button onclick="openBarcodeScanner(bc=>searchDrugByBarcode(bc))" class="btn btn-secondary btn-sm">📷 สแกน Barcode</button>
    </div>
    <span id="drugCount" class="text-xs text-slate-400"></span>
  </div>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="overflow-x-auto p-3">
      ${skeletonTable()}
    </div>
  </div>`;

  showLoading('กำลังโหลดรายการยา...');
  const res = await api('getDrugs');
  hideLoading();

  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');
  App.drugsList = res.data;
  renderDrugsTable(res.data);
}

function renderDrugsTable(drugs) {
  const el = document.getElementById('pageDrugs');
  const tbody = drugs.map(d => {
    const qty    = parseFloat(d.TotalQty) || 0;
    const min    = parseFloat(d.MinStock) || 0;
    const lowCls = qty <= min ? 'text-red-600 font-bold' : '';
    return `<tr>
      <td class="px-3 py-2 text-xs text-slate-400">${esc(d.DrugCode)}</td>
      <td class="px-3 py-2">
        <div class="font-medium text-slate-700">${esc(d.DrugName)}</div>
        <div class="text-xs text-slate-400">${esc(d.GenericName)}</div>
      </td>
      <td class="px-3 py-2 text-xs">${esc(d.Barcode)}</td>
      <td class="px-3 py-2 text-xs">${esc(d.Strength)}</td>
      <td class="px-3 py-2 text-xs text-center ${lowCls}">${fmtNum(qty)}</td>
      <td class="px-3 py-2 text-xs text-center">${fmtNum(d.MinStock)}</td>
      <td class="px-3 py-2 text-xs text-center">${esc(d.Unit)}</td>
      <td class="px-3 py-2 text-xs text-center">${statusBadge(d.Status)}</td>
      <td class="px-3 py-2 text-center">
        <div class="flex gap-1 justify-center flex-wrap">
          <button onclick="viewDrugLots('${d.DrugID}','${esc(d.DrugName)}')" class="btn btn-outline btn-xs">📦 Lot</button>
          ${App.user.role !== 'viewer' ? `
            <button onclick="openReceiveForDrug('${d.DrugID}','${esc(d.DrugName)}','${esc(d.Barcode)}','${esc(d.Unit)}')" class="btn btn-success btn-xs">📥</button>
            <button onclick="openDispenseForDrug('${d.DrugID}','${esc(d.DrugName)}','${esc(d.Barcode)}')" class="btn btn-warning btn-xs">📤</button>
          ` : ''}
          ${App.user.role === 'admin' ? `
            <button onclick="openDrugModal(${JSON.stringify(d).replace(/"/g,'&quot;')})" class="btn btn-secondary btn-xs">✏️</button>
            <button onclick="confirmDeleteDrug('${d.DrugID}','${esc(d.DrugName)}')" class="btn btn-danger btn-xs">🗑</button>
          ` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('pageDrugs').innerHTML = `
  <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
    <div class="flex gap-2 flex-wrap">
      ${App.user.role === 'admin' ? `<button onclick="openDrugModal()" class="btn btn-primary btn-sm">➕ เพิ่มยา</button>` : ''}
      <button onclick="openBarcodeScanner(bc=>searchDrugByBarcode(bc))" class="btn btn-secondary btn-sm">📷 สแกน Barcode</button>
    </div>
    <span class="text-xs text-slate-400">ทั้งหมด ${drugs.length} รายการ</span>
  </div>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="overflow-x-auto p-3">
      <table id="drugsTable" class="table-auto w-full text-sm">
        <thead><tr>
          <th class="px-3 py-2 text-left whitespace-nowrap">Code</th>
          <th class="px-3 py-2 text-left">ชื่อยา</th>
          <th class="px-3 py-2 text-left">Barcode</th>
          <th class="px-3 py-2 text-left">ความแรง</th>
          <th class="px-3 py-2 text-center">คงคลัง</th>
          <th class="px-3 py-2 text-center">ขั้นต่ำ</th>
          <th class="px-3 py-2 text-center">หน่วย</th>
          <th class="px-3 py-2 text-center">สถานะ</th>
          <th class="px-3 py-2 text-center">จัดการ</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  </div>`;

  destroyTable();
  App.activeTable = new DataTable('#drugsTable', dtOpts());
}

async function searchDrugByBarcode(barcode) {
  showLoading('ค้นหา Barcode...');
  const res = await api('getDrugByBarcode', { barcode });
  hideLoading();
  if (!res.success) return Swal.fire('ไม่พบข้อมูล', res.message, 'warning');

  const { drug, lots } = res.data;
  const lotsHtml = lots.length
    ? lots.map(l => `<tr><td class="px-2 py-1 text-xs">${l.LotNo}</td>
        <td class="px-2 py-1 text-xs">${thaiDate(l.ExpireDate)}</td>
        <td class="px-2 py-1 text-xs text-center font-bold">${l.QtyBalance}</td>
        <td class="px-2 py-1 text-xs text-center">${alertBadge(parseInt(l.DaysLeft))}</td></tr>`).join('')
    : `<tr><td colspan="4" class="text-center py-2 text-slate-400 text-xs">ไม่มี Lot ในคลัง</td></tr>`;

  Swal.fire({
    title: '💊 ' + drug.DrugName,
    html: `
      <div class="text-left text-sm space-y-1">
        <p><b>Barcode:</b> ${drug.Barcode}</p>
        <p><b>Generic:</b> ${drug.GenericName}</p>
        <p><b>ความแรง:</b> ${drug.Strength}</p>
        <hr class="my-2"/>
        <p class="font-semibold text-xs text-slate-500 mb-1">LOT ในคลัง:</p>
        <table class="w-full border-collapse text-xs">
          <thead><tr class="bg-slate-100"><th class="px-2 py-1 text-left">Lot</th><th class="px-2 py-1 text-left">หมดอายุ</th><th class="px-2 py-1 text-center">คงเหลือ</th><th class="px-2 py-1 text-center">สถานะ</th></tr></thead>
          <tbody>${lotsHtml}</tbody>
        </table>
      </div>`,
    width: 480, confirmButtonText: 'ปิด',
  });
}

// Drug Modal
function openDrugModal(drug = null) {
  document.getElementById('drugModalTitle').textContent = drug ? '✏️ แก้ไขรายการยา' : '➕ เพิ่มรายการยา';
  document.getElementById('drugFormID').value      = drug?.DrugID  || '';
  document.getElementById('drugBarcode').value     = drug?.Barcode || '';
  document.getElementById('drugCode').value        = drug?.DrugCode|| '';
  document.getElementById('drugName').value        = drug?.DrugName|| '';
  document.getElementById('drugGeneric').value     = drug?.GenericName||'';
  document.getElementById('drugStrength').value    = drug?.Strength||'';
  document.getElementById('drugUnit').value        = drug?.Unit    ||'';
  document.getElementById('drugMinStock').value    = drug?.MinStock||0;
  document.getElementById('drugStatus').value      = drug?.Status  ||'Active';
  document.getElementById('drugModal').classList.remove('hidden');
}

function closeDrugModal() { document.getElementById('drugModal').classList.add('hidden'); }

async function submitDrugForm() {
  const payload = {
    DrugID:     document.getElementById('drugFormID').value,
    Barcode:    document.getElementById('drugBarcode').value.trim(),
    DrugCode:   document.getElementById('drugCode').value.trim(),
    DrugName:   document.getElementById('drugName').value.trim(),
    GenericName:document.getElementById('drugGeneric').value.trim(),
    Strength:   document.getElementById('drugStrength').value.trim(),
    Unit:       document.getElementById('drugUnit').value.trim(),
    MinStock:   document.getElementById('drugMinStock').value,
    Status:     document.getElementById('drugStatus').value,
  };
  if (!payload.Barcode || !payload.DrugName || !payload.Unit)
    return Swal.fire('แจ้งเตือน','กรุณากรอก Barcode, ชื่อยา และหน่วย','warning');

  showLoading('กำลังบันทึก...');
  const res = await api('saveDrug', payload);
  hideLoading();

  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');
  closeDrugModal();
  Swal.fire({ icon:'success', title:res.message, timer:1500, showConfirmButton:false });
  await loadDrugs();
}

async function confirmDeleteDrug(drugID, drugName) {
  const r = await Swal.fire({
    title: 'ลบรายการยา?', text: drugName, icon: 'warning',
    showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
  });
  if (!r.isConfirmed) return;
  showLoading('กำลังลบ...');
  const res = await api('deleteDrug', { DrugID: drugID });
  hideLoading();
  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');
  Swal.fire({ icon:'success', title:res.message, timer:1200, showConfirmButton:false });
  await loadDrugs();
}

// ── LOTS PAGE ─────────────────────────────────────────────
async function loadLots() {
  const el = document.getElementById('pageLots');
  el.innerHTML = `
  <div class="flex gap-2 mb-4 flex-wrap">
    <button onclick="openBarcodeScanner(bc=>filterLotsByBarcode(bc))" class="btn btn-secondary btn-sm">📷 สแกน Barcode</button>
    <button onclick="loadLots()" class="btn btn-outline btn-sm">🔄 รีเฟรช</button>
  </div>` + skeletonTable();

  showLoading('กำลังโหลด Lot...');
  const res = await api('getLots', {});
  hideLoading();
  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');
  renderLotsTable(res.data, 'pageLots');
}

async function viewDrugLots(drugID, drugName) {
  navigateTo('lots');
  showLoading('กำลังโหลด Lot...');
  const res = await api('getLots', { drugID });
  hideLoading();
  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');

  document.getElementById('pageTitle').textContent = `📦 Lot — ${drugName}`;
  renderLotsTable(res.data, 'pageLots');
}

async function filterLotsByBarcode(barcode) {
  showLoading('ค้นหา...');
  const dRes = await api('getDrugByBarcode', { barcode });
  if (!dRes.success) { hideLoading(); return Swal.fire('ไม่พบ Barcode', dRes.message, 'warning'); }
  const res = await api('getLots', { drugID: dRes.data.drug.DrugID });
  hideLoading();
  if (!res.success) return;
  document.getElementById('pageTitle').textContent = `📦 Lot — ${dRes.data.drug.DrugName}`;
  renderLotsTable(res.data, 'pageLots');
}

function renderLotsTable(lots, containerId) {
  const tbody = lots.map(l => {
    const rowCls = l.AlertLevel === 'EXPIRED' ? 'row-expired' :
                   l.AlertLevel === 'CRITICAL' ? 'row-critical' :
                   l.AlertLevel === 'HIGH'     ? 'row-high' : '';
    return `<tr class="${rowCls}">
      <td class="px-3 py-2 text-xs font-medium">${esc(l.LotID)}</td>
      <td class="px-3 py-2 font-medium text-slate-700">${esc(l.DrugName)}</td>
      <td class="px-3 py-2 text-xs">${esc(l.LotNo)}</td>
      <td class="px-3 py-2 text-xs">${thaiDate(l.ExpireDate)}</td>
      <td class="px-3 py-2 text-center font-bold">${fmtNum(l.QtyBalance)}</td>
      <td class="px-3 py-2 text-xs text-center">${esc(l.Unit)}</td>
      <td class="px-3 py-2 text-xs text-center">${esc(l.Location)}</td>
      <td class="px-3 py-2 text-center">${alertBadge(parseInt(l.DaysLeft))}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="text-center py-6 text-slate-400">ไม่มีข้อมูล</td></tr>`;

  const el = document.getElementById(containerId);
  el.innerHTML = `
  <div class="flex gap-2 mb-4 flex-wrap">
    <button onclick="openBarcodeScanner(bc=>filterLotsByBarcode(bc))" class="btn btn-secondary btn-sm">📷 สแกน Barcode</button>
    <button onclick="loadLots()" class="btn btn-outline btn-sm">🔄 รีเฟรช</button>
    <span class="self-center text-xs text-slate-400">${lots.length} Lot</span>
  </div>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="overflow-x-auto p-3">
      <table id="lotsTable" class="table-auto w-full text-sm">
        <thead><tr>
          <th class="px-3 py-2 text-left">Lot ID</th>
          <th class="px-3 py-2 text-left">ชื่อยา</th>
          <th class="px-3 py-2 text-left">Lot No.</th>
          <th class="px-3 py-2 text-left">วันหมดอายุ</th>
          <th class="px-3 py-2 text-center">คงเหลือ</th>
          <th class="px-3 py-2 text-center">หน่วย</th>
          <th class="px-3 py-2 text-center">ที่เก็บ</th>
          <th class="px-3 py-2 text-center">สถานะ</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  </div>`;

  destroyTable();
  App.activeTable = new DataTable('#lotsTable', dtOpts());
}

// ── RECEIVE STOCK ─────────────────────────────────────────
async function loadReceive() {
  const el = document.getElementById('pageReceive');
  showLoading('โหลดรายการยา...');
  const res = await api('getDrugs');
  hideLoading();
  if (!res.success) return showErr(el, res.message);
  App.drugsList = res.data;

  el.innerHTML = `
  <div class="max-w-lg mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="bg-green-700 px-5 py-4">
      <h3 class="text-white font-semibold text-base">📥 รับยาเข้าคลัง</h3>
      <p class="text-green-100 text-xs mt-1">สแกน Barcode หรือเลือกยาจากรายการ</p>
    </div>
    <div class="p-5 space-y-3" id="receiveInlineForm">
      ${receiveFormHTML(null, res.data)}
    </div>
  </div>`;
}

function receiveFormHTML(drug, drugs) {
  const drugOpts = (drugs || App.drugsList).map(d =>
    `<option value="${d.DrugID}" data-barcode="${d.Barcode}" data-unit="${d.Unit}">${d.DrugName} (${d.Barcode})</option>`
  ).join('');

  return `
  <div>
    <label class="form-label">เลือกยา <span class="text-red-500">*</span></label>
    <div class="flex gap-2">
      <select id="rcvDrugID" class="form-input form-select flex-1" onchange="onReceiveDrugChange()">
        <option value="">— เลือกรายการยา —</option>
        ${drugOpts}
      </select>
      <button onclick="openBarcodeScanner(bc=>autoSelectDrugByBarcode(bc,'rcvDrugID'))" class="btn btn-secondary btn-sm whitespace-nowrap">📷</button>
    </div>
  </div>
  <div id="rcvDrugInfo" class="hidden text-xs text-slate-500 bg-slate-50 rounded-lg p-3"></div>
  <div class="grid grid-cols-2 gap-3">
    <div>
      <label class="form-label">Lot No. <span class="text-red-500">*</span></label>
      <input id="rcvLotNo" type="text" class="form-input" placeholder="เลขที่ Lot"/>
    </div>
    <div>
      <label class="form-label">วันหมดอายุ <span class="text-red-500">*</span></label>
      <input id="rcvExpireDate" type="date" class="form-input"/>
    </div>
    <div>
      <label class="form-label">จำนวน <span class="text-red-500">*</span></label>
      <input id="rcvQty" type="number" class="form-input" placeholder="0" min="1"/>
    </div>
    <div>
      <label class="form-label">หน่วย</label>
      <input id="rcvUnit" type="text" class="form-input" placeholder="หน่วย"/>
    </div>
  </div>
  <div>
    <label class="form-label">สถานที่เก็บ</label>
    <input id="rcvLocation" type="text" class="form-input" placeholder="เช่น ห้องยา ชั้น 2 ตู้ A"/>
  </div>
  <div>
    <label class="form-label">หมายเหตุ</label>
    <input id="rcvNote" type="text" class="form-input" placeholder="หมายเหตุเพิ่มเติม"/>
  </div>
  <div class="flex gap-2 pt-2">
    <button onclick="submitReceive()" class="btn btn-success flex-1 justify-center">📥 บันทึกรับยา</button>
    <button onclick="clearReceiveForm()" class="btn btn-secondary btn-sm">🔄 ล้าง</button>
  </div>`;
}

function onReceiveDrugChange() {
  const sel  = document.getElementById('rcvDrugID');
  const opt  = sel.options[sel.selectedIndex];
  const unit = opt?.dataset?.unit || '';
  if (document.getElementById('rcvUnit')) document.getElementById('rcvUnit').value = unit;
  const drug = App.drugsList.find(d => d.DrugID === sel.value);
  const info = document.getElementById('rcvDrugInfo');
  if (drug && info) {
    info.classList.remove('hidden');
    info.innerHTML = `<b>${drug.DrugName}</b> | ${drug.GenericName} | ${drug.Strength} | คงคลัง: <b>${drug.TotalQty} ${drug.Unit}</b>`;
  } else if (info) info.classList.add('hidden');
}

async function autoSelectDrugByBarcode(barcode, selectId) {
  showLoading('ค้นหา...');
  const res = await api('getDrugByBarcode', { barcode });
  hideLoading();
  if (!res.success) return Swal.fire('ไม่พบยา', res.message, 'warning');

  const sel = document.getElementById(selectId);
  if (sel) {
    sel.value = res.data.drug.DrugID;
    sel.dispatchEvent(new Event('change'));
  }
}

function clearReceiveForm() {
  ['rcvDrugID','rcvLotNo','rcvExpireDate','rcvQty','rcvUnit','rcvLocation','rcvNote']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
}

async function submitReceive() {
  const drugID     = document.getElementById('rcvDrugID').value;
  const lotNo      = document.getElementById('rcvLotNo').value.trim();
  const expireDate = document.getElementById('rcvExpireDate').value;
  const qty        = parseFloat(document.getElementById('rcvQty').value) || 0;
  const unit       = document.getElementById('rcvUnit').value.trim();
  const location   = document.getElementById('rcvLocation')?.value || '';
  const note       = document.getElementById('rcvNote')?.value || '';
  const sel        = document.getElementById('rcvDrugID');
  const barcode    = sel?.options[sel?.selectedIndex]?.dataset?.barcode || '';

  if (!drugID || !lotNo || !expireDate || qty <= 0)
    return Swal.fire('แจ้งเตือน','กรุณากรอกข้อมูลให้ครบ (เลือกยา, Lot, วันหมดอายุ, จำนวน)','warning');

  const exp = new Date(expireDate);
  if (exp <= new Date()) {
    const r = await Swal.fire({ title:'ยาหมดอายุแล้ว!', text:'วันหมดอายุที่ระบุผ่านไปแล้ว ยืนยันรับเข้าคลัง?',
      icon:'warning', showCancelButton:true, confirmButtonText:'ยืนยัน', cancelButtonText:'ยกเลิก' });
    if (!r.isConfirmed) return;
  }

  showLoading('กำลังบันทึก...');
  const res = await api('saveReceiveStock', { drugID, barcode, lotNo, expireDate, qty, unit, location, note });
  hideLoading();

  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');
  Swal.fire({ icon:'success', title:'รับยาเข้าคลังสำเร็จ', text:`Lot: ${lotNo} จำนวน ${qty} ${unit}`, timer:2000 });
  clearReceiveForm();
}

// Quick open from drugs table
function openReceiveForDrug(drugID, drugName, barcode, unit) {
  navigateTo('receive');
  setTimeout(() => {
    const sel = document.getElementById('rcvDrugID');
    if (sel) { sel.value = drugID; sel.dispatchEvent(new Event('change')); }
    const uEl = document.getElementById('rcvUnit');
    if (uEl) uEl.value = unit;
  }, 300);
}

// ── DISPENSE STOCK ────────────────────────────────────────
async function loadDispense() {
  const el = document.getElementById('pageDispense');
  showLoading('โหลดรายการยา...');
  const res = await api('getDrugs');
  hideLoading();
  if (!res.success) return showErr(el, res.message);
  App.drugsList = res.data;

  el.innerHTML = `
  <div class="max-w-lg mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="bg-orange-700 px-5 py-4">
      <h3 class="text-white font-semibold text-base">📤 เบิกจ่ายยา</h3>
      <p class="text-orange-100 text-xs mt-1">ระบบ FEFO — จ่ายจาก Lot ที่ใกล้หมดอายุก่อน</p>
    </div>
    <div class="p-5 space-y-3">
      <div>
        <label class="form-label">เลือกยา <span class="text-red-500">*</span></label>
        <div class="flex gap-2">
          <select id="dspDrugID" class="form-input form-select flex-1" onchange="onDispenseDrugChange()">
            <option value="">— เลือกรายการยา —</option>
            ${res.data.map(d=>`<option value="${d.DrugID}" data-barcode="${d.Barcode}" data-unit="${d.Unit}">${d.DrugName} (${d.Barcode})</option>`).join('')}
          </select>
          <button onclick="openBarcodeScanner(bc=>autoSelectDrugByBarcode(bc,'dspDrugID'))" class="btn btn-secondary btn-sm">📷</button>
        </div>
      </div>
      <div id="dspLotPreview" class="hidden">
        <p class="text-xs font-semibold text-slate-500 mb-1">Lot ที่จะถูกเบิกก่อน (FEFO):</p>
        <div id="dspLotList" class="space-y-1"></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label">จำนวนที่ต้องการเบิก <span class="text-red-500">*</span></label>
          <input id="dspQty" type="number" class="form-input" placeholder="0" min="1"/>
        </div>
        <div>
          <label class="form-label">หน่วย</label>
          <input id="dspUnit" type="text" class="form-input" readonly placeholder="อัตโนมัติ"/>
        </div>
      </div>
      <div>
        <label class="form-label">ผู้รับยา</label>
        <input id="dspReceiver" type="text" class="form-input" placeholder="ชื่อผู้รับยา"/>
      </div>
      <div>
        <label class="form-label">แผนก</label>
        <input id="dspDept" type="text" class="form-input" placeholder="แผนก / หน่วยงาน"/>
      </div>
      <div>
        <label class="form-label">หมายเหตุ</label>
        <input id="dspNote" type="text" class="form-input" placeholder="หมายเหตุ"/>
      </div>
      <button onclick="submitDispense()" class="btn btn-warning w-full justify-center py-3">📤 ยืนยันเบิกจ่าย</button>
    </div>
  </div>`;
}

async function onDispenseDrugChange() {
  const sel    = document.getElementById('dspDrugID');
  const drugID = sel.value;
  const opt    = sel.options[sel.selectedIndex];
  const unit   = opt?.dataset?.unit || '';
  if (document.getElementById('dspUnit')) document.getElementById('dspUnit').value = unit;

  if (!drugID) return;
  const res = await api('getLots', { drugID });
  if (!res.success) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const valid = res.data.filter(l => parseFloat(l.QtyBalance) > 0 && new Date(l.ExpireDate) >= today);
  const total = valid.reduce((s,l) => s + parseFloat(l.QtyBalance), 0);

  const preview = document.getElementById('dspLotPreview');
  const list    = document.getElementById('dspLotList');
  if (!preview || !list) return;

  preview.classList.remove('hidden');
  list.innerHTML = valid.length
    ? `<div class="text-xs text-slate-500 mb-1">คงคลังรวม: <b class="text-slate-700">${fmtNum(total)} ${unit}</b></div>` +
      valid.map(l => `
        <div class="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-xs">
          <span class="font-medium">Lot: ${l.LotNo}</span>
          <span>หมดอายุ: ${thaiDate(l.ExpireDate)} ${alertBadge(parseInt(l.DaysLeft))}</span>
          <span class="font-bold">${l.QtyBalance} ${unit}</span>
        </div>`).join('')
    : '<div class="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">ไม่มียาในคลัง</div>';
}

async function submitDispense() {
  const drugID   = document.getElementById('dspDrugID').value;
  const qty      = parseFloat(document.getElementById('dspQty').value) || 0;
  const receiver = document.getElementById('dspReceiver').value.trim();
  const dept     = document.getElementById('dspDept').value.trim();
  const note     = document.getElementById('dspNote').value.trim();
  const sel      = document.getElementById('dspDrugID');
  const barcode  = sel?.options[sel?.selectedIndex]?.dataset?.barcode || '';
  const unit     = document.getElementById('dspUnit').value;
  const drugName = sel?.options[sel?.selectedIndex]?.text || '';

  if (!drugID || qty <= 0)
    return Swal.fire('แจ้งเตือน','กรุณาเลือกยาและระบุจำนวน','warning');

  const conf = await Swal.fire({
    title: 'ยืนยันเบิกจ่ายยา?',
    html: `ยา: <b>${drugName}</b><br>จำนวน: <b>${qty} ${unit}</b><br>ผู้รับ: ${receiver||'-'}`,
    icon: 'question', showCancelButton:true,
    confirmButtonText:'ยืนยัน', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#d97706',
  });
  if (!conf.isConfirmed) return;

  showLoading('กำลังบันทึก...');
  const res = await api('saveDispenseStock', { drugID, barcode, qty, receiver, department: dept, note });
  hideLoading();

  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');

  const detail = res.data.dispatched.map(d =>
    `Lot: ${d.lotNo} — ${d.qty} ${unit} (หมดอายุ ${thaiDate(d.expireDate)})`
  ).join('<br/>');

  Swal.fire({ icon:'success', title:'เบิกจ่ายสำเร็จ',
    html:`<div class="text-sm text-left">${detail}</div>`, timer:3000 });

  // Reset
  document.getElementById('dspDrugID').value = '';
  ['dspQty','dspReceiver','dspDept','dspNote','dspUnit'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value='';
  });
  const prev = document.getElementById('dspLotPreview');
  if (prev) prev.classList.add('hidden');
}

function openDispenseForDrug(drugID, drugName, barcode) {
  navigateTo('dispense');
  setTimeout(() => {
    const sel = document.getElementById('dspDrugID');
    if (sel) { sel.value = drugID; sel.dispatchEvent(new Event('change')); }
  }, 300);
}

// ── EXPIRY ALERTS ─────────────────────────────────────────
async function loadExpiry() {
  const el = document.getElementById('pageExpiry');
  el.innerHTML = `
  <div class="flex gap-2 mb-4 flex-wrap items-center">
    <span class="text-sm font-medium text-slate-600">แสดงยาที่หมดอายุภายใน:</span>
    ${[7,30,60,90,180].map(d=>`<button onclick="loadExpiryDays(${d})" class="btn btn-secondary btn-sm" id="expiryBtn${d}">${d} วัน</button>`).join('')}
    <button onclick="loadExpiryDays(0)" class="btn btn-danger btn-sm" id="expiryBtn0">หมดอายุแล้ว</button>
    ${App.user.role === 'admin' ? `<button onclick="runLineNotify()" class="btn btn-outline btn-sm ml-auto">📲 แจ้งเตือน LINE</button>` : ''}
  </div>
  <div id="expiryContent">${skeletonTable()}</div>`;

  await loadExpiryDays(180);
}

async function loadExpiryDays(days) {
  document.querySelectorAll('[id^=expiryBtn]').forEach(b => b.classList.remove('bg-blue-600','text-white'));
  document.getElementById(`expiryBtn${days}`)?.classList.add('bg-blue-600','text-white');

  showLoading('กำลังโหลด...');
  const res = await api('getExpiryList', { days: days === 0 ? -9999 : days });
  hideLoading();

  const el = document.getElementById('expiryContent');
  if (!res.success) return showErr(el, res.message);

  const list = days === 0 ? res.data.filter(l => parseInt(l.DaysLeft) < 0) : res.data;

  if (list.length === 0) {
    el.innerHTML = `<div class="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
      <div class="text-4xl mb-2">✅</div>
      <p class="text-green-700 font-medium">ไม่พบยาที่ใกล้หมดอายุในช่วงนี้</p>
    </div>`;
    return;
  }

  const tbody = list.map(l => {
    const rowCls = l.AlertLevel === 'EXPIRED' ? 'row-expired' :
                   l.AlertLevel === 'CRITICAL' ? 'row-critical' :
                   l.AlertLevel === 'HIGH'     ? 'row-high' : '';
    return `<tr class="${rowCls}">
      <td class="px-3 py-2 font-medium text-slate-700">${esc(l.DrugName)}</td>
      <td class="px-3 py-2 text-xs">${esc(l.LotNo)}</td>
      <td class="px-3 py-2 text-xs">${esc(l.Barcode)}</td>
      <td class="px-3 py-2 text-xs">${thaiDate(l.ExpireDate)}</td>
      <td class="px-3 py-2 text-center">${alertBadge(parseInt(l.DaysLeft))}</td>
      <td class="px-3 py-2 text-center font-bold">${fmtNum(l.QtyBalance)}</td>
      <td class="px-3 py-2 text-xs text-center">${esc(l.Unit)}</td>
      <td class="px-3 py-2 text-xs text-center">${esc(l.Location)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
  <div class="flex items-center justify-between mb-2">
    <span class="text-sm text-slate-500">พบ <b>${list.length}</b> รายการ</span>
    <button onclick="exportCSV(${JSON.stringify(list).replace(/</g,'\\u003c')},'expiry_alert')" class="btn btn-secondary btn-xs">⬇️ Export CSV</button>
  </div>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="overflow-x-auto p-3">
      <table id="expiryTable" class="table-auto w-full text-sm">
        <thead><tr>
          <th class="px-3 py-2 text-left">ชื่อยา</th>
          <th class="px-3 py-2 text-left">Lot No.</th>
          <th class="px-3 py-2 text-left">Barcode</th>
          <th class="px-3 py-2 text-left">วันหมดอายุ</th>
          <th class="px-3 py-2 text-center">วันคงเหลือ</th>
          <th class="px-3 py-2 text-center">คงเหลือ</th>
          <th class="px-3 py-2 text-center">หน่วย</th>
          <th class="px-3 py-2 text-center">ที่เก็บ</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  </div>`;

  destroyTable();
  App.activeTable = new DataTable('#expiryTable', dtOpts({ pageLength: 25 }));
}

async function runLineNotify() {
  showLoading('กำลังตรวจสอบและส่ง LINE...');
  const res = await api('checkExpiredDrugsAndNotify');
  hideLoading();
  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');
  Swal.fire({ icon:'success', title:'เสร็จสิ้น', text: res.message });
}

// ── TRANSACTIONS ─────────────────────────────────────────
async function loadTransactions() {
  const el = document.getElementById('pageTransactions');
  el.innerHTML = `
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div>
        <label class="form-label">ประเภท</label>
        <select id="txType" class="form-input form-select">
          <option value="">ทั้งหมด</option>
          <option value="RECEIVE">รับเข้า</option>
          <option value="DISPENSE">เบิกจ่าย</option>
        </select>
      </div>
      <div>
        <label class="form-label">จากวันที่</label>
        <input id="txFrom" type="date" class="form-input"/>
      </div>
      <div>
        <label class="form-label">ถึงวันที่</label>
        <input id="txTo" type="date" class="form-input"/>
      </div>
      <div class="flex items-end">
        <button onclick="searchTransactions()" class="btn btn-primary w-full justify-center">🔍 ค้นหา</button>
      </div>
    </div>
  </div>
  <div id="txContent">${skeletonTable()}</div>`;

  // Default: today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('txFrom').value = new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
  document.getElementById('txTo').value   = today;
  await searchTransactions();
}

async function searchTransactions() {
  const payload = {
    type:     document.getElementById('txType')?.value || '',
    dateFrom: document.getElementById('txFrom')?.value || '',
    dateTo:   document.getElementById('txTo')?.value   || '',
    limit:    500,
  };

  showLoading('กำลังโหลด...');
  const res = await api('getTransactions', payload);
  hideLoading();

  const el = document.getElementById('txContent');
  if (!res.success) return showErr(el, res.message);

  const data = res.data;
  const tbody = data.map(t => `<tr>
    <td class="px-3 py-2 text-xs whitespace-nowrap">${thaiDate(t.TransDate)}</td>
    <td class="px-3 py-2">${typeBadge(t.Type)}</td>
    <td class="px-3 py-2 font-medium text-slate-700 text-sm">${esc(t.DrugName)}</td>
    <td class="px-3 py-2 text-xs">${esc(t.LotNo)}</td>
    <td class="px-3 py-2 text-center font-bold">${fmtNum(t.Qty)}</td>
    <td class="px-3 py-2 text-xs text-center">${esc(t.Unit)}</td>
    <td class="px-3 py-2 text-xs">${esc(t.Receiver)||'-'}</td>
    <td class="px-3 py-2 text-xs">${esc(t.Department)||'-'}</td>
    <td class="px-3 py-2 text-xs text-slate-400">${esc(t.CreatedBy)}</td>
    <td class="px-3 py-2 text-xs text-slate-400">${esc(t.Note)||'-'}</td>
  </tr>`).join('') || `<tr><td colspan="10" class="text-center py-6 text-slate-400">ไม่พบข้อมูล</td></tr>`;

  el.innerHTML = `
  <div class="flex items-center justify-between mb-2">
    <span class="text-sm text-slate-500">พบ <b>${data.length}</b> รายการ</span>
    <button onclick="exportCSV(${JSON.stringify(data).replace(/</g,'\\u003c')},'transactions')" class="btn btn-secondary btn-xs">⬇️ Export CSV</button>
  </div>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="overflow-x-auto p-3">
      <table id="txTable" class="table-auto w-full text-sm">
        <thead><tr>
          <th class="px-3 py-2 text-left whitespace-nowrap">วันที่</th>
          <th class="px-3 py-2 text-left">ประเภท</th>
          <th class="px-3 py-2 text-left">ชื่อยา</th>
          <th class="px-3 py-2 text-left">Lot</th>
          <th class="px-3 py-2 text-center">จำนวน</th>
          <th class="px-3 py-2 text-center">หน่วย</th>
          <th class="px-3 py-2 text-left">ผู้รับ</th>
          <th class="px-3 py-2 text-left">แผนก</th>
          <th class="px-3 py-2 text-left">ผู้บันทึก</th>
          <th class="px-3 py-2 text-left">หมายเหตุ</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  </div>`;

  destroyTable();
  App.activeTable = new DataTable('#txTable', dtOpts({ pageLength:25 }));
}

// ── REPORTS ───────────────────────────────────────────────
async function loadReports() {
  const el = document.getElementById('pageReports');
  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
    ${reportCard('📦','รายงานคงคลัง','stock')}
    ${reportCard('📉','Stock ต่ำกว่าขั้นต่ำ','lowstock')}
    ${reportCard('📥','รับเข้า','RECEIVE')}
    ${reportCard('📤','เบิกจ่าย','DISPENSE')}
  </div>
  <div id="reportContent"></div>`;
}

function reportCard(icon, label, type) {
  return `<div class="stat-card cursor-pointer" onclick="loadReportData('${type}')">
    <div class="text-3xl mb-2">${icon}</div>
    <p class="font-semibold text-slate-700 text-sm">${label}</p>
    <p class="text-xs text-slate-400 mt-1">คลิกเพื่อดูรายงาน</p>
  </div>`;
}

async function loadReportData(type) {
  const el = document.getElementById('reportContent');
  el.innerHTML = skeletonTable();

  const isStock = type === 'stock' || type === 'lowstock';
  showLoading('กำลังโหลด...');
  const res = isStock
    ? await api('getReports', { reportType: type })
    : await api('getTransactions', { type, limit: 1000 });
  hideLoading();

  if (!res.success) return showErr(el, res.message);
  const data = res.data;

  let headers, rows;
  if (isStock) {
    headers = ['DrugCode','DrugName','GenericName','Strength','Unit','MinStock','TotalQty','NearExpiry','StatusNote'];
    rows = data.map(d => headers.map(h => d[h]??''));
  } else {
    headers = ['TransDate','Type','DrugName','LotNo','Qty','Unit','Receiver','Department','CreatedBy','Note'];
    rows = data.map(d => headers.map(h => h==='TransDate' ? thaiDate(d[h]) : (d[h]??'')));
  }

  const LABELS = {
    DrugCode:'รหัสยา', DrugName:'ชื่อยา', GenericName:'ชื่อสามัญ', Strength:'ความแรง',
    Unit:'หน่วย', MinStock:'Stock ขั้นต่ำ', TotalQty:'คงคลัง',
    NearExpiry:'ใกล้หมดอายุ', StatusNote:'สถานะ',
    TransDate:'วันที่', Type:'ประเภท', LotNo:'Lot', Qty:'จำนวน',
    Receiver:'ผู้รับ', Department:'แผนก', CreatedBy:'ผู้บันทึก', Note:'หมายเหตุ'
  };

  const th = headers.map(h=>`<th class="px-3 py-2 text-left whitespace-nowrap">${LABELS[h]||h}</th>`).join('');
  const tb = rows.map(r=>`<tr>${r.map((v,i)=>{
    let cls='';
    if(headers[i]==='StatusNote' && v==='ต่ำกว่าขั้นต่ำ') cls='text-red-600 font-bold';
    if(headers[i]==='Type') return `<td class="px-3 py-2">${typeBadge(v)}</td>`;
    return `<td class="px-3 py-2 text-xs ${cls}">${esc(String(v))}</td>`;
  }).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}" class="text-center py-6 text-slate-400">ไม่มีข้อมูล</td></tr>`;

  const titles = { stock:'คงคลัง', lowstock:'Stock ต่ำ', RECEIVE:'รับเข้า', DISPENSE:'เบิกจ่าย' };
  el.innerHTML = `
  <div class="flex items-center justify-between mb-2">
    <h3 class="font-semibold text-slate-700">รายงาน${titles[type]||type} — ${data.length} รายการ</h3>
    <button onclick="exportCSV(${JSON.stringify(data).replace(/</g,'\\u003c')},'report_${type}')" class="btn btn-success btn-sm">⬇️ Export CSV</button>
  </div>
  <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
    <div class="overflow-x-auto p-3">
      <table id="reportTable" class="table-auto w-full text-sm">
        <thead><tr>${th}</tr></thead>
        <tbody>${tb}</tbody>
      </table>
    </div>
  </div>`;

  destroyTable();
  App.activeTable = new DataTable('#reportTable', dtOpts({ pageLength:25 }));
}

// ── SETTINGS ──────────────────────────────────────────────
async function loadSettings() {
  if (App.user?.role !== 'admin') return;
  const el = document.getElementById('pageSettings');
  el.innerHTML = `<div class="max-w-lg mx-auto space-y-4">${skeletonTable()}</div>`;

  showLoading('กำลังโหลดการตั้งค่า...');
  const res = await api('getSettings');
  hideLoading();

  const settings = res.success ? res.data : [];
  const find = key => settings.find(s => s.Key === key) || {};

  const lineRow    = find('LINE_NOTIFY_TOKEN');
  const hasToken   = lineRow.HasValue;
  const maskedVal  = lineRow.Value || '';
  const hospitalRow= find('HOSPITAL_NAME');
  const alertRow   = find('ALERT_DAYS');

  el.innerHTML = `
  <div class="max-w-lg mx-auto space-y-4">

    <!-- LINE Notify Token -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div class="bg-[#00B900] px-5 py-3 flex items-center justify-between">
        <h3 class="text-white font-semibold text-sm">🟢 LINE Notify Token</h3>
        ${hasToken ? '<span class="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">✅ ตั้งค่าแล้ว</span>'
                   : '<span class="bg-red-500/80 text-white text-xs px-2 py-0.5 rounded-full">⚠️ ยังไม่ตั้งค่า</span>'}
      </div>
      <div class="p-5 space-y-3">
        <div class="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
          <p>1. ไปที่ <a href="https://notify-bot.line.me/th_TH/my" target="_blank" class="text-blue-600 underline">notify-bot.line.me</a> → Generate token</p>
          <p>2. วาง Token ด้านล่าง แล้วกด บันทึก</p>
          <p>3. Token จะถูกเก็บใน <b>Setting Sheet</b> (คอลัมน์ Value)</p>
        </div>
        <div>
          <label class="form-label">LINE Notify Token</label>
          <div class="flex gap-2">
            <input id="lineTokenInput" type="password" class="form-input flex-1 font-mono text-sm"
                   placeholder="${hasToken ? maskedVal : 'วาง Token ที่นี่...'}"
                   autocomplete="off"/>
            <button onclick="toggleTokenVisibility()" class="btn btn-secondary btn-sm whitespace-nowrap" id="toggleTokenBtn">👁 แสดง</button>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="saveLineToken()" class="btn btn-success flex-1 justify-center">💾 บันทึก Token</button>
          <button onclick="clearLineToken()" class="btn btn-danger btn-sm" title="ลบ Token">🗑 ลบ</button>
        </div>
        <div class="border-t border-slate-100 pt-3 flex gap-2">
          <button onclick="testLineMessage()" class="btn btn-outline flex-1 justify-center btn-sm">
            📲 ทดสอบส่ง LINE
          </button>
          <button onclick="runLineNotifyManual()" class="btn btn-primary flex-1 justify-center btn-sm">
            🔍 ตรวจ + แจ้งเตือน
          </button>
        </div>
      </div>
    </div>

    <!-- ตั้งค่าทั่วไป -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div class="bg-[#0f1e3c] px-5 py-3">
        <h3 class="text-white font-semibold text-sm">⚙️ ตั้งค่าทั่วไป</h3>
      </div>
      <div class="p-5 space-y-3">
        <div>
          <label class="form-label">ชื่อโรงพยาบาล / หน่วยงาน</label>
          <div class="flex gap-2">
            <input id="hospitalNameInput" type="text" class="form-input flex-1"
                   value="${esc(hospitalRow.Value || '')}" placeholder="ชื่อโรงพยาบาล"/>
            <button onclick="saveSetting('HOSPITAL_NAME','hospitalNameInput')" class="btn btn-primary btn-sm">💾</button>
          </div>
        </div>
        <div>
          <label class="form-label">จำนวนวันแจ้งเตือน (คั่นด้วย ,)</label>
          <div class="flex gap-2">
            <input id="alertDaysInput" type="text" class="form-input flex-1"
                   value="${esc(alertRow.Value || '180,90,60,30,7')}" placeholder="180,90,60,30,7"/>
            <button onclick="saveSetting('ALERT_DAYS','alertDaysInput')" class="btn btn-primary btn-sm">💾</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Setting Sheet ทั้งหมด -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-semibold text-slate-700 text-sm">📋 Setting Sheet</h3>
        <span class="text-xs text-slate-400">${settings.length} รายการ</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead><tr class="bg-slate-50">
            <th class="px-4 py-2 text-left font-semibold text-slate-500">Key</th>
            <th class="px-4 py-2 text-left font-semibold text-slate-500">Value</th>
            <th class="px-4 py-2 text-left font-semibold text-slate-500">รายละเอียด</th>
          </tr></thead>
          <tbody>
            ${settings.map(s => `<tr class="border-t border-slate-100">
              <td class="px-4 py-2 font-mono font-medium text-slate-700">${esc(s.Key)}</td>
              <td class="px-4 py-2 text-slate-500">${s.Key === 'LINE_NOTIFY_TOKEN'
                ? (s.HasValue ? `<span class="text-green-600">✅ ${esc(s.Value)}</span>` : '<span class="text-red-400">ยังไม่ตั้งค่า</span>')
                : esc(s.Value)}</td>
              <td class="px-4 py-2 text-slate-400">${esc(s.Detail||'')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Setup -->
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
      <button onclick="runSetup()" class="btn btn-warning w-full justify-center">
        🔧 Setup / ตรวจสอบ Sheets
      </button>
      <div class="text-xs text-slate-400 text-center space-y-0.5">
        <p><b>GAS URL:</b> <span class="text-blue-500 break-all">${CONFIG.GAS_URL.slice(0,60)}...</span></p>
        <p>Version ${CONFIG.VERSION} &nbsp;|&nbsp; ${App.user?.fullName} (${App.user?.role})</p>
      </div>
    </div>

  </div>`;
}

function toggleTokenVisibility() {
  const input = document.getElementById('lineTokenInput');
  const btn   = document.getElementById('toggleTokenBtn');
  if (input.type === 'password') { input.type = 'text';     btn.textContent = '🙈 ซ่อน'; }
  else                           { input.type = 'password'; btn.textContent = '👁 แสดง'; }
}

async function saveLineToken() {
  const val = document.getElementById('lineTokenInput').value.trim();
  if (!val) return Swal.fire('แจ้งเตือน','กรุณากรอก LINE Token','warning');

  showLoading('กำลังบันทึก...');
  const res = await api('saveSettings', { key: 'LINE_NOTIFY_TOKEN', value: val });
  hideLoading();

  if (!res.success) return Swal.fire('ผิดพลาด', res.message, 'error');
  Swal.fire({ icon:'success', title:'บันทึก Token สำเร็จ', timer:1500, showConfirmButton:false });
  document.getElementById('lineTokenInput').value = '';
  await loadSettings();
}

async function clearLineToken() {
  const r = await Swal.fire({ title:'ลบ LINE Token?', text:'Token จะถูกลบออกจาก Setting Sheet',
    icon:'warning', showCancelButton:true, confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก',
    confirmButtonColor:'#dc2626' });
  if (!r.isConfirmed) return;

  showLoading('กำลังลบ...');
  const res = await api('saveSettings', { key: 'LINE_NOTIFY_TOKEN', value: '' });
  hideLoading();

  Swal.fire({ icon: res.success?'success':'error', title: res.success?'ลบ Token สำเร็จ':res.message, timer:1500, showConfirmButton:false });
  if (res.success) await loadSettings();
}

async function saveSetting(key, inputId) {
  const val = document.getElementById(inputId)?.value ?? '';
  showLoading('กำลังบันทึก...');
  const res = await api('saveSettings', { key, value: val });
  hideLoading();
  Swal.fire({ icon: res.success?'success':'error', title: res.success?res.message:res.message,
    timer:1500, showConfirmButton:false });
}

async function testLineMessage() {
  showLoading('กำลังส่ง LINE...');
  const res = await api('sendTestLineMessage');
  hideLoading();
  Swal.fire({ icon: res.success?'success':'error', title: res.success?'ส่งสำเร็จ':'ผิดพลาด', text: res.message });
}

async function runLineNotifyManual() {
  showLoading('กำลังตรวจสอบ...');
  const res = await api('checkExpiredDrugsAndNotify');
  hideLoading();
  Swal.fire({ icon: res.success?'success':'error', title: res.message });
}

async function runSetup() {
  const r = await Swal.fire({ title:'Setup Sheets?', text:'จะสร้าง Sheet ที่ยังไม่มีและตั้งค่า Default',
    icon:'question', showCancelButton:true, confirmButtonText:'ดำเนินการ', cancelButtonText:'ยกเลิก' });
  if (!r.isConfirmed) return;
  showLoading('กำลัง Setup...');
  const res = await api('setupSheets');
  hideLoading();
  Swal.fire({ icon: res.success?'success':'error', title: res.success?'Setup สำเร็จ':'ผิดพลาด',
    text: res.message, width: 480 });
}

// ── BARCODE SCANNER ───────────────────────────────────────
function openBarcodeScanner(callback) {
  App.scanCB = callback;
  document.getElementById('barcodeModal').classList.remove('hidden');
  document.getElementById('manualBarcodeInput').value = '';

  setTimeout(() => {
    if (App.scanner) { try { App.scanner.stop(); } catch(e){} App.scanner = null; }
    App.scanner = new Html5Qrcode('barcodeReader');
    App.scanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: { width: 280, height: 150 }, aspectRatio: 1.7 },
      (text) => {
        closeBarcodeScanner();
        if (App.scanCB) App.scanCB(text.trim());
      },
      () => {} // ignore frame errors
    ).catch(err => {
      console.warn('Scanner start failed:', err);
      // Camera not available — user can still type manually
    });
  }, 200);
}

async function closeBarcodeScanner() {
  document.getElementById('barcodeModal').classList.add('hidden');
  if (App.scanner) {
    try { await App.scanner.stop(); App.scanner.clear(); } catch(e){}
    App.scanner = null;
  }
}

function submitManualBarcode() {
  const val = document.getElementById('manualBarcodeInput').value.trim();
  if (!val) return;
  closeBarcodeScanner();
  if (App.scanCB) App.scanCB(val);
}

// ── SIDEBAR (mobile) ──────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('hidden');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.add('hidden');
}

// ── UTILITIES ─────────────────────────────────────────────
function showLoading(msg='กำลังโหลด...') {
  document.getElementById('loadingText').textContent = msg;
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}

function showErr(el, msg) {
  el.innerHTML = `<div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-600">
    <div class="text-3xl mb-2">❌</div><p>${esc(msg)}</p>
    <p class="text-xs mt-2 text-red-400">ตรวจสอบ config.js ว่า GAS_URL ถูกต้อง</p></div>`;
}

function thaiDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const day   = String(d.getDate()).padStart(2,'0');
  const month = String(d.getMonth()+1).padStart(2,'0');
  const year  = d.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

function fmtNum(n) {
  const x = parseFloat(n);
  return isNaN(x) ? '-' : x.toLocaleString('th-TH');
}

function esc(str) {
  return String(str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function roleLabel(role) {
  return { admin:'ผู้ดูแลระบบ', staff:'เจ้าหน้าที่', viewer:'ผู้ดูรายงาน' }[role] || role;
}

function typeBadge(type) {
  if (type === 'RECEIVE')  return `<span class="badge badge-ok">📥 รับเข้า</span>`;
  if (type === 'DISPENSE') return `<span class="badge badge-medium">📤 เบิกจ่าย</span>`;
  return `<span class="badge badge-watch">${esc(type)}</span>`;
}

function statusBadge(status) {
  return status === 'Active'
    ? `<span class="badge badge-ok">Active</span>`
    : `<span class="badge badge-watch">Inactive</span>`;
}

function alertBadge(daysLeft) {
  if (isNaN(daysLeft)) return '';
  if (daysLeft < 0)  return `<span class="badge badge-expired">หมดอายุ ${Math.abs(daysLeft)} วัน</span>`;
  if (daysLeft <= 7) return `<span class="badge badge-critical">${daysLeft} วัน</span>`;
  if (daysLeft <= 30)return `<span class="badge badge-high">${daysLeft} วัน</span>`;
  if (daysLeft <= 60)return `<span class="badge badge-medium">${daysLeft} วัน</span>`;
  if (daysLeft <= 90)return `<span class="badge badge-low">${daysLeft} วัน</span>`;
  return `<span class="badge badge-watch">${daysLeft} วัน</span>`;
}

function exportCSV(data, filename) {
  if (!data || data.length === 0) return Swal.fire('แจ้งเตือน','ไม่มีข้อมูลที่จะ Export','info');
  const headers = Object.keys(data[0]);
  const rows    = data.map(r => headers.map(h => `"${String(r[h]??'').replace(/"/g,'""')}"`).join(','));
  const csv     = '﻿' + [headers.join(','), ...rows].join('\r\n');
  const blob    = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `${filename}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function destroyTable() {
  if (App.activeTable) {
    try { App.activeTable.destroy(); } catch(e){}
    App.activeTable = null;
  }
}

function dtOpts(extra = {}) {
  return {
    language: { search:'ค้นหา:', lengthMenu:'แสดง _MENU_ รายการ',
      info:'_START_-_END_ จาก _TOTAL_ รายการ',
      infoEmpty:'ไม่มีข้อมูล', zeroRecords:'ไม่พบข้อมูล',
      paginate:{ first:'แรก', last:'สุดท้าย', next:'ถัดไป', previous:'ก่อนหน้า' } },
    pageLength: 20, responsive: true,
    ...extra,
  };
}

function skeletonCards(n=4) {
  return `<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">${
    Array(n).fill('<div class="stat-card animate-pulse"><div class="h-4 bg-slate-200 rounded mb-3 w-20"></div><div class="h-8 bg-slate-200 rounded w-12"></div></div>').join('')}</div>`;
}

function skeletonTable() {
  return `<div class="bg-white rounded-xl border border-slate-200 p-4 animate-pulse space-y-2">
    <div class="h-4 bg-slate-200 rounded w-32"></div>
    ${Array(5).fill('<div class="h-3 bg-slate-100 rounded"></div>').join('')}
  </div>`;
}
