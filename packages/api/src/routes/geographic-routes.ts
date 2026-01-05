import { Router } from 'express';
import {
  searchLocationsHandler,
  getRegionsHandler,
  getCommunesHandler,
  getLocationHandler,
  getAllCommunesHandler
} from '../controllers/geographic-controller';

const router = Router();

// Public routes (no authentication required for geographic data)
router.get('/search', searchLocationsHandler);
router.get('/communes', getAllCommunesHandler);
router.get('/countries/:countryCode/regions', getRegionsHandler);
router.get('/regions/:regionId/communes', getCommunesHandler);
router.get('/locations/:communeId', getLocationHandler);

export default router;




