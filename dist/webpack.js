"use strict";
const esbuild = require('esbuild');
const fs = require('fs');
Object.defineProperty(exports, "__esModule", { value: true });
var events_1 = require("events");
var path_1 = require("path");
var logger_1 = require("./logger/logger");
var config_1 = require("./util/config");
var errors_1 = require("./util/errors");
var events_2 = require("./util/events");
var interfaces_1 = require("./util/interfaces");
var eventEmitter = new events_1.EventEmitter();
var INCREMENTAL_BUILD_FAILED = 'incremental_build_failed';
var INCREMENTAL_BUILD_SUCCESS = 'incremental_build_success';
let comp;
/*
 * Due to how webpack watch works, sometimes we start an update event
 * but it doesn't affect the bundle at all, for example adding a new typescript file
 * not imported anywhere or adding an html file not used anywhere.
 * In this case, we'll be left hanging and have screwed up logging when the bundle is modified
 * because multiple promises will resolve at the same time (we queue up promises waiting for an event to occur)
 * To mitigate this, store pending "webpack watch"/bundle update promises in this array and only resolve the
 * the most recent one. reject all others at that time with an IgnorableError.
 */
var pendingPromises = [];
function webpack(context, configFile) {
  configFile = config_1.getUserConfigFile(context, taskInfo, configFile);
  var logger = new logger_1.Logger('webpack');
  return webpackWorker(context, configFile)
    .then(function () {
      context.bundleState = interfaces_1.BuildState.SuccessfulBuild;
      logger.finish();
    })
    .catch(function (err) {
      context.bundleState = interfaces_1.BuildState.RequiresBuild;
      throw logger.fail(err);
    });
}
exports.webpack = webpack;
function webpackUpdate(changedFiles, context, configFile) {
  var logger = new logger_1.Logger('webpack update');
  var webpackConfig = getWebpackConfig(context, configFile);
  logger_1.Logger.debug('webpackUpdate: Starting Incremental Build');
  var promisetoReturn = runWebpackIncrementalBuild(false, context, webpackConfig);
  events_2.emit(events_2.EventType.WebpackFilesChanged, null);
  return promisetoReturn.then(function (stats) {
    // the webpack incremental build finished, so reset the list of pending promises
    pendingPromises = [];
    logger_1.Logger.debug('webpackUpdate: Incremental Build Done, processing Data');
    return webpackBuildComplete(stats, context, webpackConfig);
  }).then(function () {
    context.bundleState = interfaces_1.BuildState.SuccessfulBuild;
    return logger.finish();
  }).catch(function (err) {
    context.bundleState = interfaces_1.BuildState.RequiresBuild;
    if (err instanceof errors_1.IgnorableError) {
      throw err;
    }
    throw logger.fail(err);
  });
}
exports.webpackUpdate = webpackUpdate;
function webpackWorker(context, configFile) {
  var webpackConfig = getWebpackConfig(context, configFile);
  var promise = null;
  if (context.isWatch) {
    promise = runWebpackIncrementalBuild(!context.webpackWatch, context, webpackConfig);
  }
  else {
    promise = runWebpackFullBuild(context, webpackConfig);
  }
  return promise
    .then(function (stats) {
      return webpackBuildComplete(stats, context, webpackConfig);
    });
}
exports.webpackWorker = webpackWorker;
function webpackBuildComplete(stats, context, _webpackConfig) {
  const trimmedFiles = Object.values(stats)
    .reduce((acc, file) => {
      Object.keys(file.inputs).forEach(dep => {
        const path = context.rootDir + '/' + dep;
        if(!acc.has(path)) {
          acc.add(path);
        }
      });
      return acc;
    }, new Set());
  context.moduleFiles = [...trimmedFiles];
  
  // clear any stale files from the build directory so it stays clean
  new Promise(async(resolve) => {
    const files = await fs.promises.readdir(context.buildDir);
    Promise.all(
      files
        .filter(file => !stats.hasOwnProperty(`www/build/${file}`) && file !== 'main.css' && file !== 'polyfills.js')
        .map(file => fs.promises.unlink(`${context.buildDir}/${file}`))
    )
      .then(resolve);
  })
  return setBundledFiles(context);
}
function setBundledFiles(context) {
  var bundledFilesToWrite = context.fileCache.getAll().filter(function (file) {
    return path_1.dirname(file.path).indexOf(context.buildDir) >= 0 && (file.path.endsWith('.js') || file.path.endsWith('.js.map'));
  });
  context.bundledFilePaths = bundledFilesToWrite.map(function (bundledFile) { return bundledFile.path; });
}
exports.setBundledFiles = setBundledFiles;
function runWebpackFullBuild(context, _config) {
  return new Promise(function (resolve, reject) {
    esbuild.build(withContext(context))
      .then(result => resolve(result.metafile.outputs))
      .catch(err => {
        console.error(err);
        reject(new errors_1.BuildError(err));
      });
  });
}
exports.runWebpackFullBuild = runWebpackFullBuild;
function incrementalCallback(err, stats) {
  if (err) {
    eventEmitter.emit(INCREMENTAL_BUILD_FAILED, err);
  } else {
    eventEmitter.emit(INCREMENTAL_BUILD_SUCCESS, stats);
  }
}
function runWebpackIncrementalBuild(initializeWatch, context, config) {
  var promise = new Promise(function (resolve, reject) {
    // start listening for events, remove listeners once an event is received
    eventEmitter.on(INCREMENTAL_BUILD_FAILED, function (err) {
      logger_1.Logger.debug('Webpack Bundle Update Failed');
      eventEmitter.removeAllListeners();
      handleWebpackBuildFailure(resolve, reject, err, promise, pendingPromises);
    });
    eventEmitter.on(INCREMENTAL_BUILD_SUCCESS, function (stats) {
      logger_1.Logger.debug('Webpack Bundle Updated');
      eventEmitter.removeAllListeners();
      handleWebpackBuildSuccess(resolve, reject, stats, promise, pendingPromises);
    });
    if (initializeWatch) {
      startWebpackWatch(context, config);
    } else {
      comp.rebuild();
    }
  });
  pendingPromises.push(promise);
  return promise;
}
function handleWebpackBuildFailure(resolve, reject, error, promise, pendingPromises) {
  // check if the promise if the last promise in the list of pending promises
  if (pendingPromises.length > 0 && pendingPromises[pendingPromises.length - 1] === promise) {
    // reject this one with a build error
    console.error(error);
    reject(new errors_1.BuildError(error));
    return;
  }
  // for all others, reject with an ignorable error
  reject(new errors_1.IgnorableError());
}
function handleWebpackBuildSuccess(resolve, reject, stats, promise, pendingPromises) {
  // check if the promise if the last promise in the list of pending promises
  if (pendingPromises.length > 0 && pendingPromises[pendingPromises.length - 1] === promise) {
    logger_1.Logger.debug('handleWebpackBuildSuccess: Resolving with Webpack data');
    // console.log(stats.toString({ colors: true }));
    resolve(stats);
    return;
  }
  // for all others, reject with an ignorable error
  logger_1.Logger.debug('handleWebpackBuildSuccess: Rejecting with ignorable error');
  reject(new errors_1.IgnorableError());
}
const getPlugin = context => ({
  name: 'Build Plugin',
  setup(build) {
    // reroute to virtual files
    build.onLoad({ filter: /.*/ }, file => {
      if(!file.path.includes('/node_modules/')) {
        let contents = context.fileCache
          .get(file.path.replace('.ts', '.js'))
          .content;

        // if(file.path.includes('app.module.ts')) {
        //   contents = contents.replace(/loadChildren: '([\w\._\/-]+)#([\w_-]+)', name: '([\w_-]+)'/g, (_, path, exportedModule, name) => `loadChildren: () => import('${path}').then(mod => mod.${exportedModule}), name: '${name}'`);
        // }

        return {
          contents,
          loader: 'js'
        };
      }
    });

    build.onEnd(
      result => eventEmitter.emit(INCREMENTAL_BUILD_SUCCESS, result.metafile.outputs)
    );
  }
});

