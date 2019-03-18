'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var debug_ = require('debug');

var debug = debug_('purs-loader');

var debugVerbose = debug_('purs-loader:verbose');

var loaderUtils = require('loader-utils');

var Promise = require('bluebird');

var path = require('path');

var PsModuleMap = require('./purs-module-map');

var compile = require('./compile');

var bundle = require('./bundle');

var ide = require('./ide');

var toJavaScript = require('./to-javascript');

var sourceMaps = require('./source-maps');

var dargs = require('./dargs');

var utils = require('./utils');

var spawn = require('cross-spawn').sync;

var eol = require('os').EOL;

var CACHE_VAR = {
  rebuild: false,
  deferred: [],
  bundleModules: [],
  ideServer: null,
  psModuleMap: null,
  warnings: [],
  errors: [],
  compilationStarted: false,
  compilationFinished: false,
  compilationFailed: false,
  installed: false,
  srcOption: []
};

module.exports = function purescriptLoader(source, map) {
  var _this = this;

  this.cacheable && this.cacheable();

  var webpackContext = this.options && this.options.context || this.rootContext;

  var callback = this.async();

  var loaderOptions = loaderUtils.getOptions(this) || {};

  var srcOption = function (pscPackage) {
    var srcPath = path.join('src', '**', '*.purs');

    var bowerPath = path.join('bower_components', 'purescript-*', 'src', '**', '*.purs');

    if (CACHE_VAR.srcOption.length > 0) {
      return CACHE_VAR.srcOption;
    } else if (pscPackage) {
      var pscPackageCommand = 'psc-package';

      var pscPackageArgs = ['sources'];

      var loaderSrc = loaderOptions.src || [srcPath];

      debug('psc-package %s %o', pscPackageCommand, pscPackageArgs);

      var cmd = spawn(pscPackageCommand, pscPackageArgs);

      if (cmd.error) {
        throw new Error(cmd.error);
      } else if (cmd.status !== 0) {
        var error = cmd.stdout.toString();

        throw new Error(error);
      } else {
        var result = cmd.stdout.toString().split(eol).filter(function (v) {
          return v != '';
        }).concat(loaderSrc);

        debug('psc-package result: %o', result);

        CACHE_VAR.srcOption = result;

        return result;
      }
    } else {
      var _result = loaderOptions.src || [bowerPath, srcPath];

      CACHE_VAR.srcOption = _result;

      return _result;
    }
  }(loaderOptions.pscPackage);

  var options = Object.assign({
    context: webpackContext,
    psc: null,
    pscArgs: {},
    pscBundle: null,
    pscBundleArgs: {},
    pscIdeClient: null,
    pscIdeClientArgs: {},
    pscIdeServer: null,
    pscIdeServerArgs: {},
    pscIde: false,
    pscIdeColors: loaderOptions.psc === 'psa',
    pscPackage: false,
    bundleOutput: 'output/bundle.js',
    bundleNamespace: 'PS',
    bundle: false,
    warnings: true,
    watch: false,
    output: 'output',
    src: []
  }, loaderOptions, {
    src: srcOption
  });

  if (!CACHE_VAR.installed) {
    debugVerbose('installing purs-loader with options: %O', options);

    CACHE_VAR.installed = true;

    // invalidate loader CACHE_VAR when bundle is marked as invalid (in watch mode)
    this._compiler.plugin('invalid', function () {
      debugVerbose('invalidating loader CACHE_VAR');

      CACHE_VAR = {
        rebuild: options.pscIde,
        deferred: [],
        bundleModules: [],
        ideServer: CACHE_VAR.ideServer,
        psModuleMap: CACHE_VAR.psModuleMap,
        warnings: [],
        errors: [],
        compilationStarted: false,
        compilationFinished: false,
        compilationFailed: false,
        installed: CACHE_VAR.installed,
        srcOption: []
      };
    });

    // add psc warnings to webpack compilation warnings
    this._compiler.plugin('after-compile', function (compilation, callback) {
      CACHE_VAR.warnings.forEach(function (warning) {
        compilation.warnings.push(warning);
      });

      CACHE_VAR.errors.forEach(function (error) {
        compilation.errors.push(error);
      });

      callback();
    });
  }

  var psModuleName = PsModuleMap.matchModule(source);

  var psModule = {
    name: psModuleName,
    source: source,
    load: function load(_ref) {
      var js = _ref.js,
          map = _ref.map;
      return callback(null, js, map);
    },
    reject: function reject(error) {
      return callback(error);
    },
    srcPath: this.resourcePath,
    remainingRequest: loaderUtils.getRemainingRequest(this),
    srcDir: path.dirname(this.resourcePath),
    jsPath: path.resolve(path.join(options.output, psModuleName, 'index.js')),
    options: options,
    cache: CACHE_VAR,
    emitWarning: function emitWarning(warning) {
      if (options.warnings && warning.length) {
        CACHE_VAR.warnings.push(warning);
      }
    },
    emitError: function emitError(pscMessage) {
      if (pscMessage.length) {
        var modules = [];

        var matchErrorsSeparator = /\n(?=Error)/;
        var errors = pscMessage.split(matchErrorsSeparator);
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = errors[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var error = _step.value;

            var matchErrLocation = /at (.+\.purs):(\d+):(\d+) - (\d+):(\d+) \(line \2, column \3 - line \4, column \5\)/;

            var _ref2 = matchErrLocation.exec(error) || [],
                _ref3 = _slicedToArray(_ref2, 2),
                filename = _ref3[1];

            if (!filename) continue;

            var baseModulePath = path.join(_this.rootContext, filename);
            _this.addDependency(baseModulePath);

            var foreignModulesErrorCodes = ['ErrorParsingFFIModule', 'MissingFFIImplementations', 'UnusedFFIImplementations', 'MissingFFIModule'];
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
              for (var _iterator2 = foreignModulesErrorCodes[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var code = _step2.value;

                if (error.includes(code)) {
                  var resolved = utils.resolveForeignModule(baseModulePath);
                  _this.addDependency(resolved);
                }
              }
            } catch (err) {
              _didIteratorError2 = true;
              _iteratorError2 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion2 && _iterator2.return) {
                  _iterator2.return();
                }
              } finally {
                if (_didIteratorError2) {
                  throw _iteratorError2;
                }
              }
            }

            var matchErrModuleName = /in module ((?:\w+\.)*\w+)/;

            var _ref4 = matchErrModuleName.exec(error) || [],
                _ref5 = _slicedToArray(_ref4, 2),
                baseModuleName = _ref5[1];

            if (!baseModuleName) continue;

            var matchMissingModuleName = /Module ((?:\w+\.)*\w+) was not found/;
            var matchMissingImportFromModuleName = /Cannot import value \w+ from module ((?:\w+\.)*\w+)/;
            var _arr = [matchMissingModuleName, matchMissingImportFromModuleName];
            for (var _i = 0; _i < _arr.length; _i++) {
              var re = _arr[_i];
              var _ref6 = re.exec(error) || [],
                  _ref7 = _slicedToArray(_ref6, 2),
                  targetModuleName = _ref7[1];

              if (targetModuleName) {
                var _resolved = utils.resolvePursModule({
                  baseModulePath: baseModulePath,
                  baseModuleName: baseModuleName,
                  targetModuleName: targetModuleName
                });
                _this.addDependency(_resolved);
              }
            }

            var desc = {
              name: baseModuleName,
              filename: baseModulePath
            };

            if (typeof _this.describePscError === 'function') {
              var _describePscError = _this.describePscError(error, desc),
                  _describePscError$dep = _describePscError.dependencies,
                  dependencies = _describePscError$dep === undefined ? [] : _describePscError$dep,
                  details = _describePscError.details;

              var _iteratorNormalCompletion3 = true;
              var _didIteratorError3 = false;
              var _iteratorError3 = undefined;

              try {

                for (var _iterator3 = dependencies[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                  var dep = _step3.value;

                  _this.addDependency(dep);
                }
              } catch (err) {
                _didIteratorError3 = true;
                _iteratorError3 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion3 && _iterator3.return) {
                    _iterator3.return();
                  }
                } finally {
                  if (_didIteratorError3) {
                    throw _iteratorError3;
                  }
                }
              }

              Object.assign(desc, details);
            }

            modules.push(desc);
          }
        } catch (err) {
          _didIteratorError = true;
          _iteratorError = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion && _iterator.return) {
              _iterator.return();
            }
          } finally {
            if (_didIteratorError) {
              throw _iteratorError;
            }
          }
        }

        CACHE_VAR.errors.push(new utils.PscError(pscMessage, modules));
      }
    }
  };

  debug('loading %s', psModule.name);

  if (options.bundle) {
    CACHE_VAR.bundleModules.push(psModule.name);
  }

  if (CACHE_VAR.rebuild) {
    var connect = function connect() {
      if (!CACHE_VAR.ideServer) {
        CACHE_VAR.ideServer = true;

        return ide.connect(psModule).then(function (ideServer) {
          CACHE_VAR.ideServer = ideServer;
          return psModule;
        }).then(ide.loadWithRetry).catch(function (error) {
          if (CACHE_VAR.ideServer.kill) {
            debug('ide failed to initially load modules, stopping the ide server process');

            CACHE_VAR.ideServer.kill();
          }

          CACHE_VAR.ideServer = null;

          return Promise.reject(error);
        });
      } else {
        return Promise.resolve(psModule);
      }
    };

    var rebuild = function rebuild() {
      return ide.rebuild(psModule).then(function () {
        return toJavaScript(psModule).then(function (js) {
          return sourceMaps(psModule, js);
        }).then(psModule.load).catch(psModule.reject);
      }).catch(function (error) {
        if (error instanceof ide.UnknownModuleError) {
          // Store the modules that trigger a recompile due to an
          // unknown module error. We need to wait until compilation is
          // done before loading these files.

          CACHE_VAR.deferred.push(psModule);

          if (!CACHE_VAR.compilationStarted) {
            CACHE_VAR.compilationStarted = true;

            return compile(psModule).then(function () {
              CACHE_VAR.compilationFinished = true;
            }).then(function () {
              return Promise.map(CACHE_VAR.deferred, function (psModule) {
                return ide.load(psModule).then(function () {
                  return toJavaScript(psModule);
                }).then(function (js) {
                  return sourceMaps(psModule, js);
                }).then(psModule.load);
              });
            }).catch(function (error) {
              CACHE_VAR.compilationFailed = true;

              CACHE_VAR.deferred[0].reject(error);

              CACHE_VAR.deferred.slice(1).forEach(function (psModule) {
                psModule.reject(new Error('purs-loader failed'));
              });
            });
          } else if (CACHE_VAR.compilationFailed) {
            CACHE_VAR.deferred.pop().reject(new Error('purs-loader failed'));
          } else {
            // The compilation has started. We must wait until it is
            // done in order to ensure the module map contains all of
            // the unknown modules.
          }
        } else {
          debug('ide rebuild failed due to an unhandled error: %o', error);

          psModule.reject(error);
        }
      });
    };

    connect().then(rebuild);
  } else if (CACHE_VAR.compilationFinished) {
    debugVerbose('compilation is already finished, loading module %s', psModule.name);

    toJavaScript(psModule).then(function (js) {
      return sourceMaps(psModule, js);
    }).then(psModule.load).catch(psModule.reject);
  } else {
    // The compilation has not finished yet. We need to wait for
    // compilation to finish before the loaders run so that references
    // to compiled output are valid. Push the modules into the CACHE_VAR to
    // be loaded once the complation is complete.

    CACHE_VAR.deferred.push(psModule);

    if (!CACHE_VAR.compilationStarted) {
      CACHE_VAR.compilationStarted = true;

      compile(psModule).then(function () {
        CACHE_VAR.compilationFinished = true;
      }).then(function () {
        if (options.bundle) {
          return bundle(options, CACHE_VAR.bundleModules);
        }
      }).then(function () {
        return Promise.map(CACHE_VAR.deferred, function (psModule) {
          return toJavaScript(psModule).then(function (js) {
            return sourceMaps(psModule, js);
          }).then(psModule.load);
        });
      }).catch(function (error) {
        CACHE_VAR.compilationFailed = true;

        CACHE_VAR.deferred[0].reject(error);

        CACHE_VAR.deferred.slice(1).forEach(function (psModule) {
          psModule.reject(new Error('purs-loader failed'));
        });
      });
    } else if (CACHE_VAR.compilationFailed) {
      CACHE_VAR.deferred.pop().reject(new Error('purs-loader failed'));
    } else {
      // The complation has started. Nothing to do but wait until it is
      // done before loading all of the modules.
    }
  }
};