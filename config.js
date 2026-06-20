/* ============================================================
   MedStock Alert — Frontend Config
   แก้ไข GAS_URL หลัง Deploy Google Apps Script
   ============================================================ */

const CONFIG = {
  // วาง URL ของ GAS Web App ที่นี่ หลัง Deploy แล้ว
  GAS_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID_HERE/exec',

  APP_NAME: 'MedStock Alert',
  VERSION:  '1.0.0',

  // จำนวนวันสำหรับแสดง badge สี
  ALERT_DAYS: { EXPIRED: 0, CRITICAL: 7, HIGH: 30, MEDIUM: 60, LOW: 90, WATCH: 180 },
};
