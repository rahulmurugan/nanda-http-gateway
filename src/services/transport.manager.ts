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
const { EventSource } = require('eventsource');
import WebSocket from 'ws';
import { ToolDefinition, EVMAuthSession } from '../types';
import { logger } from '../utils/logger';
import { AppError } from '../api/middleware/error.middleware';

// Transport connection parameters
interface ConnectParams {
  endpoint: string;
  transport: 'http' | 'websocket' | 'sse' | 'streamable-http';
  timeout: number;
  evmAuth?: EVMAuthSession;
  connectionId?: string; // Optional - if not provided, will generate one
}

// Transport connection instance
interface TransportConnection {
  id: string;
  endpoint: string;
  transport: string;
  client?: AxiosInstance; // For HTTP transport
  eventSource?: EventSource; // For SSE transport
  sseMessageQueue?: any[]; // Queue for SSE messages
  sseResponseHandlers?: Map<string, (result: any) => void>; // Response handlers for SSE
  websocket?: WebSocket; // For WebSocket transport
  wsMessageQueue?: any[]; // Queue for WebSocket messages
  wsResponseHandlers?: Map<string, (result: any) => void>; // Response handlers for WebSocket
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
    const connectionId = params.connectionId || Date.now().toString();
    
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
          connection.websocket = await this.connectWebSocket(params);
          connection.wsMessageQueue = [];
          connection.wsResponseHandlers = new Map();
          break;
          
        case 'sse':
          connection.eventSource = await this.connectSSE(params);
          connection.sseMessageQueue = [];
          connection.sseResponseHandlers = new Map();
          break;
          
        case 'streamable-http':
          connection.client = await this.connectStreamableHTTP(params);
          break;
          
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
   * Establish Streamable HTTP connection to MCP server
   */
  private async connectStreamableHTTP(params: ConnectParams): Promise<AxiosInstance> {
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

    // Test the connection with a simple request
    try {
      await client.post('/message', {
        method: 'ping',
        params: {}
      }, { timeout: 5000 });
      logger.info('Streamable HTTP transport health check passed', { endpoint: params.endpoint });
    } catch (error) {
      logger.warn('Streamable HTTP transport health check failed, proceeding anyway', { 
        endpoint: params.endpoint,
        error: error.message 
      });
    }

    return client;
  }

