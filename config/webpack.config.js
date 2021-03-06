/*
 * The webpack config exports an object that has a valid webpack configuration
 * For each environment name. By default, there are two Ionic environments:
 * "dev" and "prod". As such, the webpack.config.js exports a dictionary object
 * with "keys" for "dev" and "prod", where the value is a valid webpack configuration
 * For details on configuring webpack, see their documentation here
 * https://webpack.js.org/configuration/
 */

const path = require('path');

const ionicWebpackFactory = require(process.env.IONIC_WEBPACK_FACTORY);
const Dotenv = require('dotenv-webpack');
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin")

const { PurifyPlugin } = require('@angular-devkit/build-optimizer');

const optimizedProdLoaders = [
  {
    test: /\.js$/,
    use: [
      {
        loader: process.env.IONIC_CACHE_LOADER
      },

      {
        loader: '@angular-devkit/build-optimizer/webpack-loader',
        options: {
          sourceMap: true
        }
      },
    ]
  },
  {
    test: /\.ts$/,
    use: [
      {
        loader: process.env.IONIC_CACHE_LOADER
      },

      {
        loader: '@angular-devkit/build-optimizer/webpack-loader',
        options: {
          sourceMap: true
        }
      },

      {
        loader: process.env.IONIC_WEBPACK_LOADER
      }
    ]
  }
];

function getProdLoaders() {
  if (process.env.IONIC_OPTIMIZE_JS === 'true') {
    return optimizedProdLoaders;
  }
  return devConfig.module.loaders;
}

const common = {
  target: 'web',
  devtool: process.env.IONIC_SOURCE_MAP_TYPE,
  entry: process.env.IONIC_APP_ENTRY_POINT,
  output: {
    path: '{{BUILD}}',
    publicPath: 'build/',
    filename: '[name].js',
    devtoolModuleFilenameTemplate: ionicWebpackFactory.getSourceMapperFunction(),
  },
  optimization: {
    splitChunks: {
      // chunks: 'initial',
      cacheGroups: {
        vendor: {
          name: 'vendor',
          test: /[\\/]node_modules[\\/]/,
          chunks: 'all'
        }
      }
    }
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    modules: [path.resolve('node_modules')],
    fallback: {
      stream: false
    }
  }
};

const devConfig = {
  ...common,
  mode: 'development',

  // keeps Webpack's cache from reflecting stale files
  snapshot: {
    module: {
      timestamp: false,
      hash: true
    }
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: process.env.IONIC_WEBPACK_LOADER
      }
    ]
  },

  plugins: [
    new Dotenv({
      path: '.env.dev', // load this now instead of the ones in '.env'
      systemvars: true, // load all the predefined 'process.env' variables which will trump anything local per dotenv specs.
      silent: true // hide any errors
    }),
    new NodePolyfillPlugin(),
    ionicWebpackFactory.getIonicEnvironmentPlugin()
  ]
};

const prodConfig = {
  ...common,
  mode: 'production',

  module: {
    rules: getProdLoaders()
  },

  plugins: [
    new Dotenv({
      path: '.env.prod', // load this now instead of the ones in '.env'
      systemvars: true, // load all the predefined 'process.env' variables which will trump anything local per dotenv specs.
      silent: true // hide any errors
    }),
    new NodePolyfillPlugin(),
    ionicWebpackFactory.getIonicEnvironmentPlugin(),
    new PurifyPlugin()
  ]
};


module.exports = {
  dev: devConfig,
  prod: prodConfig
}