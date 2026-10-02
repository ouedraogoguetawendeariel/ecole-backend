import { Router } from 'express';
import pool from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// ======================================
// GET : toutes les absences — admin
// ======================================
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      message: "Réservé à l'administrateur."
    });
  }

  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.eleve_id,
        a.date_absence,
        a.matiere,
        a.heure_debut,
        a.heure_fin,
        a.type,
        a.motif,
        u.prenom,
        u.nom,
        u.classe
      FROM absences a
      INNER JOIN users u ON u.id = a.eleve_id
      WHERE u.role = 'eleve'
      ORDER BY a.date_absence DESC, a.heure_debut ASC, u.nom ASC
    `);

    res.json({
      absences: result.rows
    });
  } catch (error) {
    console.error('Erreur récupération absences :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

// ======================================
// POST : créer une absence ou un retard
// ======================================
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      message: "Réservé à l'administrateur."
    });
  }

  const {
    eleveId,
    dateAbsence,
    matiere,
    heureDebut,
    heureFin,
    type,
    motif
  } = req.body;

  if (
    !eleveId ||
    !dateAbsence ||
    !matiere ||
    !heureDebut ||
    !heureFin ||
    !type
  ) {
    return res.status(400).json({
      message:
        "L'élève, la date, la matière, l'heure de début, l'heure de fin et le type sont obligatoires."
    });
  }

  if (!['absence', 'retard'].includes(type)) {
    return res.status(400).json({
      message: "Le type doit être 'absence' ou 'retard'."
    });
  }

  if (heureFin <= heureDebut) {
    return res.status(400).json({
      message: "L'heure de fin doit être après l'heure de début."
    });
  }

  try {
    const eleve = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
        AND role = 'eleve'
      `,
      [eleveId]
    );

    if (eleve.rows.length === 0) {
      return res.status(404).json({
        message: 'Élève introuvable.'
      });
    }

    const result = await pool.query(
      `
      INSERT INTO absences (
        eleve_id,
        date_absence,
        matiere,
        heure_debut,
        heure_fin,
        type,
        motif,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        eleveId,
        dateAbsence,
        matiere,
        heureDebut,
        heureFin,
        type,
        motif || null,
        req.user.id
      ]
    );

    res.status(201).json({
      message: 'Enregistrement effectué avec succès.',
      absence: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur création absence :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

// ======================================
// PUT : modifier une absence / un retard
// ======================================
router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      message: "Réservé à l'administrateur."
    });
  }

  const { id } = req.params;

  const {
    eleveId,
    dateAbsence,
    matiere,
    heureDebut,
    heureFin,
    type,
    motif
  } = req.body;

  if (
    !eleveId ||
    !dateAbsence ||
    !matiere ||
    !heureDebut ||
    !heureFin ||
    !type
  ) {
    return res.status(400).json({
      message:
        "L'élève, la date, la matière, l'heure de début, l'heure de fin et le type sont obligatoires."
    });
  }

  if (!['absence', 'retard'].includes(type)) {
    return res.status(400).json({
      message: "Le type doit être 'absence' ou 'retard'."
    });
  }

  if (heureFin <= heureDebut) {
    return res.status(400).json({
      message: "L'heure de fin doit être après l'heure de début."
    });
  }

  try {
    const eleve = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
        AND role = 'eleve'
      `,
      [eleveId]
    );

    if (eleve.rows.length === 0) {
      return res.status(404).json({
        message: 'Élève introuvable.'
      });
    }

    const result = await pool.query(
      `
      UPDATE absences
      SET
        eleve_id = $1,
        date_absence = $2,
        matiere = $3,
        heure_debut = $4,
        heure_fin = $5,
        type = $6,
        motif = $7
      WHERE id = $8
      RETURNING *
      `,
      [
        eleveId,
        dateAbsence,
        matiere,
        heureDebut,
        heureFin,
        type,
        motif || null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Enregistrement introuvable.'
      });
    }

    res.json({
      message: 'Enregistrement modifié avec succès.',
      absence: result.rows[0]
    });
  } catch (error) {
    console.error('Erreur modification absence :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

// ======================================
// DELETE : supprimer
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
      `
      DELETE FROM absences
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Enregistrement introuvable.'
      });
    }

    res.json({
      message: 'Enregistrement supprimé avec succès.'
    });
  } catch (error) {
    console.error('Erreur suppression absence :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

// ======================================
// GET : mes absences — élève
// ou celles de l'enfant — parent
// ======================================
router.get('/mes-absences', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'Non authentifié.'
      });
    }

    let eleveId: number | null = null;

    if (req.user.role === 'eleve') {
      eleveId = req.user.id;
    } else if (req.user.role === 'parent') {
      const result = await pool.query(
        `
        SELECT u.id
        FROM parent_children pc
        INNER JOIN users u ON u.id = pc.child_id
        WHERE pc.parent_id = $1
          AND u.role = 'eleve'
        ORDER BY u.id
        LIMIT 1
        `,
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: 'Aucun enfant associé à ce compte parent.'
        });
      }

      eleveId = result.rows[0].id;
    } else {
      return res.status(403).json({
        message: 'Accès non autorisé.'
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        eleve_id,
        date_absence,
        matiere,
        heure_debut,
        heure_fin,
        type,
        motif
      FROM absences
      WHERE eleve_id = $1
      ORDER BY date_absence DESC, heure_debut ASC
      `,
      [eleveId]
    );

    res.json({
      absences: result.rows
    });
  } catch (error) {
    console.error('Erreur récupération mes absences :', error);

    res.status(500).json({
      message: 'Erreur interne du serveur.'
    });
  }
});

export default router;

