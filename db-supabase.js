/* ============================================================
 * db-supabase.js — DB Layer เชื่อม Supabase (Cache Strategy)
 * ============================================================
 * แทนที่ db.js เดิม เมื่อต้องการใช้งานจริงแบบ multi-user
 *
 * หลักการ:
 *  - DB.boot()  โหลดข้อมูลทั้งหมดจาก Supabase เข้า memory ครั้งเดียว (เรียกตอนเริ่มแอป)
 *  - DB.getAll / find  อ่านจาก memory (เร็ว เหมือนเดิม ไม่ต้องแก้ app.js)
 *  - DB.insert / update / delete  เขียน memory + sync ขึ้น Supabase เบื้องหลัง
 *
 * วิธีตั้งค่า: แก้ SUPABASE_URL และ SUPABASE_ANON_KEY ด้านล่าง
 * ============================================================ */
(function (window) {
  'use strict';

  // ====== ⚙️ ตั้งค่า Supabase (แก้ 2 บรรทัดนี้) ======
  var SUPABASE_URL      = 'https://suzhjrypskihmnhnbwgn.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_ph4_MTlHUOMFWQ9_7XMRwA_k8ZQ14uD';
  // ===================================================

  var TABLES = ['company_settings','sales_zones','users','customers','products','delivered_products',
                'repair_jobs','onsite_jobs','pm_jobs','parts','parts_transactions'];

  // primary key ของแต่ละตาราง (ส่วนใหญ่ 'id' ยกเว้น delivered_products)
  var PK = {
    delivered_products: 'sn',
    company_settings: 'id', sales_zones: 'id', pm_jobs: 'id',
    users: 'id', customers: 'id', products: 'id',
    repair_jobs: 'id', onsite_jobs: 'id', parts: 'id', parts_transactions: 'id'
  };

  // cache ใน memory
  var _cache = {};
  TABLES.forEach(function(t){ _cache[t] = []; });

  var _sb = null; // supabase client

  // ---------- Supabase REST helper (ไม่ต้องโหลด SDK) ----------
  function sbRequest(method, path, body) {
    return fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: method,
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal'
                : method === 'PATCH' ? 'return=minimal'
                : 'return=minimal'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  var DB = {
    // โหลดข้อมูลทั้งหมดจาก Supabase เข้า cache (เรียกตอนเริ่มแอป)
    boot: function () {
      return Promise.all(TABLES.map(function(table) {
        return sbRequest('GET', table + '?select=*')
          .then(function(res){ return res.ok ? res.json() : []; })
          .then(function(rows){ _cache[table] = rows || []; })
          .catch(function(err){ console.error('[DB] load ' + table + ' failed', err); _cache[table] = []; });
      })).then(function(){
        console.log('[DB] Supabase data loaded into cache');
      });
    },

    // โหลดข้อมูลตารางเดียวใหม่ (ใช้ refresh)
    reload: function (table) {
      return sbRequest('GET', table + '?select=*')
        .then(function(res){ return res.ok ? res.json() : []; })
        .then(function(rows){ _cache[table] = rows || []; return rows; });
    },

    // ====== อ่านจาก cache (sync — เหมือน db.js เดิม) ======
    getAll: function (table) {
      return (_cache[table] || []).slice();
    },

    find: function (table, field, value) {
      return (_cache[table] || []).find(function(item){ return item[field] === value; }) || null;
    },

    // ====== เขียน: memory ทันที + sync ขึ้น cloud เบื้องหลัง ======
    insert: function (table, item) {
      _cache[table] = _cache[table] || [];
      _cache[table].push(item);
      // sync ขึ้น Supabase (ไม่รอ — fire and forget แต่ log error)
      sbRequest('POST', table, item).then(function(res){
        if (!res.ok) res.text().then(function(t){ console.error('[DB] insert ' + table + ' failed:', t); });
      });
      return item;
    },

    update: function (table, keyField, keyValue, updatedData) {
      var list = _cache[table] || [];
      var idx = list.findIndex(function(item){ return item[keyField] === keyValue; });
      if (idx === -1) return null;
      // merge ใน memory
      var merged = Object.assign({}, list[idx], updatedData);
      list[idx] = merged;
      // sync: PATCH where keyField = keyValue
      var pkField = PK[table] || 'id';
      sbRequest('PATCH', table + '?' + pkField + '=eq.' + encodeURIComponent(merged[pkField]), updatedData)
        .then(function(res){
          if (!res.ok) res.text().then(function(t){ console.error('[DB] update ' + table + ' failed:', t); });
        });
      return merged;
    },

    delete: function (table, keyField, keyValue) {
      var list = _cache[table] || [];
      var existed = list.some(function(item){ return item[keyField] === keyValue; });
      _cache[table] = list.filter(function(item){ return item[keyField] !== keyValue; });
      if (existed) {
        sbRequest('DELETE', table + '?' + encodeURIComponent(keyField) + '=eq.' + encodeURIComponent(keyValue))
          .then(function(res){
            if (!res.ok) res.text().then(function(t){ console.error('[DB] delete ' + table + ' failed:', t); });
          });
      }
      return existed;
    },

    // saveAll — เขียนทั้งตาราง (ใช้น้อย แต่คงไว้เพื่อ compatibility)
    saveAll: function (table, data) {
      _cache[table] = data.slice();
      // upsert ทั้งชุด
      sbRequest('POST', table, data).then(function(res){
        if (!res.ok) res.text().then(function(t){ console.error('[DB] saveAll ' + table + ' failed:', t); });
      });
    },

    // ====== Auto Running ID (เหมือนเดิม) ======
    generateJobId: function (prefix) {
      var now = new Date();
      var year = now.getFullYear();
      var month = String(now.getMonth() + 1).padStart(2, '0');
      var prefixYearMonth = '' + prefix + year + month;
      var list = (prefix === 'MESRJ') ? this.getAll('repair_jobs') : this.getAll('onsite_jobs');
      var currentMonthJobs = list.filter(function(job){ return job.id && job.id.indexOf(prefixYearMonth) === 0; });
      var nextNumber = 1;
      if (currentMonthJobs.length > 0) {
        var runningNumbers = currentMonthJobs.map(function(job){
          return parseInt(job.id.substring(prefixYearMonth.length), 10) || 0;
        });
        nextNumber = Math.max.apply(null, runningNumbers) + 1;
      }
      return '' + prefixYearMonth + String(nextNumber).padStart(3, '0');
    },

    // ====== current user (เก็บใน sessionStorage เหมือนเดิม) ======
    getCurrentUser: function () {
      var userJSON = sessionStorage.getItem('MES_CURRENT_USER');
      return userJSON ? JSON.parse(userJSON) : null;
    },
    setCurrentUser: function (user) {
      if (user) sessionStorage.setItem('MES_CURRENT_USER', JSON.stringify(user));
      else sessionStorage.removeItem('MES_CURRENT_USER');
    },

    // init() — เพื่อ compatibility กับโค้ดเดิมที่อาจเรียก DB.init()
    init: function () { /* no-op: ใช้ boot() แทน */ }
  };

  window.DB = DB;

})(window);
