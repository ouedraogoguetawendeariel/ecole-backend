import { Router, Response } from 'express';
import pool from '../db';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();

/* =========================================================
   OPTIONS POUR L'ADMIN
   ========================================================= */

router.get('/options', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ message: 'Accès réservé à l’administration.' });
    }

    const classesResult = await pool.query(`
      SELECT DISTINCT classe
      FROM users
      WHERE role = 'eleve'
        AND classe IS NOT NULL
        AND TRIM(classe) <> ''
      ORDER BY classe
    `);

    const elevesResult = await pool.query(`
      SELECT id, nom, prenom, classe
      FROM users
      WHERE role = 'eleve'
      ORDER BY nom, prenom
    `);

    res.json({
      classes: classesResult.rows.map((row) => row.classe),
      eleves: elevesResult.rows,
    });
  } catch (error) {
    console.error('Erreur récupération options actualités :', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des options.',
    });
  }
});

/* =========================================================
   ACTUALITÉS PUBLIQUES
   ========================================================= */

/* =========================================================
   ACTUALITÉS PUBLIQUES
   ========================================================= */

router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        type,
        categorie,
        destination,
        cible,
        titre,
        contenu,
        classe,
        eleve_id,
        periode,
        photos,
        created_at
      FROM actualites
      WHERE destination = 'publique'
      ORDER BY created_at DESC
    `);

    res.json(result.rows);

  } catch (error) {

    console.error(
      'Erreur récupération actualités publiques :',
      error
    );

    res.status(500).json({
      message:
        'Erreur lors de la récupération des actualités.',
    });

  }
});

/* =========================================================
   TOUTES LES ACTUALITÉS POUR L'ADMIN
   ========================================================= */

router.get('/admin', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        message: 'Accès réservé à l’administration.',
      });
    }

    const result = await pool.query(`
      SELECT
        id,
        type,
        categorie,
        destination,
        cible,
        titre,
        contenu,
        classe,
        eleve_id,
        periode,
        photos,
        created_at
      FROM actualites
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Erreur récupération actualités admin :', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des actualités.',
    });
  }
});

/* =========================================================
   ACTUALITÉS DESTINÉES AUX UTILISATEURS
   ========================================================= */

router.get('/mes', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    if (!userId || !role) {
      return res.status(401).json({
        message: 'Utilisateur non authentifié.',
      });
    }

    /* ---------------- ADMIN ---------------- */

    if (role === 'admin') {
      const result = await pool.query(`
        SELECT
          id,
          type,
          categorie,
          destination,
          cible,
          titre,
          contenu,
          classe,
          eleve_id,
          periode,
          photos,
          created_at
        FROM actualites
        ORDER BY created_at DESC
      `);

      return res.json(result.rows);
    }

    /* ---------------- ÉLÈVE ---------------- */

    if (role === 'eleve') {
      const eleveResult = await pool.query(
        `
        SELECT classe
        FROM users
        WHERE id = $1
          AND role = 'eleve'
        `,
        [userId]
      );

      if (eleveResult.rows.length === 0) {
        return res.status(404).json({
          message: 'Élève introuvable.',
        });
      }

      const classe = eleveResult.rows[0].classe;

      const result = await pool.query(
        `
        SELECT
          id,
          type,
          categorie,
          destination,
          cible,
          titre,
          contenu,
          classe,
          eleve_id,
          periode,
          photos,
          created_at
        FROM actualites
        WHERE destination = 'utilisateurs'
          AND (
            cible = 'tous'
            OR (cible = 'classe' AND classe = $1)
            OR (cible = 'eleve' AND eleve_id = $2)
          )
        ORDER BY created_at DESC
        `,
        [classe, userId]
      );

      return res.json(result.rows);
    }

    /* ---------------- PARENT ---------------- */

    if (role === 'parent') {
      const result = await pool.query(
        `
        SELECT DISTINCT
          a.id,
          a.type,
          a.categorie,
          a.destination,
          a.cible,
          a.titre,
          a.contenu,
          a.classe,
          a.eleve_id,
          a.periode,
          a.photos,
          a.created_at
        FROM actualites a
        WHERE a.destination = 'utilisateurs'
          AND (
            a.cible = 'tous'

            OR EXISTS (
              SELECT 1
              FROM parent_children pc
              INNER JOIN users u
                ON u.id = pc.child_id
              WHERE pc.parent_id = $1
                AND (
                  (
                    a.cible = 'classe'
                    AND a.classe = u.classe
                  )
                  OR (
                    a.cible = 'eleve'
                    AND a.eleve_id = u.id
                  )
                )
            )
          )
        ORDER BY a.created_at DESC
        `,
        [userId]
      );

      return res.json(result.rows);
    }

    return res.status(403).json({
      message: 'Rôle non autorisé.',
    });
  } catch (error) {
    console.error('Erreur récupération actualités utilisateur :', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des actualités.',
    });
  }
});

