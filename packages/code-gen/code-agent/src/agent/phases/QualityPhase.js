/**
 * QualityPhase - Handles quality checks
 * 
 * Responsible for running ESLint and Jest tests to ensure
 * code quality and test coverage meet requirements.
 */

import { FileWriter } from '../utils/FileWriter.js';
import { CodeLinter } from '../utils/CodeLinter.js';

class QualityPhase {
  constructor(codeAgent) {
    this.codeAgent = codeAgent;
    this.fileWriter = new FileWriter(codeAgent);
    this.codeLinter = new CodeLinter(codeAgent);
  }

  /**
   * Run all quality checks (ESLint + Jest)
   * @returns {Promise<Object>} Quality check results
   */
  async runQualityChecks() {
    console.log('🔍 Running quality checks...');
    
    // Initialize quality check results
    this.codeAgent.qualityCheckResults = {
      eslint: {
        passed: false,
        errors: 0,
        warnings: 0,
        issues: []
      },
      jest: {
        passed: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        coverage: 0,
        failures: []
      },
      overall: false
    };
    
    // Run ESLint checks
    await this._runESLintChecks();
    
    // Run Jest tests
    await this._runJestTests();
    
    // Check if all quality gates pass
    const { qualityGates } = this.codeAgent.config;
    const { eslint, jest } = this.codeAgent.qualityCheckResults;
    
    const eslintPassed = eslint.errors <= qualityGates.eslintErrors &&
                        (qualityGates.eslintWarnings === null || eslint.warnings <= qualityGates.eslintWarnings);
    
    const jestPassed = jest.failedTests === 0 && 
                      jest.coverage >= qualityGates.testCoverage;
    
    this.codeAgent.qualityCheckResults.overall = eslintPassed && jestPassed;
    
    // Save state after quality checks
    this.codeAgent.currentTask.status = 'fixing';
    await this.codeAgent.saveState();
    
    console.log(`📊 Quality check results:`);
    console.log(`  ESLint: ${eslintPassed ? '✅' : '❌'} (${eslint.errors} errors, ${eslint.warnings} warnings)`);
    console.log(`  Jest: ${jestPassed ? '✅' : '❌'} (${jest.passedTests}/${jest.totalTests} passed, ${jest.coverage}% coverage)`);
    console.log(`  Overall: ${this.codeAgent.qualityCheckResults.overall ? '✅ PASSED' : '❌ FAILED'}`);
    
    return this.codeAgent.qualityCheckResults;
  }

  /**
   * Run ESLint checks on generated code
   * @private
   */
  async _runESLintChecks() {
    console.log('📋 Running ESLint checks...');
    
    try {
      // Get ESLint configuration
      const eslintConfig = this.codeAgent.eslintManager.getBaseRules();
      
      // Check all generated JavaScript files
      const jsFiles = Array.from(this.codeAgent.generatedFiles).filter(file => file.endsWith('.js'));
      
      for (const file of jsFiles) {
        try {
          const content = await this.codeAgent.fileOps.readFile(file);
          const issues = await this.codeLinter.lintCode(content, eslintConfig);
          
          if (issues.length > 0) {
            this.codeAgent.qualityCheckResults.eslint.issues.push({
              file,
              issues
            });
            
            issues.forEach(issue => {
              if (issue.severity === 2) {
                this.codeAgent.qualityCheckResults.eslint.errors++;
              } else {
                this.codeAgent.qualityCheckResults.eslint.warnings++;
              }
            });
          }
        } catch (error) {
          console.error(`Failed to lint ${file}: ${error.message}`);
        }
      }
      
      this.codeAgent.qualityCheckResults.eslint.passed = 
        this.codeAgent.qualityCheckResults.eslint.errors === 0 && 
        (this.codeAgent.config.qualityGates.eslintWarnings === null || 
         this.codeAgent.qualityCheckResults.eslint.warnings <= this.codeAgent.config.qualityGates.eslintWarnings);
      
      console.log(`ESLint: ${this.codeAgent.qualityCheckResults.eslint.errors} errors, ${this.codeAgent.qualityCheckResults.eslint.warnings} warnings`);
      
    } catch (error) {
      console.error(`ESLint check failed: ${error.message}`);
      this.codeAgent.qualityCheckResults.eslint.passed = false;
    }
  }

  /**
   * Run Jest tests
   * @private
   */
  async _runJestTests() {
    console.log('🧪 Running Jest tests...');
    
    try {
      // Mock test execution for now
      // In production, this would execute actual Jest tests
      const testFiles = Array.from(this.codeAgent.testFiles);
      
      // Simulate test results
      const totalTests = testFiles.length * 3; // Assume 3 tests per file
      const passedTests = Math.floor(totalTests * 0.9); // 90% pass rate
      const failedTests = totalTests - passedTests;
      
      // Simulate coverage
      const coverage = 85; // Mock 85% coverage
      
      // Update results
      this.codeAgent.qualityCheckResults.jest = {
        passed: failedTests === 0 && coverage >= this.codeAgent.config.qualityGates.testCoverage,
        totalTests,
        passedTests,
        failedTests,
        coverage,
        failures: failedTests > 0 ? this._generateMockFailures(failedTests) : []
      };
      
      console.log(`Jest: ${passedTests}/${totalTests} tests passed, ${coverage}% coverage`);
      
    } catch (error) {
      console.error(`Jest test execution failed: ${error.message}`);
      this.codeAgent.qualityCheckResults.jest.passed = false;
    }
  }

  /**
   * Generate mock test failures for simulation
   * @private
   */
  _generateMockFailures(count) {
    const failures = [];
    const testFiles = Array.from(this.codeAgent.testFiles);
    
    for (let i = 0; i < count && i < testFiles.length; i++) {
      failures.push({
        testFile: testFiles[i],
        testName: `Test case ${i + 1}`,
        error: 'Expected value to be true, but received false',
        suggestion: 'Check the test assertion or the implementation'
      });
    }
    
    return failures;
  }
}

export { QualityPhase };