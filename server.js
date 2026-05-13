require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const app     = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));  // Photo upload ke liye size badhaya
app.use(express.static('.'));

// ─── DB POOL ───────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port:     parseInt(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 30000,
});

// ─── INIT DB ───────────────────────────────
async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`CREATE TABLE IF NOT EXISTS members (
      id           VARCHAR(50)  NOT NULL PRIMARY KEY,
      name         VARCHAR(150) NOT NULL,
      father_name  VARCHAR(150) NOT NULL,
      phone        VARCHAR(20)  DEFAULT NULL,
      plan         ENUM('Regular','Silver','Gold') DEFAULT 'Regular',
      address      TEXT         DEFAULT NULL,
      join_date    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_inside    TINYINT(1)   NOT NULL DEFAULT 0,
      current_seat VARCHAR(20)  DEFAULT NULL,
      last_in_time DATETIME     DEFAULT NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      photo_data   MEDIUMTEXT   DEFAULT NULL,
      INDEX idx_name (name), INDEX idx_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    // Purane DB ke liye migration — column already exist kare toh ignore
    try {
      await conn.execute(`ALTER TABLE members ADD COLUMN photo_data MEDIUMTEXT DEFAULT NULL`);
      console.log('✅ photo_data column added');
    } catch(e) { /* Already exists — ignore */ }

    await conn.execute(`CREATE TABLE IF NOT EXISTS attendance_logs (
      log_id      BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
      member_id   VARCHAR(50)  NOT NULL,
      member_name VARCHAR(150) NOT NULL,
      type        ENUM('in','out') NOT NULL,
      seat        VARCHAR(20)  DEFAULT NULL,
      duration    VARCHAR(30)  DEFAULT NULL,
      logged_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_member (member_id), INDEX idx_date (logged_at), INDEX idx_type (type),
      CONSTRAINT fk_logs_member FOREIGN KEY (member_id)
        REFERENCES members(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS seat_status (
      seat_id     VARCHAR(20) NOT NULL PRIMARY KEY,
      member_id   VARCHAR(50) DEFAULT NULL,
      occupied_at DATETIME    DEFAULT NULL,
      updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS notifications (
      notif_id   INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title      VARCHAR(200) NOT NULL,
      message    TEXT         NOT NULL,
      type       ENUM('info','warning','success','error') DEFAULT 'info',
      is_active  TINYINT(1)   NOT NULL DEFAULT 1,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_active (is_active), INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.execute(`CREATE TABLE IF NOT EXISTS admin_settings (
      setting_key   VARCHAR(100) NOT NULL PRIMARY KEY,
      setting_value TEXT         DEFAULT NULL,
      updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await conn.execute(`INSERT IGNORE INTO admin_settings (setting_key, setting_value) VALUES
      ('admin_password','ar@123'),('seat_count','20'),
      ('library_lat',NULL),('library_lng',NULL),('library_radius','200')`);

    console.log('✅ DB initialized');
  } finally {
    conn.release();
  }
}

// ─── HEALTH CHECK ──────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── MEMBERS ───────────────────────────────
app.get('/api/members', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM members ORDER BY name ASC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/members/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM members WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Member not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members', async (req, res) => {
  try {
    const { id, name, father_name, phone, plan, address, photo_data } = req.body;
    if (!id || !name || !father_name)
      return res.status(400).json({ error: 'id, name, father_name required' });
    await pool.execute(
      'INSERT INTO members (id,name,father_name,phone,plan,address,photo_data) VALUES (?,?,?,?,?,?,?)',
      [id.toUpperCase(), name, father_name, phone||null, plan||'Regular', address||null, photo_data||null]
    );
    res.json({ success: true, id: id.toUpperCase() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/members/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM members WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ATTENDANCE ────────────────────────────
app.get('/api/logs', async (req, res) => {
  try {
    let sql = 'SELECT * FROM attendance_logs', params = [];
    if (req.query.date)      { sql += ' WHERE DATE(logged_at)=?'; params.push(req.query.date); }
    if (req.query.member_id) { sql += (params.length?' AND':' WHERE')+' member_id=?'; params.push(req.query.member_id); }
    sql += ' ORDER BY logged_at DESC LIMIT 500';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const { member_id, seat } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id required' });
    const [[member]] = await pool.execute('SELECT * FROM members WHERE id=?', [member_id.toUpperCase()]);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (!member.is_inside) {
        await conn.execute('UPDATE members SET is_inside=1,current_seat=?,last_in_time=NOW() WHERE id=?', [seat||null, member.id]);
        await conn.execute('INSERT INTO attendance_logs (member_id,member_name,type,seat) VALUES (?,?,?,?)', [member.id,member.name,'in',seat||null]);
        if (seat) await conn.execute(
          'INSERT INTO seat_status (seat_id,member_id,occupied_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE member_id=?,occupied_at=NOW()',
          [seat,member.id,member.id]
        );
        await conn.commit();
        res.json({ type:'in', message:`Welcome, ${member.name}!`, member });
      } else {
        const sec = member.last_in_time ? Math.floor((Date.now()-new Date(member.last_in_time).getTime())/1000) : 0;
        const dur = (Math.floor(sec/3600)>0?`${Math.floor(sec/3600)}h `:'')+`${Math.floor((sec%3600)/60)}m`;
        await conn.execute('UPDATE members SET is_inside=0,current_seat=NULL,last_in_time=NULL WHERE id=?', [member.id]);
        await conn.execute('INSERT INTO attendance_logs (member_id,member_name,type,duration) VALUES (?,?,?,?)', [member.id,member.name,'out',dur]);
        if (member.current_seat) await conn.execute('UPDATE seat_status SET member_id=NULL,occupied_at=NULL WHERE seat_id=?', [member.current_seat]);
        await conn.commit();
        res.json({ type:'out', duration:dur, message:`Goodbye, ${member.name}! You spent ${dur}.`, member });
      }
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── NOTIFICATIONS ─────────────────────────
app.get('/api/notifications', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM notifications WHERE is_active=1 ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const { title, message, type } = req.body;
    if (!title||!message) return res.status(400).json({ error: 'title and message required' });
    const [r] = await pool.execute('INSERT INTO notifications (title,message,type) VALUES (?,?,?)', [title,message,type||'info']);
    res.json({ success:true, notif_id:r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    await pool.execute('UPDATE notifications SET is_active=0 WHERE notif_id=?', [req.params.id]);
    res.json({ success:true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SEATS ─────────────────────────────────
app.get('/api/seats', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT s.*,m.name AS member_name FROM seat_status s LEFT JOIN members m ON s.member_id=m.id');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SETTINGS ──────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM admin_settings');
    const s = {};
    rows.forEach(r => s[r.setting_key]=r.setting_value);
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    await pool.execute('INSERT INTO admin_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?', [key,value,value]);
    res.json({ success:true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── STATS ─────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [[{totalMembers}]] = await pool.execute('SELECT COUNT(*) AS totalMembers FROM members');
    const [[{insideNow}]]    = await pool.execute('SELECT COUNT(*) AS insideNow FROM members WHERE is_inside=1');
    const [[{todayVisits}]]  = await pool.execute(`SELECT COUNT(DISTINCT member_id) AS todayVisits FROM attendance_logs WHERE DATE(logged_at)=CURDATE() AND type='in'`);
    const [[{totalLogs}]]    = await pool.execute('SELECT COUNT(*) AS totalLogs FROM attendance_logs');
    res.json({ totalMembers, insideNow, todayVisits, totalLogs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── START SERVER ──────────────────────────
const PORT = process.env.PORT || 3000;

// Server PEHLE start hoga — phir DB connect hoga
// Isse Render "No open ports" error nahi aayega
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  initDB()
    .then(() => console.log('✅ DB connected & ready'))
    .catch(err => console.error('❌ DB Error:', err.message));
});
