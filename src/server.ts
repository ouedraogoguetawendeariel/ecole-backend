import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import { initDb } from './db';

import authRoutes from './routes/auth';
import childrenRoutes from './routes/children';
import uploadRoutes from './routes/upload';
import emploiDuTempsRoutes from './routes/emploiDuTemps';
import actualitesRoutes from './routes/actualites';
import adminRoutes from './routes/admin';
import notesRoutes from './routes/notes';
import bulletinsRoutes from './routes/bulletins';
import devoirsRoutes from './routes/devoirs';
import absencesRoutes from './routes/absences';
import anneesScolairesRoutes from './routes/anneesScolaires';
import statistiquesRoutes from './routes/statistiques';

const app = express();

app.use(cors());
app.use(express.json());

// Dossier public pour les fichiers téléchargés
app.use('/uploads', express.static('uploads'));

// ============================================================
// ROUTES API
// ============================================================

app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/emploiDuTemps', emploiDuTempsRoutes);
app.use('/api/actualites', actualitesRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/bulletins', bulletinsRoutes);
app.use('/api/devoirs', devoirsRoutes);
app.use('/api/absences', absencesRoutes);
app.use('/api/anneesScolaires', anneesScolairesRoutes);

// Ancienne route conservée pour compatibilité
app.use('/api/annees-scolaires', anneesScolairesRoutes);

app.use('/api/statistiques', statistiquesRoutes);

// ============================================================
// SERVEUR
// ============================================================

const PORT = process.env.PORT || 5000;

app.get('/', (_req, res) => {
    res.json({
        message: 'Serveur de l\'école opérationnel 🚀'
    });
});

// ============================================================
// INITIALISATION BASE DE DONNÉES
// ============================================================

initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(
                `Serveur démarré sur http://localhost:${PORT}`
            );
        });
    })
    .catch((err) => {
        console.error(
            'Erreur de connexion à la base de données :',
            err
        );
    });