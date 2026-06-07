/**
 * Database Module for Medical Device After-Sales Service Management System
 * Simulates a relational database stored in localStorage.
 */

(function (window) {
  'use strict';

  const DB_PREFIX = 'MES_DB_';

  // Seed Data Definition
  const SEED_DATA = {
    company_settings: [
      {
        id: 'COMPANY001',
        name: 'บริษัท เมดิคอลเอ็นจิเนียริ่งเซอร์วิส จำกัด (สำนักงานใหญ่)',
        address: '2001/243 ซอยสุขุมวิท 101/1 แขวงบางจาก เขตพระโขนง กรุงเทพมหานคร 10260',
        tel: '081-6855596',
        tax_id: '0335566001006',
        email: 'service@mes.co.th',
        website: 'www.mes.co.th',
        updated_at: '2026-06-01'
      }
    ],
    sales_zones: [
      { id:'ZONE001', name:'ภาคเหนือ',      engineer_id:'USR003', sales_rep:'คุณสมศรี ขายดี',   provinces:['เชียงใหม่','เชียงราย','ลำปาง','ลำพูน','แม่ฮ่องสอน','พะเยา','น่าน','แพร่'] },
      { id:'ZONE002', name:'ภาคกลาง',      engineer_id:'USR004', sales_rep:'คุณวิภา สินทรัพย์', provinces:['กรุงเทพมหานคร','นนทบุรี','ปทุมธานี','สมุทรปราการ','อยุธยา','สระบุรี'] },
      { id:'ZONE003', name:'ภาคใต้',        engineer_id:'USR005', sales_rep:'คุณอนุชา โชคดี',   provinces:['สงขลา','ภูเก็ต','สุราษฎร์ธานี','นครศรีธรรมราช','กระบี่','พัทลุง'] },
      { id:'ZONE004', name:'ภาคตะวันออก',  engineer_id:'',       sales_rep:'คุณมนัส รุ่งเรือง', provinces:['ชลบุรี','ระยอง','จันทบุรี','ตราด','ฉะเชิงเทรา','สระแก้ว'] }
    ],
    users: [
      { id: 'USR001', username: 'manager', password: 'password', fullname: 'คุณสมศักดิ์ รักดี', role: 'manager', zone: 'Central' },
      { id: 'USR002', username: 'supervisor', password: 'password', fullname: 'คุณวิชัย มุ่งมั่น', role: 'supervisor', zone: 'Central' },
      { id: 'USR003', username: 'engineer_north',   password: 'password', fullname: 'วิศวกร ธนา นามดี (ภาคเหนือ)',          role: 'engineer',  zone: 'North',   tel: '081-234-5678' },
      { id: 'USR004', username: 'engineer_central', password: 'password', fullname: 'วิศวกร ประสิทธิ์ ช่างทอง (ภาคกลาง)', role: 'engineer',  zone: 'Central', tel: '082-345-6789' },
      { id: 'USR005', username: 'engineer_south',   password: 'password', fullname: 'วิศวกร นิพนธ์ ชูเกียรติ (ภาคใต้)',   role: 'engineer',  zone: 'South',   tel: '083-456-7890' },
      { id: 'USR006', username: 'engineer_east',    password: 'password', fullname: 'วิศวกร สมพงษ์ ดีงาม (ภาคตะวันออก)',  role: 'engineer',  zone: 'East',    tel: '084-567-8901' },
      { id: 'USR007', username: 'warehouse',        password: 'password', fullname: 'นายพงศ์พัฒน์ คลังดี (คลังสินค้า)',  role: 'warehouse', zone: '',        tel: '085-678-9012' },
      { id: 'USR006', username: 'admin', password: 'password', fullname: 'คุณนารี รุ่งเรือง (ธุรการ)', role: 'admin', zone: 'Central' }
    ],
    customers: [
      { id: 'CUST001', name: 'โรงพยาบาลมหาราชนครเชียงใหม่', address: '110 ถ.อินทวโรรส ต.ศรีภูมิ อ.เมือง', province: 'เชียงใหม่', zone: 'North' },
      { id: 'CUST002', name: 'โรงพยาบาลศิริราช', address: '2 ถ.วังหลัง แขวงศิริราช เขตบางกอกน้อย', province: 'กรุงเทพฯ', zone: 'Central' },
      { id: 'CUST003', name: 'โรงพยาบาลสงขลานครินทร์', address: '15 ถ.กาญจนวณิชย์ ต.คอหงส์ อ.หาดใหญ่', province: 'สงขลา', zone: 'South' },
      { id: 'CUST004', name: 'โรงพยาบาลขอนแก่น', address: '56 ถ.ศรีจันทร์ ต.ในเมือง อ.เมือง', province: 'ขอนแก่น', zone: 'East' },
      { id: 'CUST005', name: 'โรงพยาบาลชลบุรี', address: '69 หมู่ 2 ถ.สุขุมวิท ต.บ้านสวน อ.เมือง', province: 'ชลบุรี', zone: 'East' }
    ],
    products: [
      { id: 'PROD001', name: 'เครื่องช่วยหายใจ (Ventilator) - PB980', brand: 'Medtronic' },
      { id: 'PROD002', name: 'เครื่องกระตุกหัวใจ (Defibrillator) - Lifepak 15', brand: 'Stryker' },
      { id: 'PROD003', name: 'เครื่องตรวจคลื่นเสียงความถี่สูง (Ultrasound) - LOGIQ E10', brand: 'GE Healthcare' },
      { id: 'PROD004', name: 'เครื่องเฝ้าติดตามสัญญาณชีพ (Patient Monitor) - BeneVision N17', brand: 'Mindray' }
    ],
    delivered_products: [
      {
        sn: 'SN-PB980-001',
        product_id: 'PROD001',
        customer_id: 'CUST001',
        delivery_date: '2024-03-15',
        warranty_years: 2,
        warranty_expiry: '2026-03-15',
        pm_interval_months: 6,
        documents: ['warranty_card_sn001.pdf', 'installation_report_sn001.pdf']
      },
      {
        sn: 'SN-LP15-002',
        product_id: 'PROD002',
        customer_id: 'CUST002',
        delivery_date: '2025-01-10',
        warranty_years: 3,
        warranty_expiry: '2028-01-10',
        pm_interval_months: 6,
        documents: ['warranty_card_sn002.pdf']
      },
      {
        sn: 'SN-LOGIQ-003',
        product_id: 'PROD003',
        customer_id: 'CUST003',
        delivery_date: '2023-11-20',
        warranty_years: 5,
        warranty_expiry: '2028-11-20',
        pm_interval_months: 12,
        documents: ['contract_sn003.pdf', 'calibration_cert.pdf']
      },
      {
        sn: 'SN-N17-004',
        product_id: 'PROD004',
        customer_id: 'CUST004',
        delivery_date: '2026-02-18',
        warranty_years: 1,
        warranty_expiry: '2027-02-18',
        pm_interval_months: 3,
        documents: []
      }
    ],
    repair_jobs: [
      {
        id: 'MESRJ202605001',
        product_id: 'PROD001',
        accessory: 'สายไฟ AC, แผ่นกรองฝุ่น, สายลมต่อท่อทางเดินหายใจ',
        customer_id: 'CUST001',
        symptom: 'เครื่องแจ้งเปิดไม่ติด มีเสียงดังเปรี๊ยะตอนเสียบปลั๊ก',
        status: 'quote_printed',
        check_results: 'บอร์ดจ่ายไฟหลักชำรุดเนื่องจากแรงดันไฟในโรงพยาบาลไม่คงที่ ต้องเปลี่ยนบอร์ด Power Supply และฟิวส์ป้องกัน',
        parts_needed: [
          { part_id: 'PART001', qty: 1 },
          { part_id: 'PART003', qty: 1 }
        ],
        quotation: {
          number: 'QT2605001',
          date: '2026-05-20',
          amount: 8650,
          file: 'QT202605001.pdf'
        },
        po: null,
        return_slip: null,
        closed_slip: null,
        created_by: 'USR006',
        created_at: '2026-05-18 10:30:00'
      },
      {
        id: 'MESRJ202606001',
        product_id: 'PROD002',
        accessory: 'สาย ECG 12-lead, แท่นชาร์จไฟกระแสตรง, แบตเตอรี่สำรอง',
        customer_id: 'CUST002',
        symptom: 'ระบบชาร์จแบตเตอรี่โชว์สีแดงเตือน แบตเสื่อมเก็บไฟไม่อยู่',
        status: 'registered',
        check_results: '',
        parts_needed: [],
        quotation: null,
        po: null,
        return_slip: null,
        closed_slip: null,
        created_by: 'USR006',
        created_at: '2026-06-02 09:15:00'
      }
    ],
    onsite_jobs: [
      {
        id: 'MESSJ202605001',
        sn: 'SN-LOGIQ-003',
        product_id: 'PROD003',
        accessory: 'Transducer Convex, Linear, เจลอัลตราซาวด์',
        customer_id: 'CUST003',
        department: 'แผนกสูตินรีเวชวิทยา',
        contact_name: 'พญ.วิภา พรหมเกศ',
        contact_phone: '081-234-5678',
        symptom: 'หน้าจอหลักมีเส้นสั่นกระพริบรบกวนแนวตั้ง สัญญาณสแกนไม่นิ่ง',
        assigned_to: 'USR005', // engineer_south (Customer CUST003 is South Zone)
        type: 'onsite',
        status: 'closed',
        solution: 'ถอดทำความสะอาดหน้าสัมผัสของขั้วเชื่อมต่อการ์ดจอหลักและหัวตรวจด้วย Contact Cleaner ปรับการจูนกราวด์ไฟในห้องตรวจ ผลทดสอบทำงานราบรื่นคมชัด',
        report_file: 'SR202605001.pdf',
        created_by: 'USR006',
        created_at: '2026-05-22 14:00:00'
      },
      {
        id: 'MESSJ202606001',
        sn: 'SN-PB980-001',
        product_id: 'PROD001',
        accessory: 'สายไฟ AC',
        customer_id: 'CUST001',
        department: 'หออภิบาลผู้ป่วยวิกฤต (ICU)',
        contact_name: 'นพ.ประจักษ์ โชคดี',
        contact_phone: '089-876-5432',
        symptom: 'ระบบแสดงคำเตือน Oxygen Sensor Failure ระหว่างทดสอบ Self-test',
        assigned_to: 'USR003', // engineer_north (Customer CUST001 is North Zone)
        type: '',
        status: 'assigned',
        solution: '',
        report_file: null,
        created_by: 'USR006',
        created_at: '2026-06-03 11:30:00'
      }
    ],
    pm_jobs: [
      // ======================================================================
      // SN-PB980-001: ส่งมอบ 2024-03-15, ประกัน 2 ปี (ถึง 2026-03-15), PM ทุก 6 เดือน
      // รอบ PM: 2024-09, 2025-03, 2025-09, 2026-03  (4 รอบ)
      // ======================================================================
      { id:'PM-SN-PB980-001-2024-09', sn:'SN-PB980-001', scheduled_month:'2024-09', status:'completed', report_file:'PM_PB980_001_2409.pdf', completed_at:'2024-09-20', completed_by:'USR003' },
      { id:'PM-SN-PB980-001-2025-03', sn:'SN-PB980-001', scheduled_month:'2025-03', status:'completed', report_file:'PM_PB980_001_2503.pdf', completed_at:'2025-03-18', completed_by:'USR003' },
      { id:'PM-SN-PB980-001-2025-09', sn:'SN-PB980-001', scheduled_month:'2025-09', status:'completed', report_file:'PM_PB980_001_2509.pdf', completed_at:'2025-09-15', completed_by:'USR003' },
      { id:'PM-SN-PB980-001-2026-03', sn:'SN-PB980-001', scheduled_month:'2026-03', status:'pending',   report_file:null, completed_at:null, completed_by:null },

      // ======================================================================
      // SN-LP15-002: ส่งมอบ 2025-01-10, ประกัน 3 ปี (ถึง 2028-01-10), PM ทุก 6 เดือน
      // รอบ PM: 2025-07, 2026-01, 2026-07, 2027-01, 2027-07, 2028-01  (6 รอบ)
      // ======================================================================
      { id:'PM-SN-LP15-002-2025-07', sn:'SN-LP15-002', scheduled_month:'2025-07', status:'completed', report_file:'PM_LP15_002_2507.pdf', completed_at:'2025-07-22', completed_by:'USR004' },
      { id:'PM-SN-LP15-002-2026-01', sn:'SN-LP15-002', scheduled_month:'2026-01', status:'completed', report_file:'PM_LP15_002_2601.pdf', completed_at:'2026-01-20', completed_by:'USR004' },
      { id:'PM-SN-LP15-002-2026-07', sn:'SN-LP15-002', scheduled_month:'2026-07', status:'pending',   report_file:null, completed_at:null, completed_by:null },
      { id:'PM-SN-LP15-002-2027-01', sn:'SN-LP15-002', scheduled_month:'2027-01', status:'pending',   report_file:null, completed_at:null, completed_by:null },
      { id:'PM-SN-LP15-002-2027-07', sn:'SN-LP15-002', scheduled_month:'2027-07', status:'pending',   report_file:null, completed_at:null, completed_by:null },
      { id:'PM-SN-LP15-002-2028-01', sn:'SN-LP15-002', scheduled_month:'2028-01', status:'pending',   report_file:null, completed_at:null, completed_by:null },

      // ======================================================================
      // SN-LOGIQ-003: ส่งมอบ 2023-11-20, ประกัน 5 ปี (ถึง 2028-11-20), PM ทุก 12 เดือน
      // รอบ PM: 2024-11, 2025-11, 2026-11, 2027-11, 2028-11  (5 รอบ)
      // ======================================================================
      { id:'PM-SN-LOGIQ-003-2024-11', sn:'SN-LOGIQ-003', scheduled_month:'2024-11', status:'completed', report_file:'PM_LOGIQ_003_2411.pdf', completed_at:'2024-11-18', completed_by:'USR005' },
      { id:'PM-SN-LOGIQ-003-2025-11', sn:'SN-LOGIQ-003', scheduled_month:'2025-11', status:'completed', report_file:'PM_LOGIQ_003_2511.pdf', completed_at:'2025-11-12', completed_by:'USR005' },
      { id:'PM-SN-LOGIQ-003-2026-11', sn:'SN-LOGIQ-003', scheduled_month:'2026-11', status:'pending',   report_file:null, completed_at:null, completed_by:null },
      { id:'PM-SN-LOGIQ-003-2027-11', sn:'SN-LOGIQ-003', scheduled_month:'2027-11', status:'pending',   report_file:null, completed_at:null, completed_by:null },
      { id:'PM-SN-LOGIQ-003-2028-11', sn:'SN-LOGIQ-003', scheduled_month:'2028-11', status:'pending',   report_file:null, completed_at:null, completed_by:null },

      // ======================================================================
      // SN-N17-004: ส่งมอบ 2026-02-18, ประกัน 1 ปี (ถึง 2027-02-18), PM ทุก 3 เดือน
      // รอบ PM: 2026-05, 2026-08, 2026-11, 2027-02  (4 รอบ)
      // ======================================================================
      { id:'PM-SN-N17-004-2026-05', sn:'SN-N17-004', scheduled_month:'2026-05', status:'pending', report_file:null, completed_at:null, completed_by:null },
      { id:'PM-SN-N17-004-2026-08', sn:'SN-N17-004', scheduled_month:'2026-08', status:'pending', report_file:null, completed_at:null, completed_by:null },
      { id:'PM-SN-N17-004-2026-11', sn:'SN-N17-004', scheduled_month:'2026-11', status:'pending', report_file:null, completed_at:null, completed_by:null },
      { id:'PM-SN-N17-004-2027-02', sn:'SN-N17-004', scheduled_month:'2027-02', status:'pending', report_file:null, completed_at:null, completed_by:null }
    ],
    parts: [
      { id: 'PART001', name: 'บอร์ดจ่ายไฟหลัก PB980 Power Supply Board', code: 'PART-PS-001', stock: 5, min_stock: 2, price: 8500 },
      { id: 'PART002', name: 'เซ็นเซอร์วัดออกซิเจน Oxygen Sensor PB980', code: 'PART-OS-002', stock: 12, min_stock: 4, price: 3200 },
      { id: 'PART003', name: 'ฟิวส์กันไฟกระชาก Fuse 2A 250V', code: 'PART-FS-003', stock: 45, min_stock: 10, price: 150 },
      { id: 'PART004', name: 'แบตเตอรี่สำรอง Lifepak 15 Rechargeable Battery', code: 'PART-BT-004', stock: 8, min_stock: 3, price: 4800 },
      { id: 'PART005', name: 'ขวดเจลนำสัญญาณอัลตราซาวด์ Ultrasound Gel 250ml', code: 'PART-GL-005', stock: 1, min_stock: 5, price: 120 }
    ],
    parts_transactions: [
      {
        id: 'TX001',
        type: 'in',
        date: '2026-05-10 09:00:00',
        ref_no: 'PO-PART-2605A',
        items: [
          { part_id: 'PART001', qty: 5, unit_price: 8000 },
          { part_id: 'PART002', qty: 10, unit_price: 3000 },
          { part_id: 'PART003', qty: 40, unit_price: 100 }
        ],
        created_by: 'USR006'
      },
      {
        id: 'TX002',
        type: 'out',
        date: '2026-05-22 15:45:00',
        ref_no: 'MESRJ202605001',
        items: [
          { part_id: 'PART001', qty: 1, unit_price: 8500 },
          { part_id: 'PART003', qty: 1, unit_price: 150 }
        ],
        created_by: 'USR003'
      }
    ]
  };

  const DB_VERSION = '2.6'; // เพิ่มทุกครั้งที่แก้ SEED_DATA

  // Database Access Object
  const DB = {
    // Initialization
    init: function () {
      var savedVersion = localStorage.getItem(DB_PREFIX + '_version');

      // ถ้า version เปลี่ยน → reseed ทุก table
      var forceReseed = savedVersion !== DB_VERSION;
      if (forceReseed) {
        console.log('[DB] Version changed ' + savedVersion + ' → ' + DB_VERSION + ', reseeding...');
        localStorage.setItem(DB_PREFIX + '_version', DB_VERSION);
      }

      Object.keys(SEED_DATA).forEach(key => {
        const dbKey = DB_PREFIX + key;
        if (forceReseed || !localStorage.getItem(dbKey)) {
          localStorage.setItem(dbKey, JSON.stringify(SEED_DATA[key]));
        }
      });
    },

    // Read all rows
    getAll: function (table) {
      const dbKey = DB_PREFIX + table;
      const data = localStorage.getItem(dbKey);
      return data ? JSON.parse(data) : [];
    },

    // Save all rows
    saveAll: function (table, data) {
      const dbKey = DB_PREFIX + table;
      localStorage.setItem(dbKey, JSON.stringify(data));
    },

    // Find a single item by key
    find: function (table, field, value) {
      const list = this.getAll(table);
      return list.find(item => item[field] === value) || null;
    },

    // Insert a new item
    insert: function (table, item) {
      const list = this.getAll(table);
      list.push(item);
      this.saveAll(table, list);
      return item;
    },

    // Update an item by a key field
    update: function (table, keyField, keyValue, updatedData) {
      const list = this.getAll(table);
      const index = list.findIndex(item => item[keyField] === keyValue);
      if (index !== -1) {
        list[index] = { ...list[index], ...updatedData };
        this.saveAll(table, list);
        return list[index];
      }
      return null;
    },

    // Delete an item
    delete: function (table, keyField, keyValue) {
      const list = this.getAll(table);
      const filtered = list.filter(item => item[keyField] !== keyValue);
      this.saveAll(table, filtered);
      return list.length !== filtered.length;
    },

    // Generate Auto Running ID
    generateJobId: function (prefix) {
      // e.g. prefix = "MESRJ" (Repair Job) or "MESSJ" (Onsite Job)
      // Format: PREFIX + YYYY + MM + XXX (running number)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const prefixYearMonth = `${prefix}${year}${month}`;
      
      const list = (prefix === 'MESRJ') ? this.getAll('repair_jobs') : this.getAll('onsite_jobs');
      
      // Filter jobs matching current YYYYMM
      const currentMonthJobs = list.filter(job => job.id.startsWith(prefixYearMonth));
      
      let nextNumber = 1;
      if (currentMonthJobs.length > 0) {
        // Find the maximum running number
        const runningNumbers = currentMonthJobs.map(job => {
          const suffix = job.id.substring(prefixYearMonth.length);
          return parseInt(suffix, 10) || 0;
        });
        nextNumber = Math.max(...runningNumbers) + 1;
      }
      
      const suffixStr = String(nextNumber).padStart(3, '0');
      return `${prefixYearMonth}${suffixStr}`;
    },

    // Get current logged-in user
    getCurrentUser: function () {
      const userJSON = sessionStorage.getItem('MES_CURRENT_USER');
      return userJSON ? JSON.parse(userJSON) : null;
    },

    // Set logged-in user
    setCurrentUser: function (user) {
      if (user) {
        sessionStorage.setItem('MES_CURRENT_USER', JSON.stringify(user));
      } else {
        sessionStorage.removeItem('MES_CURRENT_USER');
      }
    }
  };

  // Run initialization
  DB.init();

  // Expose DB globally
  window.DB = DB;

})(window);
