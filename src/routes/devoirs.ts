import { Router } from 'express';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Vérifier que l'utilisateur est administrateur
function requireAdmin(req: AuthRequest, res: any, next: any) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      message: 'Accès réservé à l’administrateur.'
    });
  }

  next();
}

// ===============================
// GET : récupérer tous les devoirs
// ===============================
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM devoirs
      ORDER BY date_devoir ASC, created_at DESC
    `);

    res.json({
      devoirs: result.rows
    });

  } catch (error) {
    console.error('Erreur récupération devoirs :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

// ===============================
// POST : créer un devoir
// ===============================
router.post('/', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      classe,
      matiere,
      titre,
      description,
      date_devoir
    } = req.body;

    if (!classe || !matiere || !titre || !date_devoir) {
      return res.status(400).json({
        message: 'La classe, la matière, le titre et la date sont obligatoires.'
      });
    }

    const result = await pool.query(
      `
      INSERT INTO devoirs
        (classe, matiere, titre, description, date_devoir, created_by)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        classe,
        matiere,
        titre,
        description || null,
        date_devoir,
        req.user!.id
      ]
    );

    res.status(201).json({
      message: 'Devoir créé avec succès.',
      devoir: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur création devoir :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

// ===============================
// PUT : modifier un devoir
// ===============================
router.put('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const {
      classe,
      matiere,
      titre,
      description,
      date_devoir
    } = req.body;

    if (!classe || !matiere || !titre || !date_devoir) {
      return res.status(400).json({
        message: 'La classe, la matière, le titre et la date sont obligatoires.'
      });
    }

    const result = await pool.query(
      `
      UPDATE devoirs
      SET
        classe = $1,
        matiere = $2,
        titre = $3,
        description = $4,
        date_devoir = $5
      WHERE id = $6
      RETURNING *
      `,
      [
        classe,
        matiere,
        titre,
        description || null,
        date_devoir,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Devoir introuvable.'
      });
    }

    res.json({
      message: 'Devoir modifié avec succès.',
      devoir: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur modification devoir :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

// ===============================
// DELETE : supprimer un devoir
// ===============================
router.delete('/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM devoirs
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Devoir introuvable.'
      });
    }

    res.json({
      message: 'Devoir supprimé avec succès.'
    });

  } catch (error) {
    console.error('Erreur suppression devoir :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

// ======================================
// GET : devoirs de l'élève connecté
// ======================================
router.get('/mes-devoirs', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'Non authentifié.'
      });
    }

    let classe: string | null = null;

    // =========================
    // Cas élève
    // =========================
    if (req.user.role === 'eleve') {
      const eleveResult = await pool.query(
        `
        SELECT classe
        FROM users
        WHERE id = $1
          AND role = 'eleve'
        `,
        [req.user.id]
      );

      if (eleveResult.rows.length === 0) {
        return res.status(404).json({
          message: 'Élève introuvable.'
        });
      }

      classe = eleveResult.rows[0].classe;
    }

    // =========================
    // Cas parent
    // =========================
    else if (req.user.role === 'parent') {
      const enfantResult = await pool.query(
        `
        SELECT u.classe
        FROM parent_children pc
        INNER JOIN users u ON u.id = pc.child_id
        WHERE pc.parent_id = $1
          AND u.role = 'eleve'
        ORDER BY u.id
        LIMIT 1
        `,
        [req.user.id]
      );

      if (enfantResult.rows.length === 0) {
        return res.status(404).json({
          message: 'Aucun enfant associé à ce compte parent.'
        });
      }

      classe = enfantResult.rows[0].classe;
    }

    else {
      return res.status(403).json({
        message: 'Accès non autorisé.'
      });
    }

    if (!classe) {
      return res.status(400).json({
        message: 'La classe de l’élève n’est pas définie.'
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        classe,
        matiere,
        titre,
        description,
        date_devoir
      FROM devoirs
      WHERE classe = $1
      ORDER BY date_devoir ASC
      `,
      [classe]
    );

    res.json({
      classe,
      devoirs: result.rows
    });

  } catch (error) {
    console.error('Erreur récupération devoirs utilisateur :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

export default router;