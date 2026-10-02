import express from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth';
import pool from '../db';

const router = express.Router();

// ======================================================
// STATISTIQUES
// ======================================================

router.get('/statistiques', requireAuth, async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


const elevesResult = await pool.query(`
  SELECT COUNT(*) AS total
  FROM users
  WHERE role = 'eleve'
`);

const parentsResult = await pool.query(`
  SELECT COUNT(*) AS total
  FROM users
  WHERE role = 'parent'
`);

return res.json({
  eleves: Number(elevesResult.rows[0].total),
  parents: Number(parentsResult.rows[0].total),
});


} catch (error) {
console.error('Erreur statistiques admin :', error);


return res.status(500).json({
  message: 'Erreur lors de la récupération des statistiques.',
});


}
});

// ======================================================
// LISTE DES ÉLÈVES
// ======================================================

router.get('/eleves', requireAuth, async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


const result = await pool.query(`
  SELECT
    id,
    prenom,
    nom,
    email,
    classe,
    date_naissance,
    created_at
  FROM users
  WHERE role = 'eleve'
  ORDER BY nom ASC, prenom ASC
`);

return res.json({
  eleves: result.rows,
});


} catch (error) {
console.error('Erreur récupération élèves :', error);


return res.status(500).json({
  message: 'Erreur lors de la récupération des élèves.',
});


}
});

// ======================================================
// LISTE DES CLASSES
// ======================================================

router.get('/classes', requireAuth, async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


const result = await pool.query(`
  SELECT DISTINCT classe
  FROM users
  WHERE role = 'eleve'
    AND classe IS NOT NULL
    AND classe <> ''
  ORDER BY classe ASC
`);

return res.json({
  classes: result.rows.map((row) => row.classe),
});


} catch (error) {
console.error('Erreur récupération classes :', error);


return res.status(500).json({
  message: 'Erreur lors de la récupération des classes.',
});


}
});

// ======================================================
// AJOUTER UN ÉLÈVE
// ======================================================

router.post('/eleves', requireAuth, async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


const {
  prenom,
  nom,
  email,
  password,
  classe,
  date_naissance,
} = req.body;

if (!prenom || !nom || !email || !password) {
  return res.status(400).json({
    message:
      'Le prénom, le nom, l’email et le mot de passe sont obligatoires.',
  });
}

const utilisateurExiste = await pool.query(
  `SELECT id FROM users WHERE email = $1`,
  [email]
);

if (utilisateurExiste.rows.length > 0) {
  return res.status(409).json({
    message: 'Un utilisateur avec cet email existe déjà.',
  });
}

const bcrypt = await import('bcrypt');
const passwordHash = await bcrypt.hash(password, 12);

const result = await pool.query(
  `
  INSERT INTO users (
    role,
    prenom,
    nom,
    email,
    password_hash,
    classe,
    date_naissance
  )
  VALUES (
    'eleve',
    $1,
    $2,
    $3,
    $4,
    $5,
    $6
  )
  RETURNING
    id,
    prenom,
    nom,
    email,
    classe,
    date_naissance,
    created_at
  `,
  [
    prenom,
    nom,
    email,
    passwordHash,
    classe || null,
    date_naissance || null,
  ]
);

return res.status(201).json({
  message: 'Élève créé avec succès.',
  eleve: result.rows[0],
});


} catch (error) {
console.error('Erreur création élève :', error);


return res.status(500).json({
  message: 'Erreur lors de la création de l’élève.',
});


}
});

// ======================================================
// MODIFIER UN ÉLÈVE
// ======================================================

