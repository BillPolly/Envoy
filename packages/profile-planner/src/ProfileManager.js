/**
 * ProfileManager - Manages planning profiles for domain-specific planning
 * 
 * Profiles provide pre-configured environments with:
 * - Required modules and tools
 * - Domain-specific allowable actions
 * - Context prompts for better LLM understanding
 * - Default inputs/outputs for common workflows
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

class ProfileManager {
  constructor(resourceManager) {
    this.resourceManager = resourceManager;
    this.profiles = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the profile manager by loading all available profiles
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.loadBuiltinProfiles();
      this.initialized = true;
      console.log(`ProfileManager initialized with ${this.profiles.size} profiles`);
    } catch (error) {
      console.error('Failed to initialize ProfileManager:', error);
      throw error;
    }
  }

  /**
   * Load built-in profiles from the profiles directory
   */
  async loadBuiltinProfiles() {
    const profilesDir = join(__dirname, 'profiles');
    
    try {
      const files = await fs.readdir(profilesDir);
      const profileFiles = files.filter(file => file.endsWith('.json'));

      // Sort to prioritize verified profiles
      profileFiles.sort((a, b) => {
        if (a.includes('-verified') && !b.includes('-verified')) return -1;
        if (!a.includes('-verified') && b.includes('-verified')) return 1;
        return a.localeCompare(b);
      });

      // Track loaded profile names to avoid duplicates
      const loadedProfiles = new Set();

      for (const file of profileFiles) {
        try {
          const profilePath = join(profilesDir, file);
          const profileContent = await fs.readFile(profilePath, 'utf8');
          const profile = JSON.parse(profileContent);
          
          if (profile && profile.name) {
            // Skip if we already loaded a verified version
            if (loadedProfiles.has(profile.name)) {
              console.log(`Skipping ${file} - already loaded verified version`);
              continue;
            }
            
            await this.registerProfile(profile);
            loadedProfiles.add(profile.name);
            console.log(`Loaded profile: ${profile.name}${profile.verified ? ' (verified)' : ''}`);
          } else {
            console.warn(`Profile file ${file} does not contain a valid profile`);
          }
        } catch (error) {
          console.warn(`Failed to load profile from ${file}:`, error.message);
        }
      }
    } catch (error) {
      console.warn('Profiles directory not found, using no built-in profiles');
    }
  }

  /**
   * Register a planning profile
   * @param {Object} profile - The profile definition
   */
  async registerProfile(profile) {
    const validation = this.validateProfile(profile);
    if (!validation.isValid) {
      throw new Error(`Invalid profile ${profile.name}: ${validation.errors.join(', ')}`);
    }

    this.profiles.set(profile.name, profile);
  }

  /**
   * Get a profile by name
   * @param {string} name - Profile name
   * @returns {Object|null} The profile or null if not found
   */
  getProfile(name) {
    return this.profiles.get(name) || null;
  }

  /**
   * List all available profiles
   * @returns {Array} Array of profile information
   */
  listProfiles() {
    return Array.from(this.profiles.values()).map(profile => ({
      name: profile.name,
      description: profile.description,
      requiredModules: profile.requiredModules || [],
      actionCount: profile.allowableActions?.length || 0
    }));
  }

  /**
   * Prepare a profile for planning by ensuring required modules are loaded
   * @param {string} profileName - Name of the profile to prepare
   * @returns {Object} Prepared profile with resolved tools
   */
  async prepareProfile(profileName) {
    const profile = this.getProfile(profileName);
    if (!profile) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    console.log(`Preparing profile: ${profileName}`);

    // For now, just return the profile - module loading will be handled
    // by the user through the module_load command before using the profile
    const preparedProfile = {
      ...profile,
      preparedAt: new Date().toISOString()
    };

    return preparedProfile;
  }

  /**
   * Create planning context from profile
   * @param {Object} profile - The prepared profile
   * @param {string} description - User's planning request
   * @returns {Object} Planning context for LLM planner
   */
  createPlanningContext(profile, description) {
    // Convert JSON profile actions to planner format
    const convertedActions = (profile.allowableActions || []).map(action => {
      // Check if inputs/outputs are already arrays (old format) or objects (new JSON format)
      let inputKeys, outputKeys;
      
      if (Array.isArray(action.inputs)) {
        // Old format - already arrays
        inputKeys = action.inputs;
      } else {
        // New JSON format - extract keys from objects
        inputKeys = Object.keys(action.inputs || {});
      }
      
      if (Array.isArray(action.outputs)) {
        // Old format - already arrays
        outputKeys = action.outputs;
      } else {
        // New JSON format - extract keys from objects
        outputKeys = Object.keys(action.outputs || {});
      }
      
      const convertedAction = {
        type: action.type,
        description: action.description,
        inputs: inputKeys,
        outputs: outputKeys
      };
      
      // Preserve tool and function fields if present (needed for execution)
      if (action.tool) {
        convertedAction.tool = action.tool;
      }
      if (action.function) {
        convertedAction.function = action.function;
      }
      
      return convertedAction;
    });

    const context = {
      description: description,
      inputs: profile.defaultInputs || ['user_request'],
      requiredOutputs: profile.defaultOutputs || ['completed_task'],
      allowableActions: convertedActions,
      maxSteps: profile.maxSteps || 20,
      initialInputData: {
        user_request: description,
        profile_context: profile.contextPrompts?.join('\n') || ''
      }
    };

    // Add profile-specific context to the description
    if (profile.contextPrompts && profile.contextPrompts.length > 0) {
      context.description = `${profile.contextPrompts.join('\n')}\n\nTask: ${description}`;
    }

    console.log(`Created planning context for profile ${profile.name}:`);
    console.log(`- Actions: ${context.allowableActions.length}`);
    console.log(`- Max steps: ${context.maxSteps}`);
    console.log(`- Context prompts: ${profile.contextPrompts?.length || 0}`);

    return context;
  }

  /**
   * Validate a profile definition
   * @param {Object} profile - Profile to validate
   * @returns {Object} Validation result
   */
  validateProfile(profile) {
    const errors = [];

    if (!profile.name || typeof profile.name !== 'string') {
      errors.push('Profile must have a string name');
    }

    if (!profile.toolName || typeof profile.toolName !== 'string') {
      errors.push('Profile must have a string toolName');
    } else if (!/^[a-z][a-z0-9_]*$/.test(profile.toolName)) {
      errors.push('toolName must start with lowercase letter and contain only lowercase letters, numbers, and underscores');
    }

    if (!profile.description || typeof profile.description !== 'string') {
      errors.push('Profile must have a string description');
    }

    if (profile.requiredModules && !Array.isArray(profile.requiredModules)) {
      errors.push('requiredModules must be an array');
    }

    if (!profile.allowableActions || !Array.isArray(profile.allowableActions)) {
      errors.push('allowableActions must be an array and is required');
    } else {
      for (let i = 0; i < profile.allowableActions.length; i++) {
        const action = profile.allowableActions[i];
        if (!action.type || typeof action.type !== 'string') {
          errors.push(`allowableActions[${i}] must have a string type`);
        }
        if (!action.description || typeof action.description !== 'string') {
          errors.push(`allowableActions[${i}] must have a string description`);
        }
        if (!action.inputs || typeof action.inputs !== 'object') {
          errors.push(`allowableActions[${i}] must have inputs object`);
        }
        if (!action.outputs || typeof action.outputs !== 'object') {
          errors.push(`allowableActions[${i}] must have outputs object`);
        }
      }
    }

    if (profile.contextPrompts && !Array.isArray(profile.contextPrompts)) {
      errors.push('contextPrompts must be an array');
    }

    if (profile.maxSteps && (typeof profile.maxSteps !== 'number' || profile.maxSteps < 1)) {
      errors.push('maxSteps must be a positive number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export { ProfileManager };