import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDb() {
  // ============================================================
  // UTILISATEURS
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      nom TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Ajouter les rôles supplémentaires
  await pool.query(`
    ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('parent', 'eleve', 'admin'));
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS classe TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS prenom TEXT;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS date_naissance DATE;
  `);

  // ============================================================
  // ADMINISTRATEUR PRINCIPAL DEPUIS .ENV
  // ============================================================

  /*
    L'administrateur principal est défini dans .env :

    ADMIN_EMAIL=admin@ecole.com
    ADMIN_PASSWORD=mot_de_passe
    ADMIN_NOM=Administrateur
    ADMIN_PRENOM=Admin

    Si l'admin n'existe pas :
      → création automatique

    Si l'admin existe déjà :
      → son mot de passe est synchronisé avec ADMIN_PASSWORD

    Les autres utilisateurs (parent / élève) ne sont PAS modifiés.
  */

  if (
    process.env.ADMIN_EMAIL &&
    process.env.ADMIN_PASSWORD
  ) {
    const adminEmail =
      process.env.ADMIN_EMAIL.trim();

    const adminPassword =
      process.env.ADMIN_PASSWORD;

    const adminNom =
      process.env.ADMIN_NOM ||
      'Administrateur';

    const adminPrenom =
      process.env.ADMIN_PRENOM ||
      'Admin';

    const adminExiste = await pool.query(
      `
      SELECT
        id,
        role
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [adminEmail]
    );

    // ==========================================================
    // ADMIN N'EXISTE PAS → CRÉATION
    // ==========================================================

    if (adminExiste.rows.length === 0) {

      const passwordHash =
        await bcrypt.hash(
          adminPassword,
          12
        );

      await pool.query(
        `
        INSERT INTO users (
          role,
          nom,
          prenom,
          email,
          password_hash
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          'admin',
          adminNom,
          adminPrenom,
          adminEmail,
          passwordHash
        ]
      );

      console.log(
        `Administrateur principal créé : ${adminEmail}`
      );

    } else {

      // ========================================================
      // ADMIN EXISTE → SYNCHRONISATION
      // ========================================================

      const adminId =
        adminExiste.rows[0].id;

      const passwordHash =
        await bcrypt.hash(
          adminPassword,
          12
        );

      await pool.query(
        `
        UPDATE users
        SET
          role = 'admin',
          nom = $1,
          prenom = $2,
          password_hash = $3
        WHERE id = $4
        `,
        [
          adminNom,
          adminPrenom,
          passwordHash,
          adminId
        ]
      );

      console.log(
        `Administrateur principal synchronisé : ${adminEmail}`
      );
    }
  }

  // ============================================================
  // ENFANTS
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS children (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nom TEXT NOT NULL,
      classe TEXT NOT NULL DEFAULT 'Non définie'
    );
  `);

  // ============================================================
  // RELATION PARENT / ÉLÈVE
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parent_children (
      parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      child_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (parent_id, child_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS parent_child_requests (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      child_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (parent_id, child_id)
    );
  `);

  // ============================================================
  // NOTES
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      eleve_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      matiere TEXT NOT NULL,
      note DECIMAL(5,2) NOT NULL,
      coefficient DECIMAL(5,2) NOT NULL DEFAULT 1,
      trimestre TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // ============================================================
  // EMPLOI DU TEMPS
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS emploi_du_temps (
      id SERIAL PRIMARY KEY,
      classe TEXT NOT NULL,
      jour TEXT NOT NULL,
      heure_debut TIME NOT NULL,
      heure_fin TIME NOT NULL,
      matiere TEXT NOT NULL,
      salle TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE emploi_du_temps
    DROP CONSTRAINT IF EXISTS emploi_du_temps_jour_check;
  `);

  await pool.query(`
    ALTER TABLE emploi_du_temps
    ADD CONSTRAINT emploi_du_temps_jour_check
    CHECK (
      jour IN (
        'Lundi',
        'Mardi',
        'Mercredi',
        'Jeudi',
        'Vendredi',
        'Samedi',
        'Dimanche'
      )
    );
  `);

  // ============================================================
  // CONTENU DU SITE
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_contenus (
      id SERIAL PRIMARY KEY,
      page TEXT NOT NULL,
      section TEXT NOT NULL,
      contenu JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (page, section)
    );
  `);

  // ============================================================
  // ACTUALITÉS
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS actualites (
      id SERIAL PRIMARY KEY,

      type TEXT NOT NULL DEFAULT 'annonce',

      categorie TEXT NOT NULL DEFAULT 'annonce',

      destination TEXT NOT NULL DEFAULT 'publique',

      cible TEXT NOT NULL DEFAULT 'tous',

      titre TEXT NOT NULL,

      contenu TEXT,

      classe TEXT,

      eleve_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

      periode TEXT,

      fichier_url TEXT,

      photos TEXT[] DEFAULT '{}',

      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // ============================================================
  // MISE À JOUR DES ANCIENNES TABLES ACTUALITES
  // ============================================================

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'annonce';
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS categorie TEXT DEFAULT 'annonce';
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS destination TEXT DEFAULT 'publique';
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS cible TEXT DEFAULT 'tous';
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS contenu TEXT;
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS classe TEXT;
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS eleve_id INTEGER;
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS periode TEXT;
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS fichier_url TEXT;
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS created_by INTEGER;
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
  `);

  // ============================================================
  // CONTRAINTE DESTINATION
  // ============================================================

  await pool.query(`
    ALTER TABLE actualites
    DROP CONSTRAINT IF EXISTS actualites_destination_check;
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD CONSTRAINT actualites_destination_check
    CHECK (destination IN ('publique', 'utilisateurs'));
  `);

  await pool.query(`
    UPDATE actualites
    SET destination = 'publique'
    WHERE destination IS NULL
       OR destination NOT IN ('publique', 'utilisateurs');
  `);

  // ============================================================
  // CONTRAINTE CIBLE
  // ============================================================

  await pool.query(`
    ALTER TABLE actualites
    DROP CONSTRAINT IF EXISTS actualites_cible_check;
  `);

  await pool.query(`
    ALTER TABLE actualites
    ADD CONSTRAINT actualites_cible_check
    CHECK (cible IN ('tous', 'classe', 'eleve'));
  `);

  await pool.query(`
    UPDATE actualites
    SET cible = 'tous'
    WHERE cible IS NULL
       OR cible NOT IN ('tous', 'classe', 'eleve');
  `);

  // ============================================================
  // DEVOIRS
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS devoirs (
      id SERIAL PRIMARY KEY,
      classe TEXT NOT NULL,
      matiere TEXT NOT NULL,
      titre TEXT NOT NULL,
      description TEXT,
      date_devoir DATE NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // ============================================================
  // ABSENCES
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS absences (
      id SERIAL PRIMARY KEY,
      eleve_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date_absence DATE NOT NULL,
      matiere TEXT,
      heure_debut TIME,
      heure_fin TIME,
      type TEXT NOT NULL CHECK (type IN ('absence', 'retard')),
      motif TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE absences
    ADD COLUMN IF NOT EXISTS matiere TEXT;
  `);

  await pool.query(`
    ALTER TABLE absences
    ADD COLUMN IF NOT EXISTS heure_debut TIME;
  `);

  await pool.query(`
    ALTER TABLE absences
    ADD COLUMN IF NOT EXISTS heure_fin TIME;
  `);

  // ============================================================
  // ANNÉES SCOLAIRES
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annees_scolaires (
      id SERIAL PRIMARY KEY,
      libelle VARCHAR(20) NOT NULL UNIQUE,
      active BOOLEAN DEFAULT FALSE,

      premier_versement DATE,
      deuxieme_versement DATE,
      troisieme_versement DATE,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ajouter les échéances si la table existait déjà
  await pool.query(`
    ALTER TABLE annees_scolaires
    ADD COLUMN IF NOT EXISTS premier_versement DATE;
  `);

  await pool.query(`
    ALTER TABLE annees_scolaires
    ADD COLUMN IF NOT EXISTS deuxieme_versement DATE;
  `);

  await pool.query(`
    ALTER TABLE annees_scolaires
    ADD COLUMN IF NOT EXISTS troisieme_versement DATE;
  `);

  // ============================================================
  // LIEN BULLETINS / ANNÉE SCOLAIRE
  // ============================================================

  await pool.query(`
    ALTER TABLE actualites
    ADD COLUMN IF NOT EXISTS annee_scolaire_id INTEGER;
  `);

  // Associer les anciens bulletins à l'année scolaire active
  await pool.query(`
    UPDATE actualites a
    SET annee_scolaire_id = (
      SELECT id
      FROM annees_scolaires
      WHERE active = TRUE
      ORDER BY id DESC
      LIMIT 1
    )
    WHERE a.type = 'bulletin'
      AND a.annee_scolaire_id IS NULL;
  `);

  // Échéances par défaut pour l'année 2026-2027
  await pool.query(`
    UPDATE annees_scolaires
    SET
      premier_versement = '2026-09-30',
      deuxieme_versement = '2026-10-31',
      troisieme_versement = '2026-11-30'
    WHERE libelle = '2026-2027'
      AND premier_versement IS NULL;
  `);

  // ============================================================
  // STATISTIQUES DE L'ÉCOLE
  // ============================================================

  await pool.query(`
    CREATE TABLE IF NOT EXISTS statistiques_ecole (
      id SERIAL PRIMARY KEY,

      primaire_eleves INTEGER NOT NULL DEFAULT 0,
      primaire_max_classe INTEGER NOT NULL DEFAULT 0,
      primaire_niveaux INTEGER NOT NULL DEFAULT 0,
      primaire_reussite_cep DECIMAL(5,2) NOT NULL DEFAULT 0,

      college_eleves INTEGER NOT NULL DEFAULT 0,
      college_max_classe INTEGER NOT NULL DEFAULT 0,
      college_niveaux INTEGER NOT NULL DEFAULT 0,
      college_reussite_bepc DECIMAL(5,2) NOT NULL DEFAULT 0,

      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    INSERT INTO statistiques_ecole (
      primaire_eleves,
      primaire_max_classe,
      primaire_niveaux,
      primaire_reussite_cep,
      college_eleves,
      college_max_classe,
      college_niveaux,
      college_reussite_bepc
    )
    SELECT
      300,
      50,
      6,
      97.82,
      280,
      70,
      4,
      62.50
    WHERE NOT EXISTS (
      SELECT 1 FROM statistiques_ecole
    );
  `);
}

export default pool;