import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import {
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import pool from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import s3 from '../config/s3';

const router = Router();

// ============================================================
// UPLOAD TEMPORAIRE DES PDF
// ============================================================

const upload = multer({
  dest: 'uploads/',
});

// ============================================================
// RÉCUPÉRER LES BULLETINS
// ============================================================

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    let result;

    // ========================================================
    // ÉLÈVE
    // ========================================================

    if (req.user?.role === 'eleve') {
      result = await pool.query(
        `
        SELECT
          a.id,
          a.titre,
          a.periode,
          a.fichier_url,
          a.annee_scolaire_id,
          ans.libelle AS annee_scolaire,
          a.created_at
        FROM actualites a
        LEFT JOIN annees_scolaires ans
          ON ans.id = a.annee_scolaire_id
        WHERE a.type = 'bulletin'
          AND a.eleve_id = $1
        ORDER BY a.created_at DESC
        `,
        [req.user.id]
      );
    }

    // ========================================================
    // PARENT
    // ========================================================

    else if (req.user?.role === 'parent') {
      result = await pool.query(
        `
        SELECT
          a.id,
          a.titre,
          a.periode,
          a.fichier_url,
          a.annee_scolaire_id,
          ans.libelle AS annee_scolaire,
          a.created_at,
          u.id AS eleve_id,
          u.nom,
          u.prenom,
          u.classe
        FROM actualites a
        JOIN parent_children pc
          ON pc.child_id = a.eleve_id
        JOIN users u
          ON u.id = a.eleve_id
        LEFT JOIN annees_scolaires ans
          ON ans.id = a.annee_scolaire_id
        WHERE a.type = 'bulletin'
          AND pc.parent_id = $1
        ORDER BY a.created_at DESC
        `,
        [req.user.id]
      );
    }

    // ========================================================
    // ADMIN
    // ========================================================

    else if (req.user?.role === 'admin') {
      result = await pool.query(
        `
        SELECT
          a.id,
          a.titre,
          a.periode,
          a.fichier_url,
          a.annee_scolaire_id,
          ans.libelle AS annee_scolaire,
          a.created_at,
          u.id AS eleve_id,
          u.nom,
          u.prenom,
          u.classe
        FROM actualites a
        LEFT JOIN users u
          ON u.id = a.eleve_id
        LEFT JOIN annees_scolaires ans
          ON ans.id = a.annee_scolaire_id
        WHERE a.type = 'bulletin'
        ORDER BY a.created_at DESC
        `
      );
    }

    else {
      return res.status(403).json({
        message: 'Accès refusé.',
      });
    }

    return res.json({
      bulletins: result.rows,
    });

  } catch (error) {
    console.error('Erreur récupération bulletins :', error);

    return res.status(500).json({
      message: 'Erreur lors de la récupération des bulletins.',
    });
  }
});

// ============================================================
// INFORMATIONS NÉCESSAIRES À L'ADMIN
// ============================================================

// Récupérer les années scolaires
router.get(
  '/options/annees',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          message: 'Accès réservé à l’administrateur.',
        });
      }

      const result = await pool.query(
        `
        SELECT
          id,
          libelle,
          active
        FROM annees_scolaires
        ORDER BY id DESC
        `
      );

      return res.json({
        annees: result.rows,
      });

    } catch (error) {
      console.error('Erreur récupération années scolaires :', error);

      return res.status(500).json({
        message: 'Erreur lors de la récupération des années scolaires.',
      });
    }
  }
);

// Récupérer les classes disponibles
router.get(
  '/options/classes',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          message: 'Accès réservé à l’administrateur.',
        });
      }

      const result = await pool.query(
        `
        SELECT DISTINCT classe
        FROM users
        WHERE role = 'eleve'
          AND classe IS NOT NULL
          AND TRIM(classe) <> ''
        ORDER BY classe
        `
      );

      return res.json({
        classes: result.rows.map((row) => row.classe),
      });

    } catch (error) {
      console.error('Erreur récupération classes :', error);

      return res.status(500).json({
        message: 'Erreur lors de la récupération des classes.',
      });
    }
  }
);