router.put('/eleves/:id', requireAuth, async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


const eleveId = Number(req.params.id);

if (!Number.isInteger(eleveId)) {
  return res.status(400).json({
    message: 'ID de l’élève invalide.',
  });
}

const {
  prenom,
  nom,
  email,
  classe,
  date_naissance,
  password,
} = req.body;

if (!prenom || !nom || !email) {
  return res.status(400).json({
    message: 'Le prénom, le nom et l’email sont obligatoires.',
  });
}

const eleveExiste = await pool.query(
  `
  SELECT id
  FROM users
  WHERE id = $1
    AND role = 'eleve'
  `,
  [eleveId]
);

if (eleveExiste.rows.length === 0) {
  return res.status(404).json({
    message: 'Élève introuvable.',
  });
}

const emailExiste = await pool.query(
  `
  SELECT id
  FROM users
  WHERE email = $1
    AND id <> $2
  `,
  [email, eleveId]
);

if (emailExiste.rows.length > 0) {
  return res.status(409).json({
    message: 'Cet email est déjà utilisé par un autre utilisateur.',
  });
}

let result;

if (password && password.trim() !== '') {
  const bcrypt = await import('bcrypt');
  const passwordHash = await bcrypt.hash(password, 12);

  result = await pool.query(
    `
    UPDATE users
    SET
      prenom = $1,
      nom = $2,
      email = $3,
      classe = $4,
      date_naissance = $5,
      password_hash = $6
    WHERE id = $7
      AND role = 'eleve'
    RETURNING
      id,
      prenom,
      nom,
      email,
      classe,
      date_naissance,
      created_at
    `,
    [
      prenom,
      nom,
      email,
      classe || null,
      date_naissance || null,
      passwordHash,
      eleveId,
    ]
  );
} else {
  result = await pool.query(
    `
    UPDATE users
    SET
      prenom = $1,
      nom = $2,
      email = $3,
      classe = $4,
      date_naissance = $5
    WHERE id = $6
      AND role = 'eleve'
    RETURNING
      id,
      prenom,
      nom,
      email,
      classe,
      date_naissance,
      created_at
    `,
    [
      prenom,
      nom,
      email,
      classe || null,
      date_naissance || null,
      eleveId,
    ]
  );
}

return res.json({
  message: 'Élève modifié avec succès.',
  eleve: result.rows[0],
});


} catch (error) {
console.error('Erreur modification élève :', error);


return res.status(500).json({
  message: 'Erreur lors de la modification de l’élève.',
});


}
});

// ======================================================
// SUPPRIMER UN ÉLÈVE
// ======================================================

router.delete('/eleves/:id', requireAuth, async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


const eleveId = Number(req.params.id);

if (!Number.isInteger(eleveId)) {
  return res.status(400).json({
    message: 'ID de l’élève invalide.',
  });
}

const eleveExiste = await pool.query(
  `
  SELECT id
  FROM users
  WHERE id = $1
    AND role = 'eleve'
  `,
  [eleveId]
);

if (eleveExiste.rows.length === 0) {
  return res.status(404).json({
    message: 'Élève introuvable.',
  });
}

await pool.query(
  `
  DELETE FROM parent_children
  WHERE child_id = $1
  `,
  [eleveId]
);

await pool.query(
  `
  DELETE FROM users
  WHERE id = $1
    AND role = 'eleve'
  `,
  [eleveId]
);

return res.json({
  message: 'Élève supprimé avec succès.',
});


} catch (error) {
console.error('Erreur suppression élève :', error);


return res.status(500).json({
  message: 'Erreur lors de la suppression de l’élève.',
});


}
});

// ======================================================
// LISTE DES PARENTS
// ======================================================

router.get('/parents', requireAuth, async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


const result = await pool.query(`
  SELECT
    p.id,
    p.prenom,
    p.nom,
    p.email,
    p.created_at,
    COUNT(pc.child_id)::INTEGER AS nombre_enfants
  FROM users p
  LEFT JOIN parent_children pc
    ON pc.parent_id = p.id
  WHERE p.role = 'parent'
  GROUP BY
    p.id,
    p.prenom,
    p.nom,
    p.email,
    p.created_at
  ORDER BY p.nom ASC, p.prenom ASC
`);

return res.json({
  parents: result.rows,
});


} catch (error) {
console.error('Erreur récupération parents :', error);


return res.status(500).json({
  message: 'Erreur lors de la récupération des parents.',
});


}
});

// ======================================================
// AJOUTER UN PARENT
// ======================================================

