/* ============================================================
   MedStock Alert — Frontend Config
   แก้ไข GAS_URL หลัง Deploy Google Apps Script
   ============================================================ */

const CONFIG = {
  // วาง URL ของ GAS Web App ที่นี่ หลัง Deploy แล้ว
  GAS_URL: 'https://script.google.com/macros/s/AKfycby55BNF3o_Vi06LRvGHgBJFRLQaf0BBVPFdU-73GbcA8ku_BPkDrkLk2kjom7sprBY3gA/exec',

  APP_NAME: 'MedStock Alert',
  VERSION:  '1.0.0',

  // จำนวนวันสำหรับแสดง badge สี
  ALERT_DAYS: { EXPIRED: 0, CRITICAL: 7, HIGH: 30, MEDIUM: 60, LOW: 90, WATCH: 180 },
};
