/**
 * ClientCommandActor - Handles command execution requests from UI
 */

export class ClientCommandActor {
  constructor() {
    this.isActor = true;
    this.messageQueue = [];
    this.pendingRequests = new Map();
    this.requestTimeout = 30000; // 30 seconds default
    this._requestCounter = 0;
  }

  /**
   * Receive and handle messages
   * @param {Object} message - Incoming message
   */
  receive(message) {
    switch (message.type) {
      case 'execute':
        this.handleExecute(message);
        break;
        
      case 'response':
        this.handleResponse(message);
        break;
        
      case 'connectionStateChanged':
        // Handle connection state changes
        this.handleConnectionStateChanged(message.payload);
        break;
        
      case 'serverConnected':
        // Handle server connection established
        console.log(`ClientCommandActor: Server connected - version ${message.payload?.version}`);
        if (message.payload?.connected) {
          this.flushQueue();
        }
        break;
        
      case 'sessionCreated':
        // Handle session creation
        console.log(`ClientCommandActor: Session created - ${message.payload?.sessionId}`);
        break;
        
      case 'toolsList':
        // Tools list received - command actor doesn't need to process this
        console.log(`ClientCommandActor: Tools list received with ${message.payload?.tools?.length || 0} tools`);
        break;
        
      case 'toolResult':
      case 'commandResult':
        // Handle command/tool results
        this.handleResponse({
          requestId: message.requestId,
          result: message.payload?.result
        });
        break;
        
      case 'toolError':
      case 'error':
        // Handle errors
        console.error(`ClientCommandActor: Error - ${message.payload?.error?.message || 'Unknown error'}`);
        if (message.requestId) {
          this.handleResponse({
            requestId: message.requestId,
            error: message.payload?.error
          });
        }
        break;
        
      default:
        // Log but don't warn - we're handling all messages now
        console.log(`ClientCommandActor: Received message type '${message.type}'`);
    }
  }

  /**
   * Handle connection state changes
   * @private
   */
  handleConnectionStateChanged(payload) {
    const wasConnected = this.isConnected();
    this._connected = payload?.connected || false;
    
    console.log(`ClientCommandActor: Connection state changed to ${this._connected ? 'connected' : 'disconnected'}`);
    
    // If we just connected, flush any queued messages
    if (!wasConnected && this._connected) {
      this.flushQueue();
    }
  }

  /**
   * Handle execute command message
   * @private
   */
  handleExecute(message) {
    const { tool, args, requestId } = message;
    
    if (!this.isConnected()) {
      this.messageQueue.push(message);
      return;
    }
    
    const outgoingMessage = {
      type: 'tool_execution',
      tool,
      args,
      requestId
    };
    
    // Track pending request
    const timeoutTimer = setTimeout(() => {
      this.handleTimeout(requestId, tool);
    }, this.requestTimeout);
    
    this.pendingRequests.set(requestId, {
      tool,
      timer: timeoutTimer,
      timestamp: Date.now()
    });
    
    // Send to server
    this.sendToServer(outgoingMessage);
  }

  /**
   * Handle response from server
   * @private
   */
  handleResponse(message) {
    const { requestId, result } = message;
    
    // Clear pending request
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
    }
    
    // Forward to response actor
    const responseActor = this._space.getActor('response-actor');
    if (responseActor) {
      responseActor.receive({
        type: 'command_result',
        requestId,
        result
      });
    }
  }

  /**
   * Handle request timeout
   * @private
   */
  handleTimeout(requestId, tool) {
    this.pendingRequests.delete(requestId);
    
    if (this._space) {
      this._space.emit('request_timeout', {
        requestId,
        tool
      });
    }
  }

  /**
   * Send message to server through channel
   * @private
   */
  sendToServer(message) {
    const channel = this.getChannel();
    if (channel) {
      channel.send('tool-executor', message);
    }
  }

  /**
   * Get the primary channel
   * @private
   */
  getChannel() {
    if (!this._space) return null;
    
    // Get first available channel
    const channels = Array.from(this._space.channels.values());
    return channels[0] || null;
  }

  /**
   * Check if connected to server
   * @returns {boolean} Connection status
   */
  isConnected() {
    const channel = this.getChannel();
    return channel && channel.isConnected;
  }

  /**
   * Flush queued messages
   */
  flushQueue() {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      this.receive(message);
    }
  }

  /**
   * Generate unique request ID
   * @returns {string} Request ID
   */
  generateRequestId() {
    return `ui-cmd-${++this._requestCounter}-${Date.now()}`;
  }

  /**
   * Clean up actor
   */
  destroy() {
    // Clear all pending requests
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timer);
    });
    this.pendingRequests.clear();
    
    // Clear message queue
    this.messageQueue = [];
  }
}