router.post('/parents', requireAuth, async (req: AuthRequest, res) => {
const client = await pool.connect();

try {
if (req.user?.role !== 'admin') {
client.release();


  return res.status(403).json({
    message: 'Accès réservé à l’administrateur.',
  });
}

const {
  prenom,
  nom,
  email,
  password,
  childId,
} = req.body;

if (!prenom || !nom || !email || !password || !childId) {
  client.release();

  return res.status(400).json({
    message:
      'Le prénom, le nom, l’email, le mot de passe et l’enfant sont obligatoires.',
  });
}

const childIdNumber = Number(childId);

if (!Number.isInteger(childIdNumber)) {
  client.release();

  return res.status(400).json({
    message: 'ID de l’élève invalide.',
  });
}

const utilisateurExiste = await client.query(
  `SELECT id FROM users WHERE email = $1`,
  [email]
);

if (utilisateurExiste.rows.length > 0) {
  client.release();

  return res.status(409).json({
    message: 'Un utilisateur avec cet email existe déjà.',
  });
}

const eleveExiste = await client.query(
  `
  SELECT
    id,
    prenom,
    nom,
    email,
    classe,
    date_naissance
  FROM users
  WHERE id = $1
    AND role = 'eleve'
  `,
  [childIdNumber]
);

if (eleveExiste.rows.length === 0) {
  client.release();

  return res.status(404).json({
    message: 'L’élève sélectionné est introuvable.',
  });
}

const bcrypt = await import('bcrypt');
const passwordHash = await bcrypt.hash(password, 12);

await client.query('BEGIN');

const result = await client.query(
  `
  INSERT INTO users (
    role,
    prenom,
    nom,
    email,
    password_hash
  )
  VALUES (
    'parent',
    $1,
    $2,
    $3,
    $4
  )
  RETURNING
    id,
    prenom,
    nom,
    email,
    created_at
  `,
  [
    prenom,
    nom,
    email,
    passwordHash,
  ]
);

const parent = result.rows[0];

await client.query(
  `
  INSERT INTO parent_children (
    parent_id,
    child_id
  )
  VALUES ($1, $2)
  `,
  [parent.id, childIdNumber]
);

await client.query('COMMIT');
client.release();

return res.status(201).json({
  message: 'Parent créé et enfant associé avec succès.',
  parent,
  enfant: eleveExiste.rows[0],
});


} catch (error) {
try {
await client.query('ROLLBACK');
} catch {
// Rien à faire si le rollback échoue.
}


client.release();

console.error('Erreur création parent :', error);

return res.status(500).json({
  message: 'Erreur lors de la création du parent.',
});


}
});

// ======================================================
// MODIFIER UN PARENT
// ======================================================

router.put('/parents/:id', requireAuth, async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


const parentId = Number(req.params.id);

if (!Number.isInteger(parentId)) {
  return res.status(400).json({
    message: 'ID du parent invalide.',
  });
}

const {
  prenom,
  nom,
  email,
  password,
} = req.body;

if (!prenom || !nom || !email) {
  return res.status(400).json({
    message:
      'Le prénom, le nom et l’email sont obligatoires.',
  });
}

const parentExiste = await pool.query(
  `
  SELECT id
  FROM users
  WHERE id = $1
    AND role = 'parent'
  `,
  [parentId]
);

if (parentExiste.rows.length === 0) {
  return res.status(404).json({
    message: 'Parent introuvable.',
  });
}

const emailExiste = await pool.query(
  `
  SELECT id
  FROM users
  WHERE email = $1
    AND id <> $2
  `,
  [email, parentId]
);

if (emailExiste.rows.length > 0) {
  return res.status(409).json({
    message:
      'Cet email est déjà utilisé par un autre utilisateur.',
  });
}

let result;

if (password && password.trim() !== '') {
  const bcrypt = await import('bcrypt');
  const passwordHash = await bcrypt.hash(password, 12);

  result = await pool.query(
    `
    UPDATE users
    SET
      prenom = $1,
      nom = $2,
      email = $3,
      password_hash = $4
    WHERE id = $5
      AND role = 'parent'
    RETURNING
      id,
      prenom,
      nom,
      email,
      created_at
    `,
    [
      prenom,
      nom,
      email,
      passwordHash,
      parentId,
    ]
  );
} else {
  result = await pool.query(
    `
    UPDATE users
    SET
      prenom = $1,
      nom = $2,
      email = $3
    WHERE id = $4
      AND role = 'parent'
    RETURNING
      id,
      prenom,
      nom,
      email,
      created_at
    `,
    [
      prenom,
      nom,
      email,
      parentId,
    ]
  );
}

return res.json({
  message: 'Parent modifié avec succès.',
  parent: result.rows[0],
});


} catch (error) {
console.error('Erreur modification parent :', error);


return res.status(500).json({
  message: 'Erreur lors de la modification du parent.',
});


}
});

