import { Router } from 'express';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: "Réservé à l'administrateur." });
  }

  const { classe, jour, heureDebut, heureFin, matiere, salle } = req.body;

  if (!classe || !jour || !heureDebut || !heureFin || !matiere) {
    return res.status(400).json({ message: 'Classe, jour, horaires et matière sont obligatoires.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO emploi_du_temps (classe, jour, heure_debut, heure_fin, matiere, salle, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [classe, jour, heureDebut, heureFin, matiere, salle || null, req.user.id]
    );
    res.status(201).json({ creneau: result.rows[0] });
  } catch (error) {
    console.error('Erreur création créneau :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    let classe: string | null = null;

    if (req.user?.role === 'eleve') {
      const result = await pool.query('SELECT classe FROM users WHERE id = $1', [req.user.id]);
      classe = result.rows[0]?.classe;
    } else if (req.user?.role === 'parent') {
      const result = await pool.query(
        `SELECT u.classe FROM parent_children pc
         JOIN users u ON u.id = pc.child_id
         WHERE pc.parent_id = $1 LIMIT 1`,
        [req.user.id]
      );
      classe = result.rows[0]?.classe;
    } else if (req.user?.role === 'admin') {
      classe = req.query.classe as string;
    }

    if (!classe) {
      return res.status(404).json({ message: 'Aucune classe associée.' });
    }

        const result = await pool.query(
      `SELECT * FROM emploi_du_temps WHERE classe = $1
       ORDER BY 
         CASE jour 
           WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3 
           WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 WHEN 'Samedi' THEN 6 
           WHEN 'Dimanche' THEN 7
         END, heure_debut ASC`,
      [classe]
    );

    res.json({ creneaux: result.rows });
  } catch (error) {
    console.error('Erreur récupération emploi du temps :', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// ======================================
// MODIFIER UN créneau
// ======================================
router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      message: "Réservé à l'administrateur."
    });
  }

  const { id } = req.params;
  const {
    classe,
    jour,
    heureDebut,
    heureFin,
    matiere,
    salle
  } = req.body;

  if (!classe || !jour || !heureDebut || !heureFin || !matiere) {
    return res.status(400).json({
      message: 'Classe, jour, horaires et matière sont obligatoires.'
    });
  }

  try {
    const result = await pool.query(
      `UPDATE emploi_du_temps
       SET classe = $1,
           jour = $2,
           heure_debut = $3,
           heure_fin = $4,
           matiere = $5,
           salle = $6
       WHERE id = $7
       RETURNING *`,
      [
        classe,
        jour,
        heureDebut,
        heureFin,
        matiere,
        salle || null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Créneau introuvable.'
      });
    }

    res.json({
      message: 'Créneau modifié avec succès.',
      creneau: result.rows[0]
    });

  } catch (error) {
    console.error('Erreur modification créneau :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});


// ======================================
// SUPPRIMER UN créneau
// ======================================
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      message: "Réservé à l'administrateur."
    });
  }

  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM emploi_du_temps
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Créneau introuvable.'
      });
    }

    res.json({
      message: 'Créneau supprimé avec succès.'
    });

  } catch (error) {
    console.error('Erreur suppression créneau :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

export default router;