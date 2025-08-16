/**
 * Minimal Express server providing:
 * - static file hosting (public/)
 * - basic session-based auth (in-memory, for demo only)
 * - file upload for video files (uploads/)
 * - admin page (protected)
 *
 * NOTE: This is a starting scaffold. For production, replace in-memory storage
 * with a real DB, enable HTTPS, use persistent session store, rate-limiting, and
 * hardened security config.
 */
const express = require('express');
const session = require('express-session');
const multer  = require('multer');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'replace_this_secret_with_env_var',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set true when using HTTPS
}));

// Simple in-memory "database"
const users = {}; // { username: { password, role } }
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Multer for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, unique);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2GB limit (adjust)

// Serve static site
app.use('/', express.static(path.join(__dirname, '..', 'public')));

// Signup
app.post('/api/signup', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'missing' });
  if (users[username]) return res.status(409).json({ error: 'exists' });
  users[username] = { password, role: 'user' };
  req.session.user = { username, role: 'user' };
  return res.json({ ok: true });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const u = users[username];
  if (!u || u.password !== password) return res.status(401).json({ error: 'invalid' });
  req.session.user = { username, role: u.role };
  return res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

function authRequired(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

function adminRequired(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).json({ error: 'forbidden' });
}

// Upload endpoint (video files)
app.post('/api/upload', authRequired, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const urlPath = '/uploads/' + path.basename(req.file.path);
  return res.json({ ok: true, file: urlPath, name: req.file.originalname });
});

// List uploads (admin)
app.get('/api/uploads', adminRequired, (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'read failed' });
    const list = files.map(f => ({ file: '/uploads/' + f, name: f }));
    res.json({ ok: true, uploads: list });
  });
});

// Serve uploads statically
app.use('/uploads', express.static(uploadsDir));

// Simple endpoint to promote a user to admin (for demo)
app.post('/api/promote', adminRequired, (req, res) => {
  const { username } = req.body;
  if (!users[username]) return res.status(404).json({ error: 'no user' });
  users[username].role = 'admin';
  res.json({ ok: true });
});

// For convenience: create a default admin account at startup
users['admin'] = { password: 'adminpass', role: 'admin' };

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});