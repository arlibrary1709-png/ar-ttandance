// ═══════════════════════════════════════════════════════════════
//   A.R. Library — Attendance Server  (MongoDB Atlas)
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
require('./db'); // MongoDB connect

const express = require('express');
const cors    = require('cors');
const app     = express();

const { Member, AttendanceLog, SeatStatus, Notification, Setting } = require('./models');
const mongoose = require('mongoose');

// ─── LIBRARY DOCUMENT MODEL ───────────────────────────────────
const libDocSchema = new mongoose.Schema({
  title:     { type: String, required: true },
  filename:  { type: String, required: true },
  mime_type: { type: String, required: true },
  size:      { type: Number, default: 0 },
  data:      { type: String, required: true }, // base64
  createdAt: { type: Date, default: Date.now }
});
const LibraryDocument = mongoose.models.LibraryDocument || mongoose.model('LibraryDocument', libDocSchema);

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static('.'));

// ─── SEED DEFAULT SETTINGS ────────────────────────────────────
async function seedDefaults() {
  try {
    const defaults = [
      { key: 'admin_password', value: 'ar@123' },
      { key: 'seat_count',     value: '20'     },
      { key: 'library_lat',    value: null      },
      { key: 'library_lng',    value: null      },
      { key: 'library_radius', value: '200'     },
    ];
    for (const d of defaults) {
      await Setting.findOneAndUpdate({ key: d.key }, { $setOnInsert: d }, { upsert: true, new: true });
    }
    console.log('✅ Default settings ready');
  } catch (e) {
    console.error('⚠️ Seed error:', e.message);
  }
}

