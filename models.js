const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── MEMBER ───────────────────────────────────────────────────
const memberSchema = new Schema({
  id:           { type: String, required: true, unique: true, uppercase: true, trim: true },
  name:         { type: String, required: true, trim: true },
  father_name:  { type: String, required: true, trim: true },
  phone:        { type: String, default: null },
  plan:         { type: String, enum: ['Regular','Silver','Gold'], default: 'Regular' },
  address:      { type: String, default: null },
  join_date:    { type: Date, default: Date.now },
  is_inside:    { type: Boolean, default: false },
  current_seat: { type: String, default: null },
  last_in_time: { type: Date, default: null },
  photo_data:   { type: String, default: null },
  password:     { type: String, default: null },
}, { timestamps: true });

// ─── ATTENDANCE LOG ────────────────────────────────────────────
const attendanceLogSchema = new Schema({
  member_id:   { type: String, required: true },
  member_name: { type: String, required: true },
  type:        { type: String, enum: ['in','out'], required: true },
  seat:        { type: String, default: null },
  duration:    { type: String, default: null },
  logged_at:   { type: Date, default: Date.now },
}, { timestamps: true });

// ─── SEAT STATUS ──────────────────────────────────────────────
const seatStatusSchema = new Schema({
  seat_id:     { type: String, required: true, unique: true },
  member_id:   { type: String, default: null },
  occupied_at: { type: Date, default: null },
}, { timestamps: true });

// ─── NOTIFICATION ─────────────────────────────────────────────
const notificationSchema = new Schema({
  title:     { type: String, required: true },
  message:   { type: String, required: true },
  type:      { type: String, enum: ['info','warning','success','error'], default: 'info' },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

// ─── SETTING ──────────────────────────────────────────────────
const settingSchema = new Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, default: null },
}, { timestamps: true });

module.exports = {
  Member:       mongoose.model('Member',       memberSchema),
  AttendanceLog: mongoose.model('AttendanceLog', attendanceLogSchema),
  SeatStatus:   mongoose.model('SeatStatus',   seatStatusSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  Setting:      mongoose.model('Setting',      settingSchema),
};
