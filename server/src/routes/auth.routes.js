import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, withTransaction } from '../lib/db.js';
import { asyncHandler, conflict, unauthorized, badRequest } from '../lib/errors.js';
import { validateBody, emailSchema, passwordSchema } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { logAudit } from '../services/audit.service.js';

const router = Router();

const signupSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
  email: emailSchema,
  password: passwordSchema,
});

router.post(
  '/signup',
  validateBody(signupSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) throw conflict('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (first_name, last_name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, first_name, last_name, email, role, current_mode, status, created_at`,
        [firstName, lastName, email, passwordHash]
      );
      const newUser = rows[0];
      await client.query('INSERT INTO profiles (user_id) VALUES ($1)', [newUser.id]);
      await client.query(
        `INSERT INTO user_settings (user_id, default_approach_message)
         VALUES ($1, $2)`,
        [newUser.id, "Hi, I'm interested in your services and would like to discuss a project with you."]
      );
      return newUser;
    });

    req.session.userId = user.id;
    await logAudit({ userId: user.id, eventType: 'signup', req });

    res.status(201).json({ user });
  })
);

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Hardcoded admin bypass: typing the literal username "admin" with password
// "1996" logs straight into the admin account, skipping the normal
// email-format validation and signup flow entirely. This runs BEFORE
// validateBody(loginSchema) so a non-email string like "admin" never gets
// rejected by the email-format check. Requested explicitly by the site
// owner as a fast way in for themselves -- this is intentionally weak
// (a fixed, guessable credential pair) and should be swapped for a real
// password once things settle.
const ADMIN_BYPASS_USERNAME = 'admin';
const ADMIN_BYPASS_PASSWORD = '1996';

async function adminBypass(req, res, next) {
  const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const passwordRaw = typeof req.body?.password === 'string' ? req.body.password : '';
  if (emailRaw !== ADMIN_BYPASS_USERNAME || passwordRaw !== ADMIN_BYPASS_PASSWORD) return next();

  const { rows } = await query(
    `SELECT id, first_name, last_name, email, role, current_mode, status, created_at
       FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`
  );
  const user = rows[0];
  if (!user || user.status !== 'active') return next();

  req.session.userId = user.id;
  await logAudit({ userId: user.id, eventType: 'login', req });
  res.json({ user });
}

router.post(
  '/login',
  asyncHandler(adminBypass),
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query(
      `SELECT id, first_name, last_name, email, password_hash, role, current_mode, status, created_at
         FROM users WHERE email = $1`,
      [email]
    );
    const user = rows[0];
    if (!user) throw unauthorized('Incorrect email or password.');
    if (user.status !== 'active') throw unauthorized('This account is not active. Contact support.');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw unauthorized('Incorrect email or password.');

    req.session.userId = user.id;
    delete user.password_hash;
    await logAudit({ userId: user.id, eventType: 'login', req });

    res.json({ user });
  })
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('taskora.sid');
    res.json({ success: true });
  });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

export default router;
