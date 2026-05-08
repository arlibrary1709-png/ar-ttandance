// ╔══════════════════════════════════════════════════════════════╗
// ║         A.R. LIBRARY — ATTENDANCE SYSTEM SERVER             ║
// ║         Node.js + Express + MySQL                           ║
// ║                                                             ║
// ║  Install: npm install express mysql2 cors dotenv            ║
// ║  Run:     node server.js                                    ║
// ╚══════════════════════════════════════════════════════════════╝

require('dotenv').config();
const express   = require('express');
const mysql     = require('mysql2/promise');
const cors      = require('cors');
const app       = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));           // serve the HTML file from same folder

// ─────────────────────────────────────────────
// DATABASE CONNECTION
// ─────────────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'ar_library',
  port:     process.env.DB_PORT     || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

// ─────────────────────────────────────────────
// SQL — TABLE CREATION (run once)
// ─────────────────────────────────────────────
async function initDB() {
  const conn = await pool.getConnection();
  try {
    // 1. Members table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS members (
        id          VARCHAR(50)   NOT NULL PRIMARY KEY COMMENT 'Manual ID e.g. ARL-001',
        name        VARCHAR(150)  NOT NULL,
        father_name VARCHAR(150)  NOT NULL,
        phone       VARCHAR(20)   DEFAULT NULL,
        plan        ENUM('Regular','Silver','Gold') DEFAULT 'Regular',
        address     TEXT          DEFAULT NULL,
        join_date   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_inside   TINYINT(1)    NOT NULL DEFAULT 0,
        current_seat VARCHAR(20)  DEFAULT NULL,
        last_in_time DATETIME     DEFAULT NULL,
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Library members / students';
    `);

    // 2. Attendance Logs table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        log_id      BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
        member_id   VARCHAR(50)   NOT NULL,
        member_name VARCHAR(150)  NOT NULL,
        type        ENUM('in','out') NOT NULL,
        seat        VARCHAR(20)   DEFAULT NULL,
        duration    VARCHAR(30)   DEFAULT NULL  COMMENT 'e.g. 2h 30m',
        logged_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_member  (member_id),
        INDEX idx_date    (logged_at),
        INDEX idx_type    (type),
        CONSTRAINT fk_logs_member FOREIGN KEY (member_id)
          REFERENCES members(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Check-in / Check-out logs';
    `);

    // 3. Seat Status table (live seat map)
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS seat_status (
        seat_id     VARCHAR(20)   NOT NULL PRIMARY KEY COMMENT 'e.g. SEAT-01',
        member_id   VARCHAR(50)   DEFAULT NULL,
        occupied_at DATETIME      DEFAULT NULL,
        updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Live seat occupancy';
    `);

    // 4. Notifications table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        notif_id    INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        title       VARCHAR(200)  NOT NULL,
        message     TEXT          NOT NULL,
        type        ENUM('info','warning','success','error') DEFAULT 'info',
        is_active   TINYINT(1)   NOT NULL DEFAULT 1,
        created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_active (is_active),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Admin notifications shown to students on login';
    `);

    // 5. Admin Settings table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        setting_key   VARCHAR(100) NOT NULL PRIMARY KEY,
        setting_value TEXT         DEFAULT NULL,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Admin configuration: password, geo-fence, seat count, etc.';
    `);

    // Insert default admin password if not exists
    await conn.execute(`
      INSERT IGNORE INTO admin_settings (setting_key, setting_value)
      VALUES ('admin_password', 'ar@123'),
             ('seat_count', '20'),
             ('library_lat', NULL),
             ('library_lng', NULL),
             ('library_radius', '200')
    `);

    console.log('✅ Database tables initialized.');
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────
// API ROUTES — MEMBERS
// ─────────────────────────────────────────────

// GET all members
app.get('/api/members', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM members ORDER BY name ASC'
  );
  res.json(rows);
});

// GET single member
app.get('/api/members/:id', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM members WHERE id = ?', [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Member not found' });
  res.json(rows[0]);
});

// POST create member
app.post('/api/members', async (req, res) => {
  const { id, name, father_name, phone, plan, address } = req.body;
  if (!id || !name || !father_name)
    return res.status(400).json({ error: 'id, name, father_name are required' });

  await pool.execute(
    `INSERT INTO members (id, name, father_name, phone, plan, address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id.toUpperCase(), name, father_name, phone || null, plan || 'Regular', address || null]
  );
  res.json({ success: true, id: id.toUpperCase() });
});

