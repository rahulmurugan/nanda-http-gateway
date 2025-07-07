import { Router } from 'express';
import { ServicesController } from '../controllers/services.controller';
import { asyncHandler } from '../middleware/async.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { searchServicesSchema, connectServiceSchema } from '../validators/services.validator';

const router = Router();
const servicesController = new ServicesController();

// Public endpoints (no auth required)
router.get(
  '/search',
  validateRequest(searchServicesSchema, 'query'),
  asyncHandler(servicesController.searchServices.bind(servicesController))
);

router.get(
  '/popular',
  asyncHandler(servicesController.getPopularServices.bind(servicesController))
);

router.get(
  '/:serviceId',
  asyncHandler(servicesController.getServiceById.bind(servicesController))
);

router.get(
  '/:serviceId/tools',
  asyncHandler(servicesController.getServiceTools.bind(servicesController))
);

// Connection endpoint (EVMAuth will be handled in the connection process)
router.post(
  '/:serviceId/connect',
  validateRequest(connectServiceSchema, 'body'),
  asyncHandler(servicesController.connectToService.bind(servicesController))
);

export default router;