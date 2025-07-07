/**
 * Connections Controller
 * 
 * Handles all connection-related operations after connections are established.
 * 
 * Key Operations:
 * - List active connections
 * - Get connection details and available tools
 * - Execute tools on connected services
 * - Close and cleanup connections
 * 
 * This controller works with connections that have already been created
 * through the services endpoints and may have EVMAuth already verified.
 */

import { Request, Response } from 'express';
import { ConnectionManager } from '../../services/connection.manager';
import { logger } from '../../utils/logger';
import { AppError } from '../middleware/error.middleware';

export class ConnectionsController {
  private connectionManager: ConnectionManager;

  constructor() {
    this.connectionManager = ConnectionManager.getInstance();
  }

  /**
   * List all active connections
   * Optional query parameter: userId for user-specific connections
   */
  async listConnections(req: Request, res: Response): Promise<void> {
    const { userId } = req.query;

    const connections = this.connectionManager.listConnections(userId as string);
    const stats = this.connectionManager.getStats();

    res.json({
      success: true,
      data: {
        connections: connections.map(conn => ({
          id: conn.id,
          serviceId: conn.serviceId,
          serviceName: conn.serviceName,
          state: conn.state,
          transport: conn.transport,
          evmAuth: conn.evmAuth ? {
            walletAddress: conn.evmAuth.walletAddress,
            verified: conn.evmAuth.verified,
            verifiedAt: conn.evmAuth.verifiedAt
          } : undefined,
          tools: conn.metadata.tools.map(tool => tool.name),
          createdAt: conn.createdAt,
          lastUsed: conn.lastUsed
        })),
        stats
      }
    });
  }

  /**
   * Get details of a specific connection
   */
  async getConnection(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;

    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {
      throw new AppError(404, 'Connection not found', 'CONNECTION_NOT_FOUND');
    }

    res.json({
      success: true,
      data: {
        id: connection.id,
        serviceId: connection.serviceId,
        serviceName: connection.serviceName,
        state: connection.state,
        transport: connection.transport,
        endpoint: connection.endpoint,
        evmAuth: connection.evmAuth ? {
          walletAddress: connection.evmAuth.walletAddress,
          contractAddress: connection.evmAuth.contractAddress,
          tokenId: connection.evmAuth.tokenId,
          verified: connection.evmAuth.verified,
          verifiedAt: connection.evmAuth.verifiedAt,
          expiresAt: connection.evmAuth.expiresAt
        } : undefined,
        tools: connection.metadata.tools,
        capabilities: connection.metadata.capabilities,
        createdAt: connection.createdAt,
        lastUsed: connection.lastUsed
      }
    });
  }

  /**
   * Close a connection and cleanup resources
   */
  async closeConnection(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;

    await this.connectionManager.closeConnection(connectionId);

    res.json({
      success: true,
      message: 'Connection closed successfully',
      data: {
        connectionId,
        closedAt: new Date()
      }
    });
  }

  /**
   * Execute a tool on a connected service
   * This is where the actual tool calls happen after EVMAuth verification
   */
  async executeTool(req: Request, res: Response): Promise<void> {
    const { connectionId, toolName } = req.params;
    const { parameters, timeout, stream } = req.body;

    logger.info('Tool execution requested', {
      connectionId,
      toolName,
      parametersProvided: Object.keys(parameters || {}).length > 0,
      stream
    });

    try {
      // Get connection to verify it exists and is ready
      const connection = this.connectionManager.getConnection(connectionId);
      if (!connection) {
        throw new AppError(404, 'Connection not found', 'CONNECTION_NOT_FOUND');
      }

      if (connection.state !== 'connected') {
        throw new AppError(400, 'Connection not ready for tool execution', 'CONNECTION_NOT_READY');
      }

      // Check if the tool exists
      const toolExists = connection.metadata.tools.some(tool => tool.name === toolName);
      if (!toolExists) {
        throw new AppError(404, `Tool '${toolName}' not found on this service`, 'TOOL_NOT_FOUND', {
          availableTools: connection.metadata.tools.map(t => t.name)
        });
      }

      // Execute the tool
      const startTime = Date.now();
      const result = await this.connectionManager.executeTool(
        connectionId,
        toolName,
        parameters || {}
      );
      const executionTime = Date.now() - startTime;

      logger.info('Tool execution completed', {
        connectionId,
        toolName,
        executionTime,
        success: true
      });

      res.json({
        success: true,
        data: {
          connectionId,
          toolName,
          result,
          metadata: {
            executionTime,
            executedAt: new Date(),
            serviceId: connection.serviceId,
            serviceName: connection.serviceName
          }
        }
      });

    } catch (error) {
      logger.error('Tool execution failed', {
        connectionId,
        toolName,
        error: error.message
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        500,
        `Tool execution failed: ${error.message}`,
        'TOOL_EXECUTION_ERROR',
        { connectionId, toolName }
      );
    }
  }
}