import argparse from 'argparse';
import yaml from 'node-yaml';

import {flatten} from 'vph_js_utils/vph-utils.mjs'

export default class OptionsParser {

    /**
     * @param {object} config - A configuration to populate with option values.
     * @param {string} env_prefix - An environment variable prefix for environment variable options.
     * @param {object} config_help - An object whose values describe the options of `config`.
     * @param {string} config_file_path - The path of a configuration file.
     */
    constructor(config, env_prefix, config_help = {}, config_file_path = './config.yaml') {
        this._config = config;
        this._flattened_config = undefined;
        this.env_prefix = env_prefix;
        this.config_help = config_help;
        this.config_file_path = config_file_path;
    }

    /**
     * Return a flattened version of the `this._config` configuration.
     *
     * The first time this method is called, the produced flattened version is cached in a variable.
     *
     * @returns {object} - A flattened version of `this._config` configuration.
     */
    get flattened_config() {
        return this._flattened_config !== undefined
            ? this._flattened_config
            : (this._flattened_config = flatten(this._config))
        ;
    }

    /**
     * Generate an argument parser.
     *
     * The method transforms the flattened keys of the `this._config` configuration to long argument options. Help text
     * for each option is read from `this.config_help`.
     *
     * @returns {argparse.ArgumentParser} - An argument parser corresponding to the `this._config` configuration.
     * @private
     */
    _init_argparser() {
        const flattened_config_help = flatten(this.config_help);
        const parser = new argparse.ArgumentParser();

        for (const key of Object.keys(this.flattened_config)) {
            parser.addArgument(
                `--${key.replace(/\./g, '_')}`, {
                    dest: key,
                    help: flattened_config_help[key] !== undefined ? flattened_config_help[key] : ''
                }
            );
        }

        return parser;
    }

    /**
     * Set the fields corresponding to `flattened_key` in flattened config and actual config to `value`.
     *
     * @param {string} flattened_key - The flattened key of the option field to set.
     * @param value - The value to set.
     * @private
     */
    _set_option(flattened_key, value) {
        const [config_section, key] = this._config_path(flattened_key);
        config_section[key] = value;
        this.flattened_config[flattened_key] = value;
    }

    /**
     * Resolve a flattened object key to the actual section (i.e. a nested object) and key.
     *
     * @param {string} flattened_object_key - A flattened object key.
     * @returns
     * @private
     */
    _config_path(flattened_object_key) {
        const path_segments = flattened_object_key.split('.');
        let config_section = this._config;
        for (const path_segment of path_segments.slice(0, -1))
            config_section= config_section[path_segment];

        return [config_section, path_segments.slice(-1)];
    }

    /**
     * Read a YAML configuration file at a specified path and write the options to the configuration `this.config`.
     *
     * @private
     */
    _read_config_file() {
        try {
            const file_config = yaml.readSync(this.config_file_path);

            if (file_config === undefined)
                return;

            for (const [flattened_key, value] of Object.entries(flatten(file_config))) {
                if (value === '')
                    continue;

                this._set_option(flattened_key, value);
            }
        } catch (msg) {
            console.warn(msg);
        }
    }

    /**
     * Read options from environment variables to the configuration `this.config`.
     *
     * The names of the variables are generated using `this.env_prefix`; the resulting names have the format
     * <env_prefix>_<flattened_key_path>.
     *
     * @private
     */
    _read_environment() {
        // TODO: Those keys are not flattened?
        for (const flattened_key of Object.keys(this._config)) {
            const value = process.env[`${this.env_prefix}_${flattened_key.replace(/\./g, '_').toUpperCase()}`];
            if (value === undefined)
                continue;

            this._set_option(flattened_key, value);
        }
    }

    /**
     * Read and parse options provided from the command line to the configuration `this.config`.
     *
     * @private
     */
    _read_args() {
        const args = this._init_argparser().parseArgs();

        // TODO: This does not work.
        for (const [arg_key, value] of Object.entries(args)) {
            if (value === null)
                continue;

            this._set_option(arg_key, value);
        }
    }

    /**
     * Verify that no options of the configuration are unset.
     *
     * @returns {boolean} - Whether the configuration does not have any options unset.
     * @private
     */
    _verify_config() {
        let config_ok = true;
        for (const [key, value] of Object.entries(this.flattened_config)) {
            if (value === '') {
                console.warn(`${key} is empty.`);
                config_ok = false
            }
        }

        return config_ok;
    }

    /**
     * Read options from multiple sources - populate a config - and verify that no options are unset.
     *
     * The order of priority is:
     *  (1): Arguments
     *  (2): Environment variables
     *  (3): A configuration file
     *
     * @returns {boolean}
     */
    read() {
        this._read_config_file();
        this._read_environment();
        this._read_args();

        return this._verify_config();
    }
}