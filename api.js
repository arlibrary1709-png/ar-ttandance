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
    if (e instanceof TypeError) throw new Error('Could not connect to server. Please check that the server is running.');
    throw e;
  }
}

// ════════════════════════════════════════════════════════
//  HEALTH
// ════════════════════════════════════════════════════════

/** Check if server is alive */
const API = {

  // ── HEALTH ───────────────────────────────────────────
  async health() {
    return apiFetch('/health');
    // Returns: { status: 'ok' }
  },

  // ════════════════════════════════════════════════════
  //  MEMBERS
  // ════════════════════════════════════════════════════

  /** Get all members (sorted by name) */
  async getAllMembers() {
    return apiFetch('/api/members');
    // Returns: Array of member objects
  },

  /** Get a single member by ID */
  async getMember(id) {
    return apiFetch('/api/members/' + encodeURIComponent(id.toUpperCase()));
    // Returns: member object
    // Throws: 'Member not found' agar nahi mila
  },

  /**
   * Add a new member
   * @param {object} data - { id, name, father_name, phone?, plan?, address? }
   */
  async addMember({ id, name, father_name, phone = null, plan = 'Regular', address = null, photo_data = null }) {
    return apiFetch('/api/members', {
      method: 'POST',
      body: JSON.stringify({ id, name, father_name, phone, plan, address, photo_data }),
    });
    // Returns: { success: true, id: 'ARL-001' }
  },

  /** Delete a member by ID */
  async deleteMember(id) {
    return apiFetch('/api/members/' + encodeURIComponent(id), {
      method: 'DELETE',
    });
    // Returns: { success: true }
  },

  /** Update member (name, phone, plan, address, photo) */
  async updateMember(id, data) {
    return apiFetch('/api/members/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    // Returns: { success: true, member: {...} }
  },

  // ════════════════════════════════════════════════════
  //  STUDENT PASSWORD
  // ════════════════════════════════════════════════════

  /**
   * Set password for the first time (by student)
   * @param {string} member_id
   * @param {string} password
   */
  async setPassword(member_id, password) {
    return apiFetch('/api/members/' + encodeURIComponent(member_id.toUpperCase()) + '/set-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    // Returns: { success: true, message: '...' }
  },

  /**
   * Verify password at login time
   * @param {string} member_id
   * @param {string} password
   */
  async verifyPassword(member_id, password) {
    return apiFetch('/api/members/' + encodeURIComponent(member_id.toUpperCase()) + '/verify-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    // Returns: { status: 'ok'|'no_password', member: {...} }
    // Throws 401 if wrong password
  },

  /**
   * Admin — reset any member's password
   * @param {string} member_id
   * @param {string} new_password
   */
  async resetMemberPassword(member_id, new_password) {
    return apiFetch('/api/members/' + encodeURIComponent(member_id.toUpperCase()) + '/reset-password', {
      method: 'POST',
      body: JSON.stringify({ new_password }),
    });
    // Returns: { success: true, message: '...' }
  },

  /**
   * Student — reset password by verifying name, father's name and phone
   * @param {string} member_id
   * @param {string} name
   * @param {string} father_name
   * @param {string} phone
   * @param {string} new_password
   */
  async forgetPassword(member_id, name, father_name, phone, new_password) {
    return apiFetch('/api/members/' + encodeURIComponent(member_id.toUpperCase()) + '/forget-password', {
      method: 'POST',
      body: JSON.stringify({ name, father_name, phone, new_password }),
    });
    // Returns: { success: true, message: '...' }
  },

  // ════════════════════════════════════════════════════
  //  ATTENDANCE
  // ════════════════════════════════════════════════════

  /**
   * Get attendance logs
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
   * Mark attendance (auto check-in or check-out)
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

  /** Get all seat statuses (which are occupied) */
  async getSeats() {
    return apiFetch('/api/seats');
    // Returns: Array of { seat_id, member_id, member_name, occupied_at }
  },

  // ════════════════════════════════════════════════════
  //  STATS
  // ════════════════════════════════════════════════════

  /** Quick stats for dashboard */
  async getStats() {
    return apiFetch('/api/stats');
    // Returns: { totalMembers, insideNow, todayVisits, totalLogs }
  },

  // ════════════════════════════════════════════════════
  //  SETTINGS
  // ════════════════════════════════════════════════════

  /** Get all settings at once */
  async getSettings() {
    return apiFetch('/api/settings');
    // Returns: { admin_password, seat_count, library_lat, library_lng, library_radius }
  },

  /**
   * Save a single setting
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

  /** Change admin password */
  async changePassword(newPassword) {
    return API.saveSetting('admin_password', newPassword);
  },

  /** Set library GPS location */
  async setLocation(lat, lng, radius = 200) {
    await API.saveSetting('library_lat',    String(lat));
    await API.saveSetting('library_lng',    String(lng));
    await API.saveSetting('library_radius', String(radius));
    return { success: true };
  },

  /** Remove library location lock */
  async clearLocation() {
    await API.saveSetting('library_lat', null);
    await API.saveSetting('library_lng', null);
    return { success: true };
  },

  /** Save seat count */
  async setSeatCount(count) {
    return API.saveSetting('seat_count', String(count));
  },

  // ════════════════════════════════════════════════════
  //  NOTIFICATIONS
  // ════════════════════════════════════════════════════

  /** Get active notifications */
  async getNotifications() {
    return apiFetch('/api/notifications');
    // Returns: Array of { notif_id, title, message, type, created_at }
  },

  /**
   * Create a notification
   * @param {object} data - { title, message, type?: 'info'|'warning'|'success'|'error' }
   */
  async addNotification({ title, message, type = 'info' }) {
    return apiFetch('/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ title, message, type }),
    });
    // Returns: { success: true, notif_id: 5 }
  },

  /** Dismiss a notification */
  async deleteNotification(notif_id) {
    return apiFetch('/api/notifications/' + notif_id, {
      method: 'DELETE',
    });
    // Returns: { success: true }
  },

  // ════════════════════════════════════════════════════
  //  BULK HELPERS
  // ════════════════════════════════════════════════════

  /** Refresh members + logs + settings all at once */
  async refreshAll() {
    const [members, logs, settings] = await Promise.all([
      API.getAllMembers(),
      API.getLogs(),
      API.getSettings(),
    ]);
    return { members, logs, settings };
  },

  /** Export all data as JSON (download) */
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

// ── API object is globally available: API.getAllMembers() etc. ──
