/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by temporarily disabling failing providers
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing, requests are rejected immediately
 * - HALF_OPEN: Testing if service recovered
 */

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 3;
    this.timeout = options.timeout || 30000; // 30 seconds
    this.monitorInterval = options.monitorInterval || 10000; // 10 seconds
    
    this.circuits = new Map();
    this.stats = {
      totalTrips: 0,
      totalRecoveries: 0,
    };
    
    // Monitor circuits periodically
    this.monitorTimer = setInterval(() => this._monitor(), this.monitorInterval);
  }

  /**
   * Get or create circuit for a provider
   */
  _getCircuit(providerId) {
    if (!this.circuits.has(providerId)) {
      this.circuits.set(providerId, {
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        lastFailureTime: null,
        lastStateChange: Date.now(),
        totalFailures: 0,
        totalSuccesses: 0,
      });
    }
    return this.circuits.get(providerId);
  }

  /**
   * Check if request should be allowed through
   */
  canExecute(providerId) {
    const circuit = this._getCircuit(providerId);
    
    switch (circuit.state) {
      case CircuitState.CLOSED:
        return true;
        
      case CircuitState.OPEN:
        // Check if timeout has passed
        if (Date.now() - circuit.lastFailureTime >= this.timeout) {
          this._transitionTo(providerId, CircuitState.HALF_OPEN);
          return true;
        }
        return false;
        
      case CircuitState.HALF_OPEN:
        // Allow limited requests through for testing
        return true;
        
      default:
        return true;
    }
  }

  /**
   * Record successful request
   */
  recordSuccess(providerId) {
    const circuit = this._getCircuit(providerId);
    circuit.totalSuccesses++;
    
    switch (circuit.state) {
      case CircuitState.HALF_OPEN:
        circuit.successes++;
        if (circuit.successes >= this.successThreshold) {
          this._transitionTo(providerId, CircuitState.CLOSED);
          this.stats.totalRecoveries++;
          console.log(`[CircuitBreaker] ${providerId} recovered - circuit CLOSED`);
        }
        break;
        
      case CircuitState.CLOSED:
        // Reset failure count on success
        circuit.failures = 0;
        break;
    }
  }

  /**
   * Record failed request
   */
  recordFailure(providerId, error = null) {
    const circuit = this._getCircuit(providerId);
    circuit.failures++;
    circuit.totalFailures++;
    circuit.lastFailureTime = Date.now();
    circuit.lastError = error?.message || 'Unknown error';
    
    switch (circuit.state) {
      case CircuitState.CLOSED:
        if (circuit.failures >= this.failureThreshold) {
          this._transitionTo(providerId, CircuitState.OPEN);
          this.stats.totalTrips++;
          console.log(`[CircuitBreaker] ${providerId} tripped - circuit OPEN after ${circuit.failures} failures`);
        }
        break;
        
      case CircuitState.HALF_OPEN:
        // Single failure in half-open returns to open
        this._transitionTo(providerId, CircuitState.OPEN);
        console.log(`[CircuitBreaker] ${providerId} failed recovery test - circuit OPEN`);
        break;
    }
  }

  /**
   * Transition circuit to new state
   */
  _transitionTo(providerId, newState) {
    const circuit = this._getCircuit(providerId);
    const oldState = circuit.state;
    
    circuit.state = newState;
    circuit.lastStateChange = Date.now();
    
    if (newState === CircuitState.CLOSED) {
      circuit.failures = 0;
      circuit.successes = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      circuit.successes = 0;
    }
    
    console.log(`[CircuitBreaker] ${providerId}: ${oldState} -> ${newState}`);
  }

  /**
   * Monitor and auto-recover circuits
   */
  _monitor() {
    const now = Date.now();
    
    for (const [providerId, circuit] of this.circuits) {
      if (circuit.state === CircuitState.OPEN) {
        if (now - circuit.lastFailureTime >= this.timeout) {
          this._transitionTo(providerId, CircuitState.HALF_OPEN);
        }
      }
    }
  }

  /**
   * Force reset a circuit
   */
  reset(providerId) {
    if (this.circuits.has(providerId)) {
      this._transitionTo(providerId, CircuitState.CLOSED);
      console.log(`[CircuitBreaker] ${providerId} manually reset`);
    }
  }

  /**
   * Get circuit status for a provider
   */
  getStatus(providerId) {
    const circuit = this._getCircuit(providerId);
    return {
      state: circuit.state,
      failures: circuit.failures,
      successes: circuit.successes,
      lastFailureTime: circuit.lastFailureTime,
      lastError: circuit.lastError,
      totalFailures: circuit.totalFailures,
      totalSuccesses: circuit.totalSuccesses,
      timeSinceLastFailure: circuit.lastFailureTime 
        ? Date.now() - circuit.lastFailureTime 
        : null,
    };
  }

  /**
   * Get all circuits status
   */
  getAllStatus() {
    const status = {};
    for (const [providerId, circuit] of this.circuits) {
      status[providerId] = this.getStatus(providerId);
    }
    return {
      circuits: status,
      stats: this.stats,
    };
  }

  /**
   * Shutdown
   */
  shutdown() {
    clearInterval(this.monitorTimer);
  }
}

export const circuitBreaker = new CircuitBreaker();
export { CircuitBreaker, CircuitState };