// ─── HEALTH ───────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── MEMBERS ──────────────────────────────────────────────────
app.get('/api/members', async (req, res) => {
  try {
    const members = await Member.find().sort({ name: 1 });
    res.json(members);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/members/:id', async (req, res) => {
  try {
    const member = await Member.findOne({ id: req.params.id.toUpperCase() });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members', async (req, res) => {
  try {
    const { id, name, father_name, phone, plan, address, photo_data } = req.body;
    if (!id || !name || !father_name)
      return res.status(400).json({ error: 'id, name, father_name required' });
    const member = await Member.create({
      id: id.toUpperCase(), name, father_name,
      phone: phone || null, plan: plan || 'Regular',
      address: address || null, photo_data: photo_data || null
    });
    res.json({ success: true, id: member.id });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: 'Member ID already exists' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/members/:id', async (req, res) => {
  try {
    const { name, father_name, phone, plan, address, photo_data } = req.body;
    const update = {};
    if (name)        update.name        = name;
    if (father_name) update.father_name = father_name;
    if (phone !== undefined) update.phone = phone;
    if (plan)        update.plan        = plan;
    if (address !== undefined) update.address = address;
    if (photo_data !== undefined) update.photo_data = photo_data;

    const member = await Member.findOneAndUpdate(
      { id: req.params.id.toUpperCase() },
      { $set: update },
      { new: true }
    );
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json({ success: true, member });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/members/:id', async (req, res) => {
  try {
    await Member.deleteOne({ id: req.params.id.toUpperCase() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PASSWORD ─────────────────────────────────────────────────
app.post('/api/members/:id/set-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4)
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    const member = await Member.findOne({ id: req.params.id.toUpperCase() });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (member.password) return res.status(400).json({ error: 'Password already set. Please use Forgot Password.' });
    member.password = password;
    await member.save();
    res.json({ success: true, message: 'Password set successfully!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/:id/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    const member = await Member.findOne({ id: req.params.id.toUpperCase() });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    if (!member.password) return res.json({ status: 'no_password', member });
    if (member.password !== password) return res.status(401).json({ error: 'Incorrect password! Please try again.' });
    res.json({ status: 'ok', member });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/:id/reset-password', async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 4)
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    const member = await Member.findOne({ id: req.params.id.toUpperCase() });
    if (!member) return res.status(404).json({ error: 'Member not found' });
    member.password = new_password;
    await member.save();
    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members/:id/forget-password', async (req, res) => {
  try {
    const { name, father_name, phone, new_password } = req.body;
    if (!name || !father_name || !phone || !new_password)
      return res.status(400).json({ error: "Name, father's name, mobile number and new password are all required." });
    if (new_password.length < 4)
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    const member = await Member.findOne({ id: req.params.id.toUpperCase() });
    if (!member) return res.status(404).json({ error: 'Member ID not found. Please contact admin.' });
    const nameMatch   = member.name.toLowerCase().trim()        === name.toLowerCase().trim();
    const fatherMatch = member.father_name.toLowerCase().trim() === father_name.toLowerCase().trim();
    const phoneMatch  = (member.phone || '').replace(/\s/g,'')  === phone.replace(/\s/g,'');
    if (!nameMatch || !fatherMatch || !phoneMatch)
      return res.status(401).json({ error: "Details do not match. Please check your name, father's name and mobile number." });
    member.password = new_password;
    await member.save();
    res.json({ success: true, message: 'Password reset successfully! Ab login karo.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ATTENDANCE ───────────────────────────────────────────────
app.get('/api/logs', async (req, res) => {
  try {
    const filter = {};
    if (req.query.date) {
      const d = new Date(req.query.date);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      filter.logged_at = { $gte: d, $lt: next };
    }
    if (req.query.member_id) filter.member_id = req.query.member_id;
    const logs = await AttendanceLog.find(filter).sort({ logged_at: -1 }).limit(500);
    res.json(logs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const { member_id, seat } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id required' });

    const member = await Member.findOne({ id: member_id.toUpperCase() });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    if (!member.is_inside) {
      // CHECK IN
      member.is_inside    = true;
      member.current_seat = seat || null;
      member.last_in_time = new Date();
      await member.save();

      await AttendanceLog.create({
        member_id: member.id, member_name: member.name, type: 'in', seat: seat || null
      });

      if (seat) {
        await SeatStatus.findOneAndUpdate(
          { seat_id: seat },
          { seat_id: seat, member_id: member.id, occupied_at: new Date() },
          { upsert: true }
        );
      }

      res.json({ type: 'in', message: `Welcome, ${member.name}!`, member });
    } else {
      // CHECK OUT
      const now = new Date();
      const sec = member.last_in_time ? Math.floor((now - new Date(member.last_in_time)) / 1000) : 0;
      const dur = (Math.floor(sec / 3600) > 0 ? `${Math.floor(sec / 3600)}h ` : '') + `${Math.floor((sec % 3600) / 60)}m`;

      const prevSeat = member.current_seat;
      member.is_inside    = false;
      member.current_seat = null;
      member.last_in_time = null;
      await member.save();

      await AttendanceLog.create({
        member_id: member.id, member_name: member.name, type: 'out', duration: dur
      });

      if (prevSeat) {
        await SeatStatus.findOneAndUpdate(
          { seat_id: prevSeat },
          { member_id: null, occupied_at: null }
        );
      }

      res.json({ type: 'out', duration: dur, message: `Goodbye, ${member.name}! You spent ${dur}.`, member });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── NOTIFICATIONS ────────────────────────────────────────────
app.get('/api/notifications', async (req, res) => {
  try {
    const notifs = await Notification.find({ is_active: true }).sort({ createdAt: -1 });
    res.json(notifs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const { title, message, type } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });
    const notif = await Notification.create({ title, message, type: type || 'info' });
    res.json({ success: true, notif_id: notif._id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { is_active: false });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SEATS ────────────────────────────────────────────────────
app.get('/api/seats', async (req, res) => {
  try {
    const seats = await SeatStatus.find();
    // member name bhi attach karo
    const result = await Promise.all(seats.map(async (s) => {
      let member_name = null;
      if (s.member_id) {
        const m = await Member.findOne({ id: s.member_id }, 'name');
        member_name = m ? m.name : null;
      }
      return { ...s.toObject(), member_name };
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SETTINGS ─────────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await Setting.find();
    const s = {};
    rows.forEach(r => s[r.key] = r.value);
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    await Setting.findOneAndUpdate({ key }, { key, value }, { upsert: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── STATS ────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const totalMembers = await Member.countDocuments();
    const insideNow    = await Member.countDocuments({ is_inside: true });

    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
    const todayLogs  = await AttendanceLog.distinct('member_id', {
      logged_at: { $gte: todayStart, $lte: todayEnd }, type: 'in'
    });
    const todayVisits = todayLogs.length;
    const totalLogs   = await AttendanceLog.countDocuments();

    res.json({ totalMembers, insideNow, todayVisits, totalLogs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GEMINI AI PROXY ──────────────────────────────────────────
app.post('/api/gemini', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set in environment variables.' });

    const { system_instruction, contents, generationConfig } = req.body;
    if (!contents) return res.status(400).json({ error: 'contents required' });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_instruction, contents, generationConfig }),
      }
    );
    const data = await response.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── LIBRARY DOCUMENTS ────────────────────────────────────────
// List all (no data field for performance)
app.get('/api/documents', async (req, res) => {
  try {
    const docs = await LibraryDocument.find({}, '-data').sort({ createdAt: -1 });
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Download a file (returns base64 data + mime)
app.get('/api/documents/:id/file', async (req, res) => {
  try {
    const doc = await LibraryDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'File not found' });
    // Return as actual file download
    const buffer = Buffer.from(doc.data, 'base64');
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload new document (base64 JSON body)
app.post('/api/documents', async (req, res) => {
  try {
    const { title, filename, mime_type, data, size } = req.body;
    if (!title || !filename || !mime_type || !data)
      return res.status(400).json({ error: 'title, filename, mime_type, data required' });
    if (data.length > 15 * 1024 * 1024) // ~10MB base64 limit
      return res.status(400).json({ error: 'File too large. Max 7MB.' });
    const doc = await LibraryDocument.create({ title, filename, mime_type, data, size: size || 0 });
    res.json({ success: true, id: doc._id, title: doc.title, filename: doc.filename });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    await LibraryDocument.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── START SERVER ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 A.R. Library Attendance (MongoDB) running on port ${PORT}`);
  seedDefaults().catch(console.error);
});