// Récupérer les élèves d'une classe
router.get(
  '/options/eleves',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          message: 'Accès réservé à l’administrateur.',
        });
      }

      const classe = String(req.query.classe || '').trim();

      if (!classe) {
        return res.status(400).json({
          message: 'La classe est obligatoire.',
        });
      }

      const result = await pool.query(
        `
        SELECT
          id,
          nom,
          prenom,
          classe
        FROM users
        WHERE role = 'eleve'
          AND classe = $1
        ORDER BY nom ASC, prenom ASC
        `,
        [classe]
      );

      return res.json({
        eleves: result.rows,
      });

    } catch (error) {
      console.error('Erreur récupération élèves :', error);

      return res.status(500).json({
        message: 'Erreur lors de la récupération des élèves.',
      });
    }
  }
);

// ============================================================
// PUBLIER UN BULLETIN
// ============================================================

router.post(
  '/publier',
  requireAuth,
  upload.single('pdf'),
  async (req: AuthRequest, res) => {
    let fichierTemporaire: string | null = null;

    try {
      // ======================================================
      // VÉRIFICATION ADMIN
      // ======================================================

      if (req.user?.role !== 'admin') {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(403).json({
          message: 'Accès réservé à l’administrateur.',
        });
      }

      // ======================================================
      // RÉCUPÉRATION DES DONNÉES
      // ======================================================

      const anneeScolaireId = Number(req.body.anneeScolaireId);
      const eleveId = Number(req.body.eleveId);
      const classe = String(req.body.classe || '').trim();
      const periode = String(req.body.periode || '').trim();

      fichierTemporaire = req.file?.path || null;

      // ======================================================
      // VALIDATIONS
      // ======================================================

      if (!Number.isInteger(anneeScolaireId)) {
        return res.status(400).json({
          message: 'Année scolaire invalide.',
        });
      }

      if (!Number.isInteger(eleveId)) {
        return res.status(400).json({
          message: 'Élève invalide.',
        });
      }

      if (!classe) {
        return res.status(400).json({
          message: 'La classe est obligatoire.',
        });
      }

      if (!periode) {
        return res.status(400).json({
          message: 'La période est obligatoire.',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: 'Aucun fichier PDF fourni.',
        });
      }

      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({
          message: 'Seuls les fichiers PDF sont autorisés.',
        });
      }

      // ======================================================
      // VÉRIFIER L'ANNÉE SCOLAIRE
      // ======================================================

      const anneeResult = await pool.query(
        `
        SELECT
          id,
          libelle
        FROM annees_scolaires
        WHERE id = $1
        `,
        [anneeScolaireId]
      );

      if (anneeResult.rows.length === 0) {
        return res.status(404).json({
          message: 'Année scolaire introuvable.',
        });
      }

      const anneeScolaire = anneeResult.rows[0];

      // ======================================================
      // VÉRIFIER L'ÉLÈVE
      // ======================================================

      const eleveResult = await pool.query(
        `
        SELECT
          id,
          nom,
          prenom,
          classe
        FROM users
        WHERE id = $1
          AND role = 'eleve'
        `,
        [eleveId]
      );

      if (eleveResult.rows.length === 0) {
        return res.status(404).json({
          message: 'Élève introuvable.',
        });
      }

      const eleve = eleveResult.rows[0];

      // Vérifier que l'élève appartient bien à la classe sélectionnée
      if (eleve.classe !== classe) {
        return res.status(400).json({
          message: 'L’élève sélectionné n’appartient pas à cette classe.',
        });
      }

      // ======================================================
      // ÉVITER LES DOUBLONS
      // ======================================================

      const doublon = await pool.query(
        `
        SELECT id
        FROM actualites
        WHERE type = 'bulletin'
          AND eleve_id = $1
          AND annee_scolaire_id = $2
          AND periode = $3
        LIMIT 1
        `,
        [eleveId, anneeScolaireId, periode]
      );

      if (doublon.rows.length > 0) {
        return res.status(409).json({
          message:
            'Un bulletin existe déjà pour cet élève, cette année scolaire et cette période.',
        });
      }

      // ======================================================
      // ENVOYER LE PDF VERS SEAWEEDFS
      // ======================================================

      console.log(
        '📄 Publication du bulletin :',
        req.file.originalname
      );

      const fileBuffer = fs.readFileSync(req.file.path);

      const nomFichierSecurise = req.file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '_');

      const fileKey =
        `bulletins/${anneeScolaire.libelle}/${classe}/${eleveId}/${Date.now()}-${nomFichierSecurise}`;

      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: 'application/pdf',
      });

      await s3.send(command);

      console.log(
        '✅ PDF envoyé vers SeaweedFS :',
        fileKey
      );

      // ======================================================
      // ENREGISTRER LE BULLETIN DANS POSTGRESQL
      // ======================================================

      const titre =
        `Bulletin - ${periode} - ${eleve.prenom || ''} ${eleve.nom}`.trim();

      const insertResult = await pool.query(
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
          fichier_url,
          created_by,
          annee_scolaire_id
        )
        VALUES (
          'bulletin',
          'bulletin',
          'utilisateurs',
          'eleve',
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        RETURNING
          id,
          titre,
          periode,
          classe,
          eleve_id,
          fichier_url,
          annee_scolaire_id,
          created_at
        `,
        [
          titre,
          `Bulletin scolaire de ${eleve.prenom || ''} ${eleve.nom} - ${anneeScolaire.libelle}`.trim(),
          classe,
          eleveId,
          periode,
          fileKey,
          req.user.id,
          anneeScolaireId,
        ]
      );

      // ======================================================
      // SUPPRIMER LE FICHIER TEMPORAIRE
      // ======================================================

      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      fichierTemporaire = null;

      console.log(
        '✅ Bulletin enregistré dans PostgreSQL :',
        insertResult.rows[0].id
      );

      return res.status(201).json({
        message: 'Bulletin publié avec succès.',
        bulletin: insertResult.rows[0],
      });

    } catch (error) {
      console.error(
        '===== ERREUR PUBLICATION BULLETIN ====='
      );
      console.error(error);
      console.error(
        '======================================='
      );

      // Supprimer le fichier temporaire en cas d'erreur
      if (
        fichierTemporaire &&
        fs.existsSync(fichierTemporaire)
      ) {
        fs.unlinkSync(fichierTemporaire);
      }

      return res.status(500).json({
        message: 'Erreur lors de la publication du bulletin.',
      });
    }
  }
);

// ============================================================
// OUVRIR / TÉLÉCHARGER UN BULLETIN
// ============================================================

router.get(
  '/:id/fichier',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const bulletinId = Number(req.params.id);

      if (!Number.isInteger(bulletinId)) {
        return res.status(400).json({
          message: 'Identifiant du bulletin invalide.',
        });
      }

      // ======================================================
      // RÉCUPÉRER LE BULLETIN
      // ======================================================

      const result = await pool.query(
        `
        SELECT
          a.id,
          a.fichier_url,
          a.eleve_id
        FROM actualites a
        WHERE a.id = $1
          AND a.type = 'bulletin'
        `,
        [bulletinId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: 'Bulletin introuvable.',
        });
      }

      const bulletin = result.rows[0];

      // ======================================================
      // VÉRIFICATION DES DROITS
      // ======================================================

      if (req.user?.role === 'eleve') {
        if (bulletin.eleve_id !== req.user.id) {
          return res.status(403).json({
            message: 'Vous n’avez pas accès à ce bulletin.',
          });
        }
      }

      else if (req.user?.role === 'parent') {
        const parentCheck = await pool.query(
          `
          SELECT 1
          FROM parent_children
          WHERE parent_id = $1
            AND child_id = $2
          `,
          [req.user.id, bulletin.eleve_id]
        );

        if (parentCheck.rows.length === 0) {
          return res.status(403).json({
            message: 'Vous n’avez pas accès à ce bulletin.',
          });
        }
      }

      else if (req.user?.role !== 'admin') {
        return res.status(403).json({
          message: 'Accès refusé.',
        });
      }

      // ======================================================
      // RÉCUPÉRATION SEAWEEDFS
      // ======================================================

      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: bulletin.fichier_url,
      });

      const file = await s3.send(command);

      res.setHeader(
        'Content-Type',
        file.ContentType || 'application/pdf'
      );

      res.setHeader(
        'Content-Disposition',
        'inline'
      );

      if (file.ContentLength) {
        res.setHeader(
          'Content-Length',
          file.ContentLength.toString()
        );
      }

      if (!file.Body) {
        return res.status(404).json({
          message: 'Fichier PDF introuvable.',
        });
      }

      // Envoyer le PDF au navigateur
      const body = file.Body as any;

      if (typeof body.pipe === 'function') {
        body.pipe(res);
      } else {
        const buffer = await body.transformToByteArray();
        res.send(Buffer.from(buffer));
      }

    } catch (error) {
      console.error(
        'Erreur récupération PDF bulletin :',
        error
      );

      return res.status(500).json({
        message: 'Erreur lors de la récupération du PDF.',
      });
    }
  }
);

export default router;