/* =========================================================
   CRÉER UNE ACTUALITÉ
   ========================================================= */

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        message: 'Seule l’administration peut publier une actualité.',
      });
    }

    const {
      type,
      destination,
      cible,
      categorie,
      titre,
      contenu,
      classe,
      eleveId,
      periode,
      photos,
    } = req.body;

    if (!titre || !titre.trim()) {
      return res.status(400).json({
        message: 'Le titre est obligatoire.',
      });
    }

    if (!destination || !['publique', 'utilisateurs'].includes(destination)) {
      return res.status(400).json({
        message: 'Destination invalide.',
      });
    }

    let destinationFinale = destination;
    let cibleFinale = 'tous';
    let classeFinale: string | null = null;
    let eleveIdFinal: number | null = null;
    let categorieFinale = 'annonce';
    let typeFinal = 'annonce';

    /* =====================================================
       PUBLIC
       ===================================================== */

    if (destination === 'publique') {
      if (!['annonce', 'sortie', 'visite'].includes(categorie)) {
        return res.status(400).json({
          message: 'Catégorie publique invalide.',
        });
      }

      categorieFinale = categorie;
      typeFinal = 'annonce';
      cibleFinale = 'tous';
    }

    /* =====================================================
       UTILISATEURS
       ===================================================== */

    if (destination === 'utilisateurs') {
      if (!['tous', 'classe', 'eleve'].includes(cible)) {
        return res.status(400).json({
          message: 'Cible invalide.',
        });
      }

      cibleFinale = cible;
      categorieFinale = 'annonce';
      typeFinal = 'annonce';

      if (cible === 'classe') {
        if (!classe || !classe.trim()) {
          return res.status(400).json({
            message: 'Veuillez sélectionner une classe.',
          });
        }

        classeFinale = classe;
      }

      if (cible === 'eleve') {
        if (!eleveId) {
          return res.status(400).json({
            message: 'Veuillez sélectionner un élève.',
          });
        }

        eleveIdFinal = Number(eleveId);

        const eleveExiste = await pool.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
            AND role = 'eleve'
          `,
          [eleveIdFinal]
        );

        if (eleveExiste.rows.length === 0) {
          return res.status(400).json({
            message: 'Élève introuvable.',
          });
        }
      }
    }

    const photosFinales = Array.isArray(photos) ? photos : [];

    const result = await pool.query(
      `
      INSERT INTO actualites (
        type,
        categorie,
        destination,
        cible,
        titre,
        contenu,
        classe,
        eleve_id,
        periode,
        photos,
        created_by
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11
      )
      RETURNING
        id,
        type,
        categorie,
        destination,
        cible,
        titre,
        contenu,
        classe,
        eleve_id,
        periode,
        photos,
        created_at
      `,
      [
        typeFinal,
        categorieFinale,
        destinationFinale,
        cibleFinale,
        titre.trim(),
        contenu?.trim() || null,
        classeFinale,
        eleveIdFinal,
        periode?.trim() || null,
        photosFinales,
        req.user.id,
      ]
    );

    res.status(201).json({
      message: 'Actualité publiée avec succès.',
      actualite: result.rows[0],
    });
  } catch (error) {
    console.error('Erreur création actualité :', error);

    res.status(500).json({
      message: 'Erreur lors de la publication de l’actualité.',
    });
  }
});

/* =========================================================
   SUPPRIMER UNE ACTUALITÉ
   ========================================================= */

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        message: 'Seule l’administration peut supprimer une actualité.',
      });
    }

    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: 'Identifiant invalide.',
      });
    }

    const result = await pool.query(
      `
      DELETE FROM actualites
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Actualité introuvable.',
      });
    }

    res.json({
      message: 'Actualité supprimée avec succès.',
    });
  } catch (error) {
    console.error('Erreur suppression actualité :', error);

    res.status(500).json({
      message: 'Erreur lors de la suppression.',
    });
  }
});

export default router;