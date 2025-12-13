/**
 * Graceful Shutdown Handler
 * Ensures all connections are drained before exit
 */

class GracefulShutdown {
  constructor() {
    this.isShuttingDown = false;
    this.shutdownHandlers = [];
    this.activeConnections = new Set();
    this.server = null;
    this.shutdownTimeout = 30000; // 30 seconds max
    
    this._setupSignalHandlers();
  }

  /**
   * Register the HTTP server
   */
  registerServer(server) {
    this.server = server;
    
    // Track connections
    server.server.on('connection', (socket) => {
      this.activeConnections.add(socket);
      socket.on('close', () => {
        this.activeConnections.delete(socket);
      });
    });
  }

  /**
   * Register a shutdown handler
   */
  onShutdown(handler) {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Setup signal handlers
   */
  _setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`\n[Shutdown] Received ${signal}, starting graceful shutdown...`);
        await this.shutdown();
      });
    });

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      console.error('[Shutdown] Uncaught exception:', error);
      await this.shutdown(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('[Shutdown] Unhandled rejection at:', promise, 'reason:', reason);
      // Don't shutdown on unhandled rejection, just log
    });
  }

  /**
   * Perform graceful shutdown
   */
  async shutdown(exitCode = 0) {
    if (this.isShuttingDown) {
      console.log('[Shutdown] Already shutting down...');
      return;
    }
    
    this.isShuttingDown = true;
    const startTime = Date.now();
    
    console.log(`[Shutdown] Starting graceful shutdown (${this.activeConnections.size} active connections)`);
    
    // Set a hard timeout
    const forceExitTimer = setTimeout(() => {
      console.error('[Shutdown] Forced exit after timeout');
      process.exit(exitCode || 1);
    }, this.shutdownTimeout);
    
    try {
      // 1. Stop accepting new connections
      if (this.server) {
        console.log('[Shutdown] Stopping server from accepting new connections...');
        await new Promise((resolve) => {
          this.server.close(() => {
            console.log('[Shutdown] Server closed');
            resolve();
          });
        });
      }
      
      // 2. Wait for active connections to finish (with timeout per connection)
      if (this.activeConnections.size > 0) {
        console.log(`[Shutdown] Waiting for ${this.activeConnections.size} connections to close...`);
        
        // Give connections 5 seconds to finish gracefully
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Force close remaining connections
        if (this.activeConnections.size > 0) {
          console.log(`[Shutdown] Force closing ${this.activeConnections.size} remaining connections`);
          for (const socket of this.activeConnections) {
            socket.destroy();
          }
        }
      }
      
      // 3. Run registered shutdown handlers
      console.log(`[Shutdown] Running ${this.shutdownHandlers.length} shutdown handlers...`);
      
      for (const handler of this.shutdownHandlers) {
        try {
          await Promise.race([
            handler(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Handler timeout')), 5000)
            ),
          ]);
        } catch (error) {
          console.error('[Shutdown] Handler error:', error.message);
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`[Shutdown] Graceful shutdown completed in ${duration}ms`);
      
    } catch (error) {
      console.error('[Shutdown] Error during shutdown:', error);
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(exitCode);
    }
  }

  /**
   * Check if system is shutting down
   */
  isTerminating() {
    return this.isShuttingDown;
  }

  /**
   * Get shutdown status
   */
  getStatus() {
    return {
      isShuttingDown: this.isShuttingDown,
      activeConnections: this.activeConnections.size,
      registeredHandlers: this.shutdownHandlers.length,
    };
  }
}

export const gracefulShutdown = new GracefulShutdown();
export { GracefulShutdown };
