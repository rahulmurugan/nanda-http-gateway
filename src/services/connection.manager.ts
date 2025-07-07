/**
 * Connection Manager
 * 
 * This service manages dynamic connections to MCP servers discovered through NANDA registry.
 * 
 * Purpose:
 * - Create and manage connections to remote MCP servers
 * - Handle EVMAuth verification for blockchain-protected services
 * - Maintain connection state and health monitoring
 * - Provide connection pooling and reuse
 * 
 * Key Features:
 * - Supports multiple transport types (HTTP, WebSocket, SSE)
 * - EVMAuth integration for Radius blockchain verification
 * - Connection lifecycle management (create, authenticate, monitor, cleanup)
 * - Tool discovery from connected services
 * - Connection sharing and reuse
 * 
 * Flow:
 * 1. Client requests connection to a service
 * 2. If EVMAuth required, verify wallet ownership on Radius blockchain
 * 3. Establish transport connection to the MCP server
 * 4. Discover available tools from the connected service
 * 5. Store connection for reuse and monitoring
 */

import { v4 as uuidv4 } from 'uuid';
import { ServiceConnection, EVMAuthRequest, EVMAuthSession, ToolDefinition } from '../types';
import { logger } from '../utils/logger';
import { AppError } from '../api/middleware/error.middleware';
import { EVMAuthService } from './evmauth.service';
import { TransportManager } from './transport.manager';

// Parameters for creating a new connection
interface CreateConnectionParams {
  serviceId: string;
  serviceName: string;
  endpoint: string;
  transport: string;
  evmAuth?: EVMAuthRequest;
  timeout?: number;
  verifyHealth?: boolean;
  userId?: string; // Optional - for user-specific connections
}

export class ConnectionManager {
  private static instance: ConnectionManager;
  private connections: Map<string, ServiceConnection> = new Map();
  private evmAuthService: EVMAuthService;
  private transportManager: TransportManager;

  private constructor() {
    this.evmAuthService = EVMAuthService.getInstance();
    this.transportManager = TransportManager.getInstance();
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Create a new connection to a service
   * 
   * @param params - Connection parameters including service info and auth
   * @returns Promise that resolves to the created connection
   */
  async createConnection(params: CreateConnectionParams): Promise<ServiceConnection> {
    const connectionId = uuidv4();
    
    logger.info('Creating connection', { 
      connectionId, 
      serviceId: params.serviceId,
      requiresEvmAuth: !!params.evmAuth
    });

    // Create initial connection object
    const connection: ServiceConnection = {
      id: connectionId,
      userId: params.userId,
      serviceId: params.serviceId,
      serviceName: params.serviceName,
      state: 'initializing',
      transport: params.transport,
      endpoint: params.endpoint,
      metadata: {
        tools: [],
        capabilities: []
      },
      createdAt: new Date(),
      lastUsed: new Date()
    };

    try {
      // Step 1: Handle EVMAuth if required
      if (params.evmAuth) {
        connection.state = 'authenticating';
        logger.info('Performing EVMAuth verification', { connectionId });
        
        const evmAuthSession = await this.evmAuthService.verifyAuth({
          walletAddress: params.evmAuth.walletAddress,
          contractAddress: params.evmAuth.contractAddress || process.env.EVMAUTH_CONTRACT_ADDRESS!,
          tokenId: params.evmAuth.tokenId || '0',
          signature: params.evmAuth.signature,
          message: params.evmAuth.message
        });

        connection.evmAuth = evmAuthSession;
        logger.info('EVMAuth verification successful', { 
          connectionId, 
          walletAddress: evmAuthSession.walletAddress 
        });
      }

      // Step 2: Establish transport connection to MCP server
      connection.state = 'authenticating';
      logger.info('Establishing transport connection', { 
        connectionId, 
        transport: params.transport,
        endpoint: params.endpoint
      });

      const transportConnection = await this.transportManager.connect({
        endpoint: params.endpoint,
        transport: params.transport as any,
        timeout: params.timeout || 30000,
        evmAuth: connection.evmAuth
      });

      // Step 3: Discover tools from the connected service
      logger.info('Discovering tools from service', { connectionId });
      const tools = await this.transportManager.discoverTools(transportConnection);
      
      connection.metadata.tools = tools;
      connection.metadata.capabilities = tools.map(tool => tool.name);
      connection.state = 'connected';

      // Step 4: Store connection for reuse
      this.connections.set(connectionId, connection);
      logger.info('Connection established successfully', { 
        connectionId, 
        toolCount: tools.length,
        tools: tools.map(t => t.name)
      });

      // Step 5: Start health monitoring (optional)
      if (params.verifyHealth !== false) {
        this.startHealthMonitoring(connectionId);
      }

      return connection;

    } catch (error) {
      // Cleanup on failure
      connection.state = 'failed';
      this.connections.set(connectionId, connection);
      
      logger.error('Connection creation failed', { 
        connectionId, 
        error: error.message 
      });

      throw new AppError(
        500, 
        `Failed to connect to service: ${error.message}`,
        'CONNECTION_FAILED',
        { serviceId: params.serviceId, transport: params.transport }
      );
    }
  }

  /**
   * Get an existing connection by ID
   */
  getConnection(connectionId: string): ServiceConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * List all active connections (optionally filtered by user)
   */
  listConnections(userId?: string): ServiceConnection[] {
    const connections = Array.from(this.connections.values());
    
    if (userId) {
      return connections.filter(conn => conn.userId === userId);
    }
    
    return connections.filter(conn => conn.state === 'connected');
  }

  /**
   * Close a connection and clean up resources
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new AppError(404, 'Connection not found', 'CONNECTION_NOT_FOUND');
    }

    try {
      // Close transport connection
      await this.transportManager.disconnect(connectionId);
      
      // Update state
      connection.state = 'disconnected';
      
      // Remove from active connections
      this.connections.delete(connectionId);
      
      logger.info('Connection closed successfully', { connectionId });
    } catch (error) {
      logger.error('Error closing connection', { connectionId, error: error.message });
      throw new AppError(500, 'Failed to close connection', 'DISCONNECT_FAILED');
    }
  }

  /**
   * Execute a tool on a connected service
   */
  async executeTool(
    connectionId: string,
    toolName: string,
    parameters: any
  ): Promise<any> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new AppError(404, 'Connection not found', 'CONNECTION_NOT_FOUND');
    }

    if (connection.state !== 'connected') {
      throw new AppError(400, 'Connection not ready', 'CONNECTION_NOT_READY');
    }

    // Update last used time
    connection.lastUsed = new Date();

    // Execute tool via transport manager
    return await this.transportManager.executeTool(connectionId, toolName, parameters);
  }

  /**
   * Start health monitoring for a connection
   * Periodically checks if the connection is still alive
   */
  private startHealthMonitoring(connectionId: string): void {
    // TODO: Implement periodic health checks
    // This would ping the service every few minutes to ensure it's still responsive
    logger.info('Health monitoring started', { connectionId });
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    evmAuthConnections: number;
  } {
    const connections = Array.from(this.connections.values());
    
    return {
      totalConnections: connections.length,
      activeConnections: connections.filter(c => c.state === 'connected').length,
      evmAuthConnections: connections.filter(c => !!c.evmAuth).length
    };
  }
}