const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@school.com';
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    for (const statement of schema.split(';').map(statement => statement.trim()).filter(Boolean)) {
      await connection.query(statement);
    }

    await connection.beginTransaction();
    const [admins] = await connection.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (admins.length) {
      await connection.rollback();
      console.log('An admin already exists. Log in with that account to create users. No accounts changed.');
      return;
    }

    const [existingUsers] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length) {
      throw new Error('ADMIN_EMAIL belongs to an existing user. Choose a different email.');
    }

    const [school] = await connection.execute(
      'INSERT INTO schools (school_name, director_name, email) VALUES (?, ?, ?)',
      [process.env.SCHOOL_NAME || 'My School', process.env.ADMIN_NAME || 'Administrator', email]
    );
    const hashedPassword = await bcrypt.hash(password, 10);
    await connection.execute(
      'INSERT INTO users (name, email, password, role, school_id) VALUES (?, ?, ?, ?, ?)',
      [process.env.ADMIN_NAME || 'Administrator', email, hashedPassword, 'admin', school.insertId]
    );
    await connection.commit();
    console.log(`Created school and admin. Email: ${email}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log(`Generated password (save it now): ${password}`);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

seedAdmin().catch(error => {
  console.error('Admin setup failed:', error.message);
  process.exitCode = 1;
});
