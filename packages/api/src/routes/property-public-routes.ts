import { Router } from 'express';
import { getPublishedPropertiesHandler, getPublishedPropertyHandler } from '../controllers/property-public-controller';

const router = Router();

// Public routes (no authentication required)
router.get('/public/properties', getPublishedPropertiesHandler);
router.get('/public/properties/:id', getPublishedPropertyHandler);

export default router;




