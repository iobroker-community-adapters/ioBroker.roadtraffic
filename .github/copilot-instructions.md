# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

## Adapter-Specific Context

**Adapter Name:** roadtraffic  
**Primary Function:** Real-time traffic monitoring and route duration calculation using HERE.com API v8  
**Key Features:**
- Traffic monitoring with HERE.com API integration
- Route management with origin/destination geocoding
- Alarm clock functionality with Alexa integration
- Duration calculation with and without traffic
- Automatic wake-up scheduling based on travel time

**Key Dependencies:**
- HERE.com API v8 for routing and geocoding services
- node-schedule for alarm and cron functionality  
- request library for HTTP API calls
- @iobroker/adapter-core for adapter framework

**Configuration Requirements:**
- HERE.com API key (required for all functionality)
- Route definitions with origin and destination addresses
- Optional alarm settings per weekday
- Optional Alexa device integration for announcements

**External Service Integration:**
- HERE.com Geocoding API for address resolution
- HERE.com Routing API v8 for traffic and duration data
- Alexa2 adapter integration for voice announcements
- TuneIn radio integration for alarm functionality

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        resolve();
                    } catch (error) {
                        console.error('❌ Test failed:', error);
                        reject(error);
                    }
                });
            });
        });
    }
});
```

### Adapter-Specific Testing for roadtraffic

For the roadtraffic adapter, implement specific test scenarios:

```javascript
// Example integration test for roadtraffic adapter
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Traffic API Integration Tests', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should test HERE API connectivity with demo credentials', async function() {
                this.timeout(120000);
                
                const obj = await harness.objects.getObjectAsync('system.adapter.roadtraffic.0');
                if (!obj) throw new Error('Adapter object not found');
                
                // Configure with demo API key and test route
                Object.assign(obj.native, {
                    apiKEY: process.env.HERE_API_KEY || 'demo_key',
                    routepoints: [{
                        name: 'Test Route',
                        origin: 'Berlin, Germany',
                        destination: 'Hamburg, Germany',
                        routeid: 'test_route_001'
                    }]
                });
                
                await harness.objects.setObjectAsync(obj._id, obj);
                await harness.startAdapterAndWait();
                
                // Wait for API calls
                await new Promise(resolve => setTimeout(resolve, 30000));
                
                // Check connection status
                const connectionState = await harness.states.getStateAsync('roadtraffic.0.info.connection');
                expect(connectionState.val).to.be.true;
            });
        });
    }
});
```

## Development Patterns

### State Management
- Use proper state definitions with roles and types
- Implement state change listeners for user interactions
- Handle refresh triggers and automatic updates
- Example state definitions:
  ```javascript
  await this.setObjectNotExistsAsync('route.distance', {
      type: 'state',
      common: {
          name: 'Distance',
          type: 'number',
          role: 'value.distance',
          unit: 'm',
          read: true,
          write: false
      },
      native: {}
  });
  ```

### API Integration Best Practices
- Implement proper error handling for API calls
- Use timeouts for external requests (15000ms recommended)
- Handle rate limiting and API errors gracefully
- Cache geocoding results to reduce API calls
- Example HERE.com API call:
  ```javascript
  const link = `https://router.hereapi.com/v8/routes?apikey=${apiKey}&origin=${origin}&destination=${destination}&return=summary&transportMode=car`;
  
  request({ url: link, timeout: 15000 }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
          const data = JSON.parse(body);
          // Process route data
      } else {
          this.log.error(`HERE API error: ${response.statusCode}`);
      }
  });
  ```

### Scheduling and Timing
- Use node-schedule for cron-like scheduling
- Handle timezone considerations properly
- Implement proper cleanup of timers in unload()
- Example alarm scheduling:
  ```javascript
  const schedule = require('node-schedule');
  
  // Schedule daily alarm check
  this.alarmJob = schedule.scheduleJob('0 * * * *', () => {
      this.checkAlarms();
  });
  ```

### Configuration Management
- Handle encrypted passwords properly using adapter.config
- Validate required configuration on startup
- Provide meaningful error messages for missing config
- Support configuration updates without restart where possible

## Logging and Error Handling

Use appropriate logging levels:
- `this.log.error()` for critical errors that stop functionality
- `this.log.warn()` for recoverable issues
- `this.log.info()` for important status information
- `this.log.debug()` for detailed troubleshooting information

Example error handling:
```javascript
try {
    const response = await this.makeAPICall();
    this.log.debug('API call successful');
} catch (error) {
    this.log.error(`API call failed: ${error.message}`);
    this.setState('info.connection', false, true);
}
```

## Adapter Lifecycle

### Startup Sequence
1. Validate configuration (API keys, routes)
2. Set up state objects
3. Initialize external connections
4. Start scheduled tasks
5. Set connection status

### Proper Cleanup
```javascript
async unload(callback) {
    try {
        // Clear all timers
        if (this.alarmJob) {
            this.alarmJob.cancel();
        }
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        // Close any open connections
        this.setState('info.connection', false, true);
        
        callback();
    } catch (e) {
        callback();
    }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example for roadtraffic adapter API testing:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("HERE API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to HERE API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                await harness.changeAdapterConfig("roadtraffic", {
                    native: {
                        apiKEY: process.env.HERE_API_KEY || "demo_key_here",
                        routepoints: [{
                            name: "Demo Route",
                            origin: "Berlin, Germany", 
                            destination: "Hamburg, Germany",
                            routeid: "demo_route_001"
                        }]
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("roadtraffic.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: HERE API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected HERE API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```