  /**
   * Establish WebSocket connection to MCP server
   */
  private async connectWebSocket(params: ConnectParams): Promise<WebSocket> {
    // Convert HTTP URL to WebSocket URL
    const wsUrl = params.endpoint
      .replace('https://', 'wss://')
      .replace('http://', 'ws://') + '/ws';
    
    logger.info('Establishing WebSocket connection', { url: wsUrl });
    
    const headers: any = {
      'User-Agent': 'NANDA-HTTP-Gateway/1.0.0'
    };
    
    // Add EVMAuth headers if available
    if (params.evmAuth) {
      headers['X-Wallet-Address'] = params.evmAuth.walletAddress;
      headers['X-Contract-Address'] = params.evmAuth.contractAddress;
      headers['X-Token-ID'] = params.evmAuth.tokenId;
    }
    
    const ws = new WebSocket(wsUrl, { headers });
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, params.timeout);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        logger.info('WebSocket connection established', { url: wsUrl });
        resolve(ws);
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        logger.error('WebSocket connection error', { url: wsUrl, error });
        reject(new Error(`WebSocket connection failed: ${error.message}`));
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          logger.info('WebSocket message received', { type: message.type });
          // Handle message routing here
        } catch (error) {
          logger.error('WebSocket message parse error', { error });
        }
      });
    });
  }

  /**
   * Establish SSE connection to MCP server
   */
  private async connectSSE(params: ConnectParams): Promise<EventSource> {
    const baseUrl = params.endpoint.endsWith('/') ? params.endpoint.slice(0, -1) : params.endpoint;
    const sseUrl = `${baseUrl}/sse`;
    
    logger.info('Establishing SSE connection', { 
      url: sseUrl, 
      eventSourceType: typeof EventSource,
      isConstructor: typeof EventSource === 'function'
    });
    
    // First, test if the endpoint is reachable with a simple HTTP GET
    try {
      const testResponse = await axios.get(sseUrl, { 
        timeout: 5000,
        responseType: 'stream',
        headers: {
          'Accept': 'text/event-stream',
          'User-Agent': 'NANDA-HTTP-Gateway/1.0.0'
        }
      });
      logger.info('SSE endpoint is reachable', { status: testResponse.status });
      testResponse.data.destroy(); // Close the stream
    } catch (testError) {
      logger.error('SSE endpoint test failed', { error: testError.message });
      throw new Error(`SSE endpoint not reachable: ${testError.message}`);
    }
    
    const options: any = {
      headers: {
        'User-Agent': 'NANDA-HTTP-Gateway/1.0.0',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    };
    
    // Add EVMAuth headers if available
    if (params.evmAuth) {
      options.headers['X-Wallet-Address'] = params.evmAuth.walletAddress;
      options.headers['X-Contract-Address'] = params.evmAuth.contractAddress;
      options.headers['X-Token-ID'] = params.evmAuth.tokenId;
    }
    
    logger.info('Creating EventSource with options', { options });
    const eventSource = new EventSource(sseUrl, options);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.warn('SSE connection timeout, resolving anyway');
        resolve(eventSource);
      }, 8000);
      
      eventSource.onopen = () => {
        clearTimeout(timeout);
        logger.info('SSE onopen triggered');
        resolve(eventSource);
      };
      
      // Listen for any event type
      const messageHandler = (event: any) => {
        logger.info('SSE event received', { 
          type: event.type, 
          data: event.data ? event.data.substring(0, 100) : 'no data' 
        });
        clearTimeout(timeout);
        eventSource.removeEventListener('message', messageHandler);
        resolve(eventSource);
      };
      
      eventSource.addEventListener('message', messageHandler);
      
      eventSource.onerror = (error: any) => {
        logger.error('SSE error event', { 
          error: error,
          readyState: eventSource.readyState,
          url: eventSource.url 
        });
        
        // Don't reject immediately, SSE often has connection errors but recovers
        setTimeout(() => {
          if (eventSource.readyState === EventSource.CONNECTING || eventSource.readyState === EventSource.OPEN) {
            logger.info('SSE connection recovered, resolving');
            clearTimeout(timeout);
            resolve(eventSource);
          }
        }, 2000);
      };
    });
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
          
        case 'sse':
          return await this.discoverSSETools(connection);
          
        case 'websocket':
          return await this.discoverWebSocketTools(connection);
          
        case 'streamable-http':
          return await this.discoverStreamableHTTPTools(connection);
          
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
   * Discover tools via SSE transport
   */
  private async discoverSSETools(connection: TransportConnection): Promise<ToolDefinition[]> {
    if (!connection.eventSource) {
      throw new Error('SSE connection not initialized');
    }
    
    // For the calculator and currency converter, tools are hardcoded
    // since SSE doesn't support bidirectional communication
    if (connection.endpoint.includes('3.133.113.164')) {
      // Currency converter
      return [{
        name: 'convert_currency',
        description: 'Convert an amount from one currency to another',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Source currency code' },
            to: { type: 'string', description: 'Target currency code' },
            amount: { type: 'number', description: 'Amount to convert' }
          },
          required: ['from', 'to', 'amount']
        }
      }];
    } else if (connection.endpoint.includes('awsapprunner.com')) {
      // Calculator
      return [
        {
          name: 'add',
          description: 'Add two numbers',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' }
            },
            required: ['a', 'b']
          }
        },
        {
          name: 'multiply',
          description: 'Multiply two numbers',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' }
            },
            required: ['a', 'b']
          }
        }
      ];
    }
    
    // For other SSE servers, we'd need to wait for them to send tools
    return [];
  }

  /**
   * Send a message over SSE (this is a challenge since SSE is server->client only)
   * For true bidirectional communication, we'd need to POST to a separate endpoint
   * or use WebSocket instead
   */
  private sendSSEMessage(connection: TransportConnection, message: any): void {
    logger.warn('SSE is server-to-client only. Cannot send messages directly.');
    // In a real implementation, we'd need to POST to a separate endpoint
    // or the SSE server would need to automatically send tools on connection
  }

  /**
   * Discover tools via WebSocket transport
   */
  private async discoverWebSocketTools(connection: TransportConnection): Promise<ToolDefinition[]> {
    if (!connection.websocket) {
      throw new Error('WebSocket connection not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket tool discovery timeout'));
      }, 10000);
      
      const messageHandler = (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          logger.info('WebSocket tool discovery message', { type: message.type });
          
          if (message.type === 'response' && message.method === 'tools/list') {
            clearTimeout(timeout);
            connection.websocket!.removeListener('message', messageHandler);
            
            const tools = message.result?.tools || [];
            resolve(tools.map((tool: any) => ({
              name: tool.name,
              description: tool.description || `${tool.name} tool`,
              inputSchema: tool.inputSchema || tool.input_schema || {
                type: 'object',
                properties: {},
                required: []
              }
            })));
          } else if (message.type === 'error') {
            clearTimeout(timeout);
            connection.websocket!.removeListener('message', messageHandler);
            reject(new Error(`WebSocket tool discovery error: ${message.error?.message || 'Unknown error'}`));
          }
        } catch (error) {
          logger.error('WebSocket tool discovery parse error', { error });
        }
      };
      
      connection.websocket.on('message', messageHandler);
      
      // Send tools/list request
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list',
        params: {}
      };
      
      connection.websocket.send(JSON.stringify(request));
    });
  }

  /**
   * Discover tools via Streamable HTTP transport
   */
  private async discoverStreamableHTTPTools(connection: TransportConnection): Promise<ToolDefinition[]> {
    if (!connection.client) {
      throw new Error('Streamable HTTP client not initialized');
    }

    try {
      // Send tools/list request using Streamable HTTP format
      const response = await connection.client.post('/message', {
        method: 'tools/list',
        params: {}
      });
      
      const tools = response.data?.tools || [];
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
      logger.error('Streamable HTTP tool discovery failed', { 
        error: error.message,
        endpoint: connection.endpoint
      });
      return [];
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
          
        case 'sse':
          return await this.executeSSETool(connection, toolName, parameters);
          
        case 'websocket':
          return await this.executeWebSocketTool(connection, toolName, parameters);
          
        case 'streamable-http':
          return await this.executeStreamableHTTPTool(connection, toolName, parameters);
          
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
   * Execute tool via SSE transport
   */
  private async executeSSETool(connection: TransportConnection, toolName: string, parameters: any): Promise<any> {
    if (!connection.eventSource) {
      throw new Error('SSE connection not initialized');
    }
    
    // Since SSE is server-to-client only, try HTTP POST as fallback
    const baseUrl = connection.endpoint.replace('/sse', '');
    
    logger.info('Attempting SSE tool execution via HTTP POST fallback', { 
      toolName, 
      baseUrl 
    });
    
    try {
      // Try standard MCP call endpoint
      const response = await axios.post(`${baseUrl}/call`, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: parameters
        }
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'NANDA-HTTP-Gateway/1.0.0'
        }
      });
      
      if (response.data.error) {
        throw new Error(response.data.error.message || 'Tool execution failed');
      }
      
      return response.data.result;
      
    } catch (error) {
      logger.warn('HTTP POST fallback failed, trying alternative endpoints', { 
        error: error.message 
      });
      
      // Try alternative endpoints
      const endpoints = [
        `${baseUrl}/tools/${toolName}`,
        `${baseUrl}/execute`,
        `${baseUrl}/tool`
      ];
      
      for (const endpoint of endpoints) {
        try {
          const response = await axios.post(endpoint, {
            parameters,
            tool: toolName,
            arguments: parameters
          }, {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'NANDA-HTTP-Gateway/1.0.0'
            }
          });
          
          logger.info('Alternative endpoint succeeded', { endpoint });
          return response.data;
          
        } catch (altError) {
          logger.debug('Alternative endpoint failed', { 
            endpoint, 
            error: altError.message 
          });
          continue;
        }
      }
      
      throw new AppError(501, 'SSE tool execution failed - no working HTTP endpoints found', 'SSE_EXECUTION_LIMITED');
    }
  }

  /**
   * Execute tool via WebSocket transport
   */
  private async executeWebSocketTool(connection: TransportConnection, toolName: string, parameters: any): Promise<any> {
    if (!connection.websocket) {
      throw new Error('WebSocket connection not initialized');
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket tool execution timeout'));
      }, 30000);
      
      const requestId = Date.now();
      
      const messageHandler = (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.id === requestId) {
            clearTimeout(timeout);
            connection.websocket!.removeListener('message', messageHandler);
            
            if (message.error) {
              reject(new Error(`Tool execution error: ${message.error.message || 'Unknown error'}`));
            } else {
              resolve(message.result);
            }
          }
        } catch (error) {
          logger.error('WebSocket tool execution parse error', { error });
        }
      };
      
      connection.websocket.on('message', messageHandler);
      
      // Send tool execution request
      const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: parameters
        }
      };
      
      connection.websocket.send(JSON.stringify(request));
    });
  }

  /**
   * Execute tool via Streamable HTTP transport
   */
  private async executeStreamableHTTPTool(connection: TransportConnection, toolName: string, parameters: any): Promise<any> {
    if (!connection.client) {
      throw new Error('Streamable HTTP client not initialized');
    }

    try {
      // Send tool execution request using Streamable HTTP format
      const response = await connection.client.post('/message', {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: parameters
        }
      });

      if (response.data.error) {
        throw new Error(response.data.error.message || 'Tool execution failed');
      }

      return response.data.result;
    } catch (error) {
      logger.error('Streamable HTTP tool execution failed', {
        toolName,
        error: error.message,
        endpoint: connection.endpoint
      });
      throw new Error(`Streamable HTTP tool execution failed: ${error.message}`);
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
        if (connection.websocket) {
          connection.websocket.close();
          logger.info('WebSocket connection closed', { connectionId });
        }
        break;
        
      case 'sse':
        if (connection.eventSource) {
          connection.eventSource.close();
          logger.info('SSE connection closed', { connectionId });
        }
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