const autobind = require('autobind-decorator')
const Command = require('./command')
const { isNotFile, isNotDirectory, isBlank } = require('./utils')
const jetpack = require('fs-jetpack')
const { without, map, flatten } = require('ramda')

const PACKAGE_FILENAME = 'package.json'
const ROOT_KEY = 'staplegun'

/**
 * The plugin's loading stage.
 *
 * none  = the plugin has not been loaded
 * ok    = we're ready to go
 * error = something horrible has happened
 */
// export type PluginLoadState = 'none' | 'ok' | 'error'

/**
 * The error state.
 *
 * none           = no problems
 * input          = invalid directory input
 * missingdir     = can't find the plugin directory
 * missingpackage = can't find package.json
 * badpackage     = the package.json is invalid
 * namespace      = the package.json is missing namespace
 */
// export type PluginErrorState =
//   'none' | 'input' | 'missingdir' | 'missingpackage' |
//   'badpackage' | 'namespace'

/**
 * Extends the environment with new commands.
 */
class Plugin {

  constructor () {
    this.reset()
  }

  reset () {
    this.namespace = null
    this.loadState = 'none'
    this.errorState = 'none'
    this.defaults = {}
    this.directory = null
    this.errorMessage = null
    this.commands = []
  }

  /**
   * Loads a plugin from a directory.
   */
  loadFromDirectory (directory) {
    this.reset()

    // sanity check
    if (isBlank(directory)) {
      this.loadState = 'error'
      this.errorState = 'input'
      return
    }

    // directory check
    if (isNotDirectory(directory)) {
      this.loadState = 'error'
      this.errorState = 'missingdir'
      return
    }

    this.directory = directory

    // check for package.json
    const packagePath = `${directory}/${PACKAGE_FILENAME}`
    if (isNotFile(packagePath)) {
      this.loadState = 'error'
      this.errorState = 'missingpackage'
      return
    }

    // Load 'er up
    try {
      // read the file
      const pkg = jetpack.read(packagePath, 'json')
      const root = pkg[ROOT_KEY]
      if (!root) throw new Error('missing root key')

      // validate the namespace
      if (isBlank(root.namespace)) {
        this.loadState = 'error'
        this.errorState = 'namespace'
        return
      }

      // read the defaults & commands
      this.namespace = root.namespace
      this.defaults = root.defaults || {}
      // grab the commands from the package.json
      const commandsFromConfig = map(this.loadCommandFromConfig, root.commands || [])

      // grab the commands from the commands sub directory
      const commandFiles = jetpack.cwd(this.directory).find({ matching: 'commands/*.js' })
      const commandsFromCommandsDir = map(this.loadCommandFromFile, commandFiles)

      // glue them together
      this.commands = without([null], flatten([commandsFromConfig, commandsFromCommandsDir]))

      // we are good!
      this.loadState = 'ok'
      this.errorState = 'none'
      this.errorMessage = null
    } catch (e) {
      this.loadState = 'error'
      this.errorState = 'badpackage'
    }
  }

  /**
   * Loads a command based on the entry in the package.json
   */
  loadCommandFromConfig (config) {
    const command = new Command()
    const { name, file, functionName, description } = config
    command.name = name
    command.description = description
    if (this.directory) {
      const fullpath = `${this.directory}/${file}`
      command.loadFromFile(fullpath, functionName)
    }
    return command
  }

  /**
   * Loads a command from a file, attempting to use tokens to auto-detect.
   * @param {?string} filename The relative path to the file.
   */
  loadCommandFromFile (file) {
    const command = new Command()
    if (this.directory) {
      const fullpath = `${this.directory}/${file}`
      command.loadFromFile(fullpath)
    }
    return command
  }

}

module.exports = autobind(Plugin)
