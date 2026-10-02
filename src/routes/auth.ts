import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db';
import jwt from 'jsonwebtoken';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// =============================================================
// INSCRIPTION
// =============================================================

router.post('/register', async (req, res) => {
    const client = await pool.connect();

    let transactionActive = false;

    try {
        const {
            role,
            nom,
            prenom,
            email,
            password,

            // Informations élève
            classe,
            dateNaissance,

            // Informations enfant du parent
            prenomEnfant,
            nomEnfant,
            dateNaissanceEnfant,
            classeEnfant,

            // Code
            codeInscription
        } = req.body;

        // =====================================================
        // 1. VÉRIFICATION DES CHAMPS COMMUNS
        // =====================================================

        if (
            !role ||
            !nom ||
            !prenom ||
            !email ||
            !password
        ) {
            return res.status(400).json({
                message:
                    'Tous les champs sont obligatoires.'
            });
        }

        // =====================================================
        // 2. L'ADMIN NE PEUT PAS ÊTRE CRÉÉ PAR L'INSCRIPTION
        // =====================================================

        if (role === 'admin') {
            return res.status(403).json({
                message:
                    "La création d'un compte administrateur n'est pas autorisée depuis cette page."
            });
        }

        // =====================================================
        // 3. VÉRIFICATION DU RÔLE
        // =====================================================

        if (
            role !== 'parent' &&
            role !== 'eleve'
        ) {
            return res.status(400).json({
                message:
                    'Le rôle doit être parent ou eleve.'
            });
        }

        // =====================================================
        // 4. INFORMATIONS ÉLÈVE
        // =====================================================

        if (role === 'eleve') {
            if (
                !classe ||
                !dateNaissance
            ) {
                return res.status(400).json({
                    message:
                        'La classe et la date de naissance sont obligatoires pour un élève.'
                });
            }
        }

        // =====================================================
        // 5. INFORMATIONS ENFANT DU PARENT
        // =====================================================

        if (role === 'parent') {
            if (
                !prenomEnfant ||
                !nomEnfant ||
                !classeEnfant ||
                !dateNaissanceEnfant
            ) {
                return res.status(400).json({
                    message:
                        "Le prénom, le nom, la classe et la date de naissance de l'enfant sont obligatoires."
                });
            }
        }

        // =====================================================
        // 6. CODE D'INSCRIPTION
        // =====================================================

        if (
            !process.env.CODE_INSCRIPTION ||
            codeInscription !==
                process.env.CODE_INSCRIPTION
        ) {
            return res.status(403).json({
                message:
                    "Code d'inscription invalide. Contactez l'école pour obtenir le code."
            });
        }

        // =====================================================
        // 7. NETTOYER LES DONNÉES
        // =====================================================

        const emailNormalise =
            email.trim().toLowerCase();

        const nomNormalise =
            nom.trim();

        const prenomNormalise =
            prenom.trim();

        // =====================================================
        // 8. INSCRIPTION D'UN PARENT
        // =====================================================

        if (role === 'parent') {

            // =================================================
            // 8.1 NETTOYER LES INFORMATIONS DE L'ENFANT
            // =================================================

            const prenomEnfantNormalise =
                prenomEnfant.trim();

            const nomEnfantNormalise =
                nomEnfant.trim();

            // =================================================
            // 8.2 RECHERCHER L'ÉLÈVE
            // =================================================

            const enfantResult =
                await client.query(
                    `SELECT
                        id,
                        nom,
                        prenom,
                        classe,
                        date_naissance
                     FROM users
                     WHERE role = 'eleve'
                       AND LOWER(TRIM(prenom)) =
                           LOWER(TRIM($1))
                       AND LOWER(TRIM(nom)) =
                           LOWER(TRIM($2))
                       AND LOWER(TRIM(classe)) =
                           LOWER(TRIM($3))
                       AND date_naissance::date =
                           $4::date
                     LIMIT 1`,
                    [
                        prenomEnfantNormalise,
                        nomEnfantNormalise,
                        classeEnfant,
                        dateNaissanceEnfant
                    ]
                );

            // =================================================
            // 8.3 ÉLÈVE INTROUVABLE
            // =================================================

            if (
                enfantResult.rows.length === 0
            ) {
                return res.status(404).json({
                    message:
                        "Aucun compte élève correspondant aux informations fournies. Vérifiez le prénom, le nom, la classe et la date de naissance de l'élève."
                });
            }

            const enfant =
                enfantResult.rows[0];

            // =================================================
            // 8.4 CHERCHER SI LE PARENT EXISTE DÉJÀ
            // =================================================

            const parentExistant =
                await client.query(
                    `SELECT
                        id,
                        role,
                        nom,
                        prenom,
                        email,
                        password_hash,
                        classe,
                        date_naissance
                     FROM users
                     WHERE LOWER(email) =
                           LOWER($1)
                       AND role = 'parent'
                     LIMIT 1`,
                    [emailNormalise]
                );

            // =================================================
            // 8.5 PARENT EXISTANT
            // =================================================

            if (
                parentExistant.rows.length > 0
            ) {

                const parent =
                    parentExistant.rows[0];

                // =============================================
                // VÉRIFIER LE MOT DE PASSE
                // =============================================

                const passwordCorrect =
                    await bcrypt.compare(
                        password,
                        parent.password_hash
                    );

                if (!passwordCorrect) {
                    return res.status(401).json({
                        message:
                            'Le mot de passe du compte parent est incorrect.'
                    });
                }

                // =============================================
                // VÉRIFIER LA RELATION PARENT / ENFANT
                // =============================================

                const relationExistante =
                    await client.query(
                        `SELECT
                            parent_id,
                            child_id
                         FROM parent_children
                         WHERE parent_id = $1
                           AND child_id = $2`,
                        [
                            parent.id,
                            enfant.id
                        ]
                    );

                // =============================================
                // ENFANT DÉJÀ ASSOCIÉ
                // =============================================

                if (
                    relationExistante.rows.length > 0
                ) {
                    return res.status(409).json({
                        message:
                            'Cet enfant est déjà associé à ce compte parent.'
                    });
                }

                // =============================================
                // AJOUTER LE NOUVEL ENFANT
                // =============================================

                await client.query(
                    `INSERT INTO parent_children (
                        parent_id,
                        child_id
                    )
                    VALUES ($1, $2)`,
                    [
                        parent.id,
                        enfant.id
                    ]
                );

                // =============================================
                // NOUVEAU TOKEN
                // =============================================

                const token =
                    jwt.sign(
                        {
                            id: parent.id,
                            role: parent.role
                        },
                        process.env.JWT_SECRET as string,
                        {
                            expiresIn: '1h'
                        }
                    );

                // =============================================
                // RÉPONSE
                // =============================================

                return res.status(200).json({
                    message:
                        'Nouvel enfant associé avec succès au compte parent.',
                    token,
                    user: {
                        id: parent.id,
                        role: parent.role,
                        nom: parent.nom,
                        prenom: parent.prenom,
                        email: parent.email,
                        classe: parent.classe,
                        date_naissance:
                            parent.date_naissance
                    }
                });
            }

            // =================================================
            // 8.6 CRÉER UN NOUVEAU COMPTE PARENT
            // =================================================

            await client.query('BEGIN');
            transactionActive = true;

            // =============================================
            // HASH DU MOT DE PASSE
            // =============================================

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );

            // =============================================
            // CRÉER LE PARENT
            // =============================================

            const userResult =
                await client.query(
                    `INSERT INTO users (
                        role,
                        nom,
                        prenom,
                        email,
                        password_hash,
                        classe,
                        date_naissance
                    )
                    VALUES (
                        'parent',
                        $1,
                        $2,
                        $3,
                        $4,
                        NULL,
                        NULL
                    )
                    RETURNING
                        id,
                        role,
                        nom,
                        prenom,
                        email,
                        classe,
                        date_naissance,
                        created_at`,
                    [
                        nomNormalise,
                        prenomNormalise,
                        emailNormalise,
                        passwordHash
                    ]
                );

            const newParent =
                userResult.rows[0];

            // =============================================
            // ASSOCIATION DU PREMIER ENFANT
            // =============================================

            await client.query(
                `INSERT INTO parent_children (
                    parent_id,
                    child_id
                )
                VALUES ($1, $2)`,
                [
                    newParent.id,
                    enfant.id
                ]
            );

            // =============================================
            // VALIDER LA TRANSACTION
            // =============================================

            await client.query('COMMIT');
            transactionActive = false;

            // =============================================
            // TOKEN
            // =============================================

            const token =
                jwt.sign(
                    {
                        id: newParent.id,
                        role: newParent.role
                    },
                    process.env.JWT_SECRET as string,
                    {
                        expiresIn: '1h'
                    }
                );

            // =============================================
            // RÉPONSE
            // =============================================

            return res.status(201).json({
                message:
                    'Compte parent créé avec succès.',
                token,
                user: newParent
            });
        }

        // =====================================================
        // 9. INSCRIPTION D'UN ÉLÈVE
        // =====================================================

        if (role === 'eleve') {

            // =================================================
            // 9.1 VÉRIFIER SI L'EMAIL EXISTE
            // =================================================

            const existingUser =
                await client.query(
                    `SELECT id
                     FROM users
                     WHERE LOWER(email) =
                           LOWER($1)`,
                    [emailNormalise]
                );

            if (
                existingUser.rows.length > 0
            ) {
                return res.status(409).json({
                    message:
                        'Cette adresse email est déjà utilisée.'
                });
            }

            // =================================================
            // 9.2 HASH DU MOT DE PASSE
            // =================================================

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );

            // =================================================
            // 9.3 TRANSACTION
            // =================================================

            await client.query('BEGIN');
            transactionActive = true;

            // =================================================
            // 9.4 CRÉER LE COMPTE ÉLÈVE
            // =================================================

            const userResult =
                await client.query(
                    `INSERT INTO users (
                        role,
                        nom,
                        prenom,
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
                        role,
                        nom,
                        prenom,
                        email,
                        classe,
                        date_naissance,
                        created_at`,
                    [
                        nomNormalise,
                        prenomNormalise,
                        emailNormalise,
                        passwordHash,
                        classe,
                        dateNaissance
                    ]
                );

            const newUser =
                userResult.rows[0];

            // =================================================
            // 9.5 VALIDER
            // =================================================

            await client.query('COMMIT');
            transactionActive = false;

            // =================================================
            // 9.6 TOKEN
            // =================================================

            const token =
                jwt.sign(
                    {
                        id: newUser.id,
                        role: newUser.role
                    },
                    process.env.JWT_SECRET as string,
                    {
                        expiresIn: '1h'
                    }
                );

            // =================================================
            // 9.7 RÉPONSE
            // =================================================

            return res.status(201).json({
                message:
                    'Compte élève créé avec succès.',
                token,
                user: newUser
            });
        }

    } catch (error) {

        // =====================================================
        // ROLLBACK SI TRANSACTION ACTIVE
        // =====================================================

        if (transactionActive) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error(
                    'Erreur rollback :',
                    rollbackError
                );
            }
        }

        console.error(
            'Erreur inscription :',
            error
        );

        return res.status(500).json({
            message:
                'Erreur interne du serveur.'
        });

    } finally {
        client.release();
    }
});


