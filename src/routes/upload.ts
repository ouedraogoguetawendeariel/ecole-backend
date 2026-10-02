import express from 'express';
import multer from 'multer';
import fs from 'fs';
import {
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import s3 from '../config/s3';
import { AuthRequest, requireAuth } from '../middleware/auth';

const upload = multer({ dest: 'uploads/' });
const router = express.Router();

router.post(
  '/upload-pdf',
  requireAuth,
  upload.single('pdf'),
  async (req: AuthRequest, res) => {
    try {
      // Vérifier que l'utilisateur est administrateur
      if (req.user?.role !== 'admin') {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        return res.status(403).json({
          message: 'Accès réservé à l’administrateur.',
        });
      }

      // Vérifier qu'un fichier a été envoyé
      if (!req.file) {
        return res.status(400).json({
          message: 'Aucun fichier fourni.',
        });
      }

      // Vérifier qu'il s'agit bien d'un PDF
      if (req.file.mimetype !== 'application/pdf') {
        fs.unlinkSync(req.file.path);

        return res.status(400).json({
          message: 'Seuls les fichiers PDF sont autorisés.',
        });
      }

      console.log('📄 Fichier reçu :', req.file.originalname);

      const fileBuffer = fs.readFileSync(req.file.path);

      const fileKey = `bulletins/${Date.now()}-${req.file.originalname}`;

      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: 'application/pdf',
      });

      await s3.send(command);

      console.log('✅ PDF envoyé vers SeaweedFS :', fileKey);

      // Supprimer le fichier temporaire
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.json({
        message: 'PDF envoyé avec succès.',
        key: fileKey,
      });

    } catch (error) {
      console.error('===== ERREUR SEAWEEDFS =====');
      console.error(error);
      console.error('============================');

      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(500).json({
        message: "Erreur lors de l'envoi du fichier.",
      });
    }
  }
);

export default router;