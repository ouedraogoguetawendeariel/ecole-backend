import bcrypt from 'bcrypt';
import 'dotenv/config';
import pool, { initDb } from '../db';

async function main() {
  await initDb();

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  const nom = process.env.ADMIN_NOM || 'Administrateur';
  const prenom = process.env.ADMIN_PRENOM || 'Admin';

  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis.'
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existingUser = await pool.query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );

  if (existingUser.rows.length > 0) {
    await pool.query(
      `UPDATE users
       SET role = 'admin',
           nom = $2,
           prenom = $3,
           password_hash = $4
       WHERE email = $1`,
      [email, nom, prenom, passwordHash]
    );

    console.log('✅ Compte administrateur mis à jour.');
  } else {
    await pool.query(
      `INSERT INTO users
       (role, nom, prenom, email, password_hash)
       VALUES ('admin', $1, $2, $3, $4)`,
      [nom, prenom, email, passwordHash]
    );

    console.log('✅ Compte administrateur créé.');
  }

  await pool.end();
}

main().catch((error) => {
  console.error('❌ Erreur :', error);
  process.exit(1);
});