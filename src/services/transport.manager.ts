/**
 * Transport Manager
 * 
 * This service manages different transport protocols for connecting to MCP servers.
 * 
 * Purpose:
 * - Handle multiple transport types (HTTP, WebSocket, SSE, streamable-http)
 * - Abstract transport-specific details from connection manager
 * - Provide unified interface for tool execution
 * - Manage transport lifecycle (connect, disconnect, health checks)
 * 
 * Supported Transports:
 * - HTTP: Standard REST API calls
 * - WebSocket: Bidirectional real-time communication
 * - SSE: Server-sent events for streaming
 * - streamable-http: HTTP with streaming response
 * 
 * This is a simplified implementation that focuses on HTTP transport first.
 * WebSocket and SSE support can be added later as needed.
 */

import axios, { AxiosInstance } from 'axios';
import { ToolDefinition, EVMAuthSession } from '../types';
import { logger } from '../utils/logger';
import { AppError } from '../api/middleware/error.middleware';

// Transport connection parameters
interface ConnectParams {
  endpoint: string;
  transport: 'http' | 'websocket' | 'sse' | 'streamable-http';
  timeout: number;
  evmAuth?: EVMAuthSession;
}

// Transport connection instance
interface TransportConnection {
  id: string;
  endpoint: string;
  transport: string;
  client?: AxiosInstance; // For HTTP transport
  // websocket?: WebSocket; // For WebSocket transport
  // eventSource?: EventSource; // For SSE transport
}

export class TransportManager {
  private static instance: TransportManager;
  private connections: Map<string, TransportConnection> = new Map();

  private constructor() {
    logger.info('Transport Manager initialized');
  }

  static getInstance(): TransportManager {
    if (!TransportManager.instance) {
      TransportManager.instance = new TransportManager();
    }
    return TransportManager.instance;
  }

  /**
   * Connect to a service using specified transport
   * Currently implements HTTP transport, with stubs for others
   * 
   * @param params - Connection parameters
   * @returns Promise that resolves to transport connection
   */
  async connect(params: ConnectParams): Promise<TransportConnection> {
    const connectionId = Date.now().toString();
    
    logger.info('Establishing transport connection', {
      connectionId,
      transport: params.transport,
      endpoint: params.endpoint
    });

    const connection: TransportConnection = {
      id: connectionId,
      endpoint: params.endpoint,
      transport: params.transport
    };

    try {
      switch (params.transport) {
        case 'http':
          connection.client = await this.connectHTTP(params);
          break;
          
        case 'websocket':
          // TODO: Implement WebSocket connection
          throw new AppError(501, 'WebSocket transport not yet implemented', 'TRANSPORT_NOT_IMPLEMENTED');
          
        case 'sse':
          // TODO: Implement SSE connection
          throw new AppError(501, 'SSE transport not yet implemented', 'TRANSPORT_NOT_IMPLEMENTED');
          
        case 'streamable-http':
          // TODO: Implement streamable HTTP
          throw new AppError(501, 'Streamable HTTP transport not yet implemented', 'TRANSPORT_NOT_IMPLEMENTED');
          
        default:
          throw new AppError(400, `Unsupported transport: ${params.transport}`, 'UNSUPPORTED_TRANSPORT');
      }

      this.connections.set(connectionId, connection);
      
      logger.info('Transport connection established', {
        connectionId,
        transport: params.transport
      });

      return connection;

    } catch (error) {
      logger.error('Transport connection failed', {
        connectionId,
        transport: params.transport,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Establish HTTP connection to MCP server
   */
  private async connectHTTP(params: ConnectParams): Promise<AxiosInstance> {
    const client = axios.create({
      baseURL: params.endpoint,
      timeout: params.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NANDA-HTTP-Gateway/1.0.0'
      }
    });

    // Add EVMAuth headers if available
    if (params.evmAuth) {
      client.defaults.headers['X-Wallet-Address'] = params.evmAuth.walletAddress;
      client.defaults.headers['X-Contract-Address'] = params.evmAuth.contractAddress;
      client.defaults.headers['X-Token-ID'] = params.evmAuth.tokenId;
    }

    // Test the connection
    try {
      await client.get('/health', { timeout: 5000 });
      logger.info('HTTP transport health check passed', { endpoint: params.endpoint });
    } catch (error) {
      logger.warn('HTTP transport health check failed, proceeding anyway', { 
        endpoint: params.endpoint,
        error: error.message 
      });
    }

    return client;
  }

  /**
   * Discover tools from connected service
   * For HTTP transport, this typically calls a tools/list endpoint
   * 
   * @param connection - Transport connection
   * @returns Promise that resolves to list of available tools
   */
  async discoverTools(connection: TransportConnection): Promise<ToolDefinition[]> {
    logger.info('Discovering tools', { 
      connectionId: connection.id,
      transport: connection.transport 
    });

    try {
      switch (connection.transport) {
        case 'http':
          return await this.discoverHTTPTools(connection);
          
        default:
          throw new AppError(501, `Tool discovery not implemented for ${connection.transport}`, 'DISCOVERY_NOT_IMPLEMENTED');
      }
    } catch (error) {
      logger.error('Tool discovery failed', {
        connectionId: connection.id,
        error: error.message
      });
      
      // Return known tools for Starbucks service as fallback
      if (connection.endpoint.includes('railway.app')) {
        return this.getStarbucksTools();
      }
      
      throw new AppError(500, 'Failed to discover tools', 'TOOL_DISCOVERY_FAILED');
    }
  }

  /**
   * Discover tools via HTTP transport
   */
  private async discoverHTTPTools(connection: TransportConnection): Promise<ToolDefinition[]> {
    if (!connection.client) {
      throw new Error('HTTP client not initialized');
    }

    try {
      // Try standard MCP tools list endpoint
      const response = await connection.client.post('/call', {
        method: 'tools/list',
        params: {}
      });
      
      const tools = response.data?.result?.tools || response.data?.tools || [];
      return tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || `${tool.name} tool`,
        inputSchema: tool.inputSchema || tool.input_schema || {
          type: 'object',
          properties: {},
          required: []
        }
      }));
    } catch (error) {
      logger.warn('Standard MCP tools/list failed, trying alternative', { error: error.message });
      
      try {
        // Try alternative tools endpoint
        const response = await connection.client.get('/tools');
        const tools = response.data.tools || response.data || [];
        return Array.isArray(tools) ? tools : [];
      } catch (altError) {
        logger.warn('Alternative tools endpoint failed, using service-specific fallback', { 
          error: altError.message,
          endpoint: connection.endpoint
        });
        
        // Return known tools for Starbucks service as fallback
        if (connection.endpoint.includes('railway.app')) {
          return this.getStarbucksTools();
        }
        
        return [];
      }
    }
  }