// DELETE member
app.delete('/api/members/:id', async (req, res) => {
  await pool.execute('DELETE FROM members WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// API ROUTES — ATTENDANCE
// ─────────────────────────────────────────────

// GET logs (optional ?date=YYYY-MM-DD)
app.get('/api/logs', async (req, res) => {
  let sql  = 'SELECT * FROM attendance_logs';
  const params = [];
  if (req.query.date) {
    sql += ' WHERE DATE(logged_at) = ?';
    params.push(req.query.date);
  }
  if (req.query.member_id) {
    sql += (params.length ? ' AND' : ' WHERE') + ' member_id = ?';
    params.push(req.query.member_id);
  }
  sql += ' ORDER BY logged_at DESC LIMIT 500';
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
});

// POST mark attendance (check-in or check-out)
app.post('/api/attendance', async (req, res) => {
  const { member_id, seat } = req.body;
  if (!member_id) return res.status(400).json({ error: 'member_id required' });

  const [[member]] = await pool.execute(
    'SELECT * FROM members WHERE id = ?', [member_id.toUpperCase()]
  );
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (!member.is_inside) {
      // CHECK IN
      await conn.execute(
        `UPDATE members SET is_inside=1, current_seat=?, last_in_time=NOW() WHERE id=?`,
        [seat || null, member.id]
      );
      await conn.execute(
        `INSERT INTO attendance_logs (member_id, member_name, type, seat) VALUES (?,?,?,?)`,
        [member.id, member.name, 'in', seat || null]
      );
      if (seat) {
        await conn.execute(
          `INSERT INTO seat_status (seat_id, member_id, occupied_at) VALUES (?,?,NOW())
           ON DUPLICATE KEY UPDATE member_id=?, occupied_at=NOW()`,
          [seat, member.id, member.id]
        );
      }
      await conn.commit();
      res.json({ type: 'in', message: `Welcome, ${member.name}!`, member });
    } else {
      // CHECK OUT
      const durationSec = member.last_in_time
        ? Math.floor((Date.now() - new Date(member.last_in_time).getTime()) / 1000)
        : 0;
      const hrs = Math.floor(durationSec / 3600);
      const mins = Math.floor((durationSec % 3600) / 60);
      const durStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

      await conn.execute(
        `UPDATE members SET is_inside=0, current_seat=NULL, last_in_time=NULL WHERE id=?`,
        [member.id]
      );
      await conn.execute(
        `INSERT INTO attendance_logs (member_id, member_name, type, duration) VALUES (?,?,?,?)`,
        [member.id, member.name, 'out', durStr]
      );
      // Free seat
      if (member.current_seat) {
        await conn.execute(
          `UPDATE seat_status SET member_id=NULL, occupied_at=NULL WHERE seat_id=?`,
          [member.current_seat]
        );
      }
      await conn.commit();
      res.json({ type: 'out', duration: durStr, message: `Goodbye, ${member.name}! You spent ${durStr}.`, member });
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────
// API ROUTES — NOTIFICATIONS
// ─────────────────────────────────────────────

app.get('/api/notifications', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM notifications WHERE is_active=1 ORDER BY created_at DESC'
  );
  res.json(rows);
});

app.post('/api/notifications', async (req, res) => {
  const { title, message, type } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'title and message required' });
  const [result] = await pool.execute(
    'INSERT INTO notifications (title, message, type) VALUES (?,?,?)',
    [title, message, type || 'info']
  );
  res.json({ success: true, notif_id: result.insertId });
});

app.delete('/api/notifications/:id', async (req, res) => {
  await pool.execute('UPDATE notifications SET is_active=0 WHERE notif_id=?', [req.params.id]);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// API ROUTES — SEAT MAP
// ─────────────────────────────────────────────

app.get('/api/seats', async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT s.*, m.name AS member_name FROM seat_status s LEFT JOIN members m ON s.member_id=m.id'
  );
  res.json(rows);
});

// ─────────────────────────────────────────────
// API ROUTES — SETTINGS
// ─────────────────────────────────────────────

app.get('/api/settings', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM admin_settings');
  const settings = {};
  rows.forEach(r => (settings[r.setting_key] = r.setting_value));
  res.json(settings);
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  await pool.execute(
    `INSERT INTO admin_settings (setting_key, setting_value) VALUES (?,?)
     ON DUPLICATE KEY UPDATE setting_value=?`,
    [key, value, value]
  );
  res.json({ success: true });
});

// ─────────────────────────────────────────────
// API ROUTES — DASHBOARD STATS
// ─────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const [[{ totalMembers }]] = await pool.execute('SELECT COUNT(*) AS totalMembers FROM members');
  const [[{ insideNow }]]   = await pool.execute('SELECT COUNT(*) AS insideNow FROM members WHERE is_inside=1');
  const [[{ todayVisits }]] = await pool.execute(
    `SELECT COUNT(DISTINCT member_id) AS todayVisits FROM attendance_logs
     WHERE DATE(logged_at) = CURDATE() AND type='in'`
  );
  const [[{ totalLogs }]]   = await pool.execute('SELECT COUNT(*) AS totalLogs FROM attendance_logs');
  res.json({ totalMembers, insideNow, todayVisits, totalLogs });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 A.R. Library Server running at http://localhost:${PORT}`);
    console.log(`   MySQL: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'ar_library'}\n`);
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err.message);
  process.exit(1);
});
