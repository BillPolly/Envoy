# jsEnvoy - Modular AI Agent Tools Framework

A modular framework for building AI agent tools with consistent interfaces. This monorepo has been restructured into focused packages for better modularity and maintainability.

## Packages

### [@jsenvoy/core](packages/core) - Lightweight Infrastructure
Core framework providing:
- 🏗️ **ResourceManager**: Dependency injection system
- 🏭 **ModuleFactory**: Module instantiation with automatic dependency resolution
- 🧩 **Base Classes**: OpenAIModule and OpenAITool for creating new modules
- 📦 **Built-in Modules**: Calculator and File modules

### [@jsenvoy/cli](packages/cli) - Command Line Interface
Feature-complete CLI providing:
- 🔍 **Dynamic Discovery**: Auto-discovers all modules and tools
- 💬 **Interactive Mode**: REPL with autocomplete and multi-line input
- 🎯 **Flexible**: Command aliases, chaining, and batch execution
- 📊 **Multiple Formats**: Text, JSON, and colored output
- ⚡ **Optimized**: Caching and lazy loading for performance

### [@jsenvoy/tools](packages/tools) - AI Agent Tools
Comprehensive tool collection:
- 🧮 **Calculator**: Mathematical expression evaluation
- 📁 **File Operations**: Read, write, and manage files
- 🌐 **Web Tools**: Scraping, screenshots, and search
- 💻 **Development**: Code analysis, GitHub integration
- 🎥 **Content**: YouTube transcripts, format conversion

### [@jsenvoy/llm](packages/llm) - LLM Client with Retry Logic
Robust LLM client with multiple providers:
- 🤖 **Multiple Providers**: OpenAI, Anthropic, DeepSeek, OpenRouter
- 🔄 **Retry Logic**: Automatic retry with exponential backoff
- 📊 **Event Emission**: Track all interactions
- 🔧 **Dual API**: Both prompt-based and message-based interfaces


### [@jsenvoy/agent](packages/agent) - AI Agent Implementation
Complete agent system:
- 🤖 **Agent**: Base agent with tool execution
- 🔄 **Built-in Retry Logic**: Robust retry capabilities with exponential backoff
- 📊 **StructuredResponse**: Consistent response format
- 🚀 **CodeAgent Integration**: Full-stack code generation capabilities
- 📡 **Event System**: Real-time event streaming and monitoring

### CodeAgent Integration
The agent now includes powerful code generation capabilities:
- 🏗️ **Complete Applications**: Generate full-stack web applications
- 🔧 **Code Fixing**: Debug and improve existing code
- 📝 **Documentation**: Automatic documentation generation
- 🧪 **Testing**: Test suites for generated code
- 🚀 **Deployment**: Production-ready deployment configurations

## Quick Start

### Using the CLI

```bash
# Install globally
npm install -g @jsenvoy/cli @jsenvoy/core

# Execute a tool
jsenvoy calculator.calculator_evaluate --expression "2 + 2"

# Interactive mode
jsenvoy interactive

# List available tools
jsenvoy list tools
```

### Building an Agent

```javascript
const { Agent } = require('@jsenvoy/agent');
const { calculatorTool, fileReaderTool } = require('@jsenvoy/tools');

const agent = new Agent({
  modelConfig: {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: process.env.OPENAI_API_KEY
  },
  tools: [calculatorTool, fileReaderTool]
});

const result = await agent.execute("Calculate the sum of numbers in data.txt");
```

### Code Generation with Agent

```javascript
// The CLI automatically loads CodeAgent for code generation
node packages/agent/src/cli.js

// Example interactions:
// "Create a React calculator app with modern styling"
// "Fix this JavaScript function: function factorial(n) { ... }"
// "Generate a complete blog application with authentication"

// Run the example script
node packages/agent/examples/chat-with-codeagent.js
```

### Creating Custom Modules

