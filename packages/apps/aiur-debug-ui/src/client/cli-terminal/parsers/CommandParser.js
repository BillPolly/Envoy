/**
 * CommandParser - Parses CLI-style commands into executable formats
 */

export class CommandParser {
  constructor() {
    this.builtinCommands = [
      '.help', '.commands', '.vars', '.clear', '.history', 
      '.search', '.describe', '.examples', '.save', '.load'
    ];
  }

  /**
   * Parse a command string
   * @param {string} input - Raw command input
   * @param {Map} tools - Tool definitions map for dynamic parameter mapping
   * @returns {Object} Parsed command object
   */
  parse(input, tools = new Map()) {
    const trimmed = input.trim();
    
    if (!trimmed) {
      throw new Error('Empty command');
    }
    
    // Check for built-in commands
    if (trimmed.startsWith('.')) {
      return this.parseBuiltinCommand(trimmed);
    }
    
    // Check for variable assignment
    const assignMatch = trimmed.match(/^\$(\w+)\s*=\s*(.+)$/);
    if (assignMatch) {
      return this.parseAssignment(assignMatch, tools);
    }
    
    // Parse as tool command
    return this.parseToolCommand(trimmed, tools);
  }
  
  /**
   * Parse built-in command
   */
  parseBuiltinCommand(input) {
    const parts = this.splitCommand(input);
    const command = parts[0];
    
    if (!this.builtinCommands.includes(command)) {
      throw new Error(`Unknown built-in command: ${command}`);
    }
    
    return {
      type: 'builtin',
      command: command,
      args: parts.slice(1)
    };
  }
  
  /**
   * Parse variable assignment
   */
  parseAssignment(match, tools) {
    const [, variable, commandStr] = match;
    const command = this.parseToolCommand(commandStr.trim(), tools);
    
    return {
      type: 'assignment',
      variable: '$' + variable,
      tool: command.tool,
      args: command.args
    };
  }
  
  /**
   * Parse tool command with arguments
   */
  parseToolCommand(command, tools) {
    const parts = this.splitCommand(command);
    const toolName = parts[0];
    
    if (!toolName) {
      throw new Error('No tool specified');
    }
    
    const { args, options } = this.parseArguments(parts.slice(1));
    
    return {
      type: 'tool',
      tool: toolName,
      args: this.mapArgumentsToSchema(toolName, args, options, tools)
    };
  }
  
  /**
   * Parse arguments into positional and named
   */
  parseArguments(parts) {
    const args = [];
    const options = {};
    
    for (const part of parts) {
      if (part.startsWith('--')) {
        // Named argument
        const eqIndex = part.indexOf('=');
        if (eqIndex > 0) {
          const key = part.substring(2, eqIndex);
          const value = this.parseValue(part.substring(eqIndex + 1));
          options[key] = value;
        } else {
          // Flag without value
          options[part.substring(2)] = true;
        }
      } else if (part.startsWith('-') && part.length === 2) {
        // Short flag
        options[part.substring(1)] = true;
      } else {
        // Positional argument
        args.push(this.parseValue(part));
      }
    }
    
    return { args, options };
  }
  
  /**
   * Map arguments to tool schema
   */
  mapArgumentsToSchema(toolName, args, options, tools) {
    const result = { ...options };
    
    // Get the tool definition if available
    const toolDef = tools && tools.get(toolName);
    
    if (toolDef && toolDef.inputSchema && toolDef.inputSchema.properties) {
      // Extract parameter names in the order they appear in the schema
      const paramNames = [];
      const required = toolDef.inputSchema.required || [];
      
      // First add required parameters in order
      for (const paramName of required) {
        if (toolDef.inputSchema.properties[paramName]) {
          paramNames.push(paramName);
        }
      }
      
      // Then add optional parameters
      for (const paramName in toolDef.inputSchema.properties) {
        if (!paramNames.includes(paramName)) {
          paramNames.push(paramName);
        }
      }
      
      // Map positional arguments to parameters in order
      paramNames.forEach((paramName, index) => {
        if (index < args.length && !(paramName in result)) {
          result[paramName] = args[index];
        }
      });
    } else {
      // No schema available - use fallback for known tools
      const fallbackMappings = {
        'module_load': ['name'],
        'module_unload': ['name'],
        'context_get': ['name'],
        'context_list': ['filter'],
        'file_read': ['path'],
        'file_write': ['path', 'content']
      };
      
      const fallbackParams = fallbackMappings[toolName];
      if (fallbackParams) {
        fallbackParams.forEach((param, index) => {
          if (index < args.length && !(param in result)) {
            result[param] = args[index];
          }
        });
      } else {
        // Unknown tool - just pass positional args as is
        if (args.length > 0) {
          args.forEach((arg, index) => {
            result[`arg${index + 1}`] = arg;
          });
        }
      }
    }
    
    return result;
  }
  
  /**
   * Split command respecting quotes and JSON structures
   */
  splitCommand(command) {
    const parts = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let depth = 0;
    
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      const prevChar = command[i - 1];
      
      if (!inQuotes) {
        if ((char === '"' || char === "'") && depth === 0) {
          inQuotes = true;
          quoteChar = char;
          current += char;
        } else if (char === '{' || char === '[') {
          depth++;
          current += char;
        } else if (char === '}' || char === ']') {
          depth--;
          current += char;
        } else if (char === ' ' && depth === 0) {
          if (current) {
            parts.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      } else {
        current += char;
        if (char === quoteChar && prevChar !== '\\') {
          inQuotes = false;
          quoteChar = '';
        }
      }
    }
    
    if (current) {
      parts.push(current);
    }
    
    if (inQuotes || depth !== 0) {
      throw new Error('Unclosed quote or bracket');
    }
    
    return parts;
  }
  
  /**
   * Parse a value (handle JSON, strings, numbers, booleans, etc.)
   */
  parseValue(value) {
    // Handle @variable references
    if (value.startsWith('@')) {
      return value;
    }
    
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    // Try to parse as JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch (e) {
        throw new Error(`Invalid JSON: ${e.message}`);
      }
    }
    
    // Boolean values
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    
    // Numbers
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return Number(value);
    }
    
    // Default to string
    return value;
  }
}