// =============================================================
// CONNEXION
// =============================================================

router.post('/login', async (req, res) => {
    try {

        const {
            email,
            password
        } = req.body;

        // =====================================================
        // 1. VÉRIFICATION
        // =====================================================

        if (!email || !password) {
            return res.status(400).json({
                message:
                    'Email ou mot de passe obligatoires.'
            });
        }

        const emailConnexion =
            email.trim();

        // =====================================================
        // 2. RECHERCHER L'UTILISATEUR
        // =====================================================

        const result = await pool.query(
            `SELECT
                id,
                role,
                prenom,
                nom,
                email,
                password_hash,
                classe,
                date_naissance
             FROM users
             WHERE LOWER(email) =
                   LOWER($1)`,
            [emailConnexion]
        );

        // =====================================================
        // 3. UTILISATEUR INTROUVABLE
        // =====================================================

        if (result.rows.length === 0) {
            return res.status(401).json({
                message:
                    'Email ou mot de passe incorrect.'
            });
        }

        const user =
            result.rows[0];

        // =====================================================
        // 4. VÉRIFIER LE MOT DE PASSE
        // =====================================================

        const passwordCorrect =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if (!passwordCorrect) {
            return res.status(401).json({
                message:
                    'Email ou mot de passe incorrect.'
            });
        }

        // =====================================================
        // 5. CRÉER LE TOKEN
        // =====================================================

        const token =
            jwt.sign(
                {
                    id: user.id,
                    role: user.role
                },
                process.env.JWT_SECRET as string,
                {
                    expiresIn: '1h'
                }
            );

        // =====================================================
        // 6. RÉPONSE
        // =====================================================

        return res.json({
            message:
                user.role === 'admin'
                    ? 'Connexion administrateur réussie.'
                    : 'Connexion réussie.',
            token,
            user: {
                id: user.id,
                role: user.role,
                nom: user.nom,
                prenom: user.prenom,
                email: user.email,
                classe: user.classe,
                date_naissance:
                    user.date_naissance
            }
        });

    } catch (error) {

        console.error(
            'Erreur connexion :',
            error
        );

        return res.status(500).json({
            message:
                'Erreur interne du serveur.'
        });
    }
});


// =============================================================
// MON PROFIL
// =============================================================

router.get(
    '/me',
    requireAuth,
    async (req: AuthRequest, res) => {

        try {

            // =================================================
            // RÉCUPÉRER L'UTILISATEUR
            // =================================================

            const result =
                await pool.query(
                    `SELECT
                        id,
                        role,
                        prenom,
                        nom,
                        email,
                        classe,
                        date_naissance
                     FROM users
                     WHERE id = $1`,
                    [req.user!.id]
                );

            if (
                result.rows.length === 0
            ) {
                return res.status(404).json({
                    message:
                        'Utilisateur introuvable.'
                });
            }

            return res.json({
                user:
                    result.rows[0]
            });

        } catch (error) {

            console.error(
                'Erreur récupération profil :',
                error
            );

            return res.status(500).json({
                message:
                    'Erreur interne du serveur.'
            });
        }
    }
);


export default router;