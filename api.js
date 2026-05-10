// ════════════════════════════════════════════════════════
//  A.R. Library — Frontend API Wrapper  (api.js)
//  Server ke saare endpoints yahan se call honge
//  index.html mein sirf yahi file include karo:
//    <script src="api.js"></script>
// ════════════════════════════════════════════════════════

const API_BASE = ''; // Same server pe hai toh empty rakho
                     // Alag server ho toh: 'http://localhost:3000'

// ─── Core Fetch Helper ──────────────────────────────────
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    // Network error (server band hai etc.)
    if (e instanceof TypeError) throw new Error('Server se connect nahi ho paya. Check karo server chal raha hai.');
    throw e;
  }
}

// ════════════════════════════════════════════════════════
//  HEALTH
// ════════════════════════════════════════════════════════

/** Server alive hai ya nahi check karo */
const API = {

  // ── HEALTH ───────────────────────────────────────────
  async health() {
    return apiFetch('/health');
    // Returns: { status: 'ok' }
  },

  // ════════════════════════════════════════════════════
  //  MEMBERS
  // ════════════════════════════════════════════════════

  /** Saare members laao (naam se sorted) */
  async getAllMembers() {
    return apiFetch('/api/members');
    // Returns: Array of member objects
  },

  /** Ek member laao ID se */
  async getMember(id) {
    return apiFetch('/api/members/' + encodeURIComponent(id.toUpperCase()));
    // Returns: member object
    // Throws: 'Member not found' agar nahi mila
  },

  /**
   * Naya member add karo
   * @param {object} data - { id, name, father_name, phone?, plan?, address? }
   */
  async addMember({ id, name, father_name, phone = null, plan = 'Regular', address = null, photo_data = null }) {
    return apiFetch('/api/members', {
      method: 'POST',
      body: JSON.stringify({ id, name, father_name, phone, plan, address, photo_data }),
    });
    // Returns: { success: true, id: 'ARL-001' }
  },

  /** Member delete karo ID se */
  async deleteMember(id) {
    return apiFetch('/api/members/' + encodeURIComponent(id), {
      method: 'DELETE',
    });
    // Returns: { success: true }
  },

  // ════════════════════════════════════════════════════
  //  ATTENDANCE
  // ════════════════════════════════════════════════════

  /**
   * Attendance logs laao
   * @param {object} filters - { date?: 'YYYY-MM-DD', member_id?: 'ARL-001' }
   */
  async getLogs({ date = null, member_id = null } = {}) {
    let url = '/api/logs?';
    if (date)      url += `date=${encodeURIComponent(date)}&`;
    if (member_id) url += `member_id=${encodeURIComponent(member_id)}&`;
    return apiFetch(url);
    // Returns: Array of log objects (latest first, max 500)
  },

  /**
   * Attendance mark karo (check-in ya check-out automatic)
   * @param {string} member_id
   * @param {string|null} seat - e.g. 'SEAT-01' (optional)
   */
  async markAttendance(member_id, seat = null) {
    return apiFetch('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ member_id: member_id.toUpperCase(), seat }),
    });
    // Check-IN returns:  { type: 'in',  message: 'Welcome, Name!', member: {...} }
    // Check-OUT returns: { type: 'out', duration: '2h 30m', message: 'Goodbye...', member: {...} }
  },

  // ════════════════════════════════════════════════════
  //  SEATS
  // ════════════════════════════════════════════════════

  /** Saari seats ka status laao (kaun kaunsi occupied hai) */
  async getSeats() {
    return apiFetch('/api/seats');
    // Returns: Array of { seat_id, member_id, member_name, occupied_at }
  },

  // ════════════════════════════════════════════════════
  //  STATS
  // ════════════════════════════════════════════════════

  /** Dashboard ke liye quick stats */
  async getStats() {
    return apiFetch('/api/stats');
    // Returns: { totalMembers, insideNow, todayVisits, totalLogs }
  },

  // ════════════════════════════════════════════════════
  //  SETTINGS
  // ════════════════════════════════════════════════════

  /** Saari settings ek saath laao */
  async getSettings() {
    return apiFetch('/api/settings');
    // Returns: { admin_password, seat_count, library_lat, library_lng, library_radius }
  },

  /**
   * Ek setting save karo
   * @param {string} key
   * @param {string|null} value
   */
  async saveSetting(key, value) {
    return apiFetch('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ key, value: value === null ? null : String(value) }),
    });
    // Returns: { success: true }
  },

  // ── Settings shortcuts ───────────────────────────────

  /** Admin password change karo */
  async changePassword(newPassword) {
    return API.saveSetting('admin_password', newPassword);
  },

  /** Library location set karo */
  async setLocation(lat, lng, radius = 200) {
    await API.saveSetting('library_lat',    String(lat));
    await API.saveSetting('library_lng',    String(lng));
    await API.saveSetting('library_radius', String(radius));
    return { success: true };
  },

  /** Library location lock hatao */
  async clearLocation() {
    await API.saveSetting('library_lat', null);
    await API.saveSetting('library_lng', null);
    return { success: true };
  },

  /** Seat count save karo */
  async setSeatCount(count) {
    return API.saveSetting('seat_count', String(count));
  },

  // ════════════════════════════════════════════════════
  //  NOTIFICATIONS
  // ════════════════════════════════════════════════════

  /** Active notifications laao */
  async getNotifications() {
    return apiFetch('/api/notifications');
    // Returns: Array of { notif_id, title, message, type, created_at }
  },

  /**
   * Notification create karo
   * @param {object} data - { title, message, type?: 'info'|'warning'|'success'|'error' }
   */
  async addNotification({ title, message, type = 'info' }) {
    return apiFetch('/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ title, message, type }),
    });
    // Returns: { success: true, notif_id: 5 }
  },

  /** Notification dismiss karo */
  async deleteNotification(notif_id) {
    return apiFetch('/api/notifications/' + notif_id, {
      method: 'DELETE',
    });
    // Returns: { success: true }
  },

  // ════════════════════════════════════════════════════
  //  BULK HELPERS
  // ════════════════════════════════════════════════════

  /** Ek saath members + logs + settings refresh karo */
  async refreshAll() {
    const [members, logs, settings] = await Promise.all([
      API.getAllMembers(),
      API.getLogs(),
      API.getSettings(),
    ]);
    return { members, logs, settings };
  },

  /** Poora data JSON mein export karo (download) */
  async exportData() {
    const [members, logs] = await Promise.all([
      API.getAllMembers(),
      API.getLogs(),
    ]);
    const data = {
      members,
      logs,
      exportedAt: new Date().toISOString(),
      version: '3.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `AR-Library-Data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return { success: true, members: members.length, logs: logs.length };
  },
};

// ── API object globally available hai: API.getAllMembers() etc. ──