// ======================================================
// SUPPRIMER UN PARENT
// ======================================================

router.delete('/parents/:id', requireAuth, async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


const parentId = Number(req.params.id);

if (!Number.isInteger(parentId)) {
  return res.status(400).json({
    message: 'ID du parent invalide.',
  });
}

const parentExiste = await pool.query(
  `
  SELECT id
  FROM users
  WHERE id = $1
    AND role = 'parent'
  `,
  [parentId]
);

if (parentExiste.rows.length === 0) {
  return res.status(404).json({
    message: 'Parent introuvable.',
  });
}

await pool.query(
  `
  DELETE FROM parent_children
  WHERE parent_id = $1
  `,
  [parentId]
);

await pool.query(
  `
  DELETE FROM children
  WHERE parent_id = $1
  `,
  [parentId]
);

await pool.query(
  `
  DELETE FROM users
  WHERE id = $1
    AND role = 'parent'
  `,
  [parentId]
);

return res.json({
  message: 'Parent supprimé avec succès.',
});


} catch (error) {
console.error('Erreur suppression parent :', error);


return res.status(500).json({
  message: 'Erreur lors de la suppression du parent.',
});


}
});

// ======================================================
// LISTE DES ENFANTS D'UN PARENT
// ======================================================

router.get(
'/parents/:id/enfants',
requireAuth,
async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


  const parentId = Number(req.params.id);

  if (!Number.isInteger(parentId)) {
    return res.status(400).json({
      message: 'ID du parent invalide.',
    });
  }

  const parentExiste = await pool.query(
    `
    SELECT id
    FROM users
    WHERE id = $1
      AND role = 'parent'
    `,
    [parentId]
  );

  if (parentExiste.rows.length === 0) {
    return res.status(404).json({
      message: 'Parent introuvable.',
    });
  }

  const result = await pool.query(
    `
    SELECT
      u.id,
      u.prenom,
      u.nom,
      u.email,
      u.classe,
      u.date_naissance
    FROM users u
    INNER JOIN parent_children pc
      ON pc.child_id = u.id
    WHERE pc.parent_id = $1
      AND u.role = 'eleve'
    ORDER BY u.nom ASC, u.prenom ASC
    `,
    [parentId]
  );

  return res.json({
    enfants: result.rows,
  });
} catch (error) {
  console.error('Erreur récupération enfants :', error);

  return res.status(500).json({
    message: 'Erreur lors de la récupération des enfants.',
  });
}


}
);

// ======================================================
// ASSOCIER UN ÉLÈVE À UN PARENT
// ======================================================

router.post(
'/parents/:id/enfants',
requireAuth,
async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


  const parentId = Number(req.params.id);
  const childId = Number(req.body.childId);

  if (!Number.isInteger(parentId)) {
    return res.status(400).json({
      message: 'ID du parent invalide.',
    });
  }

  if (!Number.isInteger(childId)) {
    return res.status(400).json({
      message: 'ID de l’élève invalide.',
    });
  }

  const parentExiste = await pool.query(
    `
    SELECT id
    FROM users
    WHERE id = $1
      AND role = 'parent'
    `,
    [parentId]
  );

  if (parentExiste.rows.length === 0) {
    return res.status(404).json({
      message: 'Parent introuvable.',
    });
  }

  const eleveExiste = await pool.query(
    `
    SELECT
      id,
      prenom,
      nom,
      email,
      classe,
      date_naissance
    FROM users
    WHERE id = $1
      AND role = 'eleve'
    `,
    [childId]
  );

  if (eleveExiste.rows.length === 0) {
    return res.status(404).json({
      message: 'Élève introuvable.',
    });
  }

  const associationExiste = await pool.query(
    `
    SELECT parent_id
    FROM parent_children
    WHERE parent_id = $1
      AND child_id = $2
    `,
    [parentId, childId]
  );

  if (associationExiste.rows.length > 0) {
    return res.status(409).json({
      message: 'Cet élève est déjà associé à ce parent.',
    });
  }

  await pool.query(
    `
    INSERT INTO parent_children (
      parent_id,
      child_id
    )
    VALUES ($1, $2)
    `,
    [parentId, childId]
  );

  return res.status(201).json({
    message: 'Élève associé au parent avec succès.',
    enfant: eleveExiste.rows[0],
  });
} catch (error) {
  console.error('Erreur association parent-élève :', error);

  return res.status(500).json({
    message: 'Erreur lors de l’association de l’élève au parent.',
  });
}


}
);

