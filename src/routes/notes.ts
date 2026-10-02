import express from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth';
import pool from '../db';

const router = express.Router();

/* =========================================================
   GET : récupérer les notes
========================================================= */

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    if (!userId || !role) {
      return res.status(401).json({
        message: 'Utilisateur non authentifié.',
      });
    }

    let result;

    // ADMIN : toutes les notes
    if (role === 'admin') {
      result = await pool.query(`
        SELECT
          n.id,
          n.eleve_id,
          u.prenom,
          u.nom,
          u.classe,
          n.matiere,
          n.note,
          n.coefficient,
          n.trimestre,
          n.created_at
        FROM notes n
        JOIN users u ON u.id = n.eleve_id
        ORDER BY
          u.classe ASC,
          u.nom ASC,
          u.prenom ASC,
          n.trimestre ASC,
          n.matiere ASC
      `);
    }

    // ÉLÈVE : uniquement ses propres notes
    else if (role === 'eleve') {
      result = await pool.query(
        `
        SELECT
          n.id,
          n.eleve_id,
          u.prenom,
          u.nom,
          u.classe,
          n.matiere,
          n.note,
          n.coefficient,
          n.trimestre,
          n.created_at
        FROM notes n
        JOIN users u ON u.id = n.eleve_id
        WHERE n.eleve_id = $1
        ORDER BY n.trimestre ASC, n.matiere ASC
        `,
        [userId]
      );
    }

    // PARENT : notes des enfants liés
    else if (role === 'parent') {
      result = await pool.query(
        `
        SELECT
          n.id,
          n.eleve_id,
          u.prenom,
          u.nom,
          u.classe,
          n.matiere,
          n.note,
          n.coefficient,
          n.trimestre,
          n.created_at
        FROM notes n
        JOIN users u ON u.id = n.eleve_id
        JOIN parent_children pc ON pc.child_id = n.eleve_id
        WHERE pc.parent_id = $1
        ORDER BY
          u.nom ASC,
          u.prenom ASC,
          n.trimestre ASC,
          n.matiere ASC
        `,
        [userId]
      );
    }

    else {
      return res.status(403).json({
        message: 'Rôle non autorisé.',
      });
    }

    return res.json({
      notes: result.rows,
    });

  } catch (error) {
    console.error('Erreur récupération notes :', error);

    return res.status(500).json({
      message: 'Erreur lors de la récupération des notes.',
    });
  }
});


/* =========================================================
   POST : enregistrer plusieurs notes d'une classe
========================================================= */

router.post('/classe', requireAuth, async (req: AuthRequest, res) => {
  const client = await pool.connect();

  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès réservé à l’administrateur.',
      });
    }

    const {
      classe,
      matiere,
      coefficient,
      trimestre,
      notes,
    } = req.body;

    if (!classe || !matiere || !trimestre || !Array.isArray(notes)) {
      return res.status(400).json({
        message: 'Données incomplètes.',
      });
    }

    const coefficientNumber = Number(coefficient);

    if (!coefficientNumber || coefficientNumber <= 0) {
      return res.status(400).json({
        message: 'Le coefficient doit être supérieur à 0.',
      });
    }

    if (notes.length === 0) {
      return res.status(400).json({
        message: 'Aucune note à enregistrer.',
      });
    }

    // Vérifier que les élèves appartiennent bien à la classe sélectionnée
    const eleveIds = notes.map((item: any) => Number(item.eleveId));

    const elevesResult = await client.query(
      `
      SELECT id
      FROM users
      WHERE role = 'eleve'
        AND classe = $1
        AND id = ANY($2::int[])
      `,
      [classe, eleveIds]
    );

    if (elevesResult.rows.length !== eleveIds.length) {
      return res.status(400).json({
        message: 'Un ou plusieurs élèves ne correspondent pas à la classe sélectionnée.',
      });
    }

    await client.query('BEGIN');

    const notesEnregistrees = [];

    for (const item of notes) {
      const eleveId = Number(item.eleveId);
      const noteNumber = Number(item.note);

      if (!Number.isFinite(noteNumber) || noteNumber < 0 || noteNumber > 20) {
        throw new Error(
          `La note de l'élève ${eleveId} doit être comprise entre 0 et 20.`
        );
      }

      // Si la note existe déjà pour cette matière et ce trimestre,
      // on la met à jour au lieu de créer un doublon.
      const ancienneNote = await client.query(
        `
        SELECT id
        FROM notes
        WHERE eleve_id = $1
          AND matiere = $2
          AND trimestre = $3
        LIMIT 1
        `,
        [eleveId, matiere, trimestre]
      );

      let resultat;

      if (ancienneNote.rows.length > 0) {
        resultat = await client.query(
          `
          UPDATE notes
          SET
            note = $1,
            coefficient = $2
          WHERE id = $3
          RETURNING *
          `,
          [
            noteNumber,
            coefficientNumber,
            ancienneNote.rows[0].id,
          ]
        );
      } else {
        resultat = await client.query(
          `
          INSERT INTO notes
          (
            eleve_id,
            matiere,
            note,
            coefficient,
            trimestre
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
          `,
          [
            eleveId,
            matiere,
            noteNumber,
            coefficientNumber,
            trimestre,
          ]
        );
      }

      notesEnregistrees.push(resultat.rows[0]);
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: `${notesEnregistrees.length} note(s) enregistrée(s) avec succès.`,
      notes: notesEnregistrees,
    });

  } catch (error: any) {
    await client.query('ROLLBACK');

    console.error('Erreur enregistrement notes classe :', error);

    return res.status(500).json({
      message: error.message || 'Erreur lors de l’enregistrement des notes.',
    });

  } finally {
    client.release();
  }
});