  /**
   * Execute a tool on the connected service
   * 
   * @param connectionId - Connection ID
   * @param toolName - Name of the tool to execute
   * @param parameters - Tool parameters
   * @returns Promise that resolves to tool execution result
   */
  async executeTool(connectionId: string, toolName: string, parameters: any): Promise<any> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new AppError(404, 'Transport connection not found', 'CONNECTION_NOT_FOUND');
    }

    logger.info('Executing tool', {
      connectionId,
      toolName,
      parameters
    });

    try {
      switch (connection.transport) {
        case 'http':
          return await this.executeHTTPTool(connection, toolName, parameters);
          
        default:
          throw new AppError(501, `Tool execution not implemented for ${connection.transport}`, 'EXECUTION_NOT_IMPLEMENTED');
      }
    } catch (error) {
      logger.error('Tool execution failed', {
        connectionId,
        toolName,
        error: error.message
      });
      
      throw new AppError(500, `Tool execution failed: ${error.message}`, 'TOOL_EXECUTION_FAILED');
    }
  }

  /**
   * Execute tool via HTTP transport
   */
  private async executeHTTPTool(connection: TransportConnection, toolName: string, parameters: any): Promise<any> {
    if (!connection.client) {
      throw new Error('HTTP client not initialized');
    }

    try {
      // Try standard MCP tool execution endpoint
      const response = await connection.client.post(`/call`, {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: parameters
        }
      });

      return response.data;
    } catch (error) {
      logger.warn('Standard MCP endpoint failed, trying alternative', { toolName, error: error.message });
      
      // Try alternative endpoint format
      try {
        const response = await connection.client.post(`/tools/${toolName}`, {
          parameters
        });
        return response.data;
      } catch (altError) {
        logger.error('Both tool execution endpoints failed', { 
          toolName, 
          standardError: error.message,
          altError: altError.message 
        });
        throw new Error(`Tool execution failed: ${error.message}`);
      }
    }
  }

  /**
   * Disconnect transport connection
   */
  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return; // Already disconnected
    }

    logger.info('Disconnecting transport', {
      connectionId,
      transport: connection.transport
    });

    // Cleanup based on transport type
    switch (connection.transport) {
      case 'http':
        // HTTP connections are stateless, nothing to cleanup
        break;
        
      case 'websocket':
        // TODO: Close WebSocket
        break;
        
      case 'sse':
        // TODO: Close EventSource
        break;
    }

    this.connections.delete(connectionId);
  }

  /**
   * Get known tools for Starbucks service (fallback)
   */
  private getStarbucksTools(): ToolDefinition[] {
    return [
      {
        name: 'requestinfo',
        description: 'Get Starbucks company information with EVMAuth verification on Radius blockchain',
        inputSchema: {
          type: 'object',
          properties: {
            walletAddress: {
              type: 'string',
              description: 'Radius wallet address for EVMAuth authentication'
            },
            contractAddress: {
              type: 'string',
              description: 'EVMAuth contract address on Radius blockchain'
            },
            tokenId: {
              type: 'string',
              description: 'Token ID for authentication'
            },
            category: {
              type: 'string',
              enum: ['overview', 'focus', 'investment', 'contact', 'all'],
              description: 'Information category to retrieve',
              default: 'all'
            }
          },
          required: ['walletAddress']
        }
      }
    ];
  }
}