// ======================================================
// RETIRER UN ÉLÈVE D'UN PARENT
// ======================================================

router.delete(
'/parents/:id/enfants/:childId',
requireAuth,
async (req: AuthRequest, res) => {
try {
if (req.user?.role !== 'admin') {
return res.status(403).json({
message: 'Accès réservé à l’administrateur.',
});
}


  const parentId = Number(req.params.id);
  const childId = Number(req.params.childId);

  if (!Number.isInteger(parentId)) {
    return res.status(400).json({
      message: 'ID du parent invalide.',
    });
  }

  if (!Number.isInteger(childId)) {
    return res.status(400).json({
      message: 'ID de l’élève invalide.',
    });
  }

  const associationExiste = await pool.query(
    `
    SELECT parent_id
    FROM parent_children
    WHERE parent_id = $1
      AND child_id = $2
    `,
    [parentId, childId]
  );

  if (associationExiste.rows.length === 0) {
    return res.status(404).json({
      message: 'Cette association n’existe pas.',
    });
  }

  await pool.query(
    `
    DELETE FROM parent_children
    WHERE parent_id = $1
      AND child_id = $2
    `,
    [parentId, childId]
  );

  return res.json({
    message: 'Élève retiré du parent avec succès.',
  });
} catch (error) {
  console.error('Erreur suppression association :', error);

  return res.status(500).json({
    message: 'Erreur lors de la suppression de l’association.',
  });
}


}
);

// ======================================================
// FONCTION : VÉRIFIER L'ADMINISTRATEUR PRINCIPAL
// ======================================================

async function verifierAdminPrincipal(
req: AuthRequest
): Promise<boolean> {
if (req.user?.role !== 'admin' || !req.user?.id) {
return false;
}

const result = await pool.query(
`     SELECT email
    FROM users
    WHERE id = $1
      AND role = 'admin'
    LIMIT 1
    `,
[req.user.id]
);

if (result.rows.length === 0) {
return false;
}

const emailUtilisateur = String(
result.rows[0].email
)
.trim()
.toLowerCase();

const emailAdminPrincipal = String(
process.env.ADMIN_EMAIL || ''
)
.trim()
.toLowerCase();

return (
emailAdminPrincipal !== '' &&
emailUtilisateur === emailAdminPrincipal
);
}

// ======================================================
// VÉRIFIER SI L'UTILISATEUR EST ADMINISTRATEUR PRINCIPAL
// ======================================================

router.get(
'/est-principal',
requireAuth,
async (req: AuthRequest, res) => {
try {
const estPrincipal =
await verifierAdminPrincipal(req);


  return res.json({
    estPrincipal,
  });
} catch (error) {
  console.error(
    'Erreur vérification administrateur principal :',
    error
  );

  return res.status(500).json({
    message:
      'Erreur lors de la vérification des droits administrateur.',
  });
}


}
);

// ======================================================
// LISTE DES ADMINISTRATEURS
// ADMINISTRATEUR PRINCIPAL UNIQUEMENT
// ======================================================

