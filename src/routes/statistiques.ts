import { Router } from 'express';
import pool from '../db';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router();

// Récupérer les statistiques de l'école
router.get('/', async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                primaire_eleves,
                primaire_max_classe,
                primaire_niveaux,
                primaire_reussite_cep,
                college_eleves,
                college_max_classe,
                college_niveaux,
                college_reussite_bepc,
                updated_at
            FROM statistiques_ecole
            ORDER BY id ASC
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Aucune statistique trouvée.'
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(
            'Erreur récupération statistiques :',
            error
        );

        res.status(500).json({
            message: 'Erreur lors de la récupération des statistiques.'
        });
    }
});

// Modifier les statistiques
// Réservé à l'administrateur
router.put('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({
                message: 'Accès réservé à l’administrateur.'
            });
        }

        const {
            primaire_eleves,
            primaire_max_classe,
            primaire_niveaux,
            primaire_reussite_cep,
            college_eleves,
            college_max_classe,
            college_niveaux,
            college_reussite_bepc
        } = req.body;

        const result = await pool.query(
            `
            UPDATE statistiques_ecole
            SET
                primaire_eleves = $1,
                primaire_max_classe = $2,
                primaire_niveaux = $3,
                primaire_reussite_cep = $4,
                college_eleves = $5,
                college_max_classe = $6,
                college_niveaux = $7,
                college_reussite_bepc = $8,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = (
                SELECT id
                FROM statistiques_ecole
                ORDER BY id ASC
                LIMIT 1
            )
            RETURNING *
            `,
            [
                primaire_eleves,
                primaire_max_classe,
                primaire_niveaux,
                primaire_reussite_cep,
                college_eleves,
                college_max_classe,
                college_niveaux,
                college_reussite_bepc
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Aucune statistique trouvée.'
            });
        }

        res.json({
            message: 'Statistiques mises à jour avec succès.',
            statistiques: result.rows[0]
        });
    } catch (error) {
        console.error(
            'Erreur modification statistiques :',
            error
        );

        res.status(500).json({
            message: 'Erreur lors de la modification des statistiques.'
        });
    }
});

export default router;
