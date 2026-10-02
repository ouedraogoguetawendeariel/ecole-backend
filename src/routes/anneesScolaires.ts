import { Router } from 'express';
import pool from '../db';

const router = Router();

// ============================================================
// RÉCUPÉRER TOUTES LES ANNÉES SCOLAIRES
// ============================================================

router.get('/', async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                libelle,
                active,
                premier_versement,
                deuxieme_versement,
                troisieme_versement,
                created_at
            FROM annees_scolaires
            ORDER BY libelle DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Erreur récupération années scolaires :', error);

        res.status(500).json({
            message: 'Erreur lors de la récupération des années scolaires.'
        });
    }
});

// ============================================================
// RÉCUPÉRER L'ANNÉE SCOLAIRE ACTIVE
// ============================================================

router.get('/active', async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                libelle,
                active,
                premier_versement,
                deuxieme_versement,
                troisieme_versement,
                created_at
            FROM annees_scolaires
            WHERE active = true
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Aucune année scolaire active.'
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Erreur récupération année active :', error);

        res.status(500).json({
            message: 'Erreur lors de la récupération de l’année scolaire active.'
        });
    }
});

// ============================================================
// AJOUTER UNE ANNÉE SCOLAIRE
// ============================================================

router.post('/', async (req, res) => {
    try {
        const {
            libelle,
            premier_versement,
            deuxieme_versement,
            troisieme_versement
        } = req.body;

        if (!libelle || !libelle.trim()) {
            return res.status(400).json({
                message: 'L’année scolaire est obligatoire.'
            });
        }

        const result = await pool.query(
            `
            INSERT INTO annees_scolaires (
                libelle,
                active,
                premier_versement,
                deuxieme_versement,
                troisieme_versement
            )
            VALUES ($1, false, $2, $3, $4)
            RETURNING
                id,
                libelle,
                active,
                premier_versement,
                deuxieme_versement,
                troisieme_versement,
                created_at
            `,
            [
                libelle.trim(),
                premier_versement || null,
                deuxieme_versement || null,
                troisieme_versement || null
            ]
        );

        res.status(201).json({
            message: 'Année scolaire ajoutée avec succès.',
            annee: result.rows[0]
        });
    } catch (error: any) {
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Cette année scolaire existe déjà.'
            });
        }

        console.error('Erreur ajout année scolaire :', error);

        res.status(500).json({
            message: 'Erreur lors de l’ajout de l’année scolaire.'
        });
    }
});

// ============================================================
// MODIFIER LES ÉCHÉANCES D'UNE ANNÉE SCOLAIRE
// ============================================================

router.put('/:id/echeances', async (req, res) => {
    try {
        const { id } = req.params;

        const {
            premier_versement,
            deuxieme_versement,
            troisieme_versement
        } = req.body;

        if (
            !premier_versement ||
            !deuxieme_versement ||
            !troisieme_versement
        ) {
            return res.status(400).json({
                message: 'Les trois dates d’échéance sont obligatoires.'
            });
        }

        const result = await pool.query(
            `
            UPDATE annees_scolaires
            SET
                premier_versement = $1,
                deuxieme_versement = $2,
                troisieme_versement = $3
            WHERE id = $4
            RETURNING
                id,
                libelle,
                active,
                premier_versement,
                deuxieme_versement,
                troisieme_versement,
                created_at
            `,
            [
                premier_versement,
                deuxieme_versement,
                troisieme_versement,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Année scolaire introuvable.'
            });
        }

        res.json({
            message: 'Les échéances ont été enregistrées avec succès.',
            annee: result.rows[0]
        });
    } catch (error) {
        console.error('Erreur modification échéances :', error);

        res.status(500).json({
            message: 'Erreur lors de la modification des échéances.'
        });
    }
});

// ============================================================
// DÉFINIR UNE ANNÉE COMME ANNÉE ACTIVE
// ============================================================

router.put('/:id/activer', async (req, res) => {
    const client = await pool.connect();

    try {
        const { id } = req.params;

        await client.query('BEGIN');

        // Désactiver toutes les années
        await client.query(`
            UPDATE annees_scolaires
            SET active = false
        `);

        // Activer l'année sélectionnée
        const result = await client.query(
            `
            UPDATE annees_scolaires
            SET active = true
            WHERE id = $1
            RETURNING
                id,
                libelle,
                active,
                premier_versement,
                deuxieme_versement,
                troisieme_versement
            `,
            [id]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                message: 'Année scolaire introuvable.'
            });
        }

        await client.query('COMMIT');

        res.json({
            message: 'Année scolaire activée avec succès.',
            annee: result.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');

        console.error('Erreur activation année scolaire :', error);

        res.status(500).json({
            message: 'Erreur lors de l’activation de l’année scolaire.'
        });
    } finally {
        client.release();
    }
});

export default router;