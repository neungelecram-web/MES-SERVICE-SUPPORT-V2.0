/**
 * Application Controller v2.0 - Medical Device After-Sales Service Management
 * Enhanced: Notifications, Master Data CRUD, Export CSV, Toast UI
 */
(function () {
  'use strict';

  let monthlyChartInstance = null;
  let statusChartInstance = null;
  let activeDashboardTab = 'repairs';
  let activePickerType = '';
  let activePickerIdField = '';
  let activePickerDisplayField = '';
  let simulatedFiles = {};

  document.addEventListener('DOMContentLoaded', function () {
    lucide.createIcons();
    // ตรวจ URL param ?track=JOBID ก่อน — ถ้ามีให้แสดงหน้า tracking (ไม่ต้อง login)
    var params = new URLSearchParams(window.location.search);
    var trackId = params.get('track');
    if (trackId) {
      showTrackingPage(trackId);
      return;
    }
    checkSession();
    setupFormListeners();
    document.addEventListener('click', function (e) {
      const dd = document.getElementById('notification-dropdown');
      const bell = document.getElementById('notif-bell-btn');
      if (dd && !dd.contains(e.target) && bell && !bell.contains(e.target)) {
        dd.classList.remove('open');
      }
    });
  });

  // ==================== CUSTOMER TRACKING (via QR) ====================
  window.showTrackingPage = function(jobId) {
    var job = DB.find('repair_jobs','id',jobId);
    var co  = getCompanyInfo();

    var loginV = document.getElementById('view-login');
    var mainV  = document.getElementById('view-main');
    if (loginV) loginV.style.display = 'none';
    if (mainV)  mainV.style.display = 'none';

    var container = document.getElementById('view-tracking');
    if (!container) {
      container = document.createElement('div');
      container.id = 'view-tracking';
      document.body.appendChild(container);
    }
    container.style.display = 'block';

    if (!job) {
      container.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-family:Sarabun,sans-serif;padding:20px;">' +
          '<div style="background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:400px;">' +
            '<div style="font-size:48px;margin-bottom:16px;">🔍</div>' +
            '<h2 style="font-size:18px;color:#0f172a;margin-bottom:8px;">ไม่พบข้อมูลงานซ่อม</h2>' +
            '<p style="font-size:14px;color:#64748b;">หมายเลข: ' + jobId + '</p>' +
          '</div>' +
        '</div>';
      return;
    }

    var prod = DB.find('products','id',job.product_id) || {};
    var cust = DB.find('customers','id',job.customer_id) || {};
    var prodName = prod.name || job.product_name || '-';
    var prodBrand= prod.brand || job.product_brand || '-';
    var ts = job.timestamps || {};
    var wc = job.warranty_condition || 'out_warranty';
    var claimRejected = !!ts['claim_rejected'];
    var isClaimPath = (wc === 'in_warranty') && !claimRejected;
    var isPoRejected = job.po_rejected === true;
    var hasParts = (job.parts_needed||[]).length > 0;
    var wentParts = !!ts['parts_issued'];

    var tlSteps = [];
    function tlAdd(key, label, icon) { tlSteps.push({ key:key, label:label, icon:icon }); }

    tlAdd('registered', 'รับเครื่องเข้าศูนย์', 'clipboard-check');
    tlAdd('checked', 'ตรวจเช็คอาการ', 'search');
    if (isClaimPath) {
      tlAdd('claim_sent', 'ส่งเคลมประกัน', 'shield');
      tlAdd('claim_approved', 'อนุมัติเคลม', 'shield-check');
      if (hasParts || wentParts) tlAdd('claimed', 'เบิกอะไหล่', 'package');
      tlAdd('parts_issued', 'กำลังซ่อม', 'wrench');
    } else if (claimRejected) {
      tlAdd('claim_sent', 'ส่งเคลมประกัน', 'shield');
      tlAdd('claim_rejected', 'เคลมไม่ผ่าน', 'shield-x');
      tlAdd('quote_printed', 'เสนอราคา', 'file-text');
      if (!isPoRejected) {
        if (hasParts || wentParts) tlAdd('po_received', 'เบิกอะไหล่', 'package');
        tlAdd('parts_issued', 'กำลังซ่อม', 'wrench');
      }
    } else {
      tlAdd('quote_printed', 'เสนอราคา', 'file-text');
      if (!isPoRejected) {
        if (hasParts || wentParts) tlAdd('po_received', 'เบิกอะไหล่', 'package');
        tlAdd('parts_issued', 'กำลังซ่อม', 'wrench');
      }
    }
    tlAdd('ready_return', 'พร้อมส่งคืน', 'check-circle');
    tlAdd('returning', 'กำลังจัดส่งคืน', 'truck');
    tlAdd('closed', 'ส่งมอบเรียบร้อย', 'home');

    var curStep = REPAIR_STATUS[job.status] ? REPAIR_STATUS[job.status].step : 1;
    var curIdx = tlSteps.findIndex(function(s){ return s.key === job.status; });
    if (curIdx < 0) {
      for (var ci = tlSteps.length-1; ci >= 0; ci--) {
        var skStep = REPAIR_STATUS[tlSteps[ci].key] ? REPAIR_STATUS[tlSteps[ci].key].step : 99;
        if (skStep <= curStep) { curIdx = ci; break; }
      }
    }
    if (curIdx < 0) curIdx = 0;

    var isClosed = job.status === 'closed';
    var statusLabel = getStatusLabel(job.status);

    var timelineHtml = tlSteps.map(function(s, i) {
      var done = i < curIdx;
      var current = i === curIdx;
      var tsVal = ts[s.key] || '';
      var dotBg, lineColor, txtColor, iconColor;
      if (done) { dotBg='#10b981'; lineColor='#10b981'; txtColor='#0f172a'; iconColor='#fff'; }
      else if (current) { dotBg='#6366f1'; lineColor='#e2e8f0'; txtColor='#6366f1'; iconColor='#fff'; }
      else { dotBg='#e2e8f0'; lineColor='#e2e8f0'; txtColor='#94a3b8'; iconColor='#94a3b8'; }
      var pulse = current ? 'animation:trackpulse 1.8s infinite;' : '';
      return '<div style="display:flex;gap:14px;position:relative;">' +
        (i < tlSteps.length-1 ? '<div style="position:absolute;left:19px;top:40px;bottom:-16px;width:2px;background:'+lineColor+';"></div>' : '') +
        '<div style="width:40px;height:40px;border-radius:50%;background:'+dotBg+';display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1;'+pulse+'">' +
          '<i data-lucide="'+s.icon+'" style="width:19px;height:19px;color:'+iconColor+';"></i>' +
        '</div>' +
        '<div style="flex:1;padding-bottom:24px;">' +
          '<div style="font-size:15px;font-weight:'+(current?'800':'600')+';color:'+txtColor+';">'+s.label+(current?' ●':'')+'</div>' +
          (tsVal ? '<div style="font-size:12px;color:#94a3b8;margin-top:2px;">'+tsVal+'</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    container.innerHTML =
      '<style>@keyframes trackpulse{0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,.5);}50%{box-shadow:0 0 0 8px rgba(99,102,241,0);}}</style>' +
      '<div style="min-height:100vh;background:linear-gradient(180deg,#6366f1 0%,#6366f1 200px,#f1f5f9 200px);font-family:Sarabun,sans-serif;">' +
        '<div style="max-width:480px;margin:0 auto;padding:20px 16px 40px;">' +
          '<div style="text-align:center;padding:16px 0 24px;">' +
            '<div style="color:rgba(255,255,255,.85);font-size:13px;font-weight:600;margin-bottom:4px;">'+co.name+'</div>' +
            '<div style="color:#fff;font-size:20px;font-weight:800;">ติดตามสถานะงานซ่อม</div>' +
          '</div>' +
          '<div style="background:#fff;border-radius:16px;padding:20px;box-shadow:0 4px 20px rgba(0,0,0,.1);margin-bottom:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">' +
              '<div>' +
                '<div style="font-size:11px;color:#94a3b8;font-weight:600;">หมายเลขงานซ่อม</div>' +
                '<div style="font-size:17px;font-weight:800;color:#4f46e5;font-family:monospace;">'+jobId+'</div>' +
              '</div>' +
              '<div style="background:'+(isClosed?'#10b981':'#6366f1')+';color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:700;">'+statusLabel+'</div>' +
            '</div>' +
            '<div style="border-top:1px solid #f1f5f9;padding-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
              '<div><div style="font-size:11px;color:#94a3b8;">เครื่องมือ</div><div style="font-size:14px;font-weight:600;color:#0f172a;">'+prodName+'</div></div>' +
              '<div><div style="font-size:11px;color:#94a3b8;">ยี่ห้อ</div><div style="font-size:14px;font-weight:600;color:#0f172a;">'+prodBrand+'</div></div>' +
              '<div><div style="font-size:11px;color:#94a3b8;">S/N</div><div style="font-size:13px;font-weight:600;color:#4f46e5;font-family:monospace;">'+(job.sn||'-')+'</div></div>' +
              '<div><div style="font-size:11px;color:#94a3b8;">วันที่รับเครื่อง</div><div style="font-size:13px;font-weight:600;color:#0f172a;">'+(job.created_at||'').substring(0,10)+'</div></div>' +
            '</div>' +
          '</div>' +
          '<div style="background:#fff;border-radius:16px;padding:24px 20px;box-shadow:0 4px 20px rgba(0,0,0,.1);">' +
            '<div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:20px;display:flex;align-items:center;gap:8px;"><i data-lucide="route" style="width:18px;height:18px;color:#6366f1;"></i>ความคืบหน้าการซ่อม</div>' +
            timelineHtml +
          '</div>' +
          '<div style="text-align:center;margin-top:20px;font-size:12px;color:#94a3b8;">' +
            '<div>สอบถามเพิ่มเติม โทร '+(co.tel||'-')+'</div>' +
            '<div style="margin-top:4px;">อัปเดตล่าสุด: '+nowTs()+'</div>' +
            '<button onclick="location.reload()" style="margin-top:14px;background:#6366f1;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">🔄 รีเฟรชสถานะ</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    lucide.createIcons();
  };

  // ==================== TOAST ====================
  window.showToast = function (type, title, message, duration) {
    duration = duration || 3500;
    const icons = { success:'check-circle-2', danger:'alert-circle', warning:'alert-triangle', info:'info' };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<div class="toast-icon"><i data-lucide="' + (icons[type]||'info') + '" style="width:18px;height:18px;"></i></div>' +
      '<div class="toast-msg"><strong>' + title + '</strong>' + (message ? '<span>' + message + '</span>' : '') + '</div>' +
      '<button class="toast-close" onclick="this.parentElement.remove()">\xd7</button>';
    container.appendChild(toast);
    lucide.createIcons();
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      toast.style.transition = 'all .3s';
      setTimeout(function () { toast.remove(); }, 300);
    }, duration);
  };

  // ==================== AUTH ====================
  function checkSession() {
    var user = DB.getCurrentUser();
    if (user) showMainApp(user); else showLoginScreen();
  }

  window.quickLogin = function (roleName) {
    var user = DB.getAll('users').find(function(u){ return u.username.startsWith(roleName) || u.role === roleName; });
    if (user) { DB.setCurrentUser(user); showMainApp(user); }
  };

  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = document.getElementById('login-username').value.trim();
    var p = document.getElementById('login-password').value.trim();
    var user = DB.getAll('users').find(function(x){ return x.username === u && x.password === p; });
    if (user) { DB.setCurrentUser(user); showMainApp(user); }
    else showToast('danger', 'เข้าสู่ระบบไม่สำเร็จ', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  });

  window.logout = function () { DB.setCurrentUser(null); showLoginScreen(); };

  function showLoginScreen() {
    document.getElementById('view-login').style.display = 'flex';
    document.getElementById('view-main').style.display = 'none';
  }

  function showMainApp(user) {
    document.getElementById('view-login').style.display = 'none';
    document.getElementById('view-main').style.display = 'flex';
    document.getElementById('nav-fullname').textContent = user.fullname;
    var roleMap = {
      manager:   'ผู้จัดการบริการ',
      supervisor:'หัวหน้าฝ่ายบริการ',
      admin:     'ธุรการ/ประสานงาน',
      engineer:  'วิศวกรบริการ',
      warehouse: 'เจ้าหน้าที่คลังสินค้า'
    };
    document.getElementById('nav-role').textContent = roleMap[user.role] || user.role;
    document.getElementById('nav-avatar').textContent = user.fullname.replace(/คุณ|วิศวกร\s*/g,'').substring(0,2);
    updateRoleSelectorUI(user.role);
    applyRolePermissions(user);
    computeNotifications();
    // รอให้ DOM render เสร็จก่อนสร้าง chart เพื่อให้ animation ทำงาน
    setTimeout(function(){ switchView('dashboard'); }, 50);
  }

  window.testRoleSwitch = function (roleName) {
    var user = DB.getAll('users').find(function(u){ return u.role === roleName; });
    if (user) { DB.setCurrentUser(user); showMainApp(user); }
  };

  function updateRoleSelectorUI(role) {
    document.querySelectorAll('.role-btn').forEach(function(b){ b.classList.remove('active'); });
    var map = {
      manager:   'role-toggle-manager',
      supervisor:'role-toggle-supervisor',
      engineer:  'role-toggle-engineer',
      admin:     'role-toggle-admin',
      warehouse: 'role-toggle-warehouse'
    };
    var btn = document.getElementById(map[role]);
    if (btn) btn.classList.add('active');
  }

  function applyRolePermissions(user) {
    var perfPanel = document.getElementById('panel-performance-view');
    if (perfPanel) perfPanel.style.display = 'none';

    // Users menu: manager only
    var menuUsers = document.getElementById('menu-item-users');
    if (menuUsers) menuUsers.style.display = user.role === 'manager' ? 'block' : 'none';

    // Company settings menu: admin only
    var menuCompany = document.getElementById('menu-item-company');
    if (menuCompany) menuCompany.style.display = user.role === 'admin' ? 'block' : 'none';

    // Warehouse section actions: admin, supervisor, manager, warehouse
    var whActions = document.getElementById('wh-manage-actions');
    if (whActions) whActions.style.display = ['admin','supervisor','manager','warehouse'].includes(user.role) ? 'flex' : 'none';

    // Register buttons: admin, engineer only
    ['btn-open-register-repair','btn-open-register-onsite','btn-open-register-delivered'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.style.display = ['admin','engineer'].includes(user.role) ? 'inline-flex' : 'none';
    });

    // Warehouse role: ซ่อนเมนูที่ไม่เกี่ยวข้อง เหลือแค่คลังอะไหล่
    if (user.role === 'warehouse') {
      var sidebarSections = ['sec-overview','sec-service','sec-assets','sec-master','sec-reports'];
      sidebarSections.forEach(function(secId) {
        var sec = document.getElementById(secId);
        if (sec) {
          // ซ่อนทุกเมนูยกเว้น warehouse
          sec.querySelectorAll('.menu-item').forEach(function(item) {
            var view = item.getAttribute('data-view');
            if (view !== 'warehouse' && view !== 'dashboard') {
              item.style.display = 'none';
            }
          });
        }
      });
      // ซ่อน sec-admin ทั้งหมด
      var secAdmin = document.getElementById('sec-admin');
      if (secAdmin) secAdmin.style.display = 'none';
      var adminLabel = document.getElementById('admin-section-label');
      if (adminLabel) adminLabel.style.display = 'none';
    }
  }

  // ==================== ROUTING ====================
  window.switchView = function (viewName) {
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-view') === viewName);
    });
    document.querySelectorAll('.view-section').forEach(function(s){ s.classList.remove('active'); });
    var sec = document.getElementById('view-section-' + viewName);
    if (sec) sec.classList.add('active');
    var titles = {
      dashboard:['แดชบอร์ดสรุปงาน','ภาพรวมสถิติและงานบริการ'],
      notifications:['ศูนย์การแจ้งเตือน','PM ครบกำหนด, ประกันหมด, สต็อกต่ำ'],
      repair:['ทะเบียนรับงานซ่อมบำรุง','บริหารงานซ่อมเครื่องมือแพทย์'],
      onsite:['งาน Onsite / Oncall','งานบริการนอกสถานที่'],
      delivered:['เครื่องมือแพทย์ที่ส่งมอบ','ทะเบียนสินทรัพย์ลูกค้า'],
      pm:['แผนบำรุงรักษาป้องกัน (PM)','กำหนดการตรวจเช็คประจำเดือน'],
      warehouse:['คลังอะไหล่สำรอง','บริหารสต็อกและประวัติเบิกจ่าย'],
      'master-customers':['จัดการลูกค้า','CRUD ข้อมูลลูกค้า/โรงพยาบาล'],
      'master-zones':['เขตการขาย/บริการ','จัดการเขตและผู้รับผิดชอบ'],
      'master-products':['จัดการสินค้า','CRUD เครื่องมือแพทย์'],
      'master-parts':['จัดการอะไหล่','CRUD รายการอะไหล่สำรอง'],
      reports:['ออกรายงาน & Export','Export ข้อมูลเป็น CSV'],
      users:['จัดการผู้ใช้งาน','สิทธิ์และบัญชีผู้ใช้ระบบ'],
      company:['ข้อมูลบริษัท','จัดการชื่อ ที่อยู่ และข้อมูลติดต่อบริษัท']
    };
    var t = titles[viewName] || ['ระบบบริการ',''];
    document.getElementById('page-header-title').textContent = t[0];
    document.getElementById('page-header-sub').textContent = t[1];
    document.getElementById('app-sidebar').classList.remove('open');
    loadViewData(viewName);
  };

  window.toggleSidebar = function () {
    document.getElementById('app-sidebar').classList.toggle('open');
  };

  // ==================== COLLAPSIBLE SIDEBAR SECTIONS ====================
  var _collapsedSections = {};

  window.toggleSidebarSection = function(sectionId) {
    var body  = document.getElementById(sectionId);
    var arrow = document.getElementById('arrow-' + sectionId);
    if (!body) return;
    var isCollapsed = body.classList.contains('collapsed');
    if (isCollapsed) {
      body.classList.remove('collapsed');
      if (arrow) arrow.classList.remove('collapsed');
      _collapsedSections[sectionId] = false;
    } else {
      body.classList.add('collapsed');
      if (arrow) arrow.classList.add('collapsed');
      _collapsedSections[sectionId] = true;
    }
  };

  function loadViewData(viewName) {
    switch(viewName) {
      case 'dashboard': renderDashboard(); break;
      case 'notifications': renderNotificationsView(); break;
      case 'repair': renderRepairTable(); break;
      case 'onsite': renderOnsiteTable(); break;
      case 'delivered': renderDeliveredTable(); break;
      case 'pm': renderPmView(); break;
      case 'warehouse': renderWarehouseView(); break;
      case 'master-customers': renderMasterCustomers(); break;
      case 'master-zones':     renderMasterZones(); break;
      case 'master-products': renderMasterProducts(); break;
      case 'master-parts': renderMasterParts(); break;
      case 'reports': loadReportPreview(); break;
      case 'users': renderUsersTable(); break;
      case 'company': renderCompanyView(); break;
    }
  }

  // ==================== NOTIFICATIONS ====================
  function computeNotifications() {
    var today = new Date();
    var notifications = [];
    var pmJobs = DB.getAll('pm_jobs');
    var delivered = DB.getAll('delivered_products');
    var products = DB.getAll('products');
    var customers = DB.getAll('customers');
    var parts = DB.getAll('parts');

    pmJobs.filter(function(p){ return p.status === 'pending'; }).forEach(function(pm) {
      var dp = delivered.find(function(d){ return d.sn === pm.sn; });
      var prod = dp ? products.find(function(p){ return p.id === dp.product_id; }) : null;
      var cust = dp ? customers.find(function(c){ return c.id === dp.customer_id; }) : null;
      var parts2 = pm.scheduled_month.split('-').map(Number);
      var pmDate = new Date(parts2[0], parts2[1]-1, 1);
      var diffDays = Math.floor((today - pmDate) / 86400000);
      notifications.push({
        type: diffDays > 0 ? 'danger' : 'warning', category: 'pm', icon: 'calendar-x',
        title: 'PM ค้าง: ' + pm.sn,
        body: (prod ? prod.name : '-') + ' ที่ ' + (cust ? cust.name : '-') + ' (' + pm.scheduled_month + ')',
        time: diffDays > 0 ? 'เลยกำหนด ' + diffDays + ' วัน' : 'เดือนนี้'
      });
    });

    delivered.forEach(function(dp) {
      var prod = products.find(function(p){ return p.id === dp.product_id; });
      var cust = customers.find(function(c){ return c.id === dp.customer_id; });
      var expiry = new Date(dp.warranty_expiry);
      var daysLeft = Math.floor((expiry - today) / 86400000);
      if (daysLeft < 0) {
        notifications.push({ type:'danger', category:'warranty', icon:'shield-x', title:'ประกันหมดแล้ว: ' + dp.sn, body:(prod?prod.name:'-') + ' ที่ ' + (cust?cust.name:'-'), time:'หมดเมื่อ ' + Math.abs(daysLeft) + ' วันที่แล้ว' });
      } else if (daysLeft <= 90) {
        notifications.push({ type:'warning', category:'warranty', icon:'shield-alert', title:'ประกันใกล้หมด: ' + dp.sn, body:(prod?prod.name:'-') + ' ที่ ' + (cust?cust.name:'-'), time:'เหลืออีก ' + daysLeft + ' วัน' });
      }
    });

    parts.filter(function(p){ return p.stock <= p.min_stock; }).forEach(function(p) {
      notifications.push({ type: p.stock === 0 ? 'danger' : 'warning', category:'stock', icon:'package-x', title:'สต็อกต่ำ: ' + p.name.substring(0,30), body:'คงเหลือ ' + p.stock + ' ชิ้น (ต่ำกว่าเกณฑ์ ' + p.min_stock + ')', time: p.stock === 0 ? 'หมดสต็อก!' : 'ต้องสั่งซื้อ' });
    });

    window._notifications = notifications;
    updateNotifBadge(notifications.length);
    renderNotifDropdown(notifications);
    return notifications;
  }

  function updateNotifBadge(count) {
    var badge = document.getElementById('notif-bell-count');
    var sb = document.getElementById('sidebar-notif-badge');
    if (count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'flex'; }
    else badge.style.display = 'none';
    if (sb) { sb.textContent = count; sb.style.display = count > 0 ? 'inline-block' : 'none'; }
  }

  function renderNotifDropdown(notifications) {
    var list = document.getElementById('notif-list-items');
    if (!list) return;
    if (notifications.length === 0) {
      list.innerHTML = '<div class="notif-empty">ไม่มีการแจ้งเตือน</div>';
      return;
    }
    list.innerHTML = notifications.slice(0,8).map(function(n) {
      return '<div class="notif-item"><div class="notif-icon ' + n.type + '"><i data-lucide="' + n.icon + '" style="width:16px;height:16px;"></i></div><div class="notif-content"><strong>' + n.title + '</strong><span>' + n.body + '</span><span class="notif-time">' + n.time + '</span></div></div>';
    }).join('');
    if (notifications.length > 8) {
      list.innerHTML += '<div style="text-align:center;padding:12px;font-size:.8rem;color:var(--primary);cursor:pointer;" onclick="switchView(\'notifications\');document.getElementById(\'notification-dropdown\').classList.remove(\'open\')">ดูทั้งหมด ' + notifications.length + ' รายการ →</div>';
    }
    lucide.createIcons();
  }

  window.toggleNotifDropdown = function () {
    var dd = document.getElementById('notification-dropdown');
    renderNotifDropdown(computeNotifications());
    dd.classList.toggle('open');
  };

  window.markAllNotifRead = function () {
    document.getElementById('notification-dropdown').classList.remove('open');
    showToast('success','อ่านการแจ้งเตือนทั้งหมดแล้ว','');
  };

  function renderNotificationsView() {
    var notifications = computeNotifications();
    var pmList = notifications.filter(function(n){ return n.category === 'pm'; });
    var warrantyList = notifications.filter(function(n){ return n.category === 'warranty'; });
    var stockList = notifications.filter(function(n){ return n.category === 'stock'; });

    var summaryEl = document.getElementById('notif-summary-cards');
    if (summaryEl) {
      summaryEl.innerHTML = [
        {bg:'linear-gradient(135deg,#991b1b,#ef4444)', icon:'alert-circle', label:'PM ค้างดำเนินการ', count:pmList.length},
        {bg:'linear-gradient(135deg,#b45309,#f59e0b)', icon:'shield-alert', label:'ประกันหมด/ใกล้หมด', count:warrantyList.length},
        {bg:'linear-gradient(135deg,#1e40af,#3b82f6)', icon:'package-x', label:'อะไหล่สต็อกต่ำ', count:stockList.length}
      ].map(function(s) {
        return '<div class="stat-card" style="background:' + s.bg + ';border:none;cursor:default;"><div class="stat-icon" style="background:rgba(255,255,255,.15);"><i data-lucide="' + s.icon + '" style="color:white;"></i></div><div class="stat-details"><h4 style="color:rgba(255,255,255,.85);">' + s.label + '</h4><div class="counter" style="color:white;">' + s.count + '</div></div></div>';
      }).join('');
    }

    function renderCards(list, containerId) {
      var el = document.getElementById(containerId);
      if (!el) return;
      if (list.length === 0) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">✓ ไม่มีรายการแจ้งเตือน</div>'; return; }
      el.innerHTML = list.map(function(n) {
        return '<div class="notif-view-card ' + n.type + '"><div class="notif-icon ' + n.type + '" style="width:40px;height:40px;flex-shrink:0;"><i data-lucide="' + n.icon + '" style="width:18px;height:18px;"></i></div><div style="flex:1;"><div style="font-weight:700;font-size:.875rem;margin-bottom:4px;">' + n.title + '</div><div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:6px;">' + n.body + '</div><span class="badge badge-' + n.type + '">' + n.time + '</span></div></div>';
      }).join('');
    }

    renderCards(pmList, 'notif-pm-list');
    renderCards(warrantyList, 'notif-warranty-list');
    renderCards(stockList, 'notif-stock-list');
    lucide.createIcons();
  }

  // ==================== DASHBOARD ====================
  function renderDashboard() {
    var user = DB.getCurrentUser();
    var repairs = DB.getAll('repair_jobs');
    var onsites = DB.getAll('onsite_jobs');
    var pmJobs = DB.getAll('pm_jobs');
    var parts = DB.getAll('parts');

    // Animated counter update
    animateCounter('dash-stat-repairs', repairs.length);
    animateCounter('dash-stat-onsite', onsites.filter(function(j){ return j.status !== 'closed'; }).length);
    var pmDone = pmJobs.filter(function(j){ return j.status === 'completed'; }).length;
    document.getElementById('dash-stat-pm').textContent = pmDone + ' / ' + pmJobs.length;
    animateCounter('dash-stat-lowstock', parts.filter(function(p){ return p.stock <= p.min_stock; }).length);

    // Performance panel: แสดง+populate ก่อน render chart (สำคัญ! ป้องกัน reflow ระหว่างวาดกราฟ)
    var perfPanel = document.getElementById('panel-performance-view');
    var perfShownNow = false;
    if (user.role === 'manager' || user.role === 'supervisor') {
      if (perfPanel && perfPanel.style.display === 'none') {
        perfPanel.style.display = 'block';
        populatePerformanceUserDropdown();
        perfShownNow = true;
      }
    }

    // ถ้าเพิ่งแสดง perf panel → รอ 2 frame ให้ layout reflow เสร็จก่อนวาดกราฟ
    if (perfShownNow) {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          renderDashboardCharts(repairs, onsites, pmJobs);
        });
      });
    } else {
      renderDashboardCharts(repairs, onsites, pmJobs);
    }
  }

  // ตรวจว่า canvas พร้อมก่อน render chart
  function waitForCanvas(canvasId, callback) {
    var el = document.getElementById(canvasId);
    if (!el) return;
    // ถ้า canvas มีขนาดแล้ว render ทันที
    if (el.offsetWidth > 0) { callback(); return; }
    // รอให้ visible แล้วค่อย render
    var tries = 0;
    var timer = setInterval(function() {
      if (document.getElementById(canvasId).offsetWidth > 0 || tries > 20) {
        clearInterval(timer);
        callback();
      }
      tries++;
    }, 50);
  }

  // Smooth number animation for counters
  function animateCounter(elId, targetVal) {
    var el = document.getElementById(elId);
    if (!el) return;
    var current = parseInt(el.textContent) || 0;
    if (current === targetVal) return;
    var step = targetVal > current ? 1 : -1;
    var diff = Math.abs(targetVal - current);
    var delay = diff > 10 ? 20 : 40;
    var timer = setInterval(function() {
      current += step;
      el.textContent = current;
      if (current === targetVal) clearInterval(timer);
    }, delay);
  }

  window.selectDashboardTab = function (tabName) {
    activeDashboardTab = tabName;
    // เปลี่ยนแค่กราฟซ้าย ไม่ต้อง render ทั้งหน้า
    var repairs = DB.getAll('repair_jobs');
    var onsites = DB.getAll('onsite_jobs');
    var pmJobs  = DB.getAll('pm_jobs');
    _renderLeftChart(repairs, onsites, pmJobs);
  };

  function renderDashboardCharts(repairs, onsites, pmJobs) {
    // poll จน canvas ทั้งสองมีขนาดจริง แล้วรออีก 1 frame ให้แน่ใจ layout settled
    var tries = 0;
    var timer = setInterval(function() {
      var c1 = document.getElementById('chart-monthly-jobs');
      var c2 = document.getElementById('chart-job-statuses');
      var ready = c1 && c1.offsetWidth > 0 && c2 && c2.offsetWidth > 0;
      if (ready || tries > 40) {
        clearInterval(timer);
        requestAnimationFrame(function() {
          _renderDashboardChartsNow(repairs, onsites, pmJobs);
        });
      }
      tries++;
    }, 40);
  }

  function _renderDashboardChartsNow(repairs, onsites, pmJobs) {
    var animOpts = { animation:{ duration:750, easing:'easeInOutQuart' } };

    // กราฟขวา — destroy + clearRect + สร้างใหม่ทุกครั้ง = animate เสมอ
    if (statusChartInstance) { statusChartInstance.destroy(); statusChartInstance = null; }
    var ctx2 = document.getElementById('chart-job-statuses');
    if (!ctx2) return;
    var ctx2d = ctx2.getContext('2d');
    ctx2d.clearRect(0, 0, ctx2.width, ctx2.height);
    var statusCounts = {};
    repairs.forEach(function(j){ statusCounts[j.status] = (statusCounts[j.status]||0)+1; });
    var statusColors = { registered:'#6366f1', checked:'#06b6d4', quoted:'#f59e0b', quote_printed:'#f97316', claimed:'#10b981', po_received:'#22c55e', parts_issued:'#8b5cf6', ready_return:'#eab308', returning:'#7c3aed', closed:'#475569' };
    var statusKeys = Object.keys(statusCounts);
    statusChartInstance = new Chart(ctx2d, {
      type:'doughnut',
      data:{ labels:statusKeys.map(function(s){ return getStatusLabel(s); }), datasets:[{ data:statusKeys.map(function(s){ return statusCounts[s]; }), backgroundColor:statusKeys.map(function(s){ return statusColors[s]||'#94a3b8'; }), borderWidth:2, borderColor:'#fff' }] },
      options: Object.assign({ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ boxWidth:12, color:'#475569', font:{size:11} } } } }, animOpts)
    });

    // กราฟซ้าย
    _renderLeftChart(repairs, onsites, pmJobs);
  }

  function _renderLeftChart(repairs, onsites, pmJobs) {
    var animOpts = { animation:{ duration:750, easing:'easeInOutQuart' } };
    var products  = DB.getAll('products');
    var customers = DB.getAll('customers');
    var parts     = DB.getAll('parts');
    var ctx1 = document.getElementById('chart-monthly-jobs');
    if (!ctx1) return;
    var ctx1d = ctx1.getContext('2d');
    var titleEl = document.getElementById('chart-left-title');

    // destroy + clearRect เสมอ = animation ทุกครั้ง
    if (monthlyChartInstance) { monthlyChartInstance.destroy(); monthlyChartInstance = null; }
    ctx1d.clearRect(0, 0, ctx1.width, ctx1.height);

    var chartConfig = null;
    if (activeDashboardTab === 'repairs') {
      if (titleEl) titleEl.innerHTML = '<i data-lucide="pie-chart"></i>สัดส่วนงานซ่อมแยกตามยี่ห้อ';
      var brandCounts = {};
      repairs.forEach(function(j){ var p=products.find(function(x){ return x.id===j.product_id; }); var b=(p?p.brand:null)||j.product_brand||'อื่นๆ'; brandCounts[b]=(brandCounts[b]||0)+1; });
      chartConfig = { type:'doughnut', data:{ labels:Object.keys(brandCounts), datasets:[{ data:Object.values(brandCounts), backgroundColor:['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444'], borderWidth:2, borderColor:'#fff' }] } };
    } else if (activeDashboardTab === 'onsite') {
      if (titleEl) titleEl.innerHTML = '<i data-lucide="pie-chart"></i>Onsite ค้างแยกตามเขต';
      var zoneCounts = {North:0,Central:0,South:0,East:0};
      onsites.filter(function(j){ return j.status!=='closed'; }).forEach(function(j){ var c=customers.find(function(x){ return x.id===j.customer_id; }); if(c&&zoneCounts[c.zone]!==undefined) zoneCounts[c.zone]++; });
      chartConfig = { type:'doughnut', data:{ labels:['ภาคเหนือ','ภาคกลาง','ภาคใต้','ภาคตะวันออก'], datasets:[{ data:Object.values(zoneCounts), backgroundColor:['#06b6d4','#fbbf24','#f87171','#34d399'], borderWidth:2, borderColor:'#fff' }] } };
    } else if (activeDashboardTab === 'pm') {
      if (titleEl) titleEl.innerHTML = '<i data-lucide="pie-chart"></i>ความก้าวหน้าแผน PM';
      var done2 = pmJobs.filter(function(j){ return j.status==='completed'; }).length;
      var pend2 = pmJobs.filter(function(j){ return j.status==='pending'; }).length;
      chartConfig = { type:'doughnut', data:{ labels:['บำรุงรักษาแล้ว','ค้างดำเนินการ'], datasets:[{ data:[done2,pend2], backgroundColor:['#10b981','#f43f5e'], borderWidth:2, borderColor:'#fff' }] } };
    } else if (activeDashboardTab === 'lowstock') {
      if (titleEl) titleEl.innerHTML = '<i data-lucide="bar-chart-3"></i>ระดับอะไหล่สต็อกต่ำ';
      var lowParts = parts.filter(function(p){ return p.stock<=p.min_stock; });
      chartConfig = { type:'bar', data:{ labels:lowParts.length?lowParts.map(function(p){ return p.name.substring(0,14)+'...'; }):['ไม่มีสต็อกต่ำ'], datasets:[{ label:'คงเหลือ', data:lowParts.length?lowParts.map(function(p){ return p.stock; }):[0], backgroundColor:'#f43f5e', borderRadius:6 },{ label:'Min Stock', data:lowParts.length?lowParts.map(function(p){ return p.min_stock; }):[0], backgroundColor:'#94a3b8', borderRadius:6 }] } };
    }
    if (!chartConfig) return;
    var baseOpts = Object.assign({ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{boxWidth:12,color:'#475569'} } } }, animOpts);
    if (chartConfig.type === 'bar') { baseOpts.scales = {y:{beginAtZero:true}}; }
    chartConfig.options = baseOpts;
    monthlyChartInstance = new Chart(ctx1d, chartConfig);
    lucide.createIcons();
  }


  function populatePerformanceUserDropdown() {
    var select = document.getElementById('performance-user-select');
    if (!select) return;
    var engineers = DB.getAll('users').filter(function(u){ return u.role === 'engineer'; });
    select.innerHTML = engineers.map(function(e){ return '<option value="' + e.id + '">' + e.fullname + '</option>'; }).join('');
    loadUserPerformanceStats();
  }

  window.loadUserPerformanceStats = function () {
    var select = document.getElementById('performance-user-select');
    if (!select) return;
    var userId = select.value;
    if (!userId) return;
    var onsites = DB.getAll('onsite_jobs').filter(function(j){ return j.assigned_to === userId; });
    document.getElementById('perf-pending-jobs').textContent = onsites.filter(function(j){ return j.status !== 'closed'; }).length;
    var completed = onsites.filter(function(j){ return j.status === 'closed'; });
    document.getElementById('perf-completed-jobs').textContent = completed.length;
    var oncallDone = onsites.filter(function(j){ return j.status === 'closed' && j.type === 'oncall'; }).length;
    document.getElementById('perf-oncall-pct').textContent = onsites.length ? Math.round(oncallDone/onsites.length*100) + '%' : '0%';
    var products = DB.getAll('products');
    var customers = DB.getAll('customers');
    var tbody = document.querySelector('#table-user-perf-jobs tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (onsites.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">ไม่มีงาน</td></tr>'; return; }
    onsites.forEach(function(j) {
      var prod = products.find(function(p){ return p.id === j.product_id; });
      var cust = customers.find(function(c){ return c.id === j.customer_id; });
      var tr = document.createElement('tr');
      tr.innerHTML = '<td class="job-item-id">' + j.id + '</td><td>' + (prod ? prod.name.substring(0,28) : '-') + '</td><td>' + (cust ? cust.name.substring(0,28) : '-') + '</td><td><span class="badge badge-' + j.status + '">' + (j.status === 'closed' ? 'ปิดงาน' : 'จ่ายงาน') + '</span></td><td>' + j.created_at.substring(0,10) + '</td>';
      tbody.appendChild(tr);
    });
  };

  // ==================== REPAIR TABLE ====================
  var REPAIR_STATUS = {
    registered:      { label:'ลงทะเบียน',          badge:'badge-registered', step:1, color:'#6366f1' },
    checked:         { label:'กำลังตรวจเช็ค',       badge:'badge-checked',    step:2, color:'#06b6d4' },
    // ── Claim path ──
    claim_sent:      { label:'ส่งเคลมแล้ว',         badge:'badge-po_received',step:3, color:'#0ea5e9' },
    claim_approved:  { label:'เคลมอนุมัติ',          badge:'badge-po_received',step:4, color:'#10b981' },
    claim_rejected:  { label:'เคลมไม่อนุมัติ',       badge:'badge-danger',     step:4, color:'#ef4444' },
    // ── Quote path ──
    quoted:          { label:'จัดทำใบเสนอราคา',     badge:'badge-quoted',     step:3, color:'#f59e0b' },
    quote_printed:   { label:'เสนอราคาแล้ว',        badge:'badge-quoted',     step:4, color:'#f59e0b' },
    po_received:     { label:'เบิก/สั่งอะไหล่',     badge:'badge-po_received',step:5, color:'#10b981' },
    po_rejected:     { label:'ไม่อนุมัติ PO',        badge:'badge-danger',     step:5, color:'#ef4444' },
    // ── Common ──
    claimed:         { label:'อนุมัติเคลม/เบิกอะไหล่', badge:'badge-po_received',step:5, color:'#10b981' },
    parts_issued:    { label:'อยู่ระหว่างซ่อม',     badge:'badge-onsite',     step:6, color:'#8b5cf6' },
    ready_return:    { label:'รอส่งคืน',             badge:'badge-warning',    step:7, color:'#f59e0b' },
    returning:       { label:'อยู่ระหว่างส่งคืน',   badge:'badge-returned',   step:8, color:'#7c3aed' },
    closed:          { label:'ปิดงาน',               badge:'badge-closed',     step:9, color:'#475569' }
  };

  function getStatusLabel(status) {
    return REPAIR_STATUS[status] ? REPAIR_STATUS[status].label : (status || '-');
  }

  function getStatusBadge(status) {
    return REPAIR_STATUS[status] ? REPAIR_STATUS[status].badge : 'badge-registered';
  }

  function nowTs() {
    return new Date().toLocaleString('th-TH', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  }

  var REPAIR_STATUS_ACTIONS = {
    registered:      [{ label:'พิมพ์ใบรับงาน',     icon:'printer',      fn:'printRepairReceipt',    cls:'btn-info'    }],
    checked:         [],
    claim_sent:      [],
    claim_approved:  [{ label:'พิมพ์ใบเบิกอะไหล่', icon:'package-open', fn:'quickPrintRequisition',  cls:'btn-success' }],
    claim_rejected:  [{ label:'พิมพ์ใบเสนอราคา',   icon:'file-text',    fn:'quickPrintQuote',        cls:'btn-warning' }],
    quoted:          [{ label:'พิมพ์ใบเสนอราคา',   icon:'file-text',    fn:'quickPrintQuote',        cls:'btn-warning' }],
    quote_printed:   [{ label:'พิมพ์ใบเสนอราคา',   icon:'file-text',    fn:'quickPrintQuote',        cls:'btn-warning' }],
    po_received:     [{ label:'พิมพ์ใบเบิกอะไหล่', icon:'package-open', fn:'quickPrintRequisition',  cls:'btn-success' }],
    po_rejected:     [{ label:'รายงานซ่อม',         icon:'wrench',       fn:'quickPrintRepairReport', cls:'btn-primary' }],
    claimed:         [{ label:'พิมพ์ใบเบิกอะไหล่', icon:'package-open', fn:'quickPrintRequisition',  cls:'btn-success' }],
    parts_issued:    [{ label:'พิมพ์ใบเบิกอะไหล่', icon:'package-open', fn:'quickPrintRequisition',  cls:'btn-success' }],
    ready_return:    [
      { label:'รายงานซ่อม', icon:'wrench', fn:'quickPrintRepairReport', cls:'btn-primary' },
      { label:'ใบส่งคืน',  icon:'truck',  fn:'quickPrintReturn',       cls:'btn-outline' }
    ],
    returning:       [
      { label:'รายงานซ่อม', icon:'wrench', fn:'quickPrintRepairReport', cls:'btn-primary' },
      { label:'ใบส่งคืน',  icon:'truck',  fn:'quickPrintReturn',       cls:'btn-outline' }
    ],
    closed:          []
  };

  var STEPPER_PRINT_BTNS = {
    registered:    [{ label:'ใบรับงาน',     icon:'printer',      fn:'printRepairReceipt',    cls:'btn-info'    }],
    claim_approved:[{ label:'ใบเบิกอะไหล่', icon:'package-open', fn:'quickPrintRequisition', cls:'btn-success' }],
    quoted:        [{ label:'ใบเสนอราคา',   icon:'file-text',    fn:'quickPrintQuote',        cls:'btn-warning' }],
    po_received:   [{ label:'ใบเบิกอะไหล่', icon:'package-open', fn:'quickPrintRequisition', cls:'btn-success' }],
    ready_return:  [
      { label:'รายงานซ่อม', icon:'wrench', fn:'quickPrintRepairReport', cls:'btn-primary' },
      { label:'ใบส่งคืน',  icon:'truck',  fn:'quickPrintReturn',       cls:'btn-outline' }
    ]
  };

  function renderRepairTable(list) {
    var currentUser = DB.getCurrentUser();
    var isPrivileged = ['manager','supervisor'].includes(currentUser.role);
    var isEngineer   = currentUser.role === 'engineer';
    var allJobs = DB.getAll('repair_jobs');
    if (isEngineer && !list) {
      allJobs = allJobs.filter(function(j){ return j.created_by===currentUser.id||j.assigned_to===currentUser.id; });
    } else if (list) {
      allJobs = list;
    }
    // เรียงจากงานล่าสุดก่อน
    allJobs = allJobs.slice().sort(function(a,b){
      return (b.created_at||'').localeCompare(a.created_at||'');
    });

    var products = DB.getAll('products'); var customers = DB.getAll('customers');
    var body = document.getElementById('body-repairs'); if (!body) return;
    body.innerHTML = '';
    if (allJobs.length === 0) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px;">ไม่มีรายการงานซ่อม</td></tr>'; lucide.createIcons(); return; }

    allJobs.forEach(function(job) {
      var prod = products.find(function(p){ return p.id === job.product_id; });
      var cust = customers.find(function(c){ return c.id === job.customer_id; });
      var prodName  = prod ? prod.name  : (job.product_name  || job.product_id  || '-');
      var prodBrand = prod ? prod.brand : (job.product_brand || '');
      var custName  = cust ? cust.name  : (job.customer_name || job.customer_id || '-');
      var isOwner   = job.created_by===currentUser.id || job.assigned_to===currentUser.id;
      var canManage = isOwner || isPrivileged;
      var canDelete = (isOwner && job.status==='registered') || isPrivileged;
      // ปุ่มพิมพ์: เจ้าของงานเท่านั้น (isOwner) ไม่รวม manager/supervisor
      var canPrint  = isOwner;

      var actions    = REPAIR_STATUS_ACTIONS[job.status] || [];
      var actionBtns = '';

      // ปุ่ม "จัดการงาน" — icon + label ชัดเจน
      if (job.status === 'closed') {
        // งานปิดแล้ว: ดูประวัติ + เอกสาร (ทุกคนที่ canManage)
        if (canManage) {
          actionBtns += '<button class="btn btn-secondary btn-sm" onclick="openRepairProgressModal(\'' + job.id + '\')" title="ดูประวัติงาน"><i data-lucide="clock"></i>ประวัติ</button>';
        }
        actionBtns += '<button class="btn btn-primary btn-sm" onclick="openJobDocReview(\'' + job.id + '\')" title="ดูเอกสารทั้งหมด"><i data-lucide="folder-open"></i>เอกสาร</button>';
      } else if (canManage) {
        // ปุ่มจัดการ — icon "arrow-right-circle" สื่อถึง "ดำเนินการถัดไป"
        actionBtns += '<button class="btn btn-secondary btn-sm" onclick="openRepairProgressModal(\'' + job.id + '\')" title="จัดการ / ดำเนินการขั้นถัดไป" style="gap:5px;">' +
          '<i data-lucide="circle-arrow-right"></i>จัดการ</button>';
      }

      // ปุ่มพิมพ์เอกสาร — เฉพาะเจ้าของงาน (engineer ที่รับผิดชอบ)
      if (canPrint) {
        var isClaimFree = job.quotation && job.quotation.is_free;
        actions.filter(function(act){
          return !(isClaimFree && act.fn === 'quickPrintQuote');
        }).forEach(function(act) {
          actionBtns += '<button class="btn ' + act.cls + ' btn-sm" onclick="' + act.fn + '(\'' + job.id + '\')" title="' + act.label + '">' +
            '<i data-lucide="' + act.icon + '"></i>' + act.label + '</button>';
        });
      }

      // Reassign — privileged only
      if (isPrivileged) {
        actionBtns += '<button class="btn btn-warning btn-sm btn-icon-only" onclick="openReassignModal(\'' + job.id + '\',\'repair_jobs\')" title="โอนงาน"><i data-lucide="user-check"></i></button>';
      }
      // Delete
      if (canDelete) {
        actionBtns += '<button class="btn btn-danger btn-sm btn-icon-only" onclick="deleteJob(\'repair_jobs\',\'' + job.id + '\')" title="ลบ"><i data-lucide="trash-2"></i></button>';
      }

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="job-item-id" style="cursor:pointer;" onclick="openRepairProgressModal(\'' + job.id + '\')" title="คลิกจัดการ">' + job.id + '</td>' +
        '<td><div style="font-weight:600;">' + prodName + '</div><div style="font-size:.75rem;color:var(--text-muted);">' + prodBrand + '</div></td>' +
        '<td>' + (job.sn ? '<span style="font-family:monospace;font-weight:700;font-size:.82rem;color:var(--primary);">' + job.sn + '</span>' : '<span style="color:var(--text-muted);font-size:.78rem;">-</span>') + '</td>' +
        '<td><div style="font-size:.85rem;font-weight:600;">' + custName + '</div></td>' +
        '<td>' + job.created_at.substring(0,10) + '</td>' +
        '<td>' +
          '<span class="badge ' + getStatusBadge(job.status) + '">' + getStatusLabel(job.status) + '</span>' +
          (job.timestamps && job.timestamps[job.status] ? '<div style="font-size:.65rem;color:var(--text-muted);margin-top:3px;">' + job.timestamps[job.status] + '</div>' : '') +
        '</td>' +
        '<td><div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">' + actionBtns + '</div></td>';
      body.appendChild(tr);
    });
    lucide.createIcons();
  }

  window.filterRepairTable = function () {
    var q = document.getElementById('repair-search-input').value.toLowerCase();
    var status = document.getElementById('repair-filter-status').value;
    var currentUser = DB.getCurrentUser();
    var isEngineer = currentUser.role === 'engineer';
    var products = DB.getAll('products'); var customers = DB.getAll('customers');
    var base = DB.getAll('repair_jobs');
    if (isEngineer) base = base.filter(function(j){ return j.created_by===currentUser.id||j.assigned_to===currentUser.id; });
    renderRepairTable(base.filter(function(job) {
      var prod = products.find(function(p){ return p.id === job.product_id; });
      var cust = customers.find(function(c){ return c.id === job.customer_id; });
      var matchQ = job.id.toLowerCase().includes(q)||(prod&&prod.name.toLowerCase().includes(q))||(cust&&cust.name.toLowerCase().includes(q));
      return matchQ && (!status||job.status===status);
    }));
  };


  // ==================== REPAIR RECEIPT PRINT ====================

  // ---- Quick-print wrappers (called directly from table buttons) ----
  window.quickPrintQuote = function(jobId) {
    var job = DB.find('repair_jobs','id',jobId); if (!job) return;
    // Restore parts directly from DB
    _repairSelectedParts = (job.parts_needed||[]).map(function(item){
      var p = DB.find('parts','id',item.part_id)||{};
      return { part_id:item.part_id, name:p.name||item.part_id, code:p.code||'', qty:item.qty, price:p.price||0 };
    });
    var prod   = DB.find('products','id', job.product_id)||{};
    var cust   = DB.find('customers','id', job.customer_id)||{};
    var prodName  = prod.name  || job.product_name  || '-';
    var prodBrand = prod.brand || job.product_brand || '-';
    var custName  = cust.name  || job.customer_name  || '-';
    var co     = getCompanyInfo();
    var qNo    = job.quotation ? job.quotation.number : ('QT-' + new Date().getFullYear() + '-' + jobId.slice(-4));
    var qDate  = job.quotation ? job.quotation.date : new Date().toISOString().substring(0,10);
    var svcFee = job.quotation ? (job.quotation.service_fee||1500) : 1500;

    var partsSum = _repairSelectedParts.reduce(function(s,i){ return s+i.qty*i.price; }, 0);
    var sub  = partsSum + svcFee;
    var vat  = Math.round(sub * 0.07);
    var grand= sub + vat;
    var fmt  = function(n){ return '฿' + n.toLocaleString(); };

    // Update status → quote_printed
    if (job.status === 'checked') {
      var ts = job.timestamps || {};
      ts['quote_printed'] = nowTs();
      DB.update('repair_jobs','id',jobId,{ status:'quote_printed', quotation:{ number:qNo, date:qDate, service_fee:svcFee, amount:grand }, timestamps:ts });
    }

    var rowsHtml = _repairSelectedParts.map(function(item,i){
      return '<tr><td style="text-align:center;">'+(i+1)+'</td><td>'+item.name+'</td><td style="text-align:center;">'+item.qty+'</td><td style="text-align:right;">'+fmt(item.price)+'</td><td style="text-align:right;">'+fmt(item.qty*item.price)+'</td></tr>';
    }).join('') + '<tr style="background:rgba(99,102,241,.04);"><td style="text-align:center;">'+(_repairSelectedParts.length+1)+'</td><td>ค่าแรง/ค่าบริการวิศวกรรม</td><td style="text-align:center;">1</td><td style="text-align:right;">'+fmt(svcFee)+'</td><td style="text-align:right;">'+fmt(svcFee)+'</td></tr>';

    var bodyContent =
      '<div class="g2" style="margin-bottom:14px;">'+
        '<div><div class="lbl">ลูกค้า / โรงพยาบาล</div><div class="val">'+(cust.name||'-')+'</div>'+
          '<div style="font-size:.85rem;color:#64748b;margin-top:2px;">'+(cust.address||'')+' '+(cust.province||'')+'</div></div>'+
        '<div style="text-align:right;">'+
          '<div class="lbl" style="text-align:right;">เลขที่</div><div class="val" style="text-align:right;font-family:monospace;color:#4f46e5;">'+qNo+'</div>'+
          '<div class="lbl" style="margin-top:6px;text-align:right;">วันที่</div><div class="val" style="text-align:right;">'+qDate+'</div>'+
          '<div class="lbl" style="margin-top:6px;text-align:right;">อ้างอิงงาน</div><div class="val" style="text-align:right;font-family:monospace;">'+jobId+'</div>'+
          '<div class="lbl" style="margin-top:6px;text-align:right;">เครื่องมือ</div><div class="val" style="text-align:right;">'+(prod.name||'-')+(job.sn?' (S/N:'+job.sn+')':'')+'</div>'+
        '</div>'+
      '</div>'+
      '<table><thead><tr><th style="width:40px;text-align:center;">ลำดับ</th><th>รายการ</th><th style="width:60px;text-align:center;">จำนวน</th><th style="width:110px;text-align:right;">ราคา/หน่วย</th><th style="width:120px;text-align:right;">ยอดรวม</th></tr></thead>'+
      '<tbody>'+rowsHtml+'</tbody></table>'+
      '<div style="display:flex;justify-content:flex-end;margin-bottom:20px;">'+
        '<table style="width:250px;border:none;">'+
          '<tr><td style="padding:4px 8px;border:none;">Subtotal:</td><td style="text-align:right;font-weight:600;padding:4px 8px;border:none;">'+fmt(sub)+'</td></tr>'+
          '<tr><td style="padding:4px 8px;border:none;">VAT 7%:</td><td style="text-align:right;padding:4px 8px;border:none;">'+fmt(vat)+'</td></tr>'+
          '<tr style="border-top:2px solid #6366f1;"><td style="padding:8px;font-weight:800;font-size:.95rem;border:none;">Grand Total:</td><td style="text-align:right;font-weight:800;font-size:.95rem;color:#4f46e5;padding:8px;border:none;">'+fmt(grand)+'</td></tr>'+
        '</table>'+
      '</div>'+
      '<div class="sigs">'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้จัดทำ / วิศวกร</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้อนุมัติ / หัวหน้า</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้สั่งจ้าง / ลูกค้า</div></div>'+
      '</div>';

    openDocWindow(buildDocHTML('ใบเสนอราคา', bodyContent, jobId, co));
    renderRepairTable(); computeNotifications();
    showToast('success','พิมพ์ใบเสนอราคาสำเร็จ', job.status==='checked' ? 'สถานะ → เสนอราคาแล้ว' : '');
  };

  window.quickPrintRequisition = function(jobId) {
    var job = DB.find('repair_jobs','id',jobId); if (!job) return;
    var prod  = DB.find('products','id',job.product_id)||{};
    var cust  = DB.find('customers','id',job.customer_id)||{};
    var prodName  = prod.name  || job.product_name  || '-';
    var prodBrand = prod.brand || job.product_brand || '-';
    var custName  = cust.name  || job.customer_name  || '-';
    var co    = getCompanyInfo();
    var parts = DB.getAll('parts');
    var isFree = job.quotation && job.quotation.is_free;
    var isClaim = job.quotation && job.quotation.is_claim;
    var docTitle = isFree ? 'ใบเบิกอะไหล่ (เคลมประกัน)' : 'ใบเบิกอะไหล่';

    var rowsHtml = (job.parts_needed||[]).map(function(item,i){
      var p = parts.find(function(x){ return x.id===item.part_id; })||{};
      var priceDisplay = isFree ? '<span style="color:#059669;font-weight:800;">ฟรี (ประกัน)</span>' : ('฿' + (p.price||0).toLocaleString());
      var totalDisplay = isFree ? '<span style="color:#059669;font-weight:800;">฿0</span>' : ('฿' + (item.qty*(p.price||0)).toLocaleString());
      return '<tr><td style="text-align:center;">'+(i+1)+'</td><td>'+(p.code||item.part_id)+'</td><td>'+(p.name||'-')+'</td><td style="text-align:center;">'+item.qty+'</td><td style="text-align:right;">'+priceDisplay+'</td><td style="text-align:right;">'+totalDisplay+'</td><td></td></tr>';
    }).join('');

    var claimBanner = (isClaim || isFree) ? (
      '<div style="background:' + (isFree ? 'rgba(16,185,129,.08)' : 'rgba(99,102,241,.06)') + ';border:2px solid ' + (isFree ? '#10b981' : '#6366f1') + ';border-radius:6px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">' +
        '<span style="font-size:1.5rem;">' + (isFree ? '🛡️' : '📋') + '</span>' +
        '<div>' +
          '<div style="font-weight:800;font-size:13px;color:' + (isFree ? '#065f46' : '#3730a3') + ';">' + (isFree ? 'เคลมสินค้าฟรี — อยู่ในเงื่อนไขประกัน' : 'สินค้าในประกัน — มีค่าบริการ') + '</div>' +
          '<div style="font-size:11px;color:#64748b;margin-top:2px;">ค่าอะไหล่: ฟรี ตามเงื่อนไขการรับประกันสินค้า</div>' +
        '</div>' +
      '</div>'
    ) : '';

    var bodyContent =
      claimBanner +
      '<div class="g2" style="margin-bottom:14px;">'+
        '<div><div class="lbl">เลขที่งานซ่อม</div><div class="val" style="font-family:monospace;font-size:16px;color:#4f46e5;">'+jobId+'</div></div>'+
        '<div><div class="lbl">วันที่เบิก</div><div class="val">'+new Date().toLocaleDateString('th-TH')+'</div></div>'+
        '<div><div class="lbl">สินค้า</div><div class="val">'+(prod.name||'-')+' ('+(prod.brand||'-')+')</div></div>'+
        '<div><div class="lbl">S/N</div><div class="val" style="font-family:monospace;color:#4f46e5;">'+(job.sn||'-')+'</div></div>'+
        '<div><div class="lbl">ลูกค้า</div><div class="val">'+(cust.name||'-')+'</div></div>'+
        '<div><div class="lbl">เลขที่ PO / เคลม</div><div class="val" style="font-family:monospace;">'+(job.po?job.po.number:(job.quotation?job.quotation.number:'-'))+'</div></div>'+
      '</div>'+
      '<table><thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่ออะไหล่</th><th style="text-align:center;">จำนวน</th><th style="text-align:right;">ราคา/ชิ้น</th><th style="text-align:right;">ยอดรวม</th><th>หมายเหตุ</th></tr></thead>'+
      '<tbody>'+(rowsHtml||'<tr><td colspan="7" style="text-align:center;color:#94a3b8;">ไม่มีรายการอะไหล่</td></tr>')+'</tbody></table>'+
      (isFree ? '<div style="text-align:right;font-size:13px;font-weight:800;color:#059669;margin-bottom:16px;">✓ ไม่มีค่าอะไหล่ — เคลมประกันสินค้า</div>' : '') +
      '<div class="sigs">'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้ขอเบิก / วิศวกร</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้อนุมัติ / หัวหน้า</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้จ่ายอะไหล่ / คลัง</div></div>'+
      '</div>';
    openDocWindow(buildDocHTML(docTitle, bodyContent, jobId, co));
  };

  // ---- รายงานการซ่อมและใบส่งคืน (รวมเป็นเอกสารเดียว) ----
  window.quickPrintRepairReport = function(jobId) {
    printRepairAndReturnDoc(jobId);
  };
  window.quickPrintReturn = function(jobId) {
    printRepairAndReturnDoc(jobId);
  };

  function printRepairAndReturnDoc(jobId) {
    var job    = DB.find('repair_jobs','id',jobId); if (!job) return;
    var prod   = DB.find('products','id',job.product_id)||{};
    var cust   = DB.find('customers','id',job.customer_id)||{};
    var prodName  = prod.name  || job.product_name  || '-';
    var prodBrand = prod.brand || job.product_brand || '-';
    var custName  = cust.name  || job.customer_name  || '-';
    var creator= DB.find('users','id',job.created_by)||{};
    var dp     = job.sn ? DB.find('delivered_products','sn',job.sn) : null;
    var co     = getCompanyInfo();
    var parts  = DB.getAll('parts');

    var retNo  = job.return_slip ? job.return_slip.number : ('DN-'+new Date().getFullYear()+'-'+jobId.slice(-4));
    var retDate= job.return_slip ? job.return_slip.date   : new Date().toISOString().substring(0,10);
    var result = job.repair_result || '';
    var dept   = (dp && dp.department) ? dp.department : (job.department || '-');
    var wcMap  = { in_warranty:'✓ สินค้าในประกัน', out_warranty:'✗ สินค้านอกประกัน', void_warranty:'⚠ ในประกัน แต่ไม่ครอบคลุม' };
    var wcColor= { in_warranty:'#059669', out_warranty:'#dc2626', void_warranty:'#d97706' };
    var wcVal  = job.warranty_condition || 'out_warranty';

    // Parts table — ตัดราคาออก เหลือแค่ รหัส ชื่อ จำนวน
    var partsHtml = (job.parts_needed||[]).map(function(item,i){
      var p = parts.find(function(x){ return x.id===item.part_id; })||{};
      return '<tr><td style="text-align:center;width:36px;">'+(i+1)+'</td>'+
        '<td style="width:88px;font-family:monospace;font-size:11.5px;">'+(p.code||'-')+'</td>'+
        '<td>'+(p.name||'-')+'</td>'+
        '<td style="text-align:center;width:60px;font-weight:700;">'+item.qty+'</td>'+
        '</tr>';
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:10px;">ไม่มีรายการอะไหล่</td></tr>';

    var creatorTel = creator.tel || creator.phone || co.tel || '-';

    // เพิ่มแถวว่างในตารางอะไหล่ให้ครบ 4 แถว
    var partRowCount = (job.parts_needed||[]).length;
    var emptyPartRows = '';
    for (var i = partRowCount; i < 4; i++) {
      emptyPartRows += '<tr><td style="text-align:center;color:transparent;">-</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';
    }

    var bodyContent =
      '<div class="g3" style="margin-bottom:8px;">'+
        '<div><div class="lbl">เลขที่งานซ่อม</div><div class="val" style="font-family:monospace;font-size:14px;color:#4f46e5;">'+jobId+'</div></div>'+
        '<div><div class="lbl">เลขที่ใบส่งคืน</div><div class="val" style="font-family:monospace;font-size:13px;color:#0ea5e9;">'+retNo+'</div></div>'+
        '<div><div class="lbl">วันที่ส่งคืน</div><div class="val">'+retDate+'</div></div>'+
        '<div><div class="lbl">วันที่รับงาน</div><div class="val">'+(job.created_at||'').substring(0,10)+'</div></div>'+
        '<div><div class="lbl">ผู้รับผิดชอบ / วิศวกร</div><div class="val">'+(creator.fullname||'-')+'<br><span style="font-size:10px;color:#475569;font-weight:400;">📞 '+creatorTel+'</span></div></div>'+
        '<div><div class="lbl">เงื่อนไขประกัน</div>'+
          '<div class="val" style="font-weight:800;color:'+wcColor[wcVal]+';">'+wcMap[wcVal]+'</div>'+
          '<div style="font-size:9px;color:#475569;margin-top:2px;">📋 รับประกันงานซ่อม 120 วัน (อาการชำรุดเดิม)</div>'+
        '</div>'+
      '</div>'+

      '<div style="display:grid;grid-template-columns:1fr 1fr;border:1px solid #d1d5db;border-radius:3px;margin-bottom:6px;overflow:hidden;">'+
        '<div style="padding:7px 11px;border-right:1px solid #d1d5db;">'+
          '<div class="sec" style="margin-top:0;">ข้อมูลเครื่องมือแพทย์</div>'+
          '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;">'+
            '<span class="lbl" style="white-space:nowrap;">ชื่อสินค้า</span><span class="val">'+(prod.name||'-')+'</span>'+
            '<span class="lbl" style="white-space:nowrap;">ยี่ห้อ / Brand</span><span class="val">'+(prod.brand||'-')+'</span>'+
            '<span class="lbl" style="white-space:nowrap;">Serial No. (S/N)</span><span class="val" style="font-family:monospace;font-weight:700;color:#4f46e5;">'+(job.sn||'-')+'</span>'+
          '</div>'+
        '</div>'+
        '<div style="padding:7px 11px;">'+
          '<div class="sec" style="margin-top:0;">ข้อมูลลูกค้า</div>'+
          '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;">'+
            '<span class="lbl" style="white-space:nowrap;">โรงพยาบาล</span><span class="val">'+(cust.name||'-')+'</span>'+
            '<span class="lbl" style="white-space:nowrap;">แผนก</span><span class="val">'+dept+'</span>'+
            '<span class="lbl" style="white-space:nowrap;">ที่อยู่</span><span class="val" style="font-size:10px;">'+(cust.address||'')+' '+(cust.province||'')+'</span>'+
          '</div>'+
        '</div>'+
      '</div>'+

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">'+
        '<div><div class="sec" style="margin-top:0;">อาการชำรุดที่แจ้ง</div><div class="symptom-box">'+(job.symptom||'-')+'</div></div>'+
        '<div><div class="sec" style="margin-top:0;">ผลการตรวจเช็ค</div><div class="check-box">'+(job.check_results||'-')+'</div></div>'+
      '</div>'+

      '<div class="sec">สรุปผลการซ่อม</div>'+
      '<div class="result-box" style="margin-bottom:6px;">'+(result||'&nbsp;')+'</div>'+

      '<div class="sec">รายการอะไหล่ที่เปลี่ยน</div>'+
      '<table style="margin-bottom:6px;">'+
        '<thead><tr>'+
          '<th style="width:28px;text-align:center;">#</th>'+
          '<th style="width:72px;">รหัส</th>'+
          '<th>ชื่ออะไหล่</th>'+
          '<th style="width:50px;text-align:center;">จำนวน</th>'+
        '</tr></thead>'+
        '<tbody>'+partsHtml+emptyPartRows+'</tbody>'+
      '</table>'+

      '<div class="sec">รายการสินค้าที่คืน</div>'+
      '<table style="margin-bottom:8px;">'+
        '<thead><tr><th style="width:28px;">#</th><th>ชื่อสินค้า / เครื่องมือ</th><th>หมายเลขเครื่อง (S/N)</th><th>อุปกรณ์ประกอบ</th><th style="width:60px;">สภาพ</th></tr></thead>'+
        '<tbody>'+
          '<tr>'+
            '<td style="text-align:center;">1</td>'+
            '<td><strong>'+(prod.name||'-')+'</strong><br><span style="font-size:10px;color:#64748b;">'+(prod.brand||'')+'</span></td>'+
            '<td style="font-family:monospace;font-weight:700;color:#4f46e5;">'+(job.sn||'-')+'</td>'+
            '<td>'+(job.accessory||'ไม่มี')+'</td>'+
            '<td></td>'+
          '</tr>'+
          // แถวว่างเพิ่มเติมในตารางสินค้า
          '<tr><td style="text-align:center;color:transparent;">-</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'+
          '<tr><td style="text-align:center;color:transparent;">-</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'+
        '</tbody>'+
      '</table>'+

      // ── ส่วนล่าง: ลายมือชื่อ + barcode + footer — margin-top:auto ดันลงขอบล่าง ──
      '<div style="margin-top:auto;">'+
        '<div class="sec">ลายมือชื่อรับ-ส่ง</div>'+
        '<div class="sig-wrap">'+
          '<div><div class="sig-line"></div><div class="sig-lbl">ช่างซ่อม / วิศวกร</div><div class="sig-note">Technician</div><div class="sig-date"></div><div class="sig-note">วันที่ / Date</div></div>'+
          '<div><div class="sig-line"></div><div class="sig-lbl">ผู้ส่งคืน</div><div class="sig-note">Delivered by</div><div class="sig-date"></div><div class="sig-note">วันที่ / Date</div></div>'+
          '<div><div class="sig-line"></div><div class="sig-lbl">ผู้รับคืน / ลูกค้า</div><div class="sig-note">Received by</div><div class="sig-date"></div><div class="sig-note">วันที่ / Date</div></div>'+
          '<div><div class="sig-line"></div><div class="sig-lbl">หัวหน้างาน / ผู้ตรวจสอบ</div><div class="sig-note">Supervisor</div><div class="sig-date"></div><div class="sig-note">วันที่ / Date</div></div>'+
        '</div>'+
        '<div class="bc-section">'+
          '<svg id="doc-bc"></svg>'+
          '<div class="bc-lbl">แสกน Barcode เพื่อค้นหา / ดำเนินการงาน '+jobId+'</div>'+
        '</div>'+
        '<div class="foot">'+co.name+' &nbsp;|&nbsp; MES Service System v2.0 &nbsp;|&nbsp; พิมพ์เมื่อ: '+new Date().toLocaleString('th-TH')+'</div>'+
      '</div>';

    openDocWindow(buildDocHTML('รายงานการซ่อมและใบส่งคืน', bodyContent, jobId, co));
  }

  // ---- Shared document builder with Barcode ----
  function buildDocHTML(title, bodyContent, jobId, co) {
    var scriptOpen  = '<scr' + 'ipt>';
    var scriptClose = '</scr' + 'ipt>';
    var jsSrc = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    var css = [
      '*{box-sizing:border-box;margin:0;padding:0}',
      'body{font-family:"Sarabun",Tahoma,Arial,sans-serif;font-size:11.5px;padding:0;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      '.wrap{width:100%;padding:8mm 10mm;display:flex;flex-direction:column;height:277mm;overflow:hidden;}',

      '.hdr{border:1.5px solid #334155;border-radius:3px;padding:8px 13px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;background:#fff;}',
      '.hdr-co h1{font-size:11.5px;font-weight:800;color:#0f172a;margin-bottom:2px;}',
      '.hdr-co p{font-size:9px;color:#475569;line-height:1.5;margin:0;}',
      '.hdr-right{text-align:right;flex-shrink:0;}',
      '.doc-title{font-size:15px;font-weight:900;color:#334155;line-height:1;}',
      '.doc-sub{font-size:8px;color:#64748b;margin-top:2px;}',
      '.doc-no{font-size:11px;font-weight:800;color:#4f46e5;margin-top:3px;font-family:monospace;}',

      '.sec{font-size:9px;font-weight:800;color:#334155;border-bottom:1px solid #334155;padding-bottom:2px;margin:6px 0 4px;letter-spacing:.03em;}',
      '.g2{display:grid;grid-template-columns:1fr 1fr;gap:3px 16px;}',
      '.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px 12px;}',
      '.lbl{font-size:8.5px;color:#64748b;font-weight:700;margin-bottom:1px;}',
      '.val{font-size:11.5px;font-weight:600;color:#0f172a;line-height:1.3;}',

      'table{width:100%;border-collapse:collapse;margin-bottom:6px;}',
      'th{background:#f1f5f9;padding:4px 8px;font-size:9.5px;font-weight:700;text-align:left;border:1px solid #d1d5db;}',
      'td{padding:4px 8px;border:1px solid #e2e8f0;font-size:11px;vertical-align:top;line-height:1.35;}',

      '.sig-wrap{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;text-align:center;margin-top:3px;}',
      '.sig-line{border-bottom:1px solid #334155;height:30px;margin-bottom:3px;}',
      '.sig-date{border-bottom:1px dashed #94a3b8;height:20px;margin-top:7px;}',
      '.sig-lbl{font-size:9px;color:#374151;font-weight:600;line-height:1.3;}',
      '.sig-note{font-size:7.5px;color:#94a3b8;margin-top:2px;}',

      '.result-box{background:#f0fdf4;border:1px solid #86efac;border-radius:3px;padding:6px 10px;font-size:11.5px;line-height:1.7;min-height:38px;}',
      '.symptom-box{border:1px solid #fed7aa;border-radius:3px;padding:6px 10px;font-size:11.5px;line-height:1.7;min-height:38px;background:#fffbf5;}',
      '.check-box{border:1px solid #bae6fd;border-radius:3px;padding:6px 10px;font-size:11.5px;line-height:1.7;min-height:38px;background:#f0f9ff;}',

      '.bc-section{border-top:1px solid #d1d5db;padding:7px 0 2px;text-align:center;margin-top:8px;}',
      '.bc-section svg{max-width:240px;width:100%;display:block;margin:0 auto;}',
      '.bc-lbl{font-size:8px;color:#94a3b8;margin-top:3px;}',
      '.foot{border-top:1px solid #d1d5db;margin-top:5px;padding:4px 0 0;text-align:center;font-size:8.5px;color:#64748b;}',

      '@media print{',
      '  body,html{margin:0;padding:0;}',
      '  .wrap{padding:0;}',
      '  @page{margin:10mm;size:A4 portrait;}',
      '}'
    ].join('');

    return '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">'+
      '<title>'+title+' '+jobId+'</title>'+
      '<link rel="preconnect" href="https://fonts.googleapis.com">'+
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'+
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap">'+
      '<style>'+css+'</style>'+
      '</head><body>'+
      '<div class="wrap">'+
        '<div class="hdr">'+
          '<div class="hdr-co">'+
            '<h1>'+(co.name||'บริษัท เมดิคอลเอ็นจิเนียริ่งเซอร์วิส จำกัด')+'</h1>'+
            '<p>'+(co.address||'')+'</p>'+
            '<p>โทร: '+(co.tel||'-')+' &nbsp;|&nbsp; เลขผู้เสียภาษี: '+(co.tax_id||'-')+'</p>'+
          '</div>'+
          '<div class="hdr-right">'+
            '<div class="doc-title">'+title+'</div>'+
            '<div class="doc-sub">Job Reference No.</div>'+
            '<div class="doc-no">'+jobId+'</div>'+
          '</div>'+
        '</div>'+
        '<div style="display:flex;flex-direction:column;flex:1;">'+bodyContent+'</div>'+
      '</div>'+
      '<scr'+'ipt src="'+jsSrc+'"><'+'/script>'+
      scriptOpen+
        'document.fonts.ready.then(function(){'+
          'try{JsBarcode(document.getElementById("doc-bc"),"'+jobId+'",{format:"CODE128",width:1.9,height:38,displayValue:true,fontSize:10,margin:3,lineColor:"#334155",background:"#fff"});}catch(e){}'+
          'setTimeout(function(){window.print();},500);'+
        '});'+
      scriptClose+
      '</body></html>';
  }


  function openDocWindow(html) {
    var win = window.open('','_blank','width=840,height=960,scrollbars=yes');
    if (!win) { showToast('warning','Popup ถูกบล็อก','กรุณาอนุญาต Popup แล้วลองใหม่'); return; }
    win.document.open(); win.document.write(html); win.document.close();
  }

  window.printRepairReceipt = function(jobId) {
    var job = DB.find('repair_jobs','id',jobId);
    if (!job) { showToast('danger','ไม่พบข้อมูลงาน',''); return; }

    // เปลี่ยนสถานะเป็น "ตรวจเช็ค" ทันทีที่พิมพ์ใบรับงาน
    if (job.status === 'registered') {
      var ts = job.timestamps || {};
      ts['checked'] = nowTs();
      DB.update('repair_jobs','id',jobId,{ status:'checked', timestamps:ts });
      job = DB.find('repair_jobs','id',jobId); // reload
      renderRepairTable();
      showToast('success','สถานะเปลี่ยนเป็น "ตรวจเช็ค"','กำลังเปิดใบรับงาน...');
    }

    var prod    = DB.find('products','id', job.product_id) || {};
    var cust    = DB.find('customers','id', job.customer_id) || {};
    var creator = DB.find('users','id', job.created_by) || {};
    var dp      = job.sn ? DB.find('delivered_products','sn',job.sn) : null;
    var co      = getCompanyInfo(); // ดึงข้อมูลบริษัทจาก DB

    var prodName    = prod.name  || job.product_name  || '-';
    var prodBrand   = prod.brand || job.product_brand || '-';
    var prodIdVal   = prod.id    || '-';
    var accessory   = job.accessory || 'ไม่มี';
    var custName    = cust.name  || job.customer_name  || '-';
    var custAddr    = [cust.address, cust.province].filter(Boolean).join(' ') || '-';
    var custDept    = (dp && dp.department) ? dp.department : (job.department || '-');
    var creatorName = creator.fullname || '-';
    var recvDate    = job.created_at ? job.created_at.substring(0,10) : '-';
    var symptom     = job.symptom || '-';
    var snVal       = job.sn || '-';
    var printDate   = new Date().toLocaleString('th-TH');
    var statusLabel = { registered:'ลงทะเบียนรับงาน', checked:'กำลังตรวจเช็ค', quoted:'จัดทำใบเสนอราคา', quote_printed:'เสนอราคาแล้ว', po_received:'เบิก/สั่งอะไหล่', parts_issued:'อยู่ระหว่างซ่อม', ready_return:'รอส่งคืน', returning:'อยู่ระหว่างส่งคืน', closed:'ปิดงาน' };
    var statusTh = statusLabel[job.status] || job.status;
    var wcMap = { in_warranty:'✓ สินค้าในประกัน', out_warranty:'✗ สินค้านอกประกัน', void_warranty:'⚠ ในประกัน แต่ไม่ครอบคลุม' };
    var wcVal = job.warranty_condition || 'out_warranty';
    var wcText = wcMap[wcVal] || wcVal;
    var wcColor = { in_warranty:'#059669', out_warranty:'#dc2626', void_warranty:'#d97706' };

    // QR Code = URL สำหรับลูกค้าแสกนเพื่อ track สถานะงาน realtime
    var trackUrl = window.location.origin + window.location.pathname + '?track=' + encodeURIComponent(jobId);
    var qrSrc  = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(trackUrl) + '&margin=4&color=0f172a&bgcolor=f8fafc';

    var css = [
      '@import url("https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap");',
      '*{box-sizing:border-box;margin:0;padding:0}',
      'body{font-family:"Sarabun",sans-serif;background:#fff;color:#1e293b;font-size:13.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      '#wrapper{max-width:780px;margin:0 auto;padding:14px;}',
      '.no-print{display:flex;gap:8px;justify-content:flex-end;margin-bottom:12px;}',
      '.btn-p{padding:9px 20px;border:none;border-radius:7px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:"Sarabun",sans-serif;}',
      '.btn-print{background:#6366f1;color:#fff;}',
      '.btn-pdf{background:#10b981;color:#fff;}',
      '.receipt{border:2px solid #0f172a;border-radius:0;overflow:visible;}',  /* NO border-radius = no clip */

      /* HEADER */
      '.hdr{background:#0f172a;color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;}',
      '.hdr-co h1{font-size:13.5px;font-weight:800;margin-bottom:5px;font-family:"Sarabun",sans-serif;}',
      '.hdr-co p{font-size:10.5px;opacity:.7;line-height:1.7;margin:0;font-family:"Sarabun",sans-serif;}',
      '.hdr-doc{text-align:right;flex-shrink:0;}',
      '.doc-title{font-size:22px;font-weight:800;color:#818cf8;line-height:1;font-family:"Sarabun",sans-serif;}',
      '.doc-sub{font-size:10px;opacity:.6;margin-top:3px;}',
      '.doc-no{font-size:14px;font-weight:800;color:#c7d2fe;margin-top:7px;font-family:monospace;letter-spacing:.04em;}',

      /* BODY */
      '.body{padding:18px 24px;}',
      '.sec{font-size:11px;font-weight:800;color:#6366f1;border-bottom:2px solid #6366f1;padding-bottom:4px;margin:15px 0 10px;font-family:"Sarabun",sans-serif;}',
      '.g2{display:grid;grid-template-columns:1fr 1fr;gap:7px 24px;}',
      '.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px 18px;}',
      '.cell-lbl{font-size:10.5px;color:#64748b;font-weight:700;margin-bottom:2px;font-family:"Sarabun",sans-serif;}',
      '.cell-val{font-size:13.5px;font-weight:600;color:#0f172a;line-height:1.5;font-family:"Sarabun",sans-serif;}',
      '.cell-val.mono{font-family:monospace;font-size:13.5px;color:#4f46e5;}',
      '.cell-val.big{font-size:18px;color:#4f46e5;font-family:monospace;font-weight:800;}',
      '.pill{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:800;background:rgba(99,102,241,.12);color:#4338ca;border:1.5px solid rgba(99,102,241,.3);font-family:"Sarabun",sans-serif;}',

      /* Symptom */
      '.symptom-box{background:#fff7ed;border:1.5px solid #fed7aa;border-radius:6px;padding:11px 15px;font-size:13.5px;line-height:1.9;color:#1e293b;font-family:"Sarabun",sans-serif;min-height:48px;}',

      /* Engineer notes */
      '.notes-box{border:1.5px solid #cbd5e1;border-radius:6px;padding:4px 15px 0;background:#fdfdfd;}',
      '.note-line{border-bottom:1px solid #e2e8f0;height:28px;}',

      /* Sigs */
      '.sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:18px;}',
      '.sig-box{text-align:center;}',
      '.sig-line{border-bottom:1px dashed #94a3b8;height:46px;margin-bottom:6px;}',
      '.sig-lbl{font-size:10.5px;color:#64748b;font-weight:700;font-family:"Sarabun",sans-serif;}',

      /* Bottom */
      '.bottom{display:flex;align-items:stretch;border-top:2px solid #e2e8f0;background:#f8fafc;}',
      '.bc-wrap{flex:1;padding:16px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;}',
      '.bc-wrap svg{max-width:340px;width:100%;}',
      '.bc-lbl{font-size:10px;color:#94a3b8;margin-top:6px;font-family:"Sarabun",sans-serif;}',
      '.qr-wrap{border-left:2px solid #e2e8f0;padding:16px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:165px;}',
      '.qr-ttl{font-size:10.5px;font-weight:800;color:#1e293b;margin-bottom:8px;font-family:"Sarabun",sans-serif;}',
      '.qr-wrap img{border:4px solid #fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.1);}',
      '.qr-lbl{font-size:9.5px;color:#64748b;margin-top:8px;max-width:130px;line-height:1.5;font-family:"Sarabun",sans-serif;}',
      '.qr-sub{font-size:9px;color:#94a3b8;margin-top:4px;font-family:monospace;}',

      /* Footer */
      '.foot{background:#0f172a;color:rgba(255,255,255,.5);text-align:center;padding:9px 16px;font-size:10px;line-height:1.6;font-family:"Sarabun",sans-serif;}',

      /* Print */
      '@media print{',
      '  .no-print{display:none!important;}',
      '  body{padding:0;margin:0;}',
      '  #wrapper{padding:0;max-width:100%;margin:0;}',
      '  .receipt{border:1.5px solid #000;}',
      '  @page{margin:6mm;size:A4;}',
      '}',

      /* PDF export: remove shadows/radii that cause html2canvas clip */
      '.pdf-mode.receipt,.pdf-mode .receipt{border-radius:0!important;overflow:visible!important;box-shadow:none!important;}',
      '.pdf-mode .bottom{border-radius:0!important;}',
      '.pdf-mode .hdr{border-radius:0!important;}',
      '.pdf-mode{margin:0!important;}'
    ].join('\n');

    var bodyHtml =
      '<div id="wrapper">' +

      '<div class="no-print">' +
        '<button class="btn-p btn-print" onclick="window.print()">🖨️ พิมพ์</button>' +
        '<button class="btn-p btn-pdf" id="pdf-btn" onclick="doExportPDF(this)">📄 Export PDF</button>' +
      '</div>' +

      '<div class="receipt" id="receipt-body">' +

      /* HEADER */
      '<div class="hdr">' +
        '<div class="hdr-co">' +
          '<h1>' + co.name + '</h1>' +
          '<p>' + co.address + '</p>' +
          '<p>โทร: ' + co.tel + ' &nbsp;|&nbsp; เลขผู้เสียภาษี: ' + co.tax_id + '</p>' +
        '</div>' +
        '<div class="hdr-doc">' +
          '<div class="doc-title">ใบรับงานซ่อม</div>' +
          '<div class="doc-sub">Repair Service Receipt</div>' +
          '<div class="doc-no">' + jobId + '</div>' +
        '</div>' +
      '</div>' +

      /* BODY */
      '<div class="body">' +

        '<div class="g3">' +
          '<div><div class="cell-lbl">เลขที่งานซ่อม</div><div class="cell-val big">' + jobId + '</div></div>' +
          '<div><div class="cell-lbl">วันที่รับแจ้ง</div><div class="cell-val">' + recvDate + '</div></div>' +
          '<div><div class="cell-lbl">เงื่อนไขการรับประกัน</div><div class="cell-val" style="font-weight:800;color:' + wcColor[wcVal] + ';">' + wcText + '</div></div>' +
          '<div><div class="cell-lbl">ผู้รับแจ้ง / วิศวกร</div><div class="cell-val">' + creatorName + '</div></div>' +
          '<div><div class="cell-lbl">เบอร์ติดต่อ</div><div class="cell-val">081-6855596</div></div>' +
        '</div>' +

        '<div class="sec">ข้อมูลเครื่องมือแพทย์</div>' +
        '<div class="g3">' +
          '<div><div class="cell-lbl">ชื่อสินค้า / เครื่องมือ</div><div class="cell-val">' + prodName + '</div></div>' +
          '<div><div class="cell-lbl">ยี่ห้อ / Brand</div><div class="cell-val">' + prodBrand + '</div></div>' +
          '<div><div class="cell-lbl">รหัสสินค้า</div><div class="cell-val mono">' + prodIdVal + '</div></div>' +
          '<div><div class="cell-lbl">Serial Number (S/N)</div><div class="cell-val mono" style="color:#4f46e5;">' + snVal + '</div></div>' +
          '<div style="grid-column:2/-1;"><div class="cell-lbl">อุปกรณ์ / Accessories</div><div class="cell-val">' + accessory + '</div></div>' +
        '</div>' +

        '<div class="sec">ข้อมูลลูกค้า / โรงพยาบาล</div>' +
        '<div class="g2">' +
          '<div><div class="cell-lbl">ชื่อโรงพยาบาล / หน่วยงาน</div><div class="cell-val">' + custName + '</div></div>' +
          '<div><div class="cell-lbl">แผนก</div><div class="cell-val">' + custDept + '</div></div>' +
          '<div style="grid-column:1/-1;"><div class="cell-lbl">ที่อยู่</div><div class="cell-val">' + custAddr + '</div></div>' +
        '</div>' +

        '<div class="sec">อาการชำรุดที่แจ้ง</div>' +
        '<div class="symptom-box">' + symptom + '</div>' +

        '<div class="sec">ความเห็น / บันทึกระหว่างตรวจเช็ค (สำหรับช่าง)</div>' +
        '<div class="notes-box">' +
          '<div class="note-line"></div>' +
          '<div class="note-line"></div>' +
          '<div class="note-line"></div>' +
          '<div class="note-line" style="border-bottom:none;height:28px;"></div>' +
        '</div>' +

        '<div class="sec">ลายมือชื่อรับ-ส่งงาน</div>' +
        '<div class="sigs">' +
          '<div class="sig-box"><div class="sig-line"></div><div class="sig-lbl">ผู้ส่งมอบ / ลูกค้า</div></div>' +
          '<div class="sig-box"><div class="sig-line"></div><div class="sig-lbl">ผู้รับงาน / วิศวกร</div></div>' +
          '<div class="sig-box"><div class="sig-line"></div><div class="sig-lbl">หัวหน้างาน / ผู้ตรวจสอบ</div></div>' +
        '</div>' +

      '</div>' + /* end .body */

      /* BOTTOM: Barcode + QR */
      '<div class="bottom">' +
        '<div class="bc-wrap">' +
          '<svg id="bc-main"></svg>' +
          '<div class="bc-lbl">แสกน Barcode เพื่อค้นหาสถานะงานซ่อมหมายเลข ' + jobId + '</div>' +
        '</div>' +
        '<div class="qr-wrap">' +
          '<div class="qr-ttl">ตรวจสอบสถานะงาน</div>' +
          '<img src="' + qrSrc + '" width="120" height="120" alt="QR" crossorigin="anonymous">' +
          '<div class="qr-lbl">แสกน QR เพื่อดูสถานะงานแบบ Real-time</div>' +
          '<div class="qr-sub">' + jobId + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="foot">' + co.name + ' &nbsp;|&nbsp; MES Service System v2.0 &nbsp;|&nbsp; พิมพ์เมื่อ: ' + printDate + '</div>' +

      '</div>' + /* end .receipt */
      '</div>'; /* end #wrapper */

    var jsSrc1 = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    var jsSrc2 = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    var SO = '<scr' + 'ipt>'; // split to avoid parser termination
    var SC = '</scr' + 'ipt>';

    var scriptHtml =
      '<scr' + 'ipt src="' + jsSrc1 + '"><' + '/script>' +
      '<scr' + 'ipt src="' + jsSrc2 + '"><' + '/script>' +
      SO +
      'window.onload = function() {' +
        'try {' +
          'JsBarcode(document.getElementById("bc-main"),"' + jobId + '",{' +
            'format:"CODE128",width:2.4,height:60,displayValue:true,fontSize:13,margin:6,' +
            'lineColor:"#0f172a",background:"#f8fafc"' +
          '});' +
        '} catch(e){ console.warn(e); }' +
      '};' +
      'function doExportPDF(btn) {' +
        'btn.textContent = "⏳ กำลัง Export..."; btn.disabled = true;' +
        'var receipt = document.getElementById("receipt-body");' +
        'receipt.classList.add("pdf-mode");' +
        'var prevWidth = receipt.style.width;' +
        'receipt.style.width = "760px";' +
        'var opt = {' +
          'margin:[8,8,8,8],' +
          'filename:"ใบรับงานซ่อม_' + jobId + '.pdf",' +
          'image:{type:"png",quality:1},' +
          'html2canvas:{scale:2,useCORS:true,allowTaint:false,logging:false,backgroundColor:"#ffffff",width:760,windowWidth:800},' +
          'jsPDF:{unit:"mm",format:"a4",orientation:"portrait"},' +
          'pagebreak:{mode:["avoid-all","css"]}' +
        '};' +
        'document.fonts.ready.then(function(){' +
          'setTimeout(function(){' +
            'html2pdf().set(opt).from(receipt).save()' +
              '.then(function(){receipt.classList.remove("pdf-mode");receipt.style.width=prevWidth;btn.textContent="📄 Export PDF";btn.disabled=false;})' +
              '.catch(function(e){receipt.classList.remove("pdf-mode");receipt.style.width=prevWidth;btn.textContent="📄 Export PDF";btn.disabled=false;alert("Error:"+e.message);});' +
          '},500);' +
        '});' +
      '}' +
      SC;

    var fullHtml = '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
      '<title>ใบรับงานซ่อม ' + jobId + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,400;0,600;0,700;0,800;1,400&display=swap">' +
      '<style>' + css + '</style>' +
      '</head><body>' + bodyHtml + scriptHtml + '</body></html>';

    var win = window.open('', '_blank', 'width=860,height=980,scrollbars=yes');
    if (!win) { showToast('warning','Popup ถูกบล็อก','กรุณาอนุญาต Popup แล้วลองใหม่'); return; }
    win.document.open();
    win.document.write(fullHtml);
    win.document.close();
  };

  window.openRegisterRepairModal = function () {
    document.getElementById('rep-reg-id').value = DB.generateJobId('MESRJ');
    document.getElementById('rep-reg-date').value = new Date().toLocaleString('th-TH');
    ['rep-reg-prod-id','rep-reg-prod-name','rep-reg-prod-brand',
     'rep-reg-accessories','rep-reg-dept','rep-reg-cust-id','rep-reg-cust-name',
     'rep-reg-symptom','rep-reg-sn','rep-reg-sn-hidden','rep-reg-sn-display']
      .forEach(function(id){ var el = document.getElementById(id); if(el) el.value = ''; });
    // Reset warranty radio - default out_warranty until SN checked
    ['wc-in_warranty','wc-out_warranty','wc-void_warranty'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.checked = false;
    });
    document.getElementById('wc-out_warranty').checked = true;
    updateWarrantyBadge('out_warranty');
    var autoBadge = document.getElementById('rep-reg-warranty-auto-badge');
    if (autoBadge) autoBadge.style.display = 'none';
    document.getElementById('rep-reg-sn-info').style.display = 'none';
    document.getElementById('rep-reg-sn-notfound').style.display = 'none';
    openModal('modal-register-repair');
    lucide.createIcons();
  };

  // ==================== SN LOOKUP FOR REPAIR REGISTER ====================
  window.lookupRepairSN = function () {
    var sn = document.getElementById('rep-reg-sn').value.trim();
    var infoBox = document.getElementById('rep-reg-sn-info');
    var notFound = document.getElementById('rep-reg-sn-notfound');

    if (!sn) { showToast('warning', 'กรุณาระบุ S/N', 'พิมพ์หมายเลข Serial Number ก่อนค้นหา'); return; }

    var dp = DB.find('delivered_products', 'sn', sn);
    infoBox.style.display = 'none';
    notFound.style.display = 'none';

    if (!dp) {
      notFound.style.display = 'flex';
      document.getElementById('rep-reg-sn-hidden').value = sn;
      document.getElementById('rep-reg-sn-display').value = sn;
      // Not in system → default out_warranty
      document.getElementById('wc-out_warranty').checked = true;
      updateWarrantyBadge('out_warranty');
      showToast('warning', 'ไม่พบ S/N ในระบบ', 'กรอกข้อมูลสินค้าและลูกค้าด้วยตนเอง');
      return;
    }

    var prod = DB.find('products', 'id', dp.product_id) || {};
    var cust = DB.find('customers', 'id', dp.customer_id) || {};

    document.getElementById('rep-reg-prod-id').value    = prod.id   || '';
    document.getElementById('rep-reg-prod-name').value  = prod.name || '';
    document.getElementById('rep-reg-prod-brand').value = prod.brand|| '';
    document.getElementById('rep-reg-cust-id').value    = cust.id   || '';
    document.getElementById('rep-reg-cust-name').value  = cust.name || '';
    document.getElementById('rep-reg-sn-hidden').value  = sn;
    document.getElementById('rep-reg-sn-display').value = sn;
    // ดึงแผนกจากข้อมูลส่งมอบ (ถ้ามี)
    var deptEl = document.getElementById('rep-reg-dept');
    if (deptEl && dp.department) deptEl.value = dp.department;

    // Warranty status
    var today = new Date();
    var expiry = new Date(dp.warranty_expiry);
    var daysLeft = Math.floor((expiry - today) / 86400000);
    var warrantyBadgeHtml, warrantyColor, autoCondition;

    if (daysLeft < 0) {
      warrantyBadgeHtml = '<span class="badge badge-closed" style="font-size:.8rem;">⚠ หมดประกันแล้ว (' + Math.abs(daysLeft) + ' วัน)</span>';
      warrantyColor = 'var(--danger)';
      autoCondition = 'out_warranty';
    } else if (daysLeft <= 90) {
      warrantyBadgeHtml = '<span class="badge badge-warning" style="font-size:.8rem;">⚡ ใกล้หมดประกัน (เหลือ ' + daysLeft + ' วัน)</span>';
      warrantyColor = 'var(--warning)';
      autoCondition = 'in_warranty';
    } else {
      warrantyBadgeHtml = '<span class="badge badge-po_received" style="font-size:.8rem;">✓ อยู่ในประกัน (เหลือ ' + daysLeft + ' วัน)</span>';
      warrantyColor = 'var(--success)';
      autoCondition = 'in_warranty';
    }

    document.getElementById('rep-reg-sn-device-name').textContent = (prod.name || '-') + ' — ' + (prod.brand || '');
    document.getElementById('rep-reg-sn-warranty-badge').innerHTML = warrantyBadgeHtml;
    document.getElementById('rep-reg-sn-val').textContent    = sn;
    document.getElementById('rep-reg-sn-cust').textContent   = (cust.name || '-').substring(0, 30);
    document.getElementById('rep-reg-sn-expiry').textContent = dp.warranty_expiry;
    document.getElementById('rep-reg-sn-expiry').style.color = warrantyColor;

    // Auto-set warranty condition radio (user can still override)
    document.getElementById('wc-' + autoCondition).checked = true;
    updateWarrantyBadge(autoCondition);

    // Show auto-detect badge
    var autoBadgeEl = document.getElementById('rep-reg-warranty-auto-badge');
    if (autoBadgeEl) {
      autoBadgeEl.style.display = 'block';
      autoBadgeEl.innerHTML = '<span style="font-size:.75rem;color:var(--text-muted);display:flex;align-items:center;gap:5px;">' +
        '<i data-lucide="zap" style="width:11px;height:11px;color:var(--primary);"></i>' +
        'ตรวจสอบจากระบบอัตโนมัติ — สามารถเปลี่ยนได้ด้านล่าง' +
        '</span>';
      lucide.createIcons();
    }

    infoBox.style.display = 'block';
    showToast('success', 'พบข้อมูลเครื่อง S/N: ' + sn, 'ดึงข้อมูลและตรวจสอบประกันให้อัตโนมัติแล้ว');
  };

  // Update warranty radio visual highlight
  function updateWarrantyBadge(val) {
    var map = {
      in_warranty:   { border:'rgba(16,185,129,.5)',  bg:'rgba(16,185,129,.08)'  },
      out_warranty:  { border:'rgba(239,68,68,.5)',   bg:'rgba(239,68,68,.06)'   },
      void_warranty: { border:'rgba(245,158,11,.5)',  bg:'rgba(245,158,11,.07)'  }
    };
    ['in_warranty','out_warranty','void_warranty'].forEach(function(k) {
      var lbl = document.getElementById('wc-label-' + k);
      if (!lbl) return;
      if (k === val) {
        lbl.style.borderColor = map[k].border;
        lbl.style.background  = map[k].bg;
        lbl.style.boxShadow   = '0 0 0 2px ' + map[k].border;
      } else {
        lbl.style.borderColor = '';
        lbl.style.background  = '';
        lbl.style.boxShadow   = '';
      }
    });
  }

  // Listen to radio changes to update highlight
  document.addEventListener('DOMContentLoaded', function() {
    ['in_warranty','out_warranty','void_warranty'].forEach(function(val) {
      var el = document.getElementById('wc-' + val);
      if (el) el.addEventListener('change', function(){ updateWarrantyBadge(val); });
    });
  });

  window.clearRepairSN = function () {
    document.getElementById('rep-reg-sn').value = '';
    document.getElementById('rep-reg-sn-hidden').value = '';
    document.getElementById('rep-reg-sn-display').value = '';
    ['rep-reg-prod-id','rep-reg-prod-name','rep-reg-prod-brand','rep-reg-cust-id','rep-reg-cust-name']
      .forEach(function(id){ document.getElementById(id).value = ''; });
    document.getElementById('rep-reg-sn-info').style.display = 'none';
    document.getElementById('rep-reg-sn-notfound').style.display = 'none';
  };

  // ==================== ONSITE TABLE ====================
  function renderOnsiteTable(list) {
    var currentUser = DB.getCurrentUser();
    var isPrivileged = ['manager','supervisor'].includes(currentUser.role);
    var isEngineer = currentUser.role === 'engineer';
    var allJobs = DB.getAll('onsite_jobs');
    if (isEngineer && !list) {
      allJobs = allJobs.filter(function(j){ return j.assigned_to===currentUser.id||j.created_by===currentUser.id; });
    } else if (list) { allJobs = list; }
    var products = DB.getAll('products'); var customers = DB.getAll('customers'); var users = DB.getAll('users');
    var body = document.getElementById('body-onsite'); if (!body) return;
    body.innerHTML = '';
    if (allJobs.length === 0) { body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:30px;">ไม่มีรายการ</td></tr>'; lucide.createIcons(); return; }
    allJobs.forEach(function(job) {
      var prod = products.find(function(p){ return p.id === job.product_id; });
      var cust = customers.find(function(c){ return c.id === job.customer_id; });
      var eng  = users.find(function(u){ return u.id === job.assigned_to; });
      var isOwner = job.assigned_to===currentUser.id||job.created_by===currentUser.id;
      var canEdit = isOwner||isPrivileged;
      var canDelete = (isOwner&&job.status==='assigned')||isPrivileged;
      var typeBadge = job.type==='oncall'?'<span class="badge badge-oncall">Oncall</span>':job.type==='onsite'?'<span class="badge badge-onsite">Onsite</span>':'<span class="badge badge-registered">ยังไม่ระบุ</span>';
      var editBtn = canEdit ? '<button class="btn btn-secondary btn-sm" onclick="openOnsiteProgressModal(\'' + job.id + '\')"><i data-lucide="edit-3"></i>บันทึก</button>' : '<span style="font-size:.72rem;color:var(--text-muted);padding:4px;">ไม่มีสิทธิ์</span>';
      var reassignBtn = isPrivileged ? '<button class="btn btn-warning btn-sm btn-icon-only" onclick="openReassignModal(\'' + job.id + '\',\'onsite_jobs\')" title="โอนงาน"><i data-lucide="user-check"></i></button>' : '';
      var deleteBtn = canDelete ? '<button class="btn btn-danger btn-sm btn-icon-only" onclick="deleteJob(\'onsite_jobs\',\'' + job.id + '\')"><i data-lucide="trash-2"></i></button>' : '';
      var tr = document.createElement('tr');
      tr.innerHTML = '<td class="job-item-id">' + job.id + '</td><td><strong style="color:var(--primary);">' + (job.sn||'-') + '</strong></td>' +
        '<td><div style="font-weight:600;">' + (prod?prod.name.substring(0,22)+'...':'-') + '</div><div style="font-size:.72rem;color:var(--text-muted);">' + (prod?prod.brand:'') + '</div></td>' +
        '<td><div style="font-weight:600;font-size:.85rem;">' + (cust?cust.name.substring(0,22)+'...':'-') + '</div><div style="font-size:.72rem;color:var(--text-muted);">' + (cust?cust.province:'') + '</div></td>' +
        '<td style="font-size:.82rem;">' + (eng?eng.fullname.replace('วิศวกร ',''):'-') + '</td>' +
        '<td>' + typeBadge + '</td>' +
        '<td><span class="badge badge-' + job.status + '">' + (job.status==='closed'?'ปิดงาน':'จ่ายงาน') + '</span></td>' +
        '<td><div style="display:flex;gap:5px;">' + editBtn + reassignBtn + deleteBtn + '</div></td>';
      body.appendChild(tr);
    });
    lucide.createIcons();
  }

  window.filterOnsiteTable = function () {
    var q = document.getElementById('onsite-search-input').value.toLowerCase();
    var status = document.getElementById('onsite-filter-status').value;
    var type = document.getElementById('onsite-filter-type').value;
    var currentUser = DB.getCurrentUser();
    var isEngineer = currentUser.role === 'engineer';
    var products = DB.getAll('products'); var customers = DB.getAll('customers');
    var base = DB.getAll('onsite_jobs');
    if (isEngineer) base = base.filter(function(j){ return j.assigned_to===currentUser.id||j.created_by===currentUser.id; });
    renderOnsiteTable(base.filter(function(job) {
      var prod = products.find(function(p){ return p.id === job.product_id; });
      var cust = customers.find(function(c){ return c.id === job.customer_id; });
      var matchQ = job.id.toLowerCase().includes(q)||(job.sn&&job.sn.toLowerCase().includes(q))||(prod&&prod.name.toLowerCase().includes(q))||(cust&&cust.name.toLowerCase().includes(q));
      return matchQ&&(!status||job.status===status)&&(!type||job.type===type);
    }));
  };


  window.openRegisterOnsiteModal = function () {
    document.getElementById('ons-reg-id').value = DB.generateJobId('MESSJ');
    document.getElementById('ons-reg-date').value = new Date().toLocaleString('th-TH');
    ['ons-reg-sn','ons-reg-sn-id-holder','ons-reg-prod-id','ons-reg-cust-id','ons-reg-prod-display','ons-reg-cust-display','ons-reg-accessories','ons-reg-dept','ons-reg-contact','ons-reg-phone','ons-reg-symptom'].forEach(function(id){ var el = document.getElementById(id); if(el) el.value = ''; });
    document.getElementById('ons-reg-zone-hint').innerHTML = '';
    populateOnsiteEngineerSelect();
    openModal('modal-register-onsite');
  };

  function populateOnsiteEngineerSelect(defaultId) {
    defaultId = defaultId || '';
    var select = document.getElementById('ons-reg-assigned-to');
    select.innerHTML = '<option value="">-- เลือกช่าง --</option>';
    DB.getAll('users').filter(function(u){ return u.role === 'engineer'; }).forEach(function(eng) {
      var opt = document.createElement('option');
      opt.value = eng.id; opt.textContent = eng.fullname + ' [' + eng.zone + ']';
      if (eng.id === defaultId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  window.handleOnsiteSnSelected = function (sn) {
    var dp = DB.find('delivered_products','sn',sn); if (!dp) return;
    var cust = DB.find('customers','id',dp.customer_id);
    var prod = DB.find('products','id',dp.product_id);
    if (cust && prod) {
      document.getElementById('ons-reg-prod-id').value = prod.id;
      document.getElementById('ons-reg-cust-id').value = cust.id;
      document.getElementById('ons-reg-prod-display').value = prod.name + ' (' + prod.brand + ')';
      document.getElementById('ons-reg-cust-display').value = cust.name + ' (' + cust.zone + ')';
      var engineers = DB.getAll('users').filter(function(u){ return u.role==='engineer'; });
      var zoneEng = engineers.find(function(e){ return e.zone===cust.zone; }) || engineers.find(function(e){ return e.zone==='Central'; }) || engineers[0];
      populateOnsiteEngineerSelect(zoneEng ? zoneEng.id : '');
      document.getElementById('ons-reg-zone-hint').innerHTML = zoneEng ? '<i data-lucide="check" style="width:12px;vertical-align:middle;color:var(--success);"></i> มอบหมาย: <strong>' + zoneEng.fullname + '</strong>' : 'ไม่พบช่างประจำเขต';
      lucide.createIcons();
    }
  };

  // ==================== DELIVERED ====================
  function renderDeliveredTable(list) {
    list = list || DB.getAll('delivered_products');
    var products = DB.getAll('products'); var customers = DB.getAll('customers'); var currentUser = DB.getCurrentUser();
    var body = document.getElementById('body-delivered'); if (!body) return;
    body.innerHTML = '';
    if (list.length === 0) { body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:30px;">ไม่มีข้อมูล</td></tr>'; lucide.createIcons(); return; }
    var today = new Date();
    list.forEach(function(item) {
      var prod = products.find(function(p){ return p.id === item.product_id; });
      var cust = customers.find(function(c){ return c.id === item.customer_id; });
      var expiry = new Date(item.warranty_expiry);
      var daysLeft = Math.floor((expiry - today) / 86400000);
      var warrantyBadge = daysLeft < 0 ? 'หมดประกัน' : daysLeft <= 90 ? 'ใกล้หมด (' + daysLeft + 'ว.)' : 'อยู่ในประกัน';
      var warrantyClass = daysLeft < 0 ? 'badge-closed' : daysLeft <= 90 ? 'badge-warning' : 'badge-po_received';
      var docsHtml = item.documents && item.documents.length > 0 ? item.documents.map(function(doc){ return '<div style="font-size:.72rem;"><i data-lucide="file" style="width:10px;display:inline;vertical-align:middle;"></i> ' + doc + '</div>'; }).join('') : '<span style="color:var(--text-muted);font-size:.72rem;">-</span>';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong style="color:var(--primary);font-size:.85rem;cursor:pointer;" onclick="openDeviceHistory(\'' + item.sn + '\')">' + item.sn + '</strong>' +
          '<div style="font-size:.7rem;color:var(--text-muted);">' + (item.department || '') + '</div></td>' +
        '<td><div style="font-weight:600;font-size:.85rem;">' + (prod?prod.name.substring(0,24)+'...':'-') + '</div><div style="font-size:.72rem;color:var(--text-muted);">' + (prod?prod.brand:'') + '</div></td>' +
        '<td><div style="font-weight:600;font-size:.85rem;">' + (cust?cust.name.substring(0,24)+'...':'-') + '</div><div style="font-size:.72rem;color:var(--text-muted);">' + (cust?cust.province:'') + '</div></td>' +
        '<td>' + item.delivery_date + '</td>' +
        '<td>' + item.warranty_years + ' ปี</td>' +
        '<td><div style="font-weight:600;font-size:.82rem;">' + item.warranty_expiry + '</div><span class="badge ' + warrantyClass + '" style="margin-top:4px;display:inline-block;">' + warrantyBadge + '</span></td>' +
        '<td>ทุก ' + item.pm_interval_months + ' เดือน</td>' +
        '<td>' + docsHtml + '</td>' +
        '<td><div style="display:flex;gap:5px;">' +
          '<button class="btn btn-secondary btn-sm btn-icon-only" onclick="openDeviceHistory(\'' + item.sn + '\')" title="ประวัติงาน"><i data-lucide="history"></i></button>' +
          '<button class="btn btn-outline btn-sm btn-icon-only" onclick="openRegisterDeliveredModal(\'' + item.sn + '\')" title="แก้ไข"><i data-lucide="edit-3"></i></button>' +
          '<button class="btn btn-danger btn-sm btn-icon-only" onclick="deleteJob(\'delivered_products\',\'' + item.sn + '\',\'sn\')" title="ลบ"><i data-lucide="trash-2"></i></button>' +
        '</div></td>';
      body.appendChild(tr);
    });
    lucide.createIcons();
  }

  window.filterDeliveredTable = function () {
    var q = document.getElementById('delivered-search-input').value.toLowerCase();
    var warrantyFilter = document.getElementById('delivered-filter-warranty').value;
    var products = DB.getAll('products'); var customers = DB.getAll('customers'); var today = new Date();
    renderDeliveredTable(DB.getAll('delivered_products').filter(function(item) {
      var prod = products.find(function(p){ return p.id === item.product_id; });
      var cust = customers.find(function(c){ return c.id === item.customer_id; });
      var matchQ = item.sn.toLowerCase().includes(q) || (prod&&prod.name.toLowerCase().includes(q)) || (cust&&cust.name.toLowerCase().includes(q));
      var daysLeft = Math.floor((new Date(item.warranty_expiry) - today) / 86400000);
      var matchW = !warrantyFilter || (warrantyFilter==='active'&&daysLeft>90) || (warrantyFilter==='expired'&&daysLeft<0) || (warrantyFilter==='expiring'&&daysLeft>=0&&daysLeft<=90);
      return matchQ && matchW;
    }));
  };

  // ==================== DEVICE HISTORY ====================
  window.openDeviceHistory = function (sn) {
    var dp = DB.find('delivered_products','sn',sn); if (!dp) return;
    var prod = DB.find('products','id',dp.product_id) || {};
    var cust = DB.find('customers','id',dp.customer_id) || {};
    var today = new Date();
    var expiry = new Date(dp.warranty_expiry);
    var daysLeft = Math.floor((expiry - today) / 86400000);
    var wBadge = daysLeft < 0 ? '<span class="badge badge-closed">หมดประกัน (' + Math.abs(daysLeft) + ' วัน)</span>'
      : daysLeft <= 90 ? '<span class="badge badge-warning">ใกล้หมด (เหลือ ' + daysLeft + ' วัน)</span>'
      : '<span class="badge badge-po_received">อยู่ในประกัน (เหลือ ' + daysLeft + ' วัน)</span>';

    document.getElementById('dh-modal-title').textContent = 'ประวัติงาน — S/N: ' + sn;
    document.getElementById('dh-info-product').textContent = (prod.name || '-') + ' / ' + (prod.brand || '-');
    document.getElementById('dh-info-sn').textContent = sn;
    document.getElementById('dh-info-cust').textContent = cust.name || '-';
    document.getElementById('dh-info-dept').textContent = dp.department || '-';
    document.getElementById('dh-info-date').textContent = dp.delivery_date;
    document.getElementById('dh-info-warranty').innerHTML = wBadge;

    // Repair history
    var repairs = DB.getAll('repair_jobs').filter(function(r){ return r.sn === sn; });
    var rTbody = document.getElementById('dh-repair-tbody');
    document.getElementById('dh-repair-count').textContent = repairs.length + ' รายการ';
    rTbody.innerHTML = repairs.length === 0
      ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">ไม่มีประวัติงานซ่อม</td></tr>'
      : repairs.map(function(r){
          return '<tr><td class="job-item-id">' + r.id + '</td><td>' + r.created_at.substring(0,10) + '</td>' +
            '<td style="font-size:.82rem;max-width:160px;">' + (r.symptom||'-').substring(0,50) + '</td>' +
            '<td style="font-size:.82rem;color:var(--text-secondary);">' + (r.check_results||'-').substring(0,50) + '</td>' +
            '<td><span class="badge badge-' + r.status + '">' + getStatusLabel(r.status) + '</span></td></tr>';
        }).join('');

    // PM history
    var pmJobs = DB.getAll('pm_jobs').filter(function(p){ return p.sn === sn; });
    var users = DB.getAll('users');
    var pTbody = document.getElementById('dh-pm-tbody');
    document.getElementById('dh-pm-count').textContent = pmJobs.length + ' รายการ';
    pTbody.innerHTML = pmJobs.length === 0
      ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">ไม่มีแผน PM</td></tr>'
      : pmJobs.map(function(p){
          var eng = p.completed_by ? users.find(function(u){ return u.id === p.completed_by; }) : null;
          return '<tr><td class="job-item-id">' + p.id + '</td>' +
            '<td>' + p.scheduled_month + '</td>' +
            '<td><span class="badge badge-' + p.status + '">' + (p.status==='completed'?'เสร็จสิ้น':'ค้างอยู่') + '</span></td>' +
            '<td>' + (p.completed_at||'-') + '</td>' +
            '<td style="font-size:.82rem;">' + (eng?eng.fullname.replace('วิศวกร ',''):'-') + '</td>' +
            '<td style="font-size:.75rem;">' + (p.report_file ? '<a href="#" style="color:var(--primary);">' + p.report_file + '</a>' : '-') + '</td></tr>';
        }).join('');

    openModal('modal-device-history');
    lucide.createIcons();
  };
  window.calcDeliveredExpiry = function () {
    var dateVal = document.getElementById('del-reg-date').value;
    var years   = parseInt(document.getElementById('del-reg-warranty-years').value, 10);
    if (!dateVal || isNaN(years) || years < 1) return;
    var d = new Date(dateVal);
    d.setFullYear(d.getFullYear() + years);
    document.getElementById('del-reg-expiry').value = d.toISOString().substring(0, 10);
  };

  window.openRegisterDeliveredModal = function (editSn) {
    var prodSel = document.getElementById('del-reg-prod-id');
    var custSel = document.getElementById('del-reg-cust-id');
    prodSel.innerHTML = '<option value="">-- เลือกสินค้า --</option>';
    custSel.innerHTML = '<option value="">-- เลือกลูกค้า --</option>';
    DB.getAll('products').forEach(function(p){ prodSel.innerHTML += '<option value="' + p.id + '">' + p.name + ' (' + p.brand + ')</option>'; });
    DB.getAll('customers').forEach(function(c){ custSel.innerHTML += '<option value="' + c.id + '">' + c.name + '</option>'; });

    if (editSn) {
      // EDIT MODE
      var dp = DB.find('delivered_products', 'sn', editSn);
      if (!dp) return;
      document.getElementById('del-reg-mode').value = 'edit';
      document.getElementById('del-modal-title').textContent = 'แก้ไขข้อมูลเครื่อง S/N: ' + editSn;
      document.getElementById('del-submit-btn').innerHTML = '<i data-lucide="save"></i>บันทึกการแก้ไข';
      document.getElementById('del-reg-sn').value = dp.sn;
      document.getElementById('del-reg-sn').readOnly = true;
      document.getElementById('del-reg-date').value = dp.delivery_date;
      document.getElementById('del-reg-prod-id').value = dp.product_id;
      document.getElementById('del-reg-cust-id').value = dp.customer_id;
      document.getElementById('del-reg-dept').value = dp.department || '';
      document.getElementById('del-reg-warranty-years').value = dp.warranty_years;
      document.getElementById('del-reg-expiry').value = dp.warranty_expiry;
      document.getElementById('del-reg-pm-interval').value = dp.pm_interval_months;
      simulatedFiles['del-reg-file'] = null;
      document.getElementById('del-reg-file-name').textContent = '';
    } else {
      // NEW MODE
      document.getElementById('del-reg-mode').value = 'new';
      document.getElementById('del-modal-title').textContent = 'ลงทะเบียนส่งมอบเครื่องมือแพทย์';
      document.getElementById('del-submit-btn').innerHTML = '<i data-lucide="save"></i>บันทึกการส่งมอบ';
      document.getElementById('del-reg-sn').readOnly = false;
      ['del-reg-sn','del-reg-date','del-reg-expiry','del-reg-dept'].forEach(function(id){ document.getElementById(id).value = ''; });
      document.getElementById('del-reg-warranty-years').value = '2';
      document.getElementById('del-reg-pm-interval').value = '6';
      simulatedFiles['del-reg-file'] = null;
      document.getElementById('del-reg-file-name').textContent = '';
    }
    openModal('modal-register-delivered');
    lucide.createIcons();
  };

  // ==================== PM TABLE ====================
  // ==================== PM TABLE (Month Navigator) ====================
  var pmCurrentYM = (function(){
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  })();

  var THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

  function pmYMLabel(ym) {
    var parts = ym.split('-');
    return THAI_MONTHS[parseInt(parts[1],10)-1] + ' ' + (parseInt(parts[0],10)+543);
  }

  function pmAddMonths(ym, delta) {
    var parts = ym.split('-');
    var d = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1+delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }

  function pmIsOverdue(ym) {
    var now = new Date();
    var cur = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    return ym < cur;
  }

  window.pmNavigateMonth = function(delta) {
    pmCurrentYM = pmAddMonths(pmCurrentYM, delta);
    renderPmView();
  };

  window.pmGoToday = function() {
    var now = new Date();
    pmCurrentYM = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    renderPmView();
  };

  window.pmJumpToMonth = function(val) {
    if (val) { pmCurrentYM = val; renderPmView(); }
  };

  window.toggleOverdueTable = function() {
    var wrap = document.getElementById('pm-overdue-table-wrap');
    var btn  = document.getElementById('pm-overdue-toggle-btn');
    var icon = document.getElementById('pm-overdue-toggle-icon');
    var open = wrap.style.display !== 'none';
    wrap.style.display = open ? 'none' : 'block';
    btn.innerHTML = open
      ? '<i data-lucide="chevron-down" id="pm-overdue-toggle-icon"></i>แสดงรายการ'
      : '<i data-lucide="chevron-up" id="pm-overdue-toggle-icon"></i>ซ่อนรายการ';
    lucide.createIcons();
  };

  function getPmBaseList() {
    var currentUser = DB.getCurrentUser();
    var isEngineer = currentUser.role === 'engineer';
    var delivered  = DB.getAll('delivered_products');
    var all = DB.getAll('pm_jobs');
    if (isEngineer) {
      var myCusts = DB.getAll('customers').filter(function(c){ return c.zone===currentUser.zone; }).map(function(c){ return c.id; });
      all = all.filter(function(pm){
        var dp = delivered.find(function(d){ return d.sn===pm.sn; });
        return dp && myCusts.includes(dp.customer_id);
      });
    }
    return all;
  }

  function renderPmView() {
    var ym = pmCurrentYM;
    var now = new Date();
    var todayYM = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    var isToday = ym === todayYM;

    // Update nav UI
    var label = document.getElementById('pm-month-label');
    var sub   = document.getElementById('pm-month-sub');
    var picker= document.getElementById('pm-month-picker');
    var todayBtn = document.getElementById('pm-today-btn');
    if (label) label.textContent = pmYMLabel(ym);
    if (sub)   sub.textContent   = ym + (isToday ? ' (เดือนนี้)' : '');
    if (picker) picker.value = ym;
    if (todayBtn) {
      todayBtn.style.opacity = isToday ? '.4' : '1';
      todayBtn.disabled = isToday;
    }

    var allBase = getPmBaseList();
    var delivered = DB.getAll('delivered_products');
    var products  = DB.getAll('products');
    var customers = DB.getAll('customers');
    var users     = DB.getAll('users');

    // --- Overdue: pending PM from BEFORE this month ---
    var overdue = allBase.filter(function(pm){ return pm.status==='pending' && pm.scheduled_month < ym; });
    var overdueSection = document.getElementById('pm-overdue-section');
    if (overdueSection) {
      if (overdue.length > 0) {
        overdueSection.style.display = 'block';
        document.getElementById('pm-overdue-label').textContent =
          'มีงาน PM ค้างจากเดือนก่อน จำนวน ' + overdue.length + ' รายการ';
        renderPmOverdueTable(overdue, delivered, products, customers, users);
      } else {
        overdueSection.style.display = 'none';
      }
    }

    // --- Current month PM ---
    var monthList = allBase.filter(function(pm){ return pm.scheduled_month === ym; });

    // --- Summary cards ---
    var totalMonth   = monthList.length;
    var doneMonth    = monthList.filter(function(p){ return p.status==='completed'; }).length;
    var pendingMonth = totalMonth - doneMonth;
    var pct = totalMonth > 0 ? Math.round(doneMonth/totalMonth*100) : 0;
    var summaryEl = document.getElementById('pm-summary-cards');
    if (summaryEl) {
      summaryEl.innerHTML = [
        { icon:'calendar-check', label:'PM เดือนนี้ทั้งหมด', val:totalMonth, cls:'', style:'' },
        { icon:'check-circle-2', label:'ดำเนินการแล้ว',       val:doneMonth,    cls:'', style:'background:linear-gradient(135deg,#065f46,#10b981);border:none;cursor:default;' },
        { icon:'clock',          label:'ยังไม่ดำเนินการ',     val:pendingMonth, cls:'', style: pendingMonth>0 ? 'background:linear-gradient(135deg,#b45309,#f59e0b);border:none;cursor:default;' : '' },
        { icon:'percent',        label:'ความคืบหน้า',          val:pct+'%',      cls:'', style:'' }
      ].map(function(s) {
        var colored = s.style.includes('linear-gradient');
        var ic = colored ? 'style="background:rgba(255,255,255,.15);width:44px;height:44px;" ' : '';
        var tx = colored ? 'style="color:white;"' : '';
        return '<div class="stat-card" style="' + s.style + 'padding:18px;">' +
          '<div class="stat-icon ' + (colored?'':'primary') + '" ' + ic + '>' +
            '<i data-lucide="' + s.icon + '" ' + tx + '></i>' +
          '</div>' +
          '<div class="stat-details">' +
            '<h4 style="' + (colored?'color:rgba(255,255,255,.85);':'') + '">' + s.label + '</h4>' +
            '<div class="counter" style="' + (colored?'color:white;':'') + '">' + s.val + '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      // Progress bar card
      summaryEl.innerHTML += '<div class="stat-card" style="grid-column:1/-1;padding:16px;gap:12px;">' +
        '<div style="flex:1;">' +
          '<div style="display:flex;justify-content:space-between;font-size:.8rem;font-weight:700;margin-bottom:6px;">' +
            '<span>ความคืบหน้าโดยรวม</span><span style="color:var(--primary);">' + doneMonth + ' / ' + totalMonth + '</span>' +
          '</div>' +
          '<div style="height:10px;background:rgba(0,0,0,.06);border-radius:10px;overflow:hidden;">' +
            '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--primary),#10b981);border-radius:10px;transition:width .8s ease;"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    var titleEl = document.getElementById('pm-table-title');
    if (titleEl) titleEl.innerHTML = '<i data-lucide="calendar-check"></i>แผน PM ประจำเดือน ' + pmYMLabel(ym) + (monthList.length > 0 ? ' <span class="badge badge-registered" style="font-size:.75rem;">' + monthList.length + ' รายการ</span>' : '');

    // Render main table filtered by search
    renderPmTable(monthList);
    lucide.createIcons();
  }

  function renderPmOverdueTable(overdue, delivered, products, customers, users) {
    var tbody = document.getElementById('body-pm-overdue');
    if (!tbody) return;
    var currentUser = DB.getCurrentUser();
    var isPrivileged = ['manager','supervisor'].includes(currentUser.role);
    var canEdit = true;
    var today = new Date();

    tbody.innerHTML = overdue.map(function(pm) {
      var dp   = delivered.find(function(d){ return d.sn===pm.sn; });
      var prod = dp ? products.find(function(p){ return p.id===dp.product_id; }) : null;
      var cust = dp ? customers.find(function(c){ return c.id===dp.customer_id; }) : null;
      var pmDate = new Date(pm.scheduled_month + '-01');
      var daysLate = Math.floor((today - pmDate) / 86400000);
      var pmBtn = '<button class="btn btn-success btn-sm" onclick="openPmProgressModal(\'' + pm.id + '\')"><i data-lucide="check"></i>บันทึก PM</button>';
      var reassignBtn = isPrivileged ? '<button class="btn btn-warning btn-xs btn-icon-only" onclick="openReassignModal(\'' + pm.id + '\',\'pm_jobs\')" title="มอบหมาย"><i data-lucide="user-check"></i></button>' : '';
      return '<tr style="background:rgba(239,68,68,.02);">' +
        '<td class="job-item-id" style="color:var(--danger);">' + pm.id + '</td>' +
        '<td><strong style="color:var(--primary);">' + pm.sn + '</strong></td>' +
        '<td style="font-size:.85rem;">' + (prod?prod.name.substring(0,20)+'...':'-') + '</td>' +
        '<td style="font-size:.85rem;">' + (cust?cust.name.substring(0,20)+'...':'-') + '</td>' +
        '<td><span class="badge badge-danger">' + pmYMLabel(pm.scheduled_month) + '</span></td>' +
        '<td><span style="font-size:.82rem;font-weight:700;color:var(--danger);">เลย ' + daysLate + ' วัน</span></td>' +
        '<td><div style="display:flex;gap:5px;">' + pmBtn + reassignBtn + '</div></td>' +
        '</tr>';
    }).join('');
    lucide.createIcons();
  }

  function renderPmTable(list) {
    var currentUser = DB.getCurrentUser();
    var isPrivileged = ['manager','supervisor'].includes(currentUser.role);
    var isEngineer   = currentUser.role === 'engineer';
    var delivered = DB.getAll('delivered_products');
    var products  = DB.getAll('products');
    var customers = DB.getAll('customers');
    var users     = DB.getAll('users');
    var body = document.getElementById('body-pm'); if (!body) return;
    body.innerHTML = '';

    if (!list || list.length === 0) {
      body.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:40px;">' +
        '<div style="font-size:2rem;margin-bottom:8px;">📅</div>' +
        '<div style="font-weight:600;">ไม่มีแผน PM ในเดือนนี้</div>' +
        '<div style="font-size:.8rem;margin-top:4px;">ลองเปลี่ยนเดือน หรือตรวจสอบรอบ PM ของเครื่องที่ส่งมอบ</div>' +
        '</td></tr>';
      lucide.createIcons();
      return;
    }

    list.forEach(function(pm) {
      var dp = delivered.find(function(d){ return d.sn===pm.sn; });
      var prod = dp ? products.find(function(p){ return p.id===dp.product_id; }) : null;
      var cust = dp ? customers.find(function(c){ return c.id===dp.customer_id; }) : null;
      var completedBy = pm.completed_by ? users.find(function(u){ return u.id===pm.completed_by; }) : null;
      var canEdit = isPrivileged || isEngineer;
      var pmBtn = pm.status==='pending'
        ? (canEdit ? '<button class="btn btn-success btn-sm" onclick="openPmProgressModal(\'' + pm.id + '\')"><i data-lucide="check"></i>บันทึก PM</button>' : '<span style="font-size:.72rem;color:var(--text-muted);">ไม่มีสิทธิ์</span>')
        : '<span style="color:var(--success);font-size:.8rem;font-weight:700;">✓ ' + (pm.completed_at||'') + '</span>';
      var reassignBtn = isPrivileged ? '<button class="btn btn-warning btn-xs btn-icon-only" onclick="openReassignModal(\'' + pm.id + '\',\'pm_jobs\')" title="มอบหมายช่าง"><i data-lucide="user-check"></i></button>' : '';
      var dept = dp ? (dp.department || '-') : '-';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="job-item-id">' + pm.id + '</td>' +
        '<td><strong style="color:var(--primary);font-size:.85rem;">' + pm.sn + '</strong></td>' +
        '<td><div style="font-weight:600;font-size:.85rem;">' + (prod?prod.name.substring(0,22)+'...':'-') + '</div><div style="font-size:.72rem;color:var(--text-muted);">' + (prod?prod.brand:'') + '</div></td>' +
        '<td style="font-size:.85rem;">' + (cust?cust.name.substring(0,22)+'...':'-') + '</td>' +
        '<td style="font-size:.82rem;color:var(--text-secondary);">' + dept + '</td>' +
        '<td>' + (dp?'ทุก '+dp.pm_interval_months+' เดือน':'-') + '</td>' +
        '<td style="font-size:.82rem;">' + (completedBy?completedBy.fullname.replace('วิศวกร ',''):'-') + '</td>' +
        '<td>' + (pm.report_file?'<a href="#" style="font-size:.75rem;color:var(--primary);"><i data-lucide="file" style="width:10px;display:inline;vertical-align:middle;"></i> '+pm.report_file+'</a>':'<span style="color:var(--text-muted);font-size:.75rem;">-</span>') + '</td>' +
        '<td><span class="badge badge-' + pm.status + '">' + (pm.status==='completed'?'เสร็จสิ้น':'ค้างอยู่') + '</span></td>' +
        '<td><div style="display:flex;gap:5px;">' + pmBtn + reassignBtn + '</div></td>';
      body.appendChild(tr);
    });
    lucide.createIcons();
  }

  window.filterPmTable = function () {
    var q = document.getElementById('pm-search-input').value.toLowerCase();
    var status = document.getElementById('pm-filter-status').value;
    var ym = pmCurrentYM;
    var delivered = DB.getAll('delivered_products');
    var customers = DB.getAll('customers');
    var base = getPmBaseList().filter(function(pm){ return pm.scheduled_month === ym; });
    renderPmTable(base.filter(function(pm) {
      var dp = delivered.find(function(d){ return d.sn===pm.sn; });
      var cust = dp ? customers.find(function(c){ return c.id===dp.customer_id; }) : null;
      var matchQ = pm.sn.toLowerCase().includes(q)||(cust&&cust.name.toLowerCase().includes(q))||(pm.id.toLowerCase().includes(q));
      return matchQ && (!status||pm.status===status);
    }));
  };

  window.openPmProgressModal = function (pmId) {
    var pm = DB.find('pm_jobs','id',pmId); if (!pm) return;
    var dp = DB.find('delivered_products','sn',pm.sn);
    var prod = dp ? DB.find('products','id',dp.product_id) : null;
    var cust = dp ? DB.find('customers','id',dp.customer_id) : null;
    document.getElementById('pm-prog-id').value = pmId;
    document.getElementById('pm-prog-lbl-id').textContent = pmId;
    document.getElementById('pm-prog-lbl-sn').textContent = pm.sn;
    document.getElementById('pm-prog-lbl-product').textContent = prod ? prod.name : '-';
    document.getElementById('pm-prog-lbl-customer').textContent = cust ? cust.name : '-';
    document.getElementById('pm-prog-lbl-month').textContent = pm.scheduled_month;
    simulatedFiles['pm-close-file'] = null;
    document.getElementById('pm-close-file-name').textContent = '';
    openModal('modal-pm-progress');
  };

  // ==================== WAREHOUSE ====================
  function renderWarehouseView() {
    var parts = DB.getAll('parts'); var txList = DB.getAll('parts_transactions'); var users = DB.getAll('users');
    document.getElementById('wh-stat-total-items').textContent = parts.length;
    var totalVal = 0; parts.forEach(function(p){ totalVal += p.stock * p.price; });
    document.getElementById('wh-stat-total-value').textContent = '\u0e3f' + totalVal.toLocaleString();
    var now = new Date();
    var curYM = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    document.getElementById('wh-stat-transactions-in').textContent = txList.filter(function(t){ return t.type==='in' && t.date.includes(curYM); }).length;
    document.getElementById('wh-stat-transactions-out').textContent = txList.filter(function(t){ return t.type==='out' && t.date.includes(curYM); }).length;
    var lowStock = parts.filter(function(p){ return p.stock <= p.min_stock; });
    var alertBox = document.getElementById('warehouse-alert-box');
    if (lowStock.length > 0) { alertBox.style.display = 'flex'; document.getElementById('warehouse-alert-message').innerHTML = 'มีอะไหล่ต่ำกว่าเกณฑ์ <strong>' + lowStock.length + ' รายการ</strong>'; }
    else alertBox.style.display = 'none';

    var body = document.getElementById('body-warehouse-parts'); body.innerHTML = '';
    parts.forEach(function(part) {
      var isLow = part.stock <= part.min_stock;
      var tr = document.createElement('tr');
      tr.innerHTML = '<td style="font-weight:700;font-size:.82rem;">' + part.id + '</td><td style="font-weight:600;font-size:.85rem;">' + part.name + '</td><td><code style="font-size:.78rem;">' + part.code + '</code></td><td><strong style="' + (isLow?'color:var(--danger);':'') + 'font-size:1rem;">' + part.stock + '</strong></td><td>' + part.min_stock + '</td><td>\u0e3f' + part.price.toLocaleString() + '</td><td><span class="badge ' + (isLow?'badge-danger':'badge-success') + '">' + (isLow?'ต่ำกว่าเกณฑ์':'ปกติ') + '</span></td>';
      body.appendChild(tr);
    });

    var logsContainer = document.getElementById('warehouse-transaction-logs'); logsContainer.innerHTML = '';
    var sorted = txList.slice().sort(function(a,b){ return new Date(b.date) - new Date(a.date); });
    sorted.forEach(function(tx) {
      var creator = users.find(function(u){ return u.id === tx.created_by; });
      var isIn = tx.type === 'in';
      var itemsText = '';
      tx.items.forEach(function(item) {
        var part = parts.find(function(p){ return p.id === item.part_id; });
        itemsText += '<div style="font-size:.75rem;">- ' + (part?part.name.substring(0,30):'-') + ' x ' + item.qty + '</div>';
      });
      var card = document.createElement('div');
      card.className = 'job-item-card';
      card.style.cssText = 'flex-direction:column;align-items:stretch;gap:6px;';
      card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:700;font-size:.85rem;color:' + (isIn?'var(--success)':'var(--danger)') + ';">' + (isIn?'\u2193 นำเข้า (IN)':'\u2191 จ่ายออก (OUT)') + '</span><span style="font-size:.72rem;color:var(--text-muted);">' + tx.date + '</span></div><div style="font-size:.8rem;"><strong>อ้างอิง:</strong> <code>' + tx.ref_no + '</code></div><div style="background:rgba(0,0,0,.04);padding:8px;border-radius:6px;">' + itemsText + '</div><div style="font-size:.72rem;color:var(--text-muted);text-align:right;">โดย: ' + (creator?creator.fullname:'-') + '</div>';
      logsContainer.appendChild(card);
    });
    if (sorted.length === 0) logsContainer.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:.875rem;">ไม่มีประวัติ</div>';
    lucide.createIcons();
  }

  window.openReceiveStockModal = function () {
    document.getElementById('wh-in-ref').value = '';
    document.getElementById('wh-in-items-list').innerHTML = '';
    addBulkInRow();
    openModal('modal-warehouse-in');
  };

  window.addBulkInRow = function () {
    var container = document.getElementById('wh-in-items-list');
    var div = document.createElement('div'); div.className = 'bulk-item-row';
    var opts = '<option value="">-- อะไหล่ --</option>';
    DB.getAll('parts').forEach(function(p){ opts += '<option value="' + p.id + '">' + p.name + ' [' + p.stock + ']</option>'; });
    div.innerHTML = '<select class="form-control bulk-part-select" required onchange="handleBulkInPartChange(this)">' + opts + '</select><input type="number" class="form-control bulk-qty-input" placeholder="จำนวน" min="1" required><input type="number" class="form-control bulk-price-input" placeholder="ราคา/ชิ้น" min="0" required><button type="button" class="btn btn-danger btn-sm btn-icon-only" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>';
    container.appendChild(div); lucide.createIcons();
  };

  window.handleBulkInPartChange = function (sel) {
    var part = DB.find('parts','id',sel.value);
    if (part) sel.parentElement.querySelector('.bulk-price-input').value = Math.round(part.price * 0.9);
  };

  window.openIssueStockModal = function () {
    document.getElementById('wh-out-ref').value = '';
    document.getElementById('wh-out-items-list').innerHTML = '';
    addBulkOutRow();
    openModal('modal-warehouse-out');
  };

  window.addBulkOutRow = function () {
    var container = document.getElementById('wh-out-items-list');
    var div = document.createElement('div'); div.className = 'bulk-item-row'; div.style.gridTemplateColumns = '3fr 1.5fr auto';
    var opts = '<option value="">-- อะไหล่ --</option>';
    DB.getAll('parts').forEach(function(p){ opts += '<option value="' + p.id + '">' + p.name + ' [' + p.stock + ']</option>'; });
    div.innerHTML = '<select class="form-control bulk-part-select" required>' + opts + '</select><input type="number" class="form-control bulk-qty-input" placeholder="จำนวนเบิก" min="1" required><button type="button" class="btn btn-danger btn-sm btn-icon-only" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>';
    container.appendChild(div); lucide.createIcons();
  };

  // ==================== MASTER DATA ====================
  function renderMasterCustomers(list) {
    list = list || DB.getAll('customers');
    var grid = document.getElementById('master-customers-grid'); if (!grid) return;
    var delivered = DB.getAll('delivered_products');
    var zones = DB.getAll('sales_zones');
    var currentUser = DB.getCurrentUser();
    var canDelete = ['manager','supervisor'].includes(currentUser.role);

    // Update filter dropdown from DB zones
    var filterZone = document.getElementById('cust-filter-zone');
    if (filterZone && filterZone.options.length <= 1) {
      filterZone.innerHTML = '<option value="">ทุกเขต</option>';
      zones.forEach(function(z){ filterZone.innerHTML += '<option value="' + z.id + '">' + z.name + '</option>'; });
    }

    if (list.length === 0) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted);">ไม่มีข้อมูลลูกค้า</div>'; return; }
    grid.innerHTML = list.map(function(c) {
      var deviceCount = delivered.filter(function(d){ return d.customer_id === c.id; }).length;
      var zone = zones.find(function(z){ return z.id === c.zone; });
      var zoneName = zone ? zone.name : (c.zone || '-');
      var deleteBtn = canDelete
        ? '<button class="btn btn-danger btn-sm btn-icon-only" onclick="deleteMasterRecord(\'customers\',\'id\',\'' + c.id + '\',\'renderMasterCustomers\')" title="ลบ"><i data-lucide="trash-2"></i></button>'
        : '';
      return '<div class="master-card">' +
        '<div class="master-card-header">' +
          '<div><div class="master-card-title">' + c.name + '</div><div class="master-card-sub">' + (c.address||'') + '</div></div>' +
          '<div class="master-card-actions">' +
            '<button class="btn btn-secondary btn-sm btn-icon-only" onclick="openMasterCustomerModal(\'' + c.id + '\')"><i data-lucide="edit-3"></i></button>' +
            deleteBtn +
          '</div>' +
        '</div>' +
        '<div class="master-card-meta">' +
          '<span class="meta-chip"><i data-lucide="map-pin"></i>' + (c.province||'-') + '</span>' +
          '<span class="meta-chip"><i data-lucide="map"></i>' + zoneName + '</span>' +
          '<span class="meta-chip"><i data-lucide="package"></i>' + deviceCount + ' เครื่อง</span>' +
        '</div>' +
      '</div>';
    }).join('');
    lucide.createIcons();
  }

  window.filterMasterCustomers = function () {
    var q = document.getElementById('cust-search').value.toLowerCase();
    var zone = document.getElementById('cust-filter-zone').value;
    renderMasterCustomers(DB.getAll('customers').filter(function(c){
      return (c.name.toLowerCase().includes(q)||c.province.toLowerCase().includes(q)) && (!zone||c.zone===zone);
    }));
  };

  window.openMasterCustomerModal = function (custId) {
    var list = DB.getAll('customers');
    // Populate zone dropdown from DB
    var zones = DB.getAll('sales_zones');
    var zoneSel = document.getElementById('cust-form-zone');
    zoneSel.innerHTML = '<option value="">-- เลือกเขต --</option>';
    zones.forEach(function(z){ zoneSel.innerHTML += '<option value="' + z.id + '">' + z.name + '</option>'; });

    if (custId) {
      var c = DB.find('customers','id',custId); if (!c) return;
      document.getElementById('cust-form-id').value = 'edit';
      document.getElementById('cust-form-cid').value = c.id;
      document.getElementById('cust-form-name').value = c.name;
      document.getElementById('cust-form-address').value = c.address||'';
      document.getElementById('cust-form-province').value = c.province;
      document.getElementById('cust-form-zone').value = c.zone;
      document.getElementById('cust-modal-title').textContent = 'แก้ไขข้อมูลลูกค้า';
    } else {
      var maxNum = Math.max.apply(null, [0].concat(list.map(function(c){ return parseInt(c.id.replace('CUST',''))||0; })));
      document.getElementById('cust-form-id').value = 'new';
      document.getElementById('cust-form-cid').value = 'CUST' + String(maxNum+1).padStart(3,'0');
      ['cust-form-name','cust-form-address','cust-form-province'].forEach(function(id){ document.getElementById(id).value = ''; });
      document.getElementById('cust-modal-title').textContent = 'เพิ่มลูกค้าใหม่';
    }
    openModal('modal-master-customer');
    lucide.createIcons();
  };

  function renderMasterProducts(list) {
    list = list || DB.getAll('products');
    var grid = document.getElementById('master-products-grid'); if (!grid) return;
    var delivered = DB.getAll('delivered_products');
    var currentUser = DB.getCurrentUser();
    var canDelete = ['manager','supervisor'].includes(currentUser.role);
    grid.innerHTML = list.map(function(p) {
      var installed = delivered.filter(function(d){ return d.product_id === p.id; }).length;
      var deleteBtn = canDelete
        ? '<button class="btn btn-danger btn-sm btn-icon-only" onclick="deleteMasterRecord(\'products\',\'id\',\'' + p.id + '\',\'renderMasterProducts\')"><i data-lucide="trash-2"></i></button>'
        : '';
      return '<div class="master-card"><div class="master-card-header"><div><div class="master-card-title">' + p.name + '</div><div class="master-card-sub">Brand: ' + p.brand + '</div></div><div class="master-card-actions"><button class="btn btn-secondary btn-sm btn-icon-only" onclick="openMasterProductModal(\'' + p.id + '\')"><i data-lucide="edit-3"></i></button>' + deleteBtn + '</div></div><div class="master-card-meta"><span class="meta-chip"><i data-lucide="tag"></i>' + p.id + '</span><span class="meta-chip"><i data-lucide="building"></i>' + p.brand + '</span><span class="meta-chip"><i data-lucide="monitor"></i>ติดตั้ง ' + installed + ' เครื่อง</span></div></div>';
    }).join('');
    lucide.createIcons();
  }

  window.filterMasterProducts = function () {
    var q = document.getElementById('prod-search').value.toLowerCase();
    renderMasterProducts(DB.getAll('products').filter(function(p){ return p.name.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q); }));
  };

  window.openMasterProductModal = function (prodId) {
    var list = DB.getAll('products');
    if (prodId) {
      var p = DB.find('products','id',prodId);
      document.getElementById('prod-form-id').value = 'edit';
      document.getElementById('prod-form-pid').value = p.id;
      document.getElementById('prod-form-name').value = p.name;
      document.getElementById('prod-form-brand').value = p.brand;
      document.getElementById('prod-modal-title').textContent = 'แก้ไขสินค้า';
    } else {
      var maxNum = Math.max.apply(null,[0].concat(list.map(function(p){ return parseInt(p.id.replace('PROD',''))||0; })));
      document.getElementById('prod-form-id').value = 'new';
      document.getElementById('prod-form-pid').value = 'PROD' + String(maxNum+1).padStart(3,'0');
      document.getElementById('prod-form-name').value = ''; document.getElementById('prod-form-brand').value = '';
      document.getElementById('prod-modal-title').textContent = 'เพิ่มสินค้าใหม่';
    }
    openModal('modal-master-product');
  };

  function renderMasterParts(list) {
    list = list || DB.getAll('parts');
    var grid = document.getElementById('master-parts-grid'); if (!grid) return;
    grid.innerHTML = list.map(function(p) {
      var isLow = p.stock <= p.min_stock;
      return '<div class="master-card" style="' + (isLow?'border-color:rgba(239,68,68,.25);':'') + '"><div class="master-card-header"><div><div class="master-card-title">' + p.name + '</div><div class="master-card-sub">' + p.code + '</div></div><div class="master-card-actions"><button class="btn btn-secondary btn-sm btn-icon-only" onclick="openMasterPartModal(\'' + p.id + '\')"><i data-lucide="edit-3"></i></button><button class="btn btn-danger btn-sm btn-icon-only" onclick="deleteMasterRecord(\'parts\',\'id\',\'' + p.id + '\',\'renderMasterParts\')"><i data-lucide="trash-2"></i></button></div></div><div class="master-card-meta"><span class="meta-chip">คงเหลือ: <strong style="' + (isLow?'color:var(--danger);':'') + '">' + p.stock + '</strong></span><span class="meta-chip">Min: ' + p.min_stock + '</span><span class="meta-chip">\u0e3f' + p.price.toLocaleString() + '</span>' + (isLow?'<span class="badge badge-danger">สต็อกต่ำ</span>':'<span class="badge badge-success">ปกติ</span>') + '</div></div>';
    }).join('');
    lucide.createIcons();
  }

  window.filterMasterParts = function () {
    var q = document.getElementById('part-search').value.toLowerCase();
    renderMasterParts(DB.getAll('parts').filter(function(p){ return p.name.toLowerCase().includes(q)||p.code.toLowerCase().includes(q); }));
  };

  window.openMasterPartModal = function (partId) {
    var list = DB.getAll('parts');
    if (partId) {
      var p = DB.find('parts','id',partId);
      document.getElementById('part-form-id').value = 'edit';
      document.getElementById('part-form-pid').value = p.id;
      document.getElementById('part-form-code').value = p.code;
      document.getElementById('part-form-name').value = p.name;
      document.getElementById('part-form-stock').value = p.stock;
      document.getElementById('part-form-min-stock').value = p.min_stock;
      document.getElementById('part-form-price').value = p.price;
      document.getElementById('part-modal-title').textContent = 'แก้ไขอะไหล่';
    } else {
      var maxNum = Math.max.apply(null,[0].concat(list.map(function(p){ return parseInt(p.id.replace('PART',''))||0; })));
      document.getElementById('part-form-id').value = 'new';
      document.getElementById('part-form-pid').value = 'PART' + String(maxNum+1).padStart(3,'0');
      ['part-form-code','part-form-name'].forEach(function(id){ document.getElementById(id).value = ''; });
      document.getElementById('part-form-stock').value = '0'; document.getElementById('part-form-min-stock').value = '3'; document.getElementById('part-form-price').value = '';
      document.getElementById('part-modal-title').textContent = 'เพิ่มอะไหล่ใหม่';
    }
    openModal('modal-master-part');
  };

  window.deleteMasterRecord = function (table, keyField, keyValue, refreshFnName) {
    if (confirm('ยืนยันลบรายการนี้?')) {
      DB.delete(table, keyField, keyValue);
      showToast('success','ลบข้อมูลสำเร็จ','');
      // refreshFnName is either a string (from onclick) or a function ref
      if (typeof refreshFnName === 'function') {
        refreshFnName();
      } else if (typeof refreshFnName === 'string' && window[refreshFnName]) {
        window[refreshFnName]();
      }
    }
  };

  // Expose all master render functions globally so onclick attributes can call them
  window.renderMasterCustomers = renderMasterCustomers;
  window.renderMasterProducts  = renderMasterProducts;
  window.renderMasterParts     = renderMasterParts;
  window.renderMasterZones     = renderMasterZones;

  // ==================== EXPORT ====================
  window.exportCSV = function (tableName) {
    var data = DB.getAll(tableName);
    if (data.length === 0) { showToast('warning','ไม่มีข้อมูล','ไม่พบรายการเพื่อ Export'); return; }
    var headers = Object.keys(data[0]);
    var rows = data.map(function(row) {
      return headers.map(function(h) {
        var val = row[h];
        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
        if (val === null || val === undefined) val = '';
        return '"' + String(val).replace(/"/g,'""') + '"';
      }).join(',');
    });
    var csv = [headers.join(',')].concat(rows).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'MES_' + tableName + '_' + new Date().toISOString().substring(0,10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
    showToast('success','Export สำเร็จ!','บันทึกไฟล์ ' + tableName + '.csv แล้ว');
  };

  window.loadReportPreview = function () {
    var select = document.getElementById('report-preview-select'); if (!select) return;
    var tableName = select.value;
    var data = DB.getAll(tableName);
    var container = document.getElementById('report-preview-table-container'); if (!container) return;
    if (data.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">ไม่มีข้อมูล</p>'; return; }
    var headers = Object.keys(data[0]);
    var preview = data.slice(0,10);
    container.innerHTML = '<table class="custom-table"><thead><tr>' + headers.map(function(h){ return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + preview.map(function(row){ return '<tr>' + headers.map(function(h){ var val = row[h]; if(typeof val==='object'&&val!==null) val = JSON.stringify(val).substring(0,40)+'...'; return '<td style="font-size:.78rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (val!==null&&val!==undefined?val:'-') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' + (data.length>10?'<div style="text-align:center;padding:12px;font-size:.8rem;color:var(--text-muted);">แสดง 10/' + data.length + ' รายการ</div>':'');
  };

  // ==================== PICKER ====================
  window.openPicker = function (type, idField, displayField) {
    activePickerType = type; activePickerIdField = idField; activePickerDisplayField = displayField;
    var titles = { customers:'เลือกลูกค้า/โรงพยาบาล', products:'เลือกเครื่องมือแพทย์', delivered:'ค้นหา Serial Number' };
    document.getElementById('picker-modal-title').textContent = titles[type]||'ค้นหา';
    document.getElementById('picker-search-input').value = '';
    renderPickerItems('');
    openModal('modal-picker');
  };

  window.closePickerModal = function () { closeModal('modal-picker'); };
  window.searchPickerList = function () { renderPickerItems(document.getElementById('picker-search-input').value); };

  function renderPickerItems(query) {
    var container = document.getElementById('picker-items-container');
    var q = (query||'').toLowerCase();
    container.innerHTML = '';
    if (activePickerType === 'customers') {
      DB.getAll('customers').filter(function(c){ return c.name.toLowerCase().includes(q)||c.province.toLowerCase().includes(q); }).forEach(function(item) {
        var div = document.createElement('div'); div.className = 'picker-item'; div.onclick = function(){ selectPickerItem(item.id,item.name); };
        div.innerHTML = '<span class="picker-item-title">' + item.name + '</span><span class="picker-item-sub">' + (item.address||'') + ' · ' + item.province + ' [' + item.zone + ']</span>';
        container.appendChild(div);
      });
    } else if (activePickerType === 'products') {
      DB.getAll('products').filter(function(p){ return p.name.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q); }).forEach(function(item) {
        var div = document.createElement('div'); div.className = 'picker-item'; div.onclick = function(){ selectPickerItem(item.id,item.name,item.brand); };
        div.innerHTML = '<span class="picker-item-title">' + item.name + '</span><span class="picker-item-sub">Brand: ' + item.brand + ' · ' + item.id + '</span>';
        container.appendChild(div);
      });
    } else if (activePickerType === 'delivered') {
      var list = DB.getAll('delivered_products'); var products = DB.getAll('products'); var customers = DB.getAll('customers');
      list.filter(function(item) {
        var prod = products.find(function(p){ return p.id === item.product_id; });
        var cust = customers.find(function(c){ return c.id === item.customer_id; });
        return item.sn.toLowerCase().includes(q)||(prod&&prod.name.toLowerCase().includes(q))||(cust&&cust.name.toLowerCase().includes(q));
      }).forEach(function(item) {
        var prod = products.find(function(p){ return p.id === item.product_id; });
        var cust = customers.find(function(c){ return c.id === item.customer_id; });
        var div = document.createElement('div'); div.className = 'picker-item'; div.onclick = function(){ selectPickerItem(item.sn,item.sn); };
        div.innerHTML = '<span class="picker-item-title" style="color:var(--primary);">S/N: ' + item.sn + '</span><span class="picker-item-sub">' + (prod?prod.name:'-') + ' · ' + (cust?cust.name:'-') + '</span>';
        container.appendChild(div);
      });
    }
    if (container.children.length === 0) container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:30px;">ไม่พบข้อมูล</div>';
  }

  function selectPickerItem(id, name, extra) {
    var idField = document.getElementById(activePickerIdField);
    var displayField = document.getElementById(activePickerDisplayField);
    if (idField) idField.value = id;
    if (displayField) displayField.value = name;
    if (activePickerDisplayField === 'rep-reg-prod-name' && extra) document.getElementById('rep-reg-prod-brand').value = extra;
    if (activePickerDisplayField === 'ons-reg-sn') handleOnsiteSnSelected(id);
    closePickerModal();
  }

  // ==================== USERS ====================
  window.renderUsersTable = function () {
    var list = DB.getAll('users'); var currentUser = DB.getCurrentUser();
    var body = document.getElementById('body-users'); if (!body) return;
    var roleMap = { manager:'ผู้จัดการ', supervisor:'หัวหน้า', admin:'ธุรการ', engineer:'วิศวกร' };
    body.innerHTML = '';
    list.forEach(function(u) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td style="font-weight:700;">' + u.id + '</td><td><code>' + u.username + '</code></td><td><strong>' + u.fullname + '</strong></td><td><span class="user-role-badge">' + (roleMap[u.role]||u.role) + '</span></td><td>' + u.zone + '</td><td>' + (u.id !== currentUser.id ? '<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + u.id + '\')"><i data-lucide="trash-2"></i></button>' : '<span style="color:var(--text-muted);font-size:.8rem;">(คุณเอง)</span>') + '</td>';
      body.appendChild(tr);
    });
    lucide.createIcons();
  };

  window.filterUsersTable = function () {
    var q = document.getElementById('users-search-input').value.toLowerCase();
    var body = document.getElementById('body-users'); var currentUser = DB.getCurrentUser();
    var roleMap = { manager:'ผู้จัดการ', supervisor:'หัวหน้า', admin:'ธุรการ', engineer:'วิศวกร' };
    body.innerHTML = '';
    DB.getAll('users').filter(function(u){ return u.username.toLowerCase().includes(q)||u.fullname.toLowerCase().includes(q)||u.role.toLowerCase().includes(q); }).forEach(function(u) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td style="font-weight:700;">' + u.id + '</td><td><code>' + u.username + '</code></td><td><strong>' + u.fullname + '</strong></td><td><span class="user-role-badge">' + (roleMap[u.role]||u.role) + '</span></td><td>' + u.zone + '</td><td>' + (u.id !== currentUser.id ? '<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + u.id + '\')"><i data-lucide="trash-2"></i></button>' : '') + '</td>';
      body.appendChild(tr);
    });
    lucide.createIcons();
  };

  window.openRegisterUserModal = function () {
    var list = DB.getAll('users');
    var maxNum = Math.max.apply(null,[0].concat(list.map(function(u){ return parseInt(u.id.replace('USR',''))||0; })));
    document.getElementById('user-reg-id').value = 'USR' + String(maxNum+1).padStart(3,'0');
    ['user-reg-username','user-reg-password','user-reg-fullname'].forEach(function(id){ document.getElementById(id).value = ''; });
    document.getElementById('user-reg-role').value = 'engineer'; document.getElementById('user-reg-zone').value = 'Central';
    openModal('modal-register-user');
  };

  window.deleteUser = function (userId) {
    if (confirm('ยืนยันลบผู้ใช้งาน?')) { DB.delete('users','id',userId); showToast('success','ลบผู้ใช้สำเร็จ',''); renderUsersTable(); }
  };

  // ==================== REPAIR WORKFLOW ====================

  // ===================================================================
  // REPAIR WORKFLOW — 9 STEPS WITH TIMESTAMPS
  // ===================================================================

  // Global: selected parts for repair {part_id, name, code, qty, price}
  var _repairSelectedParts = [];

  // ---- Helper: save timestamp for a status ----
  function repairSetTimestamp(job, status) {
    var ts = job.timestamps || {};
    ts[status] = nowTs();
    return ts;
  }

  function renderRepairStepper(currentStatus, timestamps, jobId) {
    var job = DB.find('repair_jobs','id',jobId) || {};
    var wc  = job.warranty_condition || 'out_warranty';
    var ts  = timestamps || {};
    var claimWasRejected = (currentStatus === 'claim_rejected') || ts['claim_rejected'];
    var isClaimPath  = (wc === 'in_warranty') && !claimWasRejected;
    var isPoRejected = job.po_rejected === true;
    var hasParts     = (job.parts_needed || []).length > 0;
    // ถ้าผ่าน parts_issued มาแล้ว ถือว่ามี flow ซ่อม
    var wentThroughParts = !!ts['parts_issued'];

    // สร้าง steps แบบ dynamic
    var steps = [];
    var n = 1;
    function add(key, label, opts) {
      var s = { key:key, label:label, num:n++ };
      if (opts) { for (var k in opts) s[k] = opts[k]; }
      steps.push(s);
    }

    add('registered', 'ลงทะเบียน');
    add('checked', 'ตรวจเช็ค');

    if (isClaimPath) {
      // ── เส้นทางเคลม ──
      add('claim_sent', 'ส่งเคลม');
      add('claim_approved', 'เคลมอนุมัติ', { altKey:'claim_rejected', altLabel:'เคลมไม่อนุมัติ' });
      // เบิกอะไหล่ (ข้ามถ้าไม่มีอะไหล่ และยังไม่ผ่าน parts_issued)
      if (hasParts || wentThroughParts) add('claimed', 'เบิกอะไหล่');
      add('parts_issued', 'กำลังซ่อม');
    } else if (claimWasRejected) {
      // ── เคลมไม่อนุมัติ → ใบเสนอราคา ──
      add('claim_sent', 'ส่งเคลม');
      add('claim_rejected', 'เคลมไม่อนุมัติ', { forceRejected:true });
      add('quoted', 'จัดทำใบเสนอราคา');
      add('quote_printed', 'เสนอราคาแล้ว');
      if (isPoRejected && !wentThroughParts) {
        add('po_rejected', 'ไม่อนุมัติ PO', { forceRejected:true });
      } else {
        if (hasParts || wentThroughParts) add('po_received', 'เบิกอะไหล่');
        add('parts_issued', 'กำลังซ่อม');
      }
    } else {
      // ── เส้นทางนอกประกัน ──
      add('quoted', 'จัดทำใบเสนอราคา');
      add('quote_printed', 'เสนอราคาแล้ว');
      if (isPoRejected && !wentThroughParts) {
        add('po_rejected', 'ไม่อนุมัติ PO', { forceRejected:true });
      } else {
        if (hasParts || wentThroughParts) add('po_received', 'เบิกอะไหล่');
        add('parts_issued', 'กำลังซ่อม');
      }
    }

    add('ready_return', 'รอส่งคืน');
    add('returning', 'ส่งคืนแล้ว');
    add('closed', 'ปิดงาน');

    // หาตำแหน่งปัจจุบัน
    var currentIdx = steps.findIndex(function(s){
      return s.key === currentStatus || (s.altKey && s.altKey === currentStatus);
    });
    // ถ้าหา status ปัจจุบันไม่เจอใน steps (เช่นถูกข้าม) → ใช้ step number เทียบหาตำแหน่งใกล้สุด
    if (currentIdx < 0) {
      var curStep = REPAIR_STATUS[currentStatus] ? REPAIR_STATUS[currentStatus].step : 1;
      // หา step ที่มี step number <= curStep ตำแหน่งสุดท้าย
      for (var ci = steps.length - 1; ci >= 0; ci--) {
        var sk = steps[ci].key;
        var skStep = REPAIR_STATUS[sk] ? REPAIR_STATUS[sk].step : 99;
        if (skStep <= curStep) { currentIdx = ci; break; }
      }
      if (currentIdx < 0) currentIdx = 0;
    }

    var printMap = {
      registered:    [{ label:'ใบรับงาน',     icon:'printer',      fn:'printRepairReceipt',    cls:'btn-info'    }],
      claim_approved:[{ label:'ใบเบิกอะไหล่', icon:'package-open', fn:'quickPrintRequisition', cls:'btn-success' }],
      claimed:       [{ label:'ใบเบิกอะไหล่', icon:'package-open', fn:'quickPrintRequisition', cls:'btn-success' }],
      quoted:        [{ label:'ใบเสนอราคา',   icon:'file-text',    fn:'quickPrintQuote',        cls:'btn-warning' }],
      quote_printed: [{ label:'ใบเสนอราคา',   icon:'file-text',    fn:'quickPrintQuote',        cls:'btn-warning' }],
      po_received:   [{ label:'ใบเบิกอะไหล่', icon:'package-open', fn:'quickPrintRequisition', cls:'btn-success' }],
      ready_return:  [
        { label:'รายงานซ่อม', icon:'wrench', fn:'quickPrintRepairReport', cls:'btn-primary' },
        { label:'ใบส่งคืน',  icon:'truck',  fn:'quickPrintReturn',       cls:'btn-outline' }
      ]
    };

    var html = '<div style="display:flex;align-items:flex-start;min-width:720px;">';
    steps.forEach(function(s, i) {
      var done = i <= currentIdx;
      // step ที่ forceRejected (ไม่อนุมัติ PO) แสดงสีแดงเสมอเมื่อ done
      var isRejected = (s.forceRejected && done) || (s.altKey && s.altKey === currentStatus);
      var ts = timestamps && (timestamps[s.key] || (s.altKey && timestamps[s.altKey])) || '';

      var circleStyle, labelColor, stepLabel;
      if (isRejected) {
        circleStyle = 'background:#ef4444;color:#fff;box-shadow:0 2px 8px rgba(239,68,68,.35);';
        labelColor  = '#ef4444';
        stepLabel   = s.altLabel || s.label;
      } else if (done) {
        circleStyle = 'background:var(--primary);color:#fff;box-shadow:0 2px 8px rgba(99,102,241,.35);';
        labelColor  = 'var(--text-main)';
        stepLabel   = s.label;
      } else {
        circleStyle = 'background:rgba(0,0,0,.07);color:#94a3b8;';
        labelColor  = '#94a3b8';
        stepLabel   = s.label;
      }

      // ไม่แสดงปุ่มพิมพ์ใน step ที่ rejected หรือ forceRejected
      var printBtns = (done && !isRejected && !s.forceRejected && printMap[s.key]) ? printMap[s.key] : [];

      html += '<div style="text-align:center;flex:1;min-width:64px;display:flex;flex-direction:column;align-items:center;">';
      html += '<div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 5px;font-size:.75rem;font-weight:700;' + circleStyle + '">' + s.num + '</div>';
      html += '<div style="font-size:.62rem;font-weight:700;color:' + labelColor + ';line-height:1.3;margin-bottom:2px;">' + stepLabel + '</div>';
      html += ts ? '<div style="font-size:.55rem;color:var(--text-muted);line-height:1.3;margin-bottom:4px;">' + ts + '</div>' : '<div style="height:16px;margin-bottom:4px;"></div>';

      printBtns.forEach(function(btn) {
        html += '<button onclick="' + btn.fn + '(\'' + jobId + '\')" class="' + btn.cls + '" style="font-size:.6rem;padding:3px 7px;border-radius:5px;border:1px solid;cursor:pointer;display:flex;align-items:center;gap:3px;white-space:nowrap;margin:2px auto;font-family:inherit;font-weight:700;" title="' + btn.label + '"><i data-lucide="' + btn.icon + '" style="width:10px;height:10px;"></i>' + btn.label + '</button>';
      });
      if (done && printBtns.length === 0) html += '<div style="height:24px;"></div>';

      html += '</div>';
      if (i < steps.length - 1) {
        var lineColor = (i < currentIdx)
          ? (steps[i].forceRejected ? '#ef4444' : 'var(--primary)')
          : 'rgba(0,0,0,.07)';
        html += '<div style="height:2px;background:' + lineColor + ';flex:1;margin-top:16px;min-width:8px;align-self:flex-start;"></div>';
      }
    });
    html += '</div>';
    document.getElementById('repair-stepper').innerHTML = html;
    lucide.createIcons();
  }

  // ---- Open modal ----
  window.openRepairProgressModal = function (jobId) {
    var job = DB.find('repair_jobs','id',jobId); if (!job) return;
    var prod = DB.find('products','id',job.product_id);
    var cust = DB.find('customers','id',job.customer_id);
    var ts   = job.timestamps || {};
    var wc   = job.warranty_condition || 'out_warranty';

    document.getElementById('rep-prog-id').value = jobId;
    document.getElementById('rep-prog-title').textContent = 'จัดการงานซ่อม: ' + jobId;
    document.getElementById('rep-prog-lbl-product').textContent   = prod ? prod.name  : (job.product_name  || '-');
    document.getElementById('rep-prog-lbl-brand').textContent     = prod ? prod.brand : (job.product_brand || '-');
    document.getElementById('rep-prog-lbl-accessory').textContent = job.accessory || 'ไม่มี';
    document.getElementById('rep-prog-lbl-customer').textContent  = cust ? cust.name  : (job.customer_name  || '-');
    document.getElementById('rep-prog-lbl-symptom').textContent   = job.symptom || '-';
    document.getElementById('rep-prog-lbl-date').textContent      = job.created_at;

    // Warranty badge instead of status in info panel
    var wcMap = {
      in_warranty:   '<span class="badge badge-po_received">✓ สินค้าในประกัน</span>',
      out_warranty:  '<span class="badge badge-closed">✗ สินค้านอกประกัน</span>',
      void_warranty: '<span class="badge badge-warning">⚠ ในประกัน แต่ไม่ครอบคลุม</span>'
    };
    document.getElementById('rep-prog-lbl-status').innerHTML =
      (wcMap[wc] || '') + ' &nbsp; <span class="badge ' + getStatusBadge(job.status) + '">' + getStatusLabel(job.status) + '</span>';

    var snEl = document.getElementById('rep-prog-lbl-sn');
    if (snEl) snEl.textContent = job.sn || '-';

    renderRepairStepper(job.status, ts, jobId);

    _repairSelectedParts = (job.parts_needed || []).map(function(item) {
      var p = DB.find('parts','id',item.part_id);
      return { part_id:item.part_id, name:p?p.name:item.part_id, code:p?p.code:'', qty:item.qty, price:p?p.price:0 };
    });

    var allBoxes = ['stage-box-registered','stage-box-check','stage-box-claim-review','stage-box-quote','stage-box-po','stage-box-parts-issue','stage-box-ready-return','stage-box-returning','stage-box-close'];
    allBoxes.forEach(function(id){ var el=document.getElementById(id); if(el) el.style.display='none'; });

    var stageMap = {
      registered:      'stage-box-registered',
      checked:         'stage-box-check',
      claim_sent:      'stage-box-claim-review',
      claim_approved:  'stage-box-parts-issue',
      claim_rejected:  'stage-box-quote',
      quoted:          'stage-box-quote',
      quote_printed:   'stage-box-po',
      po_received:     'stage-box-parts-issue',
      claimed:         'stage-box-parts-issue',
      parts_issued:    'stage-box-ready-return',
      ready_return:    'stage-box-returning',
      returning:       'stage-box-close'
    };
    var boxId = stageMap[job.status];
    if (boxId) {
      var box = document.getElementById(boxId);
      if (box) {
        box.style.display = 'block';
        if (job.status === 'registered')   initEditRegistration(job);
        if (job.status === 'checked')       initRepairPartSearch();
        if (job.status === 'claim_sent')    initClaimReview(job);
        if (job.status === 'quoted' || job.status === 'claim_rejected') initRepairQuoteEditor(job);
        if (['po_received','claimed','claim_approved'].includes(job.status)) initPartsIssueSummary(job);
        if (job.status === 'parts_issued') initRepairReadyReturn(job);
        if (job.status === 'ready_return') initReturnSlip(job);
      }
    }

    renderRepairHistory(job);
    openModal('modal-repair-progress');
    lucide.createIcons();
  };

  // ==================== STAGE 1: แก้ไขข้อมูลลงทะเบียน ====================
  function initEditRegistration(job) {
    var cust = DB.find('customers','id',job.customer_id)||{};
    document.getElementById('edit-reg-cust-name').value  = cust.name || job.customer_name || '-';
    document.getElementById('edit-reg-sn').value         = job.sn || '';
    document.getElementById('edit-reg-dept').value       = job.department || '';
    document.getElementById('edit-reg-accessory').value  = job.accessory || '';
    document.getElementById('edit-reg-symptom').value    = job.symptom || '';
    document.getElementById('edit-reg-warranty').value   = job.warranty_condition || 'out_warranty';
  }

  window.saveRepairRegistration = function() {
    var jobId = document.getElementById('rep-prog-id').value;
    DB.update('repair_jobs','id',jobId,{
      sn:                document.getElementById('edit-reg-sn').value.trim(),
      department:        document.getElementById('edit-reg-dept').value.trim(),
      accessory:         document.getElementById('edit-reg-accessory').value.trim(),
      symptom:           document.getElementById('edit-reg-symptom').value.trim(),
      warranty_condition:document.getElementById('edit-reg-warranty').value
    });
    showToast('success','บันทึกข้อมูลสำเร็จ','แก้ไขรายละเอียดงานแล้ว ยังไม่เปลี่ยนสถานะ');
  };

  // พิมพ์ใบรับงาน → เปลี่ยนสถานะเป็น checked (การเปลี่ยนสถานะทำใน printRepairReceipt)
  window.printAndAdvanceReceipt = function() {
    var jobId   = document.getElementById('rep-prog-id').value;
    var symptom = document.getElementById('edit-reg-symptom').value.trim();
    if (!symptom) { showToast('warning','กรุณากรอกอาการชำรุด',''); return; }
    // Save edits first
    DB.update('repair_jobs','id',jobId,{
      sn:                 document.getElementById('edit-reg-sn').value.trim(),
      department:         document.getElementById('edit-reg-dept').value.trim(),
      accessory:          document.getElementById('edit-reg-accessory').value.trim(),
      symptom:            symptom,
      warranty_condition: document.getElementById('edit-reg-warranty').value
    });
    closeModal('modal-repair-progress');
    // printRepairReceipt จะเปลี่ยนสถานะเป็น checked อัตโนมัติ
    setTimeout(function(){ printRepairReceipt(jobId); }, 200);
  };

  // พิมพ์รายงานซ่อม → เปลี่ยนสถานะเป็น ready_return
  window.printAndAdvanceRepairReport = function() {
    var jobId  = document.getElementById('rep-prog-id').value;
    var result = document.getElementById('rep-repair-result').value.trim();
    if (!result) { showToast('warning','กรุณากรอกสรุปผลการซ่อม',''); return; }
    var job = DB.find('repair_jobs','id',jobId);
    var ts  = repairSetTimestamp(job,'ready_return');
    DB.update('repair_jobs','id',jobId,{ status:'ready_return', repair_result:result, timestamps:ts });
    showToast('success','สถานะเปลี่ยนเป็น "รอส่งคืน"','กำลังเปิดรายงานการซ่อม...');
    closeModal('modal-repair-progress');
    renderRepairTable();
    setTimeout(function(){ quickPrintRepairReport(jobId); }, 300);
  };

  // พิมพ์ใบส่งคืน → เปลี่ยนสถานะเป็น returning
  window.printAndAdvanceReturnSlip = function() {
    var jobId   = document.getElementById('rep-prog-id').value;
    var retNo   = document.getElementById('rep-ret-no').value.trim();
    var retDate = document.getElementById('rep-ret-date').value;
    if (!retNo) { showToast('warning','กรุณาระบุเลขที่ใบส่งคืน',''); return; }
    var job = DB.find('repair_jobs','id',jobId);
    var ts  = repairSetTimestamp(job,'returning');
    DB.update('repair_jobs','id',jobId,{
      status:'returning',
      return_slip:{ number:retNo, date:retDate, file:retNo+'.pdf' },
      timestamps: ts
    });
    showToast('success','สถานะเปลี่ยนเป็น "อยู่ระหว่างส่งคืน"','กำลังเปิดใบส่งคืน...');
    closeModal('modal-repair-progress');
    renderRepairTable();
    setTimeout(function(){ quickPrintReturn(jobId); }, 300);
  };

  function initReturnSlip(job) {
    var retNoEl   = document.getElementById('rep-ret-no');
    var retDateEl = document.getElementById('rep-ret-date');
    if (retNoEl)   retNoEl.value   = job.return_slip ? job.return_slip.number : ('DN-' + new Date().getFullYear() + '-' + job.id.slice(-4));
    if (retDateEl) retDateEl.value = job.return_slip ? job.return_slip.date   : new Date().toISOString().substring(0,10);

    // แสดง banner กรณี PO ไม่อนุมัติ
    var box = document.getElementById('stage-box-returning');
    if (!box) return;
    var existBanner = box.querySelector('.po-reject-banner');
    if (existBanner) existBanner.remove();
    if (job.po_rejected) {
      var banner = document.createElement('div');
      banner.className = 'po-reject-banner';
      banner.style.cssText = 'background:rgba(239,68,68,.06);border:1.5px solid rgba(239,68,68,.2);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;font-size:.82rem;color:#991b1b;display:flex;align-items:center;gap:8px;';
      banner.innerHTML = '<i data-lucide="x-circle" style="width:14px;height:14px;flex-shrink:0;"></i><strong>ลูกค้าไม่อนุมัติ PO</strong> — ส่งคืนเครื่องโดยไม่ซ่อม';
      box.insertBefore(banner, box.firstChild);
      lucide.createIcons();
    }
  }

  // ==================== STAGE 2: ตรวจเช็ค ====================

  // ---- Claim Review (Stage 3 for in_warranty) ----
  function initClaimReview(job) {
    var el = document.getElementById('claim-review-summary');
    if (el) {
      var parts = DB.getAll('parts');
      el.innerHTML =
        '<div style="font-weight:700;color:#0369a1;margin-bottom:8px;">📋 รายการอะไหล่ที่จะเคลม</div>' +
        ((job.parts_needed||[]).map(function(item){
          var p = parts.find(function(x){ return x.id===item.part_id; });
          return '• ' + (p?p.name:item.part_id) + ' × ' + item.qty;
        }).join('<br>') || '<span style="color:var(--text-muted);">ไม่มีรายการอะไหล่</span>') +
        '<div style="margin-top:8px;font-size:.78rem;color:var(--text-muted);">ผลตรวจเช็ค: ' + (job.check_results||'-') + '</div>';
    }
    // เฉพาะ Supervisor/Manager เท่านั้นกดปุ่มได้
    var currentUser = DB.getCurrentUser();
    var canApprove = ['manager','supervisor'].includes(currentUser.role);
    var btns = document.getElementById('claim-approval-btns');
    if (btns) btns.style.display = canApprove ? 'flex' : 'none';
    if (!canApprove) {
      var notice = document.createElement('div');
      notice.style.cssText = 'font-size:.82rem;color:var(--warning);padding:10px;background:rgba(245,158,11,.06);border-radius:var(--radius-sm);border:1px solid rgba(245,158,11,.2);';
      notice.innerHTML = '⚠️ รอ Supervisor หรือ Manager อนุมัติ/ปฏิเสธเคลม';
      btns.parentNode.insertBefore(notice, btns);
    }
  }

  window.submitClaimApproval = function(approved) {
    var jobId = document.getElementById('rep-prog-id').value;
    var job   = DB.find('repair_jobs','id',jobId);
    var currentUser = DB.getCurrentUser();
    if (!['manager','supervisor'].includes(currentUser.role)) {
      showToast('danger','ไม่มีสิทธิ์','เฉพาะ Supervisor / Manager เท่านั้น');
      return;
    }
    var ts = repairSetTimestamp(job, approved ? 'claim_approved' : 'claim_rejected');
    if (approved) {
      var hasParts = (job.parts_needed || []).length > 0;
      if (hasParts) {
        // อนุมัติ + มีอะไหล่ → ไปเบิกอะไหล่
        DB.update('repair_jobs','id',jobId,{
          status: 'claim_approved',
          claim_approved_by: currentUser.id,
          claim_approved_at: nowTs(),
          timestamps: ts
        });
        showToast('success','อนุมัติเคลมแล้ว!','สถานะ → เบิกอะไหล่');
      } else {
        // อนุมัติ + ไม่มีอะไหล่ → ข้ามไปกำลังซ่อมเลย
        ts['parts_issued'] = nowTs();
        DB.update('repair_jobs','id',jobId,{
          status: 'parts_issued',
          claim_approved_by: currentUser.id,
          claim_approved_at: nowTs(),
          timestamps: ts
        });
        showToast('success','อนุมัติเคลมแล้ว!','ไม่มีอะไหล่เปลี่ยน → ข้ามไปกำลังซ่อม');
      }
    } else {
      // ไม่อนุมัติ → ทำใบเสนอราคา (เปลี่ยนเป็น out_warranty flow)
      DB.update('repair_jobs','id',jobId,{
        status: 'claim_rejected',
        claim_rejected_by: currentUser.id,
        claim_rejected_at: nowTs(),
        timestamps: ts
      });
      showToast('warning','ปฏิเสธเคลม','สถานะ → จัดทำใบเสนอราคาแทน');
    }
    closeModal('modal-repair-progress'); renderRepairTable(); computeNotifications();
  };

  window.submitPORejected = function() {
    var jobId = document.getElementById('rep-prog-id').value;
    var job   = DB.find('repair_jobs','id',jobId);
    var ts    = job.timestamps || {};
    ts['po_rejected']  = nowTs();
    ts['ready_return'] = nowTs(); // ข้ามไป ready_return โดยตรง
    DB.update('repair_jobs','id',jobId,{
      status: 'ready_return',
      po_rejected: true, // flag ว่า PO ไม่อนุมัติ (ไม่ซ่อม)
      timestamps: ts
    });
    showToast('warning','บันทึก PO ไม่อนุมัติ','สถานะ → รอส่งคืน (ไม่ซ่อม)');
    closeModal('modal-repair-progress'); renderRepairTable();
  };
  function initRepairPartSearch() {
    renderRepairSelectedParts();
    document.getElementById('rep-part-search-input').value = '';
    document.getElementById('rep-part-search-dropdown').style.display = 'none';
    document.getElementById('rep-check-diagnosis').value = '';

    // Show correct action buttons based on warranty_condition
    var jobId = document.getElementById('rep-prog-id').value;
    var job   = DB.find('repair_jobs','id',jobId);
    var isWarranty = job && job.warranty_condition === 'in_warranty';

    var normalBtn   = document.getElementById('check-btn-normal');
    var warrantyBtn = document.getElementById('check-btn-warranty');
    var notice      = document.getElementById('check-warranty-notice');
    if (normalBtn)   normalBtn.style.display   = isWarranty ? 'none' : 'block';
    if (warrantyBtn) warrantyBtn.style.display = isWarranty ? 'block' : 'none';
    if (notice) {
      notice.style.display = isWarranty ? 'flex' : 'none';
    }
  }

  window.filterRepairPartSearch = function() {
    var q = document.getElementById('rep-part-search-input').value.toLowerCase().trim();
    var dd = document.getElementById('rep-part-search-dropdown');
    if (!q) { dd.style.display = 'none'; return; }
    var matches = DB.getAll('parts').filter(function(p){ return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q); });
    if (matches.length === 0) { dd.style.display = 'none'; return; }
    dd.innerHTML = matches.slice(0,8).map(function(p) {
      return '<div onclick="selectRepairPart(\'' + p.id + '\')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.05);font-size:.875rem;display:flex;justify-content:space-between;background:white;">'+
        '<span><strong>' + p.name + '</strong> <span style="color:var(--text-muted);font-size:.78rem;">' + p.code + '</span></span>' +
        '<span style="color:var(--primary);font-weight:700;">฿' + p.price.toLocaleString() + ' (เหลือ ' + p.stock + ')</span>' +
      '</div>';
    }).join('');
    dd.style.display = 'block';
  };

  window.selectRepairPart = function(partId) {
    var part = DB.find('parts','id',partId); if (!part) return;
    var existing = _repairSelectedParts.find(function(p){ return p.part_id === partId; });
    if (existing) { existing.qty++; }
    else { _repairSelectedParts.push({ part_id:partId, name:part.name, code:part.code, qty:1, price:part.price }); }
    document.getElementById('rep-part-search-input').value = '';
    document.getElementById('rep-part-search-dropdown').style.display = 'none';
    renderRepairSelectedParts();
  };

  window.addRepairPartByBarcode = function() {
    var val = document.getElementById('rep-part-search-input').value.trim();
    if (!val) return;
    var part = DB.getAll('parts').find(function(p){ return p.code === val || p.id === val || p.name.toLowerCase() === val.toLowerCase(); });
    if (part) selectRepairPart(part.id);
    else showToast('warning','ไม่พบอะไหล่','รหัส: ' + val);
  };

  function renderRepairSelectedParts() {
    var body = document.getElementById('rep-parts-selected-body');
    var wrap = document.getElementById('rep-parts-selected-wrap');
    if (!body) return;
    if (_repairSelectedParts.length === 0) {
      if (wrap) wrap.style.display = 'none';
      var totEl = document.getElementById('rep-parts-total');
      if (totEl) totEl.textContent = '฿0';
      return;
    }
    if (wrap) wrap.style.display = 'block';
    var allParts = DB.getAll('parts');
    body.innerHTML = _repairSelectedParts.map(function(item, idx) {
      var partData = allParts.find(function(p){ return p.id === item.part_id; });
      var stock = partData ? partData.stock : '-';
      var total = item.qty * item.price;
      return '<tr>' +
        '<td><code style="font-size:.78rem;">' + (item.code||'-') + '</code></td>' +
        '<td style="font-size:.875rem;font-weight:600;">' + item.name + '</td>' +
        '<td style="text-align:center;color:' + (stock < item.qty ? 'var(--danger)' : 'var(--text-muted)') + ';">' + stock + '</td>' +
        '<td>฿' + item.price.toLocaleString() + '</td>' +
        '<td><input type="number" class="form-control" style="width:70px;padding:4px 8px;text-align:center;" value="' + item.qty + '" min="1" onchange="updateRepairPartQty(' + idx + ',this.value)"></td>' +
        '<td style="font-weight:700;color:var(--primary);">฿' + total.toLocaleString() + '</td>' +
        '<td>' +
          '<button type="button" class="btn btn-danger btn-sm" onclick="removeRepairPart(' + idx + ')" title="นำออก" style="padding:4px 10px;">' +
            '<i data-lucide="trash-2" style="width:13px;height:13px;"></i>' +
          '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    var grandTotal = _repairSelectedParts.reduce(function(s, i){ return s + i.qty * i.price; }, 0);
    var totEl = document.getElementById('rep-parts-total');
    if (totEl) totEl.textContent = '฿' + grandTotal.toLocaleString();
    lucide.createIcons();
  }

  window.updateRepairPartQty = function(idx, val) {
    _repairSelectedParts[idx].qty = Math.max(1, parseInt(val)||1);
    renderRepairSelectedParts();
  };

  window.removeRepairPart = function(idx) {
    _repairSelectedParts.splice(idx, 1);
    renderRepairSelectedParts();
  };

  window.toggleClaimServiceFee = function() {
    var checked = document.getElementById('rep-claim-has-service-fee').checked;
    var wrap = document.getElementById('rep-claim-service-fee-wrap');
    if (wrap) wrap.style.display = checked ? 'block' : 'none';
  };

  window.submitWarrantyClaim = function() {
    var jobId    = document.getElementById('rep-prog-id').value;
    var claimNo  = document.getElementById('rep-claim-no').value.trim();
    var claimDate= document.getElementById('rep-claim-date').value;
    var hasFee   = document.getElementById('rep-claim-has-service-fee').checked;
    var fee      = hasFee ? (parseInt(document.getElementById('rep-claim-service-fee').value)||0) : 0;
    if (!claimNo) { showToast('warning','กรุณาระบุเลขที่ใบแจ้งเคลม',''); return; }
    var job = DB.find('repair_jobs','id',jobId);
    var ts  = repairSetTimestamp(job, 'claim_sent');
    DB.update('repair_jobs','id',jobId, {
      status: 'claim_sent',
      quotation: { number:claimNo, date:claimDate, service_fee:fee, amount:fee, is_claim:true },
      timestamps: ts
    });
    showToast('success','ส่งเคลมสำเร็จ!','เคลมหมายเลข ' + claimNo + ' · รอ Supervisor/Manager อนุมัติ');
    closeModal('modal-repair-progress'); renderRepairTable(); computeNotifications();
  };

  // ---- Submit stage 2: checked ----
  window.submitRepairCheck = function(mode) {
    var jobId = document.getElementById('rep-prog-id').value;
    var diag  = document.getElementById('rep-check-diagnosis').value.trim();
    if (!diag) { showToast('warning','กรุณากรอกผลตรวจ',''); return; }
    var job = DB.find('repair_jobs','id',jobId);

    if (mode === 'claim_free') {
      // สินค้าในประกัน → ส่งเคลม (รอ Supervisor/Manager อนุมัติ)
      var ts = job.timestamps || {};
      ts['checked']    = nowTs();
      ts['claim_sent'] = nowTs();
      DB.update('repair_jobs','id',jobId,{
        status: 'claim_sent',
        check_results: diag,
        parts_needed: _repairSelectedParts.map(function(p){ return {part_id:p.part_id,qty:p.qty}; }),
        timestamps: ts
      });
      showToast('success','ส่งเคลมสำเร็จ','รอ Supervisor/Manager อนุมัติ');
    } else {
      // บันทึกผลตรวจ → เปลี่ยนสถานะเป็น quoted ทันที
      // (ข้อมูลครบพร้อมออกใบเสนอราคาแล้ว)
      var ts = job.timestamps || {};
      ts['checked'] = nowTs();
      ts['quoted']  = nowTs();
      DB.update('repair_jobs','id',jobId,{
        status: 'quoted',
        check_results: diag,
        parts_needed: _repairSelectedParts.map(function(p){ return {part_id:p.part_id,qty:p.qty}; }),
        timestamps: ts
      });
      var isWarranty = job.warranty_condition === 'in_warranty';
      showToast('success','บันทึกผลตรวจเช็คสำเร็จ',
        isWarranty ? 'สถานะ → จัดทำใบเสนอราคาค่าบริการ' : 'สถานะ → จัดทำใบเสนอราคา');
    }
    closeModal('modal-repair-progress'); renderRepairTable(); computeNotifications();
  };

  // ---- Quote Editor (stage 3/4) ----
  function initRepairQuoteEditor(job) {
    var wc = job.warranty_condition || 'out_warranty';
    // ถ้าเคลมถูกปฏิเสธแล้ว → ใช้ quotation mode แม้ warranty เป็น in_warranty
    var claimRejected = (job.status === 'claim_rejected') || (job.timestamps && job.timestamps['claim_rejected']);
    var isWarranty = (wc === 'in_warranty') && !claimRejected;

    // Update mode banner + title
    var banner = document.getElementById('quote-mode-banner');
    var title  = document.getElementById('quote-stage-title');
    if (isWarranty) {
      banner.style.cssText = 'padding:10px 14px;border-radius:var(--radius-sm);margin-bottom:14px;font-size:.875rem;font-weight:700;display:flex;align-items:center;gap:8px;background:rgba(16,185,129,.07);border:1.5px solid rgba(16,185,129,.25);color:#065f46;';
      banner.innerHTML = '<i data-lucide="shield-check" style="width:16px;height:16px;"></i>สินค้าในประกัน — ใช้กระบวนการส่งเคลมสินค้าแทนการออกใบเสนอราคา';
      title.innerHTML = '<i data-lucide="shield-check"></i>ขั้นที่ 3: ส่งเคลมสินค้า (Warranty Claim)';
      title.style.color = '#059669';
    } else {
      var vcLabel = wc === 'void_warranty' ? 'ในประกัน แต่ไม่ครอบคลุม — ออกใบเสนอราคาปกติ' : 'สินค้านอกประกัน — ออกใบเสนอราคา';
      banner.style.cssText = 'padding:10px 14px;border-radius:var(--radius-sm);margin-bottom:14px;font-size:.875rem;font-weight:700;display:flex;align-items:center;gap:8px;background:rgba(99,102,241,.05);border:1.5px solid rgba(99,102,241,.15);color:#4338ca;';
      banner.innerHTML = '<i data-lucide="file-text" style="width:16px;height:16px;"></i>' + vcLabel;
      title.innerHTML = '<i data-lucide="file-text"></i>ขั้นที่ 3-4: ใบเสนอราคา (แก้ไขได้ก่อนพิมพ์)';
      title.style.color = 'var(--primary)';
    }

    // Show/hide mode panels
    document.getElementById('quote-mode-quotation').style.display = isWarranty ? 'none' : 'block';
    document.getElementById('quote-mode-claim').style.display     = isWarranty ? 'block' : 'none';

    if (isWarranty) {
      // Claim mode: show parts list, set claim fields
      document.getElementById('rep-claim-no').value   = job.quotation ? job.quotation.number : ('CLM-' + new Date().getFullYear() + '-' + job.id.slice(-4));
      document.getElementById('rep-claim-date').value = job.quotation ? job.quotation.date   : new Date().toISOString().substring(0,10);
      document.getElementById('rep-claim-has-service-fee').checked = !!(job.quotation && job.quotation.service_fee > 0);
      toggleClaimServiceFee();
      var parts = DB.getAll('parts');
      var el = document.getElementById('claim-parts-summary');
      if (el) {
        el.innerHTML = (_repairSelectedParts.length === 0)
          ? '<span style="color:var(--text-muted);">ไม่มีรายการอะไหล่ที่ระบุ</span>'
          : _repairSelectedParts.map(function(p) {
              return '• ' + p.name + ' × ' + p.qty;
            }).join('<br>');
      }
    } else {
      // Quote mode: fill fields
      document.getElementById('rep-quote-no').value    = job.quotation ? job.quotation.number : ('QT-' + new Date().getFullYear() + '-' + job.id.slice(-4));
      document.getElementById('rep-quote-date').value  = job.quotation ? job.quotation.date   : new Date().toISOString().substring(0,10);
      document.getElementById('rep-service-fee').value = job.quotation ? (job.quotation.service_fee||1500) : 1500;
      document.getElementById('rep-quote-part-dropdown').style.display = 'none';
      renderQuotePartsTable();
    }

    lucide.createIcons();
  }

  window.filterQuotePartSearch = function() {
    var q  = document.getElementById('rep-quote-part-search').value.toLowerCase().trim();
    var dd = document.getElementById('rep-quote-part-dropdown');
    if (!q) { dd.style.display='none'; return; }
    var matches = DB.getAll('parts').filter(function(p){ return p.name.toLowerCase().includes(q)||p.code.toLowerCase().includes(q); });
    if (!matches.length) { dd.style.display='none'; return; }
    dd.innerHTML = matches.slice(0,6).map(function(p){
      return '<div onclick="addQuotePartItem(\'' + p.id + '\')" style="padding:9px 14px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,.05);font-size:.85rem;display:flex;justify-content:space-between;background:white;">' +
        '<span>' + p.name + '</span><span style="color:var(--primary);font-weight:700;">฿' + p.price.toLocaleString() + '</span></div>';
    }).join('');
    dd.style.display='block';
  };

  window.addQuotePart = function() {
    var val = document.getElementById('rep-quote-part-search').value.trim();
    if (!val) return;
    var part = DB.getAll('parts').find(function(p){ return p.code===val||p.id===val||p.name.toLowerCase()===val.toLowerCase(); });
    if (part) addQuotePartItem(part.id);
  };

  window.addQuotePartItem = function(partId) {
    var part = DB.find('parts','id',partId); if (!part) return;
    var ex = _repairSelectedParts.find(function(p){ return p.part_id===partId; });
    if (ex) ex.qty++;
    else _repairSelectedParts.push({ part_id:partId, name:part.name, code:part.code, qty:1, price:part.price });
    document.getElementById('rep-quote-part-search').value = '';
    document.getElementById('rep-quote-part-dropdown').style.display='none';
    renderQuotePartsTable();
  };

  function renderQuotePartsTable() {
    var body = document.getElementById('rep-quote-parts-body'); if (!body) return;
    body.innerHTML = _repairSelectedParts.map(function(item, idx) {
      var total = item.qty * item.price;
      return '<tr>' +
        '<td><code style="font-size:.78rem;">' + item.code + '</code></td>' +
        '<td>' + item.name + '</td>' +
        '<td><input type="number" class="form-control" style="width:100px;padding:4px 8px;" value="' + item.price + '" min="0" onchange="updateQuotePrice(' + idx + ',this.value)"></td>' +
        '<td><input type="number" class="form-control" style="width:70px;padding:4px 8px;" value="' + item.qty + '" min="1" onchange="updateQuoteQty(' + idx + ',this.value)"></td>' +
        '<td style="font-weight:700;">฿' + total.toLocaleString() + '</td>' +
        '<td><button class="btn btn-danger btn-xs btn-icon-only" onclick="removeQuotePart(' + idx + ')"><i data-lucide="x"></i></button></td>' +
      '</tr>';
    }).join('');
    recalcQuoteTotal();
    lucide.createIcons();
  }

  window.updateQuotePrice = function(idx,val){ _repairSelectedParts[idx].price=Math.max(0,parseInt(val)||0); renderQuotePartsTable(); };
  window.updateQuoteQty   = function(idx,val){ _repairSelectedParts[idx].qty=Math.max(1,parseInt(val)||1); renderQuotePartsTable(); };
  window.removeQuotePart  = function(idx){ _repairSelectedParts.splice(idx,1); renderQuotePartsTable(); };

  window.recalcQuoteTotal = function() {
    var partsSum = _repairSelectedParts.reduce(function(s,i){ return s+i.qty*i.price; },0);
    var svc = parseInt(document.getElementById('rep-service-fee')?.value||0);
    var sub  = partsSum + svc;
    var vat  = Math.round(sub * 0.07);
    var grand= sub + vat;
    var fmt  = function(n){ return '฿' + n.toLocaleString(); };
    var subEl=document.getElementById('rep-quote-subtotal'); if(subEl) subEl.textContent=fmt(sub);
    var vatEl=document.getElementById('rep-quote-vat');      if(vatEl) vatEl.textContent=fmt(vat);
    var gEl  =document.getElementById('rep-quote-grand');    if(gEl)   gEl.textContent=fmt(grand);
    return {partsSum:partsSum,svc:svc,sub:sub,vat:vat,grand:grand};
  };

  // ---- Print quotation → status: quote_printed ----
  window.showQuotationInvoice = function() {
    var jobId = document.getElementById('rep-prog-id').value;
    var job   = DB.find('repair_jobs','id',jobId); if (!job) return;
    var prod  = DB.find('products','id',job.product_id)||{};
    var cust  = DB.find('customers','id',job.customer_id)||{};
    var prodName  = prod.name  || job.product_name  || '-';
    var prodBrand = prod.brand || job.product_brand || '-';
    var custName  = cust.name  || job.customer_name  || '-';
    var co    = getCompanyInfo();
    var qNo   = document.getElementById('rep-quote-no').value || ('QT-'+new Date().getFullYear()+'-'+jobId.slice(-4));
    var qDate = document.getElementById('rep-quote-date').value || new Date().toISOString().substring(0,10);
    var totals= recalcQuoteTotal();

    // Save state → quote_printed
    var ts = repairSetTimestamp(DB.find('repair_jobs','id',jobId), 'quote_printed');
    DB.update('repair_jobs','id',jobId,{
      status:'quote_printed',
      parts_needed: _repairSelectedParts.map(function(p){ return {part_id:p.part_id,qty:p.qty}; }),
      quotation:{ number:qNo, date:qDate, service_fee:totals.svc, amount:totals.grand, file:qNo+'.pdf' },
      timestamps: ts
    });

    var rowsHtml = _repairSelectedParts.map(function(item,i){
      return '<tr><td style="text-align:center;">'+(i+1)+'</td><td>'+item.name+'</td><td style="text-align:center;">'+item.qty+'</td><td style="text-align:right;">฿'+item.price.toLocaleString()+'</td><td style="text-align:right;">฿'+(item.qty*item.price).toLocaleString()+'</td></tr>';
    }).join('') + '<tr style="background:rgba(99,102,241,.04);"><td style="text-align:center;">'+ (_repairSelectedParts.length+1) +'</td><td>ค่าแรง/ค่าบริการวิศวกรรม</td><td style="text-align:center;">1</td><td style="text-align:right;">฿'+totals.svc.toLocaleString()+'</td><td style="text-align:right;">฿'+totals.svc.toLocaleString()+'</td></tr>';

    var bodyContent =
      '<div class="g2" style="margin-bottom:14px;">'+
        '<div><div class="lbl">ลูกค้า / โรงพยาบาล</div><div class="val">'+( cust.name||'-')+'</div>'+
             '<div class="val" style="font-size:.85rem;color:var(--text-secondary);">'+(cust.address||'')+(cust.province?' '+cust.province:'')+'</div></div>'+
        '<div style="text-align:right;font-size:12.5px;">'+
          '<div class="lbl" style="text-align:right;">เลขที่ใบเสนอราคา</div><div class="val mono" style="text-align:right;">'+qNo+'</div>'+
          '<div class="lbl" style="margin-top:8px;text-align:right;">วันที่</div><div class="val" style="text-align:right;">'+qDate+'</div>'+
          '<div class="lbl" style="margin-top:8px;text-align:right;">อ้างอิงงาน</div><div class="val mono" style="text-align:right;">'+jobId+'</div>'+
          '<div class="lbl" style="margin-top:8px;text-align:right;">เครื่องมือแพทย์</div><div class="val" style="text-align:right;">'+(prod.name||'-')+(job.sn?' (S/N: '+job.sn+')':'')+'</div>'+
        '</div>'+
      '</div>'+
      '<table><thead><tr><th style="width:44px;text-align:center;">ลำดับ</th><th>รายการ</th><th style="width:70px;text-align:center;">จำนวน</th><th style="width:110px;text-align:right;">ราคา/หน่วย</th><th style="width:120px;text-align:right;">ยอดรวม</th></tr></thead>'+
      '<tbody>'+rowsHtml+'</tbody></table>'+
      '<div style="display:flex;justify-content:flex-end;margin-bottom:24px;">'+
        '<table style="width:260px;border:none;">'+
          '<tr><td style="padding:5px 10px;border:none;">Subtotal:</td><td style="text-align:right;font-weight:600;padding:5px 10px;border:none;">฿'+totals.sub.toLocaleString()+'</td></tr>'+
          '<tr><td style="padding:5px 10px;border:none;">VAT 7%:</td><td style="text-align:right;padding:5px 10px;border:none;">฿'+totals.vat.toLocaleString()+'</td></tr>'+
          '<tr style="border-top:2px solid #6366f1;"><td style="padding:9px 10px;font-weight:800;font-size:.95rem;border:none;">Grand Total:</td><td style="text-align:right;font-weight:800;font-size:.95rem;color:#4f46e5;padding:9px 10px;border:none;">฿'+totals.grand.toLocaleString()+'</td></tr>'+
        '</table>'+
      '</div>'+
      '<div class="sigs">'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้จัดทำ / วิศวกร</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้อนุมัติ / หัวหน้า</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้สั่งจ้าง / ลูกค้า</div></div>'+
      '</div>';

    openDocWindow(buildDocHTML('ใบเสนอราคา', bodyContent, jobId, co));
    renderRepairTable(); computeNotifications();
    showToast('success','พิมพ์ใบเสนอราคาสำเร็จ','สถานะ → เสนอราคาแล้ว');
  };

  // ---- Submit PO → status: po_received ----
  window.submitRepairPO = function() {
    var jobId = document.getElementById('rep-prog-id').value;
    var poNo  = document.getElementById('rep-po-no').value.trim();
    var delDate = document.getElementById('rep-po-delivery').value;
    var file  = simulatedFiles['rep-po-file'];
    if (!poNo) { showToast('warning','กรุณาระบุเลขที่ PO',''); return; }
    var job = DB.find('repair_jobs','id',jobId);
    var hasParts = (job.parts_needed || []).length > 0;
    var ts  = repairSetTimestamp(job,'po_received');
    if (hasParts) {
      DB.update('repair_jobs','id',jobId,{ status:'po_received', po:{number:poNo,delivery_date:delDate,file:file||'po_pending.pdf'}, timestamps:ts });
      showToast('success','บันทึก PO สำเร็จ','สถานะ → เบิก/สั่งอะไหล่');
    } else {
      // ไม่มีอะไหล่ → ข้ามไปกำลังซ่อมเลย
      ts['parts_issued'] = nowTs();
      DB.update('repair_jobs','id',jobId,{ status:'parts_issued', po:{number:poNo,delivery_date:delDate,file:file||'po_pending.pdf'}, timestamps:ts });
      showToast('success','บันทึก PO สำเร็จ','ไม่มีอะไหล่เปลี่ยน → ข้ามไปกำลังซ่อม');
    }
    closeModal('modal-repair-progress'); renderRepairTable(); computeNotifications();
  };

  // ---- Print parts requisition form ----
  window.printPartsRequisition = function() {
    var jobId = document.getElementById('rep-prog-id').value;
    var job   = DB.find('repair_jobs','id',jobId); if (!job) return;
    var prod  = DB.find('products','id',job.product_id)||{};
    var cust  = DB.find('customers','id',job.customer_id)||{};
    var prodName  = prod.name  || job.product_name  || '-';
    var prodBrand = prod.brand || job.product_brand || '-';
    var custName  = cust.name  || job.customer_name  || '-';
    var co    = getCompanyInfo();
    var parts = DB.getAll('parts');
    var rowsHtml = (job.parts_needed||[]).map(function(item,i){
      var p = parts.find(function(x){ return x.id===item.part_id; })||{};
      return '<tr><td style="text-align:center;">'+(i+1)+'</td><td>'+(p.code||item.part_id)+'</td><td>'+(p.name||'-')+'</td><td style="text-align:center;">'+item.qty+'</td><td style="text-align:right;">฿'+(p.price||0).toLocaleString()+'</td><td style="text-align:right;">฿'+(item.qty*(p.price||0)).toLocaleString()+'</td><td></td></tr>';
    }).join('');

    var bodyContent =
      '<div class="g2" style="margin-bottom:14px;">'+
        '<div><div class="lbl">เลขที่งานซ่อม</div><div class="val big">'+jobId+'</div></div>'+
        '<div><div class="lbl">วันที่เบิก</div><div class="val">'+new Date().toLocaleDateString('th-TH')+'</div></div>'+
        '<div><div class="lbl">สินค้า</div><div class="val">'+(prod.name||'-')+' ('+(prod.brand||'-')+')</div></div>'+
        '<div><div class="lbl">S/N</div><div class="val mono">'+(job.sn||'-')+'</div></div>'+
        '<div><div class="lbl">ลูกค้า</div><div class="val">'+(cust.name||'-')+'</div></div>'+
        '<div><div class="lbl">เลขที่ PO อ้างอิง</div><div class="val mono">'+(job.po?job.po.number:'-')+'</div></div>'+
      '</div>'+
      '<table><thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่ออะไหล่</th><th style="text-align:center;">จำนวน</th><th style="text-align:right;">ราคา/ชิ้น</th><th style="text-align:right;">ยอดรวม</th><th>หมายเหตุ</th></tr></thead>'+
      '<tbody>'+(rowsHtml||'<tr><td colspan="7" style="text-align:center;color:#94a3b8;">ไม่มีรายการอะไหล่</td></tr>')+'</tbody></table>'+
      '<div class="sigs">'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้ขอเบิก / วิศวกร</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้อนุมัติ / หัวหน้า</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้จ่ายอะไหล่ / คลัง</div></div>'+
      '</div>';

    openDocWindow(buildDocHTML('ใบเบิกอะไหล่', bodyContent, jobId, co));
  };


  // ---- Parts issue (stage 6) ----
  function initPartsIssueSummary(job) {
    var parts = DB.getAll('parts');
    var el = document.getElementById('parts-issue-summary'); if (!el) return;
    el.innerHTML = '<strong>รายการอะไหล่ตามใบเสนอราคา:</strong><br>' +
      (job.parts_needed||[]).map(function(item) {
        var p = parts.find(function(x){ return x.id===item.part_id; });
        return '• ' + (p?p.name:item.part_id) + ' × ' + item.qty + (p?' (คงเหลือ: '+p.stock+')':'');
      }).join('<br>');
  }

  window.submitPartsIssue = function() {
    var jobId = document.getElementById('rep-prog-id').value;
    var file  = simulatedFiles['rep-parts-file'];
    if (!file) { showToast('warning','กรุณาอัปโหลดใบเบิกอะไหล่',''); return; }
    var job = DB.find('repair_jobs','id',jobId);
    // Deduct stock
    var parts = DB.getAll('parts');
    var txItems = [];
    (job.parts_needed||[]).forEach(function(item) {
      var p = parts.find(function(x){ return x.id===item.part_id; });
      if (p) {
        if (p.stock < item.qty) { showToast('danger','สต็อกไม่พอ',p.name+' เหลือ '+p.stock+' ชิ้น'); return; }
        DB.update('parts','id',item.part_id,{stock:p.stock-item.qty});
        txItems.push({part_id:item.part_id,qty:item.qty,unit_price:p.price});
      }
    });
    if (txItems.length > 0) {
      DB.insert('parts_transactions',{id:'TX-'+Date.now().toString().slice(-6),type:'out',date:new Date().toISOString().replace('T',' ').substring(0,19),ref_no:jobId,items:txItems,created_by:DB.getCurrentUser().id});
    }
    var ts = repairSetTimestamp(job,'parts_issued');
    DB.update('repair_jobs','id',jobId,{ status:'parts_issued', parts_issue_file:file, timestamps:ts });
    showToast('success','จ่ายอะไหล่สำเร็จ','สถานะ → อยู่ระหว่างซ่อม');
    closeModal('modal-repair-progress'); renderRepairTable(); computeNotifications();
  };

  // ---- Ready return (stage 7) ----
  function initRepairReadyReturn(job) {
    var el = document.getElementById('rep-actual-parts-summary'); if (!el) return;
    var parts = DB.getAll('parts');
    el.innerHTML = (job.parts_needed||[]).map(function(item) {
      var p = parts.find(function(x){ return x.id===item.part_id; });
      return '• ' + (p?p.name:item.part_id) + ' × ' + item.qty;
    }).join('<br>') || 'ไม่มีอะไหล่';
  }

  window.submitRepairReady = function() {
    // ฟังก์ชันนี้ใช้สำหรับบันทึกผลซ่อมเท่านั้น ไม่เปลี่ยนสถานะ
    // สถานะจะเปลี่ยนเมื่อกด printAndAdvanceRepairReport()
    var jobId  = document.getElementById('rep-prog-id').value;
    var result = document.getElementById('rep-repair-result').value.trim();
    if (!result) { showToast('warning','กรุณากรอกสรุปผลการซ่อม',''); return; }
    DB.update('repair_jobs','id',jobId,{ repair_result: result });
    showToast('success','บันทึกผลการซ่อมแล้ว','กด "พิมพ์รายงานการซ่อม" เพื่อเปลี่ยนสถานะ');
  };

  // ---- Print repair report ----
  window.printRepairReport = function() {
    var jobId  = document.getElementById('rep-prog-id').value;
    var result = document.getElementById('rep-repair-result') ? document.getElementById('rep-repair-result').value.trim() : '';
    var job    = DB.find('repair_jobs','id',jobId); if (!job) return;
    var prod   = DB.find('products','id',job.product_id)||{};
    var cust   = DB.find('customers','id',job.customer_id)||{};
    var prodName  = prod.name  || job.product_name  || '-';
    var prodBrand = prod.brand || job.product_brand || '-';
    var custName  = cust.name  || job.customer_name  || '-';
    var co     = getCompanyInfo();
    var parts  = DB.getAll('parts');
    result = result || job.repair_result || '';
    var partsHtml = (job.parts_needed||[]).map(function(item,i){
      var p = parts.find(function(x){ return x.id===item.part_id; })||{};
      return '<tr><td style="text-align:center;">'+(i+1)+'</td><td>'+(p.name||'-')+'</td><td style="text-align:center;">'+item.qty+'</td></tr>';
    }).join('');
    var bodyContent =
      '<div class="g2" style="margin-bottom:14px;">'+
        '<div><div class="lbl">เลขที่งานซ่อม</div><div class="val mono big">'+jobId+'</div></div>'+
        '<div><div class="lbl">วันที่รับแจ้ง</div><div class="val">'+(job.created_at||'').substring(0,10)+'</div></div>'+
        '<div><div class="lbl">สินค้า</div><div class="val">'+(prod.name||'-')+' / '+(prod.brand||'-')+'</div></div>'+
        '<div><div class="lbl">S/N</div><div class="val mono">'+(job.sn||'-')+'</div></div>'+
        '<div><div class="lbl">ลูกค้า</div><div class="val">'+(cust.name||'-')+'</div></div>'+
        '<div><div class="lbl">อาการที่แจ้ง</div><div class="val" style="color:#d97706;">'+(job.symptom||'-')+'</div></div>'+
      '</div>'+
      '<div class="sec">ผลการตรวจเช็ค</div><p style="margin-bottom:12px;font-size:13px;line-height:1.8;">'+(job.check_results||'-')+'</p>'+
      '<div class="sec">อะไหล่ที่ใช้งาน</div>'+
      '<table><thead><tr><th>ลำดับ</th><th>ชื่ออะไหล่</th><th style="text-align:center;">จำนวน</th></tr></thead>'+
      '<tbody>'+(partsHtml||'<tr><td colspan="3" style="text-align:center;color:#94a3b8;">ไม่มีอะไหล่</td></tr>')+'</tbody></table>'+
      '<div class="sec">สรุปผลการซ่อม</div><div class="result-box">'+(result||'&nbsp;')+'</div>'+
      '<div class="sigs">'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ช่างซ่อม / วิศวกร</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">หัวหน้างาน / ผู้ตรวจ</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้รับเครื่อง / ลูกค้า</div></div>'+
      '</div>';
    openDocWindow(buildDocHTML('รายงานการซ่อม', bodyContent, jobId, co));
  };

  // ---- Print return slip (stage 8) ----
  window.printReturnSlip = function() {
    var jobId = document.getElementById('rep-prog-id').value;
    var retNoEl = document.getElementById('rep-ret-no');
    var retDateEl = document.getElementById('rep-ret-date');
    var retNo = retNoEl ? retNoEl.value.trim() : '';
    var job   = DB.find('repair_jobs','id',jobId); if (!job) return;
    retNo = retNo || (job.return_slip ? job.return_slip.number : 'DN-' + new Date().getFullYear() + '-' + jobId.slice(-4));
    var prod  = DB.find('products','id',job.product_id)||{};
    var cust  = DB.find('customers','id',job.customer_id)||{};
    var prodName  = prod.name  || job.product_name  || '-';
    var prodBrand = prod.brand || job.product_brand || '-';
    var custName  = cust.name  || job.customer_name  || '-';
    var co    = getCompanyInfo();
    var retDate = retDateEl ? retDateEl.value : (job.return_slip ? job.return_slip.date : new Date().toLocaleDateString('th-TH'));
    var bodyContent =
      '<div class="g2" style="margin-bottom:14px;">'+
        '<div><div class="lbl">เลขที่ใบส่งคืน</div><div class="val mono big">'+retNo+'</div></div>'+
        '<div><div class="lbl">วันที่ส่งคืน</div><div class="val">'+retDate+'</div></div>'+
        '<div><div class="lbl">เลขที่งานซ่อม</div><div class="val mono">'+jobId+'</div></div>'+
        '<div><div class="lbl">ลูกค้า / โรงพยาบาล</div><div class="val">'+(cust.name||'-')+'</div></div>'+
      '</div>'+
      '<div class="sec">รายการเครื่องมือแพทย์ที่ส่งคืน</div>'+
      '<div class="g2" style="margin-bottom:14px;">'+
        '<div><div class="lbl">ชื่อสินค้า</div><div class="val">'+(prod.name||'-')+'</div></div>'+
        '<div><div class="lbl">ยี่ห้อ / Brand</div><div class="val">'+(prod.brand||'-')+'</div></div>'+
        '<div><div class="lbl">Serial Number (S/N)</div><div class="val mono" style="color:#4f46e5;">'+(job.sn||'-')+'</div></div>'+
        '<div><div class="lbl">อุปกรณ์ประกอบ</div><div class="val">'+(job.accessory||'ไม่มี')+'</div></div>'+
      '</div>'+
      '<div class="sec">หมายเหตุ / สภาพการส่งคืน</div>'+
      '<div class="remark-box"></div>'+
      '<div class="sigs">'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้ส่งคืน / วิศวกร</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">ผู้รับคืน / ลูกค้า</div></div>'+
        '<div><div class="sig-line"></div><div class="sig-lbl">พยาน / หัวหน้างาน</div></div>'+
      '</div>';
    openDocWindow(buildDocHTML('ใบส่งคืนสินค้า', bodyContent, jobId, co));
  };

  // ---- Submit return → status: returning (legacy, now handled by printAndAdvanceReturnSlip) ----
  window.submitRepairReturn = function() {
    var jobId = document.getElementById('rep-prog-id').value;
    var retNo = document.getElementById('rep-ret-no') ? document.getElementById('rep-ret-no').value.trim() : '';
    if (!retNo) { showToast('warning','กรุณาระบุเลขที่ใบส่งคืน',''); return; }
    printAndAdvanceReturnSlip();
  };

  // ---- Close job → status: closed ----
  window.submitRepairClose = function() {
    var jobId = document.getElementById('rep-prog-id').value;
    var file  = simulatedFiles['rep-close-file'];
    if (!file) { showToast('warning','กรุณาอัปโหลดเอกสารปิดงาน',''); return; }
    var job = DB.find('repair_jobs','id',jobId);
    var ts  = repairSetTimestamp(job,'closed');
    DB.update('repair_jobs','id',jobId,{ status:'closed', closed_slip:{file:file}, timestamps:ts });
    showToast('success','ปิดงานซ่อมสำเร็จ!','งาน ' + jobId + ' ปิดแล้ว');
    closeModal('modal-repair-progress'); renderRepairTable(); computeNotifications();
  };

  // ---- Render history / documents panel ----
  function renderRepairHistory(job) {
    var panel = document.getElementById('rep-history-files-panel');
    var list  = document.getElementById('rep-history-files-list');
    if (!panel || !list) return;

    var ts = job.timestamps || {};
    var jobId = job.id;

    // Build document inventory from job fields
    var docs = [
      {
        step: 1, key: 'registered', label: 'ใบรับงานซ่อม',
        ts: job.created_at,
        hasDoc: true, // always printable
        printFn: 'printRepairReceipt',
        icon: 'clipboard-list', color: '#6366f1'
      },
      {
        step: 3, key: 'quoted', label: 'ใบเสนอราคา',
        ts: ts.quote_printed || ts.quoted || null,
        hasDoc: !!(job.quotation && job.quotation.number),
        docNo: job.quotation ? job.quotation.number : null,
        printFn: 'quickPrintQuote',
        icon: 'file-text', color: '#f59e0b'
      },
      {
        step: 4, key: 'po_received', label: 'ใบสั่งจ้าง (PO)',
        ts: ts.po_received || null,
        hasDoc: !!(job.po && job.po.file),
        docNo: job.po ? (job.po.number || null) : null,
        printFn: null, isUpload: !!(job.po && job.po.file),
        icon: 'file-check', color: '#0ea5e9'
      },
      {
        step: 5, key: 'po_received', label: 'ใบเบิกอะไหล่',
        ts: ts.po_received || null,
        hasDoc: !!(job.po && job.po.number),
        docNo: job.po ? job.po.number : null,
        printFn: 'quickPrintRequisition',
        icon: 'package-open', color: '#10b981'
      },
      {
        step: 6, key: 'parts_issued', label: 'ใบเบิกอะไหล่ (อนุมัติ)',
        ts: ts.parts_issued || null,
        hasDoc: !!job.parts_issue_file,
        docNo: job.parts_issue_file || null,
        printFn: null, isUpload: true,
        icon: 'file-check', color: '#10b981'
      },
      {
        step: 7, key: 'ready_return', label: 'รายงานการซ่อม',
        ts: ts.ready_return || null,
        hasDoc: !!job.repair_result,
        printFn: 'quickPrintRepairReport',
        icon: 'wrench', color: '#8b5cf6'
      },
      {
        step: 8, key: 'returning', label: 'ใบส่งคืนสินค้า',
        ts: ts.returning || null,
        hasDoc: !!(job.return_slip && job.return_slip.number),
        docNo: job.return_slip ? job.return_slip.number : null,
        printFn: 'quickPrintReturn',
        icon: 'truck', color: '#0ea5e9'
      },
      {
        step: 9, key: 'closed', label: 'เอกสารปิดงาน',
        ts: ts.closed || null,
        hasDoc: !!(job.closed_slip && job.closed_slip.file),
        docNo: job.closed_slip ? job.closed_slip.file : null,
        printFn: null, isUpload: true,
        icon: 'lock', color: '#475569'
      }
    ];

    var doneDocs = docs.filter(function(d){ return d.ts; });

    if (doneDocs.length === 0) { panel.style.display = 'none'; return; }

    panel.style.display = 'block';

    // Section header
    var headerHtml =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
        '<div style="font-size:.85rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:7px;">' +
          '<i data-lucide="folder-open" style="width:15px;height:15px;color:var(--primary);"></i>' +
          'เอกสารและ Timestamp' +
          '<span class="badge badge-registered" style="font-size:.7rem;">' + doneDocs.length + ' รายการ</span>' +
        '</div>' +
        (job.status === 'closed'
          ? '<button class="btn btn-outline btn-sm" onclick="openJobDocReview(\'' + jobId + '\')" style="font-size:.75rem;">' +
              '<i data-lucide="eye"></i>ดูเอกสารทั้งหมด' +
            '</button>'
          : '') +
      '</div>';

    // Document rows
    var rowsHtml = doneDocs.map(function(d) {
      var printBtn = '';
      if (d.printFn) {
        printBtn = '<button class="btn btn-secondary btn-sm" onclick="' + d.printFn + '(\'' + jobId + '\')" style="font-size:.72rem;padding:3px 10px;">' +
          '<i data-lucide="printer" style="width:11px;height:11px;"></i>พิมพ์' +
          '</button>';
      } else if (d.isUpload && d.hasDoc) {
        printBtn = '<span style="font-size:.72rem;color:var(--success);display:flex;align-items:center;gap:4px;">' +
          '<i data-lucide="check-circle" style="width:11px;height:11px;"></i>อัปโหลดแล้ว</span>';
      }

      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,.05);">' +
        '<div style="width:28px;height:28px;border-radius:7px;background:' + d.color + '18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<i data-lucide="' + d.icon + '" style="width:13px;height:13px;color:' + d.color + ';"></i>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:.82rem;font-weight:700;color:#0f172a;">' + d.label +
            (d.docNo ? ' <span style="font-family:monospace;font-size:.75rem;color:var(--primary);">' + d.docNo + '</span>' : '') +
          '</div>' +
          '<div style="font-size:.7rem;color:var(--text-muted);margin-top:1px;">' + (d.ts || '') + '</div>' +
        '</div>' +
        '<div style="flex-shrink:0;">' + printBtn + '</div>' +
      '</div>';
    }).join('');

    list.innerHTML = headerHtml + rowsHtml;
    lucide.createIcons();
  }

  // ---- Full document review popup ----
  window.openJobDocReview = function(jobId) {
    var job  = DB.find('repair_jobs','id',jobId); if (!job) return;
    var prod = DB.find('products','id',job.product_id) || {};
    var cust = DB.find('customers','id',job.customer_id) || {};
    var co   = getCompanyInfo();
    var ts   = job.timestamps || {};

    var docs = [
      { step:'1', label:'ใบรับงานซ่อม',         icon:'📋', ts: job.created_at,              fn:'printRepairReceipt',     done:true },
      { step:'3', label:'ใบเสนอราคา',             icon:'📄', ts: ts.quote_printed||ts.quoted, fn:'quickPrintQuote',        done:!!(job.quotation) },
      { step:'4', label:'ใบสั่งจ้าง (PO)',        icon:'📑', ts: ts.po_received,              fn:null, file: job.po ? job.po.file : null, done:!!(job.po && job.po.number) },
      { step:'5', label:'ใบเบิกอะไหล่',           icon:'📦', ts: ts.po_received,              fn:'quickPrintRequisition',  done:!!(job.po) },
      { step:'6', label:'ใบเบิกอะไหล่ (อนุมัติ)', icon:'✅', ts: ts.parts_issued,            fn:null, file:job.parts_issue_file, done:!!job.parts_issue_file },
      { step:'7', label:'รายงานการซ่อม',          icon:'🔧', ts: ts.ready_return,             fn:'quickPrintRepairReport', done:!!job.repair_result },
      { step:'8', label:'ใบส่งคืนสินค้า',         icon:'🚛', ts: ts.returning,               fn:'quickPrintReturn',       done:!!(job.return_slip) },
      { step:'9', label:'เอกสารปิดงาน',           icon:'🔒', ts: ts.closed,                  fn:null, file:job.closed_slip&&job.closed_slip.file, done:!!(job.closed_slip) }
    ];

    var docRows = docs.map(function(d) {
      var statusIcon = d.done ? '✓' : '—';
      var statusColor = d.done ? '#10b981' : '#cbd5e1';
      var btnHtml = '';
      if (d.done && d.fn) {
        btnHtml = '<button onclick="window.opener && window.opener.' + d.fn + '(\'' + jobId + '\')" ' +
          'style="padding:5px 14px;background:#6366f1;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:700;font-family:inherit;">🖨 พิมพ์</button>';
      } else if (d.done && d.file) {
        btnHtml = '<span style="font-size:12px;color:#10b981;font-weight:700;">📁 ' + d.file + '</span>';
      } else if (!d.done) {
        btnHtml = '<span style="font-size:12px;color:#94a3b8;">ยังไม่ดำเนินการ</span>';
      }
      return '<tr style="border-bottom:1px solid #e2e8f0;">' +
        '<td style="padding:10px 14px;font-size:13px;text-align:center;">' + d.step + '</td>' +
        '<td style="padding:10px 14px;font-size:13px;">' + d.icon + ' ' + d.label + '</td>' +
        '<td style="padding:10px 14px;font-size:12px;color:#64748b;">' + (d.ts||'—') + '</td>' +
        '<td style="padding:10px 14px;font-size:13px;font-weight:700;color:' + statusColor + ';text-align:center;">' + statusIcon + '</td>' +
        '<td style="padding:10px 14px;">' + btnHtml + '</td>' +
        '</tr>';
    }).join('');

    var totalDocs = docs.length;
    var completedCount = docs.filter(function(d){ return d.done; }).length;

    var html = '<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">' +
      '<title>เอกสารงาน ' + jobId + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap">' +
      '<style>' +
        '*{box-sizing:border-box;margin:0;padding:0}' +
        'body{font-family:"Sarabun",sans-serif;background:#f1f5f9;color:#1e293b;padding:20px;font-size:14px;}' +
        '.card{background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.08);overflow:hidden;max-width:820px;margin:0 auto;}' +
        '.hdr{background:#0f172a;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:flex-start;}' +
        '.hdr h1{font-size:14px;font-weight:800;margin-bottom:4px;}' +
        '.hdr p{font-size:10.5px;opacity:.6;line-height:1.6;margin:0;}' +
        '.hdr-right{text-align:right;}' +
        '.doc-title{font-size:20px;font-weight:800;color:#a5b4fc;}' +
        '.doc-no{font-size:15px;font-weight:800;color:#c7d2fe;margin-top:5px;font-family:monospace;}' +
        '.job-info{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;padding:20px 28px;background:rgba(99,102,241,.03);border-bottom:1px solid #e2e8f0;}' +
        '.info-lbl{font-size:10px;color:#64748b;font-weight:700;margin-bottom:3px;}' +
        '.info-val{font-size:13.5px;font-weight:600;color:#0f172a;}' +
        '.progress-bar{height:8px;background:#e2e8f0;border-radius:10px;margin:0 28px 0;overflow:hidden;}' +
        '.progress-fill{height:100%;background:linear-gradient(90deg,#6366f1,#10b981);border-radius:10px;transition:width .8s ease;}' +
        '.progress-lbl{padding:8px 28px 20px;font-size:.78rem;color:var(--text-muted);display:flex;justify-content:space-between;}' +
        'table{width:100%;border-collapse:collapse;}' +
        'thead tr{background:#f8fafc;}' +
        'th{padding:10px 14px;font-size:11px;font-weight:700;text-align:left;color:#64748b;border-bottom:2px solid #e2e8f0;}' +
        '.foot{background:#0f172a;color:rgba(255,255,255,.4);text-align:center;padding:12px;font-size:10px;}' +
        '@media print{body{background:#fff;padding:0;}.card{box-shadow:none;border-radius:0;max-width:100%;}}' +
      '</style></head><body>' +
      '<div class="card">' +
        '<div class="hdr">' +
          '<div><h1>' + co.name + '</h1><p>' + co.address + '</p><p>โทร: ' + co.tel + '</p></div>' +
          '<div class="hdr-right"><div class="doc-title">เอกสารประกอบงานซ่อม</div><div class="doc-no">' + jobId + '</div></div>' +
        '</div>' +
        '<div class="job-info">' +
          '<div><div class="info-lbl">สินค้า / เครื่องมือ</div><div class="info-val">' + (prod.name||'-') + ' ' + (prod.brand||'') + '</div></div>' +
          '<div><div class="info-lbl">S/N</div><div class="info-val" style="font-family:monospace;color:#4f46e5;">' + (job.sn||'-') + '</div></div>' +
          '<div><div class="info-lbl">ลูกค้า</div><div class="info-val">' + (cust.name||'-') + '</div></div>' +
          '<div><div class="info-lbl">วันที่รับแจ้ง</div><div class="info-val">' + (job.created_at||'').substring(0,10) + '</div></div>' +
          '<div><div class="info-lbl">วันที่ปิดงาน</div><div class="info-val">' + (ts.closed||'-') + '</div></div>' +
          '<div><div class="info-lbl">สถานะ</div><div class="info-val" style="color:#10b981;font-weight:800;">✓ ปิดงานแล้ว</div></div>' +
        '</div>' +
        '<div class="progress-bar" style="margin-top:16px;"><div class="progress-fill" style="width:' + Math.round(completedCount/totalDocs*100) + '%;"></div></div>' +
        '<div class="progress-lbl"><span>ความครบถ้วนของเอกสาร</span><span style="font-weight:700;color:#6366f1;">' + completedCount + ' / ' + totalDocs + ' รายการ</span></div>' +
        '<table>' +
          '<thead><tr><th style="width:50px;text-align:center;">ขั้น</th><th>เอกสาร</th><th>วัน-เวลา</th><th style="width:60px;text-align:center;">สถานะ</th><th style="width:130px;">จัดการ</th></tr></thead>' +
          '<tbody>' + docRows + '</tbody>' +
        '</table>' +
        '<div class="foot">' + co.name + ' &nbsp;|&nbsp; MES v2.0 &nbsp;|&nbsp; ดูเมื่อ: ' + new Date().toLocaleString('th-TH') + '</div>' +
      '</div>' +
      '<scr' + 'ipt>' +
        'function callPrint(fn,id){' +
          'if(window.opener&&window.opener[fn]){window.opener[fn](id);}' +
          'else{alert("กรุณาเปิดจากระบบ MES โดยตรง");}' +
        '}' +
      '</scr' + 'ipt>' +
      '</body></html>';

    var win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!win) { showToast('warning','Popup ถูกบล็อก',''); return; }
    win.document.open(); win.document.write(html); win.document.close();
  };

  // ==================== ONSITE PROGRESS ====================
  window.openOnsiteProgressModal = function (jobId) {
    var job = DB.find('onsite_jobs','id',jobId); if (!job) return;
    var prod = DB.find('products','id',job.product_id); var cust = DB.find('customers','id',job.customer_id); var eng = DB.find('users','id',job.assigned_to);
    document.getElementById('ons-prog-id').value = jobId;
    document.getElementById('ons-prog-title').textContent = 'บันทึกผลงาน: ' + jobId;
    document.getElementById('ons-prog-lbl-product').textContent = prod ? prod.name : '-';
    document.getElementById('ons-prog-lbl-sn').textContent = job.sn || '-';
    document.getElementById('ons-prog-lbl-customer').textContent = cust ? cust.name : '-';
    document.getElementById('ons-prog-lbl-dept').textContent = job.department || '-';
    document.getElementById('ons-prog-lbl-contact').textContent = job.contact_name || '-';
    document.getElementById('ons-prog-lbl-phone').textContent = job.contact_phone || '-';
    document.getElementById('ons-prog-lbl-engineer').textContent = eng ? eng.fullname : '-';
    document.getElementById('ons-prog-lbl-symptom').textContent = job.symptom || '-';
    document.getElementById('ons-prog-solution').value = job.solution || '';
    document.getElementById('ons-radio-oncall').checked = job.type === 'oncall';
    document.getElementById('ons-radio-onsite').checked = job.type === 'onsite';
    simulatedFiles['ons-close-file'] = null;
    document.getElementById('ons-close-file-name').textContent = '';
    toggleOnsiteFields();
    openModal('modal-onsite-progress');
  };

  window.toggleOnsiteFields = function () {
    var isOnsite = document.getElementById('ons-radio-onsite').checked;
    document.getElementById('ons-report-upload-sec').style.display = isOnsite ? 'block' : 'none';
  };

  // ==================== REASSIGN ENGINEER ====================
  window.openReassignModal = function(jobId, tableName) {
    var job = DB.find(tableName, 'id', jobId);
    if (!job) return;
    document.getElementById('reassign-job-id').value = jobId;
    document.getElementById('reassign-table').value = tableName;
    document.getElementById('reassign-job-info').textContent = jobId;
    document.getElementById('reassign-note').value = '';

    var currentEngId = job.assigned_to || job.created_by || '';
    var currentEng = DB.find('users','id',currentEngId);
    document.getElementById('reassign-current-eng').value = currentEng ? currentEng.fullname : '-';

    var sel = document.getElementById('reassign-new-eng');
    sel.innerHTML = '<option value="">-- เลือกวิศวกร/ช่าง --</option>';
    DB.getAll('users').filter(function(u){ return u.role === 'engineer'; }).forEach(function(u) {
      var opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.fullname + ' [' + u.zone + ']';
      sel.appendChild(opt);
    });
    openModal('modal-reassign-engineer');
    lucide.createIcons();
  };

  window.submitReassignEngineer = function() {
    var jobId = document.getElementById('reassign-job-id').value;
    var table = document.getElementById('reassign-table').value;
    var newEngId = document.getElementById('reassign-new-eng').value;
    if (!newEngId) { showToast('warning','กรุณาเลือกวิศวกร',''); return; }
    var newEng = DB.find('users','id',newEngId);
    DB.update(table,'id',jobId,{ assigned_to: newEngId });
    showToast('success','โอนงานสำเร็จ!','มอบหมายให้ ' + (newEng ? newEng.fullname : newEngId));
    closeModal('modal-reassign-engineer');
    // Refresh current view
    var viewMap = { repair_jobs:'repair', onsite_jobs:'onsite', pm_jobs:'pm' };
    loadViewData(viewMap[table] || 'repair');
  };

  // ==================== COMPANY SETTINGS ====================
  function getCompanyInfo() {
    var list = DB.getAll('company_settings');
    return list && list.length > 0 ? list[0] : {
      id:'COMPANY001', name:'บริษัท เมดิคอลเอ็นจิเนียริ่งเซอร์วิส จำกัด (สำนักงานใหญ่)',
      address:'2001/243 ซอยสุขุมวิท 101/1 แขวงบางจาก เขตพระโขนง กรุงเทพมหานคร 10260',
      tel:'081-6855596', tax_id:'0335566001006', email:'', website:''
    };
  }

  function renderCompanyView() {
    var co = getCompanyInfo();
    var el = document.getElementById('company-info-display');
    if (!el) return;
    var fields = [
      { label:'ชื่อบริษัท / สำนักงาน', value: co.name, full: true },
      { label:'ที่อยู่', value: co.address, full: true },
      { label:'โทรศัพท์', value: co.tel },
      { label:'เลขผู้เสียภาษี', value: co.tax_id },
      { label:'อีเมล', value: co.email || '-' },
      { label:'เว็บไซต์', value: co.website || '-' },
      { label:'แก้ไขล่าสุด', value: co.updated_at || '-' }
    ];
    el.innerHTML = fields.map(function(f) {
      return '<div style="' + (f.full?'grid-column:1/-1;':'') + 'padding:14px;background:white;border:1px solid rgba(0,0,0,.06);border-radius:var(--radius-md);">' +
        '<div style="font-size:.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">' + f.label + '</div>' +
        '<div style="font-size:.95rem;font-weight:600;color:#0f172a;">' + f.value + '</div>' +
        '</div>';
    }).join('');
    lucide.createIcons();
  }

  window.openCompanyModal = function() {
    var co = getCompanyInfo();
    document.getElementById('co-name').value    = co.name;
    document.getElementById('co-address').value = co.address;
    document.getElementById('co-tel').value     = co.tel;
    document.getElementById('co-tax-id').value  = co.tax_id;
    document.getElementById('co-email').value   = co.email || '';
    document.getElementById('co-website').value = co.website || '';
    openModal('modal-company-settings');
    lucide.createIcons();
  };

  // ==================== SALES ZONES ====================
  function renderMasterZones(list) {
    list = list || DB.getAll('sales_zones');
    var grid = document.getElementById('master-zones-grid'); if (!grid) return;
    var users = DB.getAll('users');
    var customers = DB.getAll('customers');
    var currentUser = DB.getCurrentUser();
    var canDelete = ['manager','supervisor'].includes(currentUser.role);

    if (list.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted);">ยังไม่มีเขตการขาย</div>';
      return;
    }
    grid.innerHTML = list.map(function(z) {
      var eng = z.engineer_id ? users.find(function(u){ return u.id === z.engineer_id; }) : null;
      var custCount = customers.filter(function(c){ return c.zone === z.id; }).length;
      var deleteBtn = canDelete
        ? '<button class="btn btn-danger btn-sm btn-icon-only" onclick="deleteMasterRecord(\'sales_zones\',\'id\',\'' + z.id + '\',\'renderMasterZones\')" title="ลบ"><i data-lucide="trash-2"></i></button>'
        : '';
      return '<div class="master-card">' +
        '<div class="master-card-header">' +
          '<div>' +
            '<div class="master-card-title" style="display:flex;align-items:center;gap:8px;">' +
              '<span style="font-size:.7rem;background:var(--primary-glow);color:var(--primary);padding:2px 8px;border-radius:10px;font-family:monospace;">' + z.id + '</span>' +
              z.name +
            '</div>' +
          '</div>' +
          '<div class="master-card-actions">' +
            '<button class="btn btn-secondary btn-sm btn-icon-only" onclick="openMasterZoneModal(\'' + z.id + '\')"><i data-lucide="edit-3"></i></button>' +
            deleteBtn +
          '</div>' +
        '</div>' +
        '<div class="master-card-meta">' +
          '<span class="meta-chip"><i data-lucide="user"></i>ช่าง: ' + (eng ? eng.fullname.replace('วิศวกร ','') : 'ยังไม่มอบหมาย') + '</span>' +
          '<span class="meta-chip"><i data-lucide="briefcase"></i>' + (z.sales_rep || 'ยังไม่มีผู้แทน') + '</span>' +
          '<span class="meta-chip"><i data-lucide="building-2"></i>' + custCount + ' ลูกค้า</span>' +
        '</div>' +
      '</div>';
    }).join('');
    lucide.createIcons();
  }

  window.filterMasterZones = function() {
    var q = document.getElementById('zone-search').value.toLowerCase();
    renderMasterZones(DB.getAll('sales_zones').filter(function(z){
      return z.name.toLowerCase().includes(q) || (z.sales_rep && z.sales_rep.toLowerCase().includes(q));
    }));
  };

  window.openMasterZoneModal = function(zoneId) {
    var list = DB.getAll('sales_zones');
    // Populate engineer dropdown
    var engSel = document.getElementById('zone-form-engineer');
    engSel.innerHTML = '<option value="">-- ยังไม่มอบหมาย --</option>';
    DB.getAll('users').filter(function(u){ return u.role === 'engineer'; }).forEach(function(u) {
      engSel.innerHTML += '<option value="' + u.id + '">' + u.fullname + ' [' + u.zone + ']</option>';
    });

    if (zoneId) {
      var z = DB.find('sales_zones','id',zoneId); if (!z) return;
      document.getElementById('zone-form-id').value = 'edit';
      document.getElementById('zone-form-zid').value = z.id;
      document.getElementById('zone-form-name').value = z.name;
      document.getElementById('zone-form-engineer').value = z.engineer_id || '';
      document.getElementById('zone-form-sales-rep').value = z.sales_rep || '';
      document.getElementById('zone-modal-title').textContent = 'แก้ไขเขต: ' + z.name;
    } else {
      var maxNum = Math.max.apply(null,[0].concat(list.map(function(z){ return parseInt(z.id.replace('ZONE',''))||0; })));
      document.getElementById('zone-form-id').value = 'new';
      document.getElementById('zone-form-zid').value = 'ZONE' + String(maxNum+1).padStart(3,'0');
      document.getElementById('zone-form-name').value = '';
      document.getElementById('zone-form-engineer').value = '';
      document.getElementById('zone-form-sales-rep').value = '';
      document.getElementById('zone-modal-title').textContent = 'เพิ่มเขตการขายใหม่';
    }
    openModal('modal-master-zone');
    lucide.createIcons();
  };

  // ==================== MODAL HELPERS ====================
  window.openModal = function (id) { document.getElementById(id).classList.add('active'); };
  window.closeModal = function (id) { document.getElementById(id).classList.remove('active'); };

  window.simulateFileUpload = function (key) {
    // สร้าง hidden file input รองรับ PDF + รูปภาพ (สะดวกกรณี upload จากมือถือ)
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = function() {
      var file = input.files[0];
      if (!file) { document.body.removeChild(input); return; }

      // ตรวจสอบขนาดไฟล์ไม่เกิน 10MB
      if (file.size > 10 * 1024 * 1024) {
        showToast('danger','ไฟล์ใหญ่เกินไป','ขนาดไฟล์ต้องไม่เกิน 10MB');
        document.body.removeChild(input); return;
      }

      var fileName = file.name;
      var isImage  = file.type.startsWith('image/');

      // เก็บชื่อไฟล์ไว้ใช้งาน
      simulatedFiles[key] = fileName;

      // แสดงผล: ชื่อไฟล์ + thumbnail ถ้าเป็นรูปภาพ
      var span = document.getElementById(key + '-name');
      if (span) {
        if (isImage) {
          var reader = new FileReader();
          reader.onload = function(e) {
            span.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">' +
              '<img src="' + e.target.result + '" style="height:48px;width:auto;border-radius:4px;border:1px solid #d1d5db;object-fit:cover;" alt="preview">' +
              '<span style="color:var(--success);font-weight:600;font-size:.85rem;">✓ ' + fileName + '</span>' +
            '</div>';
          };
          reader.readAsDataURL(file);
        } else {
          span.innerHTML = '<span style="color:var(--success);font-weight:600;font-size:.85rem;">✓ ' + fileName + '</span>';
        }
      }

      showToast('success','อัปโหลดสำเร็จ', fileName + (isImage ? ' (รูปภาพ)' : ' (PDF)'));
      document.body.removeChild(input);
    };

    input.click();
  };

  window.deleteJob = function (tableName, keyVal, keyField) {
    keyField = keyField || 'id';
    if (confirm('ยืนยันลบรายการนี้?')) {
      DB.delete(tableName, keyField, keyVal);
      showToast('success','ลบข้อมูลสำเร็จ','');
      var viewMap = { repair_jobs:'repair', onsite_jobs:'onsite', delivered_products:'delivered' };
      loadViewData(viewMap[tableName] || tableName);
      computeNotifications();
    }
  };

  // ==================== FORM LISTENERS ====================
  function setupFormListeners() {

    document.getElementById('form-register-repair').addEventListener('submit', function(e) {
      e.preventDefault();
      var jobId    = document.getElementById('rep-reg-id').value;
      var prodId   = document.getElementById('rep-reg-prod-id').value;
      var prodName = document.getElementById('rep-reg-prod-name').value.trim();
      var prodBrand= document.getElementById('rep-reg-prod-brand').value.trim();
      var custId   = document.getElementById('rep-reg-cust-id').value;
      var custName = document.getElementById('rep-reg-cust-name').value.trim();
      var sn       = document.getElementById('rep-reg-sn-display').value.trim() ||
                     document.getElementById('rep-reg-sn-hidden').value.trim();
      var wcRadio  = document.querySelector('input[name="rep-reg-warranty-cond"]:checked');
      var warrantyCond = wcRadio ? wcRadio.value : 'out_warranty';

      // ต้องมีชื่อสินค้าและลูกค้าอย่างน้อย (จาก DB หรือพิมพ์เอง)
      if (!prodName) { showToast('warning','กรุณาระบุชื่อสินค้า','เลือกจากระบบหรือพิมพ์ชื่อสินค้า'); return; }
      if (!custName) { showToast('warning','กรุณาระบุลูกค้า','เลือกจากระบบหรือพิมพ์ชื่อโรงพยาบาล'); return; }

      // ถ้าไม่มี prodId (พิมพ์เอง) ให้ใช้ชื่อแทน
      var finalProdId   = prodId   || ('MANUAL-' + prodName.substring(0,10).replace(/\s/g,''));
      var finalCustId   = custId   || ('MANUAL-' + custName.substring(0,10).replace(/\s/g,''));

      var wcLabel = { in_warranty:'สินค้าในประกัน', out_warranty:'สินค้านอกประกัน', void_warranty:'ในประกัน แต่ไม่ครอบคลุม' };

      DB.insert('repair_jobs', {
        id: jobId,
        product_id:   finalProdId,
        product_name: prodName,   // เก็บชื่อไว้กรณีพิมพ์เอง
        product_brand:prodBrand,
        customer_id:  finalCustId,
        customer_name:custName,   // เก็บชื่อไว้กรณีพิมพ์เอง
        department:   document.getElementById('rep-reg-dept').value.trim(),
        sn: sn || '',
        warranty_condition: warrantyCond,
        accessory: document.getElementById('rep-reg-accessories').value.trim(),
        symptom:   document.getElementById('rep-reg-symptom').value.trim(),
        status: 'registered', check_results: '', parts_needed: [],
        quotation: null, po: null, return_slip: null, closed_slip: null,
        created_by: DB.getCurrentUser().id,
        created_at: new Date().toISOString().replace('T',' ').substring(0,19)
      });

      showToast('success','ลงทะเบียนรับซ่อมสำเร็จ!',
        'เลขงาน: ' + jobId + (sn ? ' · S/N: ' + sn : '') + ' · ' + (wcLabel[warrantyCond]||warrantyCond));
      closeModal('modal-register-repair'); renderRepairTable();
    });

    document.getElementById('form-register-onsite').addEventListener('submit', function(e) {
      e.preventDefault();
      var jobId = document.getElementById('ons-reg-id').value;
      var sn = document.getElementById('ons-reg-sn').value.trim();
      var prodId = document.getElementById('ons-reg-prod-id').value;
      var custId = document.getElementById('ons-reg-cust-id').value;
      var assigned = document.getElementById('ons-reg-assigned-to').value;
      if (!sn || !prodId || !custId || !assigned) { showToast('warning','กรุณากรอกข้อมูลให้ครบ',''); return; }
      DB.insert('onsite_jobs', {
        id: jobId, sn: sn, product_id: prodId, customer_id: custId,
        accessory: document.getElementById('ons-reg-accessories').value.trim(),
        department: document.getElementById('ons-reg-dept').value.trim(),
        contact_name: document.getElementById('ons-reg-contact').value.trim(),
        contact_phone: document.getElementById('ons-reg-phone').value.trim(),
        symptom: document.getElementById('ons-reg-symptom').value.trim(),
        assigned_to: assigned, type: '', status: 'assigned',
        solution: '', report_file: null,
        created_by: DB.getCurrentUser().id,
        created_at: new Date().toISOString().replace('T',' ').substring(0,19)
      });
      showToast('success','จ่ายงาน Onsite สำเร็จ!','เลขงาน: ' + jobId);
      closeModal('modal-register-onsite'); renderOnsiteTable();
    });

    document.getElementById('form-onsite-progress').addEventListener('submit', function(e) {
      e.preventDefault();
      var jobId = document.getElementById('ons-prog-id').value;
      var typeEl = document.querySelector('input[name="ons-prog-type"]:checked');
      if (!typeEl) { showToast('warning','กรุณาเลือกประเภทงาน',''); return; }
      var typeValue = typeEl.value;
      var solution = document.getElementById('ons-prog-solution').value.trim();
      if (!solution) { showToast('warning','กรุณากรอกวิธีแก้ไข',''); return; }
      var update = { type: typeValue, solution: solution, status: 'closed', report_file: null };
      if (typeValue === 'onsite') {
        var file = simulatedFiles['ons-close-file'];
        if (!file) { showToast('warning','กรุณาอัปโหลด Service Report',''); return; }
        update.report_file = file;
      }
      DB.update('onsite_jobs','id',jobId, update);
      showToast('success','ปิดงาน Onsite สำเร็จ!','ประเภท: ' + typeValue.toUpperCase());
      closeModal('modal-onsite-progress'); renderOnsiteTable(); computeNotifications();
    });

    document.getElementById('form-register-delivered').addEventListener('submit', function(e) {
      e.preventDefault();
      var sn      = document.getElementById('del-reg-sn').value.trim();
      var mode    = document.getElementById('del-reg-mode').value;
      if (mode === 'new' && DB.find('delivered_products','sn',sn)) { showToast('danger','S/N ซ้ำ!',sn + ' มีอยู่แล้ว'); return; }
      var docs = []; if (simulatedFiles['del-reg-file']) docs.push(simulatedFiles['del-reg-file']);
      var deliveryDate  = document.getElementById('del-reg-date').value;
      var warrantyExpiry= document.getElementById('del-reg-expiry').value;
      var pmInterval    = parseInt(document.getElementById('del-reg-pm-interval').value, 10);
      var record = {
        sn: sn,
        product_id:        document.getElementById('del-reg-prod-id').value,
        customer_id:       document.getElementById('del-reg-cust-id').value,
        department:        document.getElementById('del-reg-dept').value.trim(),
        delivery_date:     deliveryDate,
        warranty_years:    parseInt(document.getElementById('del-reg-warranty-years').value, 10),
        warranty_expiry:   warrantyExpiry,
        pm_interval_months: pmInterval,
        documents: docs
      };

      if (mode === 'edit') {
        DB.update('delivered_products', 'sn', sn, record);
        showToast('success', 'แก้ไขข้อมูลสำเร็จ!', 'S/N: ' + sn);
      } else {
        DB.insert('delivered_products', record);

        // ===== สร้างแผน PM ทุกรอบ จากวันส่งมอบ + interval จนถึงวันหมดประกัน =====
        var pmCount = generatePmSchedule(sn, deliveryDate, pmInterval, warrantyExpiry);
        showToast('success',
          'ลงทะเบียนส่งมอบสำเร็จ!',
          'S/N: ' + sn + ' — สร้างแผน PM ' + pmCount + ' รายการ'
        );
      }
      closeModal('modal-register-delivered');
      renderDeliveredTable();
      computeNotifications();
    });

    // ===== Helper: สร้างแผน PM ครบทุกรอบ =====
    function generatePmSchedule(sn, deliveryDateStr, intervalMonths, expiryDateStr) {
      // เริ่ม PM รอบแรกจาก delivery + interval เดือน
      var start  = new Date(deliveryDateStr);
      var expiry = new Date(expiryDateStr);
      var count  = 0;

      // เดิน loop เพิ่มทีละ interval เดือน จนเกินวันหมดประกัน
      var current = new Date(start.getFullYear(), start.getMonth() + intervalMonths, 1);

      while (current <= expiry) {
        var ym = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0');
        var pmId = 'PM-' + sn + '-' + ym;

        if (!DB.find('pm_jobs', 'id', pmId)) {
          DB.insert('pm_jobs', {
            id:              pmId,
            sn:              sn,
            scheduled_month: ym,
            status:          'pending',
            report_file:     null,
            completed_at:    null,
            completed_by:    null
          });
          count++;
        }

        // เลื่อนไปรอบถัดไป
        current = new Date(current.getFullYear(), current.getMonth() + intervalMonths, 1);
      }
      return count;
    }

    document.getElementById('form-pm-progress').addEventListener('submit', function(e) {
      e.preventDefault();
      var pmId = document.getElementById('pm-prog-id').value;
      var file = simulatedFiles['pm-close-file'];
      if (!file) { showToast('warning','กรุณาอัปโหลด PM Report',''); return; }
      DB.update('pm_jobs','id',pmId,{ status:'completed', report_file:file, completed_at:new Date().toISOString().substring(0,10), completed_by:DB.getCurrentUser().id });
      showToast('success','บันทึก PM สำเร็จ!','แผนงาน ' + pmId);
      closeModal('modal-pm-progress'); renderPmView(); computeNotifications();
    });

    document.getElementById('form-warehouse-in').addEventListener('submit', function(e) {
      e.preventDefault();
      var refDoc = document.getElementById('wh-in-ref').value.trim();
      var rows = document.querySelectorAll('#wh-in-items-list .bulk-item-row');
      if (rows.length === 0) { showToast('warning','กรุณาเพิ่มรายการ',''); return; }
      var txItems = []; var parts = DB.getAll('parts'); var valid = true;
      rows.forEach(function(row) {
        var partId = row.querySelector('.bulk-part-select').value;
        var qty = parseInt(row.querySelector('.bulk-qty-input').value,10);
        var price = parseInt(row.querySelector('.bulk-price-input').value,10);
        if (!partId || isNaN(qty) || isNaN(price)) valid = false;
        else txItems.push({ part_id:partId, qty:qty, unit_price:price });
      });
      if (!valid) { showToast('warning','กรอกข้อมูลให้ครบทุกแถว',''); return; }
      txItems.forEach(function(item) {
        var part = parts.find(function(p){ return p.id===item.part_id; });
        DB.update('parts','id',item.part_id,{ stock: part.stock + item.qty });
      });
      var txId = 'TX-' + Date.now().toString().slice(-6);
      DB.insert('parts_transactions',{ id:txId, type:'in', date:new Date().toISOString().replace('T',' ').substring(0,19), ref_no:refDoc, items:txItems, created_by:DB.getCurrentUser().id });
      showToast('success','รับอะไหล่เข้าสต็อกสำเร็จ!',txItems.length + ' รายการ · TX: ' + txId);
      closeModal('modal-warehouse-in'); renderWarehouseView(); computeNotifications();
    });

    document.getElementById('form-warehouse-out').addEventListener('submit', function(e) {
      e.preventDefault();
      var refDoc = document.getElementById('wh-out-ref').value.trim();
      var rows = document.querySelectorAll('#wh-out-items-list .bulk-item-row');
      if (rows.length === 0) { showToast('warning','กรุณาเพิ่มรายการ',''); return; }
      var txItems = []; var parts = DB.getAll('parts'); var valid = true; var stockErr = '';
      rows.forEach(function(row) {
        var partId = row.querySelector('.bulk-part-select').value;
        var qty = parseInt(row.querySelector('.bulk-qty-input').value,10);
        if (!partId || isNaN(qty)) { valid = false; return; }
        var part = parts.find(function(p){ return p.id===partId; });
        if (part && part.stock < qty) stockErr = part.name + ': เหลือ ' + part.stock + ' ชิ้น';
        else if (part) txItems.push({ part_id:partId, qty:qty, unit_price:part.price });
      });
      if (!valid) { showToast('warning','กรอกข้อมูลให้ครบ',''); return; }
      if (stockErr) { showToast('danger','สต็อกไม่พอ!',stockErr); return; }
      txItems.forEach(function(item) {
        var part = parts.find(function(p){ return p.id===item.part_id; });
        DB.update('parts','id',item.part_id,{ stock: part.stock - item.qty });
      });
      var txId = 'TX-' + Date.now().toString().slice(-6);
      DB.insert('parts_transactions',{ id:txId, type:'out', date:new Date().toISOString().replace('T',' ').substring(0,19), ref_no:refDoc, items:txItems, created_by:DB.getCurrentUser().id });
      showToast('success','เบิกอะไหล่สำเร็จ!',txItems.length + ' รายการ · TX: ' + txId);
      closeModal('modal-warehouse-out'); renderWarehouseView(); computeNotifications();
    });

    document.getElementById('form-register-user').addEventListener('submit', function(e) {
      e.preventDefault();
      var userId = document.getElementById('user-reg-id').value;
      var username = document.getElementById('user-reg-username').value.trim();
      var password = document.getElementById('user-reg-password').value;
      var fullname = document.getElementById('user-reg-fullname').value.trim();
      var role = document.getElementById('user-reg-role').value;
      var zone = document.getElementById('user-reg-zone').value;
      if (DB.find('users','username',username)) { showToast('danger','Username ซ้ำ',username + ' มีในระบบแล้ว'); return; }
      DB.insert('users',{ id:userId, username:username, password:password, fullname:fullname, role:role, zone:zone });
      showToast('success','เพิ่มผู้ใช้งานสำเร็จ!',fullname);
      closeModal('modal-register-user'); renderUsersTable();
    });

    // Zone form
    document.getElementById('form-master-zone').addEventListener('submit', function(e) {
      e.preventDefault();
      var mode = document.getElementById('zone-form-id').value;
      var zid  = document.getElementById('zone-form-zid').value;
      var data = {
        id: zid,
        name: document.getElementById('zone-form-name').value.trim(),
        engineer_id: document.getElementById('zone-form-engineer').value,
        sales_rep: document.getElementById('zone-form-sales-rep').value.trim()
      };
      var existing = DB.find('sales_zones','id',zid);
      if (mode === 'edit') {
        data.provinces = existing ? (existing.provinces || []) : [];
        DB.update('sales_zones','id',zid,data);
        showToast('success','แก้ไขเขตสำเร็จ',data.name);
      } else {
        data.provinces = [];
        DB.insert('sales_zones',data);
        showToast('success','เพิ่มเขตใหม่สำเร็จ!',data.name);
      }
      closeModal('modal-master-zone');
      renderMasterZones();
    });

    document.getElementById('form-master-customer').addEventListener('submit', function(e) {
      e.preventDefault();
      var mode = document.getElementById('cust-form-id').value;
      var cid = document.getElementById('cust-form-cid').value;
      var data = { id:cid, name:document.getElementById('cust-form-name').value.trim(), address:document.getElementById('cust-form-address').value.trim(), province:document.getElementById('cust-form-province').value.trim(), zone:document.getElementById('cust-form-zone').value };
      if (mode === 'edit') { DB.update('customers','id',cid,data); showToast('success','แก้ไขลูกค้าสำเร็จ',data.name); }
      else { DB.insert('customers',data); showToast('success','เพิ่มลูกค้าสำเร็จ!',data.name); }
      closeModal('modal-master-customer'); renderMasterCustomers();
    });

    document.getElementById('form-master-product').addEventListener('submit', function(e) {
      e.preventDefault();
      var mode = document.getElementById('prod-form-id').value;
      var pid = document.getElementById('prod-form-pid').value;
      var data = { id:pid, name:document.getElementById('prod-form-name').value.trim(), brand:document.getElementById('prod-form-brand').value.trim() };
      if (mode === 'edit') { DB.update('products','id',pid,data); showToast('success','แก้ไขสินค้าสำเร็จ',data.name); }
      else { DB.insert('products',data); showToast('success','เพิ่มสินค้าสำเร็จ!',data.name); }
      closeModal('modal-master-product'); renderMasterProducts();
    });

    document.getElementById('form-master-part').addEventListener('submit', function(e) {
      e.preventDefault();
      var mode = document.getElementById('part-form-id').value;
      var pid = document.getElementById('part-form-pid').value;
      var data = {
        id: pid,
        code: document.getElementById('part-form-code').value.trim(),
        name: document.getElementById('part-form-name').value.trim(),
        stock: parseInt(document.getElementById('part-form-stock').value,10),
        min_stock: parseInt(document.getElementById('part-form-min-stock').value,10),
        price: parseInt(document.getElementById('part-form-price').value,10)
      };
      if (mode === 'edit') { DB.update('parts','id',pid,data); showToast('success','แก้ไขอะไหล่สำเร็จ',data.name); }
      else { DB.insert('parts',data); showToast('success','เพิ่มอะไหล่สำเร็จ!',data.name); }
      closeModal('modal-master-part'); renderMasterParts(); computeNotifications();
    });

    // Company Settings
    document.getElementById('form-company-settings').addEventListener('submit', function(e) {
      e.preventDefault();
      var co = getCompanyInfo();
      var updated = {
        id: co.id,
        name:    document.getElementById('co-name').value.trim(),
        address: document.getElementById('co-address').value.trim(),
        tel:     document.getElementById('co-tel').value.trim(),
        tax_id:  document.getElementById('co-tax-id').value.trim(),
        email:   document.getElementById('co-email').value.trim(),
        website: document.getElementById('co-website').value.trim(),
        updated_at: new Date().toISOString().substring(0,10)
      };
      // company_settings has only 1 record - update or insert
      var existing = DB.find('company_settings','id',co.id);
      if (existing) DB.update('company_settings','id',co.id, updated);
      else DB.insert('company_settings', updated);
      showToast('success','บันทึกข้อมูลบริษัทสำเร็จ!','');
      closeModal('modal-company-settings');
      renderCompanyView();
    });
  }

})();
