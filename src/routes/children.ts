import { Router } from 'express';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'parent') {
      return res.status(403).json({
        message: 'Réservé aux comptes parents.'
      });
    }

    const result = await pool.query(
      `SELECT 
          u.id,
          u.prenom,
          u.nom,
          u.email,
          u.classe,
          u.date_naissance
       FROM parent_children pc
       INNER JOIN users u ON u.id = pc.child_id
       WHERE pc.parent_id = $1
       AND u.role = 'eleve'`,
      [req.user.id]
    );

    res.json({
      enfants: result.rows
    });

  } catch (error) {
    console.error('Erreur récupération enfants :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

router.post('/link', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'parent') {
      return res.status(403).json({
        message: 'Seuls les parents peuvent associer un enfant.'
      });
    }

    const {
      nomEnfant,
      classeEnfant,
      dateNaissanceEnfant
    } = req.body;

    if (!nomEnfant || !classeEnfant || !dateNaissanceEnfant) {
      return res.status(400).json({
        message: "Le nom, la classe et la date de naissance de l'enfant sont obligatoires."
      });
    }

    const childResult = await pool.query(
  `SELECT id, prenom, nom, email, classe, date_naissance
   FROM users
   WHERE role = 'eleve'
   AND (
        LOWER(TRIM(nom || ' ' || prenom)) = LOWER(TRIM($1))
        OR
        LOWER(TRIM(prenom || ' ' || nom)) = LOWER(TRIM($1))
   )
   AND classe = $2
   AND date_naissance = $3`,
  [nomEnfant, classeEnfant, dateNaissanceEnfant]
);

    if (childResult.rows.length === 0) {
      return res.status(404).json({
        message: "Aucun élève correspondant à ces informations."
      });
    }

    const enfant = childResult.rows[0];

    await pool.query(
      `INSERT INTO parent_children (parent_id, child_id)
       VALUES ($1, $2)
       ON CONFLICT (parent_id, child_id) DO NOTHING`,
      [req.user.id, enfant.id]
    );

    res.status(201).json({
      message: "Enfant associé avec succès.",
      enfant
    });

  } catch (error) {
    console.error('Erreur association enfant :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});


export default router;