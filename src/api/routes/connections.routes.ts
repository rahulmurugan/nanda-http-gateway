/**
 * Connections Routes
 * 
 * These routes handle managing connections to MCP servers and executing tools.
 * 
 * Endpoints:
 * - GET /connections - List all active connections
 * - GET /connections/:id - Get specific connection details
 * - DELETE /connections/:id - Close a connection
 * - POST /connections/:id/tools/:toolName/execute - Execute a tool
 * 
 * All connection endpoints are public (no auth required).
 * EVMAuth is handled during the connection creation process in services routes.
 */

import { Router } from 'express';
import { ConnectionsController } from '../controllers/connections.controller';
import { asyncHandler } from '../middleware/async.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { executeToolSchema } from '../validators/connections.validator';

const router = Router();
const connectionsController = new ConnectionsController();

// List active connections
router.get(
  '/',
  asyncHandler(connectionsController.listConnections.bind(connectionsController))
);

// Get specific connection details
router.get(
  '/:connectionId',
  asyncHandler(connectionsController.getConnection.bind(connectionsController))
);

// Close a connection
router.delete(
  '/:connectionId',
  asyncHandler(connectionsController.closeConnection.bind(connectionsController))
);

// Execute a tool on a connection
router.post(
  '/:connectionId/tools/:toolName/execute',
  validateRequest(executeToolSchema, 'body'),
  asyncHandler(connectionsController.executeTool.bind(connectionsController))
);

export default router;