const withContext = context => ({
  entryPoints: [context.rootDir + '/src/app/main.ts'],
  outdir: context.wwwDir + '/build',
  bundle: true,
  splitting: true,
  format: 'esm',
  incremental: !context.isProd,
  plugins: [getPlugin(context)],
  resolveExtensions: ['.ts', '.js'],
  define: {
    global: 'window',
    this: 'globalThis'
  },
  logLevel: 'error',
  metafile: true,
  external: ['crypto'],
  publicPath: '/build',
  minify: context.isProd,
  inject: [
    require.resolve('@esbuild-plugins/node-globals-polyfill/buffer'),
    require.resolve('@esbuild-plugins/node-globals-polyfill/process')
  ]
});

async function startWebpackWatch(context) {
  logger_1.Logger.debug('Starting Webpack watch');

  comp = await esbuild.build(withContext(context))
    .catch(e => incrementalCallback(e));
}

function getWebpackConfig(context, configFile) {
  configFile = config_1.getUserConfigFile(context, taskInfo, configFile);
  var webpackConfigDictionary = config_1.fillConfigDefaults(configFile, taskInfo.defaultConfigFile);
  var webpackConfig = getWebpackConfigFromDictionary(context, webpackConfigDictionary);
  webpackConfig.entry = config_1.replacePathVars(context, webpackConfig.entry);
  webpackConfig.output.path = config_1.replacePathVars(context, webpackConfig.output.path);
  return webpackConfig;
}
exports.getWebpackConfig = getWebpackConfig;
function getWebpackConfigFromDictionary(context, webpackConfigDictionary) {
  // todo, support more ENV here
  if (context.runAot) {
    return webpackConfigDictionary['prod'];
  }
  return webpackConfigDictionary['dev'];
}
exports.getWebpackConfigFromDictionary = getWebpackConfigFromDictionary;
function getOutputDest(context) {
  var webpackConfig = getWebpackConfig(context, null);
  return path_1.join(webpackConfig.output.path, webpackConfig.output.filename);
}
exports.getOutputDest = getOutputDest;
var taskInfo = {
  fullArg: '--webpack',
  shortArg: '-w',
  envVar: 'IONIC_WEBPACK',
  packageConfig: 'ionic_webpack',
  defaultConfigFile: 'webpack.config'
};