router.get(
'/administrateurs',
requireAuth,
async (req: AuthRequest, res) => {
try {
const estPrincipal =
await verifierAdminPrincipal(req);


  if (!estPrincipal) {
    return res.status(403).json({
      message:
        'Accès réservé à l’administrateur principal.',
    });
  }

  const result = await pool.query(
    `
    SELECT
      id,
      prenom,
      nom,
      email,
      role,
      created_at
    FROM users
    WHERE role = 'admin'
    ORDER BY created_at ASC
    `
  );

  return res.json({
    administrateurs: result.rows,
  });
} catch (error) {
  console.error(
    'Erreur récupération administrateurs :',
    error
  );

  return res.status(500).json({
    message:
      'Erreur lors de la récupération des administrateurs.',
  });
}


}
);

// ======================================================
// CRÉER UN ADMINISTRATEUR
// ADMINISTRATEUR PRINCIPAL UNIQUEMENT
// ======================================================

router.post(
'/administrateurs',
requireAuth,
async (req: AuthRequest, res) => {
try {
const estPrincipal =
await verifierAdminPrincipal(req);


  if (!estPrincipal) {
    return res.status(403).json({
      message:
        'Seul l’administrateur principal peut créer un administrateur.',
    });
  }

  const {
    prenom,
    nom,
    email,
    password,
  } = req.body;

  if (
    !prenom ||
    !nom ||
    !email ||
    !password
  ) {
    return res.status(400).json({
      message:
        'Le prénom, le nom, l’email et le mot de passe sont obligatoires.',
    });
  }

  const emailNormalise =
    String(email).trim().toLowerCase();

  if (password.length < 6) {
    return res.status(400).json({
      message:
        'Le mot de passe doit contenir au moins 6 caractères.',
    });
  }

  const utilisateurExiste =
    await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [emailNormalise]
    );

  if (utilisateurExiste.rows.length > 0) {
    return res.status(409).json({
      message:
        'Un utilisateur avec cet email existe déjà.',
    });
  }

  const bcrypt = await import('bcrypt');

  const passwordHash =
    await bcrypt.hash(password, 12);

  const result = await pool.query(
    `
    INSERT INTO users (
      role,
      prenom,
      nom,
      email,
      password_hash
    )
    VALUES (
      'admin',
      $1,
      $2,
      $3,
      $4
    )
    RETURNING
      id,
      prenom,
      nom,
      email,
      role,
      created_at
    `,
    [
      prenom.trim(),
      nom.trim(),
      emailNormalise,
      passwordHash,
    ]
  );

  return res.status(201).json({
    message:
      'Administrateur créé avec succès.',
    administrateur: result.rows[0],
  });
} catch (error) {
  console.error(
    'Erreur création administrateur :',
    error
  );

  return res.status(500).json({
    message:
      'Erreur lors de la création de l’administrateur.',
  });
}


}
);

// ======================================================
// SUPPRIMER UN ADMINISTRATEUR
// ADMINISTRATEUR PRINCIPAL UNIQUEMENT
// ======================================================

router.delete(
'/administrateurs/:id',
requireAuth,
async (req: AuthRequest, res) => {
try {
const estPrincipal =
await verifierAdminPrincipal(req);


  if (!estPrincipal) {
    return res.status(403).json({
      message:
        'Seul l’administrateur principal peut gérer les administrateurs.',
    });
  }

  const adminId =
    Number(req.params.id);

  if (!Number.isInteger(adminId)) {
    return res.status(400).json({
      message:
        'ID de l’administrateur invalide.',
    });
  }

  if (adminId === req.user?.id) {
    return res.status(400).json({
      message:
        'L’administrateur principal ne peut pas supprimer son propre compte.',
    });
  }

  const adminExiste =
    await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
        AND role = 'admin'
      LIMIT 1
      `,
      [adminId]
    );

  if (adminExiste.rows.length === 0) {
    return res.status(404).json({
      message:
        'Administrateur introuvable.',
    });
  }

  await pool.query(
    `
    DELETE FROM users
    WHERE id = $1
      AND role = 'admin'
    `,
    [adminId]
  );

  return res.json({
    message:
      'Administrateur supprimé avec succès.',
  });
} catch (error) {
  console.error(
    'Erreur suppression administrateur :',
    error
  );

  return res.status(500).json({
    message:
      'Erreur lors de la suppression de l’administrateur.',
  });
}


}
);

export default router;