```javascript
const { OpenAIModule, OpenAITool } = require('@jsenvoy/core');

class MyTool extends OpenAITool {
  constructor() {
    super('my_tool', 'Description', {
      type: 'object',
      properties: {
        input: { type: 'string' }
      },
      required: ['input']
    });
  }
  
  async execute(args) {
    return { result: `Processed: ${args.input}` };
  }
}

class MyModule extends OpenAIModule {
  constructor(dependencies = {}) {
    super('MyModule', dependencies);
    this.tools = [new MyTool()];
  }
}
```

## Project Structure

```
jsEnvoy/
├── packages/
│   ├── core/              # Core infrastructure
│   ├── cli/               # Command-line interface
│   ├── tools/             # AI agent tools
│   └── agent/             # Agent implementation
├── docs/                  # Project documentation
└── package.json           # Monorepo root
```

## Development

This is a monorepo managed with npm workspaces.

```bash
# Install all dependencies
npm install

# Run all tests
npm test

# Run tests for specific packages
npm run test:core
npm run test:cli
npm run test:tools
npm run test:llm
npm run test:agent

# Run tests with coverage
npm run test:coverage

# Clean install
npm run clean
npm install
```

## Benefits of the New Architecture

1. **Smaller Bundle Sizes** - Applications only include needed packages
2. **Independent Versioning** - Each package can be updated separately
3. **Clearer Dependencies** - Each package declares its own dependencies
4. **Better Testing** - Packages can be tested in isolation
5. **Improved Modularity** - Clear separation of concerns

## Migration Guide

If upgrading from the monolithic @jsenvoy/core:

```javascript
// Old imports
const { Agent, Model, calculatorTool } = require('@jsenvoy/core');

// New imports
const { Agent } = require('@jsenvoy/agent');
const { LLMClient } = require('@jsenvoy/llm');
const { calculatorTool } = require('@jsenvoy/tools');
```

## Architecture

The framework uses a modular architecture with dependency injection:

1. **Modules** are containers for related tools
2. **Tools** implement specific functionality in OpenAI function format
3. **ResourceManager** handles dependency injection
4. **ModuleFactory** creates module instances with resolved dependencies
5. **Agent** orchestrates tool execution with LLM integration

See [Architecture Documentation](docs/ARCHITECTURE.md) for details.

## Event System

jsEnvoy includes a comprehensive event system for real-time monitoring and feedback:

### Event Types
- **progress** - Track operation progress with percentage and status
- **info** - General information and status updates
- **warning** - Non-critical issues and important notices
- **error** - Critical errors that may affect execution

### Event Flow
1. **Tools emit events** during execution (progress, errors, warnings)
2. **Modules relay events** from their tools with module context
3. **Agents aggregate events** from all registered modules
4. **WebSocket server broadcasts** events to connected clients

### Example: Monitoring Agent Execution

```javascript
const { Agent } = require('@jsenvoy/agent');
const { FileModule } = require('@jsenvoy/tools');

const agent = new Agent({
  name: 'DataProcessor',
  modelConfig: { /* ... */ }
});

// Listen to all events
agent.on('module-event', (event) => {
  console.log(`[${event.type}] ${event.module}: ${event.message}`);
});

// Register modules
agent.registerModule(new FileModule());

// Execute with real-time monitoring
await agent.execute("Process all CSV files and generate report");
```

### WebSocket Event Streaming

```javascript
import { AgentWebSocketServer } from '@jsenvoy/agent/src/websocket-server.js';

// Start WebSocket server
const wsServer = new AgentWebSocketServer(agent, { port: 3001 });
await wsServer.start();

// Client subscribes to events
ws.send(JSON.stringify({
  id: 'sub-1',
  type: 'subscribe-events'
}));
```

See package-specific READMEs for detailed event system documentation.

## Contributing

1. Choose the appropriate package for your contribution
2. Follow existing patterns and conventions
3. Write tests using TDD approach
4. Update package-specific documentation
5. Ensure all tests pass before submitting PR

## License

MIT