/* =========================================================
   POST : ajouter une seule note
========================================================= */

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès réservé à l’administrateur.',
      });
    }

    const {
      eleveId,
      matiere,
      note,
      coefficient,
      trimestre,
    } = req.body;

    if (!eleveId || !matiere || note === undefined || !trimestre) {
      return res.status(400).json({
        message: 'Veuillez remplir tous les champs obligatoires.',
      });
    }

    const noteNumber = Number(note);
    const coefficientNumber = Number(coefficient || 1);

    if (noteNumber < 0 || noteNumber > 20) {
      return res.status(400).json({
        message: 'La note doit être comprise entre 0 et 20.',
      });
    }

    if (coefficientNumber <= 0) {
      return res.status(400).json({
        message: 'Le coefficient doit être supérieur à 0.',
      });
    }

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
        message: 'Élève introuvable.',
      });
    }

    const result = await pool.query(
      `
      INSERT INTO notes
      (
        eleve_id,
        matiere,
        note,
        coefficient,
        trimestre
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        eleveId,
        matiere,
        noteNumber,
        coefficientNumber,
        trimestre,
      ]
    );

    return res.status(201).json({
      message: 'Note enregistrée avec succès.',
      note: result.rows[0],
    });

  } catch (error) {
    console.error('Erreur ajout note :', error);

    return res.status(500).json({
      message: 'Erreur lors de l’enregistrement de la note.',
    });
  }
});



/* =========================================================
   DELETE : supprimer une note par son ID
========================================================= */

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès réservé à l’administrateur.',
      });
    }

    const noteId = Number(req.params.id);

    if (!Number.isInteger(noteId)) {
      return res.status(400).json({
        message: 'ID de la note invalide.',
      });
    }

    const result = await pool.query(
      `
      DELETE FROM notes
      WHERE id = $1
      RETURNING id
      `,
      [noteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Note introuvable.',
      });
    }

    return res.json({
      message: 'Note supprimée avec succès.',
    });

  } catch (error) {
    console.error('Erreur suppression note :', error);

    return res.status(500).json({
      message: 'Erreur lors de la suppression de la note.',
    });
  }
});

/* =========================================================
   PUT : modifier une note existante
========================================================= */

router.put('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès réservé à l’administrateur.',
      });
    }

    const noteId = Number(req.params.id);

    if (!Number.isInteger(noteId)) {
      return res.status(400).json({
        message: 'ID de la note invalide.',
      });
    }

    const { matiere, note, coefficient, trimestre } = req.body;

    if (!matiere || note === undefined || !trimestre) {
      return res.status(400).json({
        message: 'Veuillez remplir tous les champs obligatoires.',
      });
    }

    const noteNumber = Number(note);
    const coefficientNumber = Number(coefficient || 1);

    if (noteNumber < 0 || noteNumber > 20) {
      return res.status(400).json({
        message: 'La note doit être comprise entre 0 et 20.',
      });
    }

    if (coefficientNumber <= 0) {
      return res.status(400).json({
        message: 'Le coefficient doit être supérieur à 0.',
      });
    }

    const noteExiste = await pool.query(
      `
      SELECT id
      FROM notes
      WHERE id = $1
      `,
      [noteId]
    );

    if (noteExiste.rows.length === 0) {
      return res.status(404).json({
        message: 'Note introuvable.',
      });
    }

    const result = await pool.query(
      `
      UPDATE notes
      SET
        matiere = $1,
        note = $2,
        coefficient = $3,
        trimestre = $4
      WHERE id = $5
      RETURNING *
      `,
      [matiere, noteNumber, coefficientNumber, trimestre, noteId]
    );

    return res.json({
      message: 'Note modifiée avec succès.',
      note: result.rows[0],
    });

  } catch (error) {
    console.error('Erreur modification note :', error);

    return res.status(500).json({
      message: 'Erreur lors de la modification de la note.',
    });
  }
});

export default router;