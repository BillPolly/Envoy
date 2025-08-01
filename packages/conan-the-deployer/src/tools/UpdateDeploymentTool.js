import { Tool, ToolResult } from '@legion/module-loader';
import DeploymentManager from '../DeploymentManager.js';
import ResourceManager from '../core/ResourceManager.js';

/**
 * UpdateDeploymentTool - Update deployment configurations with various strategies
 */
class UpdateDeploymentTool extends Tool {
  constructor() {
    super();
    this.name = 'update_deployment';
    this.description = 'Update deployment configurations with various strategies including rolling updates, blue-green deployments, and scaling';
    
    // Valid update strategies
    this.validStrategies = ['rolling', 'blue-green', 'recreate', 'scaling', 'config'];
  }

  /**
   * Get tool description for function calling
   */
  getToolDescription() {
    return {
      type: 'function',
      function: {
        name: 'update_deployment',
        description: 'Update deployment configurations with various strategies',
        parameters: {
          type: 'object',
          properties: {
            deploymentId: {
              type: 'string',
              description: 'ID of the deployment to update'
            },
            updates: {
              type: 'object',
              description: 'Configuration updates to apply',
              properties: {
                image: {
                  type: 'string',
                  description: 'New Docker image (for container deployments)'
                },
                command: {
                  type: 'string',
                  description: 'New command to run (for local deployments)'
                },
                environment: {
                  type: 'object',
                  description: 'Environment variables to update'
                },
                port: {
                  type: 'number',
                  description: 'New port number'
                },
                replicas: {
                  type: 'number',
                  description: 'Number of replicas for scaling',
                  minimum: 0
                },
                resources: {
                  type: 'object',
                  properties: {
                    cpu: { type: 'string', description: 'CPU allocation' },
                    memory: { type: 'string', description: 'Memory allocation' }
                  },
                  description: 'Resource allocation updates'
                },
                branch: {
                  type: 'string',
                  description: 'Git branch (for git-based deployments)'
                }
              }
            },
            strategy: {
              type: 'string',
              enum: ['rolling', 'blue-green', 'recreate', 'scaling', 'config'],
              description: 'Update strategy to use',
              default: 'rolling'
            },
            // Strategy-specific options
            rollbackOnFailure: {
              type: 'boolean',
              description: 'Automatically rollback on update failure',
              default: true
            },
            verifyUpdate: {
              type: 'boolean',
              description: 'Verify update success before completing',
              default: true
            },
            healthCheckTimeout: {
              type: 'number',
              description: 'Timeout for health checks in milliseconds',
              minimum: 5000,
              maximum: 300000,
              default: 60000
            },
            trafficSplitPercentage: {
              type: 'number',
              description: 'Traffic percentage for blue-green deployment',
              minimum: 0,
              maximum: 100
            },
            maxUnavailable: {
              type: 'number',
              description: 'Max unavailable instances during rolling update',
              minimum: 0
            },
            maxSurge: {
              type: 'number',
              description: 'Max additional instances during rolling update',
              minimum: 0
            }
          },
          required: ['deploymentId', 'updates']
        },
        output: {
          success: {
            type: 'object',
            properties: {
              deployment: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  provider: { type: 'string' },
                  status: { type: 'string' }
                }
              },
              update: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  strategy: { type: 'string' },
                  status: { type: 'string' },
                  verified: { type: 'boolean' },
                  previousVersion: { type: 'string' },
                  newVersion: { type: 'string' }
                }
              },
              summary: { type: 'string' },
              nextSteps: { type: 'array', items: { type: 'string' } }
            }
          },
          failure: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              deploymentId: { type: 'string' },
              strategy: { type: 'string' },
              rolledBack: { type: 'boolean' },
              rollbackId: { type: 'string' },
              suggestions: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    };
  }

  /**
   * Execute the update
   */
  async invoke(toolCall) {
    try {
      const args = this.parseArguments(toolCall.function.arguments);
      
      // Validate required parameters
      this.validateRequiredParameters(args, ['deploymentId', 'updates']);
      
      // Validate updates is object
      if (typeof args.updates !== 'object' || args.updates === null) {
        const updatesObjectResult = ToolResult.failure('Updates must be an object');
        updatesObjectResult.deploymentId = args.deploymentId;
        updatesObjectResult.suggestions = ['Provide updates as a JSON object with the configuration changes'];
        return updatesObjectResult;
      }
      
      // Validate strategy
      const strategy = args.strategy || 'rolling';
      if (!this.validStrategies.includes(strategy)) {
        const invalidStrategyResult = ToolResult.failure(
          `Invalid update strategy: ${strategy}. Must be one of: ${this.validStrategies.join(', ')}`
        );
        invalidStrategyResult.deploymentId = args.deploymentId;
        invalidStrategyResult.strategy = strategy;
        invalidStrategyResult.suggestions = ['Use one of the supported strategies: rolling, blue-green, recreate, scaling, config'];
        return invalidStrategyResult;
      }
      
      // Validate strategy-specific parameters
      const validationResult = this.validateStrategyParameters(args, strategy);
      if (!validationResult.valid) {
        const validationFailureResult = ToolResult.failure(validationResult.error);
        validationFailureResult.deploymentId = args.deploymentId;
        validationFailureResult.strategy = strategy;
        validationFailureResult.suggestions = validationResult.suggestions;
        return validationFailureResult;
      }
      
      // Get deployment manager
      const deploymentManager = await this.getDeploymentManager();
      if (!deploymentManager) {
        const managerNotAvailableResult = ToolResult.failure('Deployment manager not available. Please initialize the system first.');
        managerNotAvailableResult.deploymentId = args.deploymentId;
        managerNotAvailableResult.suggestions = ['Initialize the deployment system before updating deployments'];
        return managerNotAvailableResult;
      }
      
      // Verify deployment exists
      const deployment = await deploymentManager.getDeployment(args.deploymentId);
      if (!deployment) {
        const deploymentNotFoundResult = ToolResult.failure(`Deployment not found: ${args.deploymentId}`);
        deploymentNotFoundResult.deploymentId = args.deploymentId;
        deploymentNotFoundResult.suggestions = [
          'Verify the deployment ID is correct',
          'Use list_deployments to see available deployments'
        ];
        return deploymentNotFoundResult;
      }
      
      this.emitProgress(`Starting ${strategy} update for ${args.deploymentId}`, { 
        deploymentId: args.deploymentId,
        strategy: strategy
      });
      
      // Build update options
      const updateOptions = this.buildUpdateOptions(args, strategy);
      
      // Execute update
      const result = await deploymentManager.updateDeployment(args.deploymentId, args.updates, updateOptions);
      
      if (result.success) {
        this.emitInfo(`Successfully updated ${args.deploymentId} using ${strategy} strategy`, {
          deploymentId: args.deploymentId,
          strategy: strategy,
          updateId: result.id
        });
        
        return ToolResult.success({
          deployment: {
            id: deployment.id,
            name: deployment.name,
            provider: deployment.provider,
            status: deployment.status
          },
          update: {
            id: result.id,
            strategy: result.strategy || strategy,
            status: result.status,
            verified: result.verified,
            previousVersion: result.previousVersion,
            newVersion: result.newVersion,
            previousReplicas: result.previousReplicas,
            newReplicas: result.newReplicas,
            scalingType: result.scalingType,
            downtime: result.downtime,
            greenEnvironment: result.greenEnvironment,
            switchedAt: result.switchedAt,
            environmentUpdated: result.environmentUpdated,
            restartRequired: result.restartRequired,
            healthChecks: result.healthChecks,
            resources: result.resources
          },
          summary: this.buildSummary(result, strategy, deployment),
          nextSteps: this.getNextSteps(strategy, result)
        });
      } else {
        this.emitError(`Update failed: ${result.error}`, {
          deploymentId: args.deploymentId,
          strategy: strategy,
          error: result.error
        });
        
        const failureResult = ToolResult.failure(result.error || 'Update failed');
        failureResult.deploymentId = args.deploymentId;
        failureResult.strategy = strategy;
        failureResult.rolledBack = result.rolledBack || false;
        failureResult.rollbackId = result.rollbackId;
        failureResult.suggestions = this.getFailureSuggestions(strategy, result);
        return failureResult;
      }
      
    } catch (error) {
      this.emitError(`Update deployment tool error: ${error.message}`, { error: error.stack });
      
      const errorResult = ToolResult.failure(
        error.message.includes('JSON') ? `Invalid JSON in arguments: ${error.message}` : `Update failed: ${error.message}`
      );
      errorResult.suggestions = ['Check your parameters and try again'];
      return errorResult;
    }
  }

  /**
   * Validate strategy-specific parameters
   */
  validateStrategyParameters(args, strategy) {
    const errors = [];
    
    // Blue-green specific validation
    if (strategy === 'blue-green') {
      if (args.trafficSplitPercentage !== undefined && 
          (args.trafficSplitPercentage < 0 || args.trafficSplitPercentage > 100)) {
        errors.push('Traffic split percentage must be between 0 and 100');
      }
    }
    
    // Scaling specific validation
    if (strategy === 'scaling') {
      if (args.updates.replicas !== undefined && args.updates.replicas < 0) {
        errors.push('Replicas must be a positive number');
      }
    }
    
    // Rolling update specific validation
    if (strategy === 'rolling') {
      if (args.maxUnavailable !== undefined && args.maxUnavailable < 0) {
        errors.push('maxUnavailable must be a positive number');
      }
      if (args.maxSurge !== undefined && args.maxSurge < 0) {
        errors.push('maxSurge must be a positive number');
      }
    }
    
    return {
      valid: errors.length === 0,
      error: errors[0],
      suggestions: errors.length > 0 ? ['Check parameter values and valid ranges'] : []
    };
  }

  /**
   * Build update options from arguments
   */
  buildUpdateOptions(args, strategy) {
    return {
      strategy: strategy,
      rollbackOnFailure: args.rollbackOnFailure !== false, // Default true
      verifyUpdate: args.verifyUpdate !== false, // Default true
      healthCheckTimeout: args.healthCheckTimeout || 60000,
      trafficSplitPercentage: args.trafficSplitPercentage,
      maxUnavailable: args.maxUnavailable,
      maxSurge: args.maxSurge
    };
  }

  /**
   * Build summary message based on update result
   */
  buildSummary(result, strategy, deployment) {
    const appName = deployment.name || deployment.id;
    
    switch (strategy) {
      case 'rolling':
        return `Rolling update completed for "${appName}"${result.verified ? ' and verified successfully' : ''}`;
      case 'blue-green':
        return `Blue-green deployment completed for "${appName}"${result.greenEnvironment ? ` (green environment: ${result.greenEnvironment})` : ''}`;
      case 'recreate':
        return `Recreate deployment completed for "${appName}"${result.downtime ? ` with ${result.downtime}ms downtime` : ''}`;
      case 'scaling':
        if (result.scalingType === 'horizontal') {
          return `Scaled "${appName}" from ${result.previousReplicas} to ${result.newReplicas} replicas`;
        } else if (result.scalingType === 'vertical') {
          return `Updated "${appName}" resources with vertical scaling`;
        } else {
          return `Scaling update completed for "${appName}"`;
        }
      case 'config':
        return `Environment variables updated for "${appName}"${result.restartRequired ? ' (restart required)' : ''}`;
      default:
        return `Update completed for "${appName}" using ${strategy} strategy`;
    }
  }

  /**
   * Get deployment manager instance
   */
  async getDeploymentManager() {
    try {
      const resourceManager = new ResourceManager();
      await resourceManager.initialize();
      
      let deploymentManager = resourceManager.get('deployment-manager');
      
      if (!deploymentManager) {
        deploymentManager = new DeploymentManager(resourceManager);
        if (typeof deploymentManager.initialize === 'function') {
          await deploymentManager.initialize();
        }
        resourceManager.register('deployment-manager', deploymentManager);
      }
      
      return deploymentManager;
    } catch (error) {
      console.error('Failed to get deployment manager:', error);
      return null;
    }
  }

  /**
   * Get next steps based on strategy and result
   */
  getNextSteps(strategy, result) {
    const steps = [];
    
    switch (strategy) {
      case 'rolling':
        steps.push('Monitor deployment status with: monitor_deployment --id <deploymentId> --action status');
        if (result.verified) {
          steps.push('Update is verified and complete');
        } else {
          steps.push('Verify update manually if needed');
        }
        break;
      case 'blue-green':
        if (result.greenEnvironment) {
          steps.push(`Green environment is running at: ${result.greenEnvironment}`);
          steps.push('Monitor both environments during transition');
        }
        steps.push('Switch traffic completely when ready');
        break;
      case 'recreate':
        steps.push('Check application startup logs for any issues');
        steps.push('Verify all services are responding correctly');
        break;
      case 'scaling':
        steps.push('Monitor resource usage after scaling');
        if (result.scalingType === 'horizontal') {
          steps.push('Check load distribution across replicas');
        } else {
          steps.push('Verify performance improvements with new resources');
        }
        break;
      case 'config':
        if (result.restartRequired) {
          steps.push('Restart the application to apply environment changes');
        }
        steps.push('Verify configuration changes are working correctly');
        break;
    }
    
    steps.push('Use get_deployment_logs to check for any issues');
    
    return steps;
  }

  /**
   * Get failure suggestions based on strategy and error
   */
  getFailureSuggestions(strategy, result) {
    const suggestions = [];
    
    if (result.rolledBack) {
      suggestions.push('The deployment was automatically rolled back to the previous version');
      suggestions.push('Check the error details to understand what went wrong');
    }
    
    if (result.error && result.error.includes('health check')) {
      suggestions.push('Verify your application starts correctly with the new configuration');
      suggestions.push('Check application logs for startup errors');
      suggestions.push('Increase health check timeout if the application needs more time to start');
    }
    
    if (result.error && result.error.includes('resource')) {
      suggestions.push('Check if sufficient resources are available');
      suggestions.push('Consider scaling down other deployments to free up resources');
    }
    
    if (strategy === 'blue-green' && result.error) {
      suggestions.push('Ensure the green environment can be created successfully');
      suggestions.push('Check network connectivity between environments');
    }
    
    if (strategy === 'scaling') {
      suggestions.push('Verify the target replica count is supported by your provider');
      suggestions.push('Check resource quotas and limits');
    }
    
    suggestions.push('Review the deployment configuration and try again');
    suggestions.push('Use a different update strategy if this one continues to fail');
    
    return suggestions;
  }
}

export default UpdateDeploymentTool;