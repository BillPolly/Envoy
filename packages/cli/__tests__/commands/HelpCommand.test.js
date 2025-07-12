import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HelpCommand } from '../../src/commands/HelpCommand.js';

describe('HelpCommand', () => {
  let helpCommand;
  let mockModuleLoader;
  let mockToolRegistry;
  let mockStringUtils;
  let consoleLogSpy;

  beforeEach(() => {
    mockModuleLoader = {
      hasModule: jest.fn(),
      getModule: jest.fn(),
      getModuleInfo: jest.fn(),
      getModuleNames: jest.fn(),
      getModules: jest.fn().mockReturnValue(new Map())
    };
    
    mockToolRegistry = {
      hasTool: jest.fn(),
      getToolByName: jest.fn(),
      searchTools: jest.fn(),
      getToolMetadata: jest.fn(),
      discoverTools: jest.fn().mockReturnValue(new Map())
    };
    
    mockStringUtils = {
      findBestMatch: jest.fn(),
      calculateSimilarity: jest.fn().mockReturnValue(0)
    };
    
    helpCommand = new HelpCommand(mockModuleLoader, mockToolRegistry, mockStringUtils);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleLogSpy.mockRestore();
  });

  describe('execute', () => {
    describe('general help', () => {
      it('should show general help when no topic specified', async () => {
        await helpCommand.execute({
          command: 'help',
          helpTopic: undefined
        }, {});
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('jsEnvoy CLI'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commands:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Options:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Examples:'));
      });
    });

    describe('command help', () => {
      it('should show help for list command', async () => {
        await helpCommand.execute({
          command: 'help',
          helpTopic: 'list'
        }, {});
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('list command'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Types:'));
      });

      it('should show help for interactive command', async () => {
        await helpCommand.execute({
          command: 'help',
          helpTopic: 'interactive'
        }, {});
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('interactive mode'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('REPL'));
      });
    });

    describe('module help', () => {
      it('should show help for module', async () => {
        mockModuleLoader.hasModule.mockReturnValue(true);
        mockModuleLoader.getModuleInfo.mockReturnValue({
          name: 'calculator',
          className: 'CalculatorModule',
          dependencies: [],
          tools: [],
          functionCount: 2
        });
        
        // Mock the toolRegistry.discoverTools() method
        const mockTools = new Map([
          ['calculator.add', { name: 'add', module: 'calculator', description: 'Add two numbers' }],
          ['calculator.subtract', { name: 'subtract', module: 'calculator', description: 'Subtract numbers' }]
        ]);
        mockToolRegistry.discoverTools = jest.fn().mockReturnValue(mockTools);
        
        await helpCommand.execute({
          command: 'help',
          helpTopic: 'calculator'
        }, {});
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Module: calculator'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Tools:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('- add'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('- subtract'));
      });
    });

    describe('tool help', () => {

      it('should handle tool without parameters', async () => {
        mockToolRegistry.hasTool.mockReturnValue(true);
        mockToolRegistry.getToolByName.mockReturnValue({
          name: 'simple',
          module: 'test',
          description: 'Simple tool'
        });
        
        await helpCommand.execute({
          command: 'help',
          helpTopic: 'test.simple'
        }, {});
        
        expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Parameters:'));
      });
    });

    describe('unknown topic', () => {
      it('should suggest similar module', async () => {
        mockModuleLoader.hasModule.mockReturnValue(false);
        mockModuleLoader.getModuleInfo.mockReturnValue(null);
        mockToolRegistry.getToolByName.mockReturnValue(null);
        mockModuleLoader.getModules.mockReturnValue(new Map([
          ['calculator', { name: 'calculator' }],
          ['file', { name: 'file' }]
        ]));
        mockToolRegistry.discoverTools.mockReturnValue(new Map());
        mockStringUtils.findBestMatch.mockReturnValue('calculator');
        mockStringUtils.calculateSimilarity.mockImplementation((a, b) => {
          if (a.includes(b) || b.includes(a)) return 0.8;
          return 0.2;
        });
        
        await helpCommand.execute({
          command: 'help',
          helpTopic: 'calc'
        }, {});
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown help topic: calc'));
        expect(consoleLogSpy).toHaveBeenCalledWith('Did you mean:');
        expect(consoleLogSpy).toHaveBeenCalledWith('  - calculator');
      });

      it('should search for tools containing keyword', async () => {
        mockModuleLoader.hasModule.mockReturnValue(false);
        mockModuleLoader.getModuleInfo.mockReturnValue(null);
        mockToolRegistry.getToolByName.mockReturnValue(null);
        mockModuleLoader.getModules.mockReturnValue(new Map());
        mockToolRegistry.discoverTools.mockReturnValue(new Map([
          ['file.read', { name: 'read', module: 'file' }],
          ['file.write', { name: 'write', module: 'file' }]
        ]));
        mockStringUtils.findBestMatch.mockReturnValue(null);
        mockStringUtils.calculateSimilarity.mockImplementation((a, b) => {
          // file.read contains "read"
          if (a.toLowerCase().includes(b.toLowerCase())) return 0.8;
          return 0.2;
        });
        
        await helpCommand.execute({
          command: 'help',
          helpTopic: 'read'
        }, {});
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown help topic: read'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Did you mean:'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('file.read'));
      });

      it('should show general help for completely unknown topic', async () => {
        mockModuleLoader.hasModule.mockReturnValue(false);
        mockModuleLoader.getModuleInfo.mockReturnValue(null);
        mockToolRegistry.getToolByName.mockReturnValue(null);
        mockModuleLoader.getModules.mockReturnValue(new Map());
        mockToolRegistry.discoverTools.mockReturnValue(new Map());
        mockStringUtils.findBestMatch.mockReturnValue(null);
        mockStringUtils.calculateSimilarity.mockReturnValue(0.2);
        
        await helpCommand.execute({
          command: 'help',
          helpTopic: 'xyz123'
        }, {});
        
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown help topic: xyz123'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Available topics:'));
      });
    });
  });

  describe('showGeneralHelp', () => {
    it('should display comprehensive help information', () => {
      helpCommand.showGeneralHelp();
      
      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      
      expect(output).toContain('jsEnvoy CLI');
      expect(output).toContain('Usage:');
      expect(output).toContain('Commands:');
      expect(output).toContain('<module>.<tool>');
      expect(output).toContain('list');
      expect(output).toContain('help');
      expect(output).toContain('interactive');
      expect(output).toContain('Options:');
      expect(output).toContain('--verbose');
      expect(output).toContain('--output');
      expect(output).toContain('--config');
      expect(output).toContain('Examples:');
    });
  });
});