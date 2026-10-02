import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config();

console.log(
  'Cloudinary Cloud Name:',
  process.env.CLOUDINARY_CLOUD_NAME
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

cloudinary.api.ping()
  .then((result) => {
    console.log('✅ Cloudinary connecté :', result.status);
  })
  .catch((error) => {
    console.error('❌ Cloudinary ping échoué :', error);
  });

export default cloudinary;