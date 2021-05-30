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

const { ProvidePlugin } = require('webpack');
const { PurifyPlugin } = require('@angular-devkit/build-optimizer');

const optimizedProdLoaders = [
  {
    test: /\.js$/,
    loader: [
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
    loader: [
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

var devConfig = {
  mode: 'development',
  entry: process.env.IONIC_APP_ENTRY_POINT,
  output: {
    path: '{{BUILD}}',
    publicPath: 'build/',
    filename: '[name].js',
    devtoolModuleFilenameTemplate: ionicWebpackFactory.getSourceMapperFunction(),
  },
  devtool: process.env.IONIC_SOURCE_MAP_TYPE,

  resolve: {
    extensions: ['.ts', '.js', '.json'],
    modules: [path.resolve('node_modules')],
    fallback: {
      stream: false
    }
  },

  externals: {
    systemjs: 'System'
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: process.env.IONIC_WEBPACK_LOADER
      },
      {
        test: require.resolve('systemjs'),
        loader: 'expose-loader',
        options: {
          exposes: {
            globalName: 'System',
            override: true
          }
        }
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
    new ProvidePlugin({
      System: 'systemjs'
    }),
    ionicWebpackFactory.getIonicEnvironmentPlugin()
  ],

  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          name: 'vendor',
          test: /[\\/]node_modules[\\/]/,
          chunks: 'all'
        },
        // pages: {
        //   name: file => file.split('/').reduceRight(name => name),
        //   test: /[\\/]src[\\/]pages[\\/]/,
        //   chunks: 'all'
        // }
      }
    }
  }
};

var prodConfig = {
  mode: 'production',
  entry: process.env.IONIC_APP_ENTRY_POINT,
  output: {
    path: '{{BUILD}}',
    publicPath: 'build/',
    filename: '[name].js',
    devtoolModuleFilenameTemplate: ionicWebpackFactory.getSourceMapperFunction(),
  },
  devtool: process.env.IONIC_SOURCE_MAP_TYPE,

  resolve: {
    extensions: ['.ts', '.js', '.json'],
    modules: [path.resolve('node_modules')],
    fallback: {
      stream: false
    }
  },

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
  ],

  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          name: 'vendor',
          test: /[\\/]node_modules[\\/]/,
          chunks: 'all'
        }
      }
    }
  }
};


module.exports = {
  dev: devConfig,
  prod: prodConfig
}