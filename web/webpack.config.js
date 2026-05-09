// @ts-check
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack');

/** @param {Record<string, unknown>} _env @param {{ mode: string }} argv */
module.exports = (_env, argv) => {
  const isProd = argv.mode === 'production';

  // Federation host name for the reusable indexer remote.
  // Consuming apps load `mws_indexer/IndexerApp` from the deployed remoteEntry.js.
  const FEDERATION_NAME = 'mws_indexer';

  return {
    entry: './src/main.tsx',

    output: {
      path: path.resolve(__dirname, 'dist'),
      // Content-hash filenames in production for long-term caching.
      filename: isProd ? '[name].[contenthash].js' : '[name].js',
      chunkFilename: isProd ? '[name].[contenthash].js' : '[name].js',
      // 'auto' lets the federation runtime resolve chunk URLs relative to where
      // remoteEntry.js was loaded from. Required for federation: when a consumer
      // at a different origin (e.g. localhost:8080) loads remoteEntry.js from
      // this SWA, chunks must load from the SWA — not from the consumer's origin.
      // PUBLIC_PATH env var (if set) overrides — used for CI deployments to
      // pin a specific absolute URL.
      publicPath: process.env.PUBLIC_PATH || 'auto',
      clean: true,
    },

    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },

    module: {
      rules: [
        // TypeScript / JSX — transpiled by Babel; type-checking is handled
        // separately by ForkTsCheckerWebpackPlugin in parallel.
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                ['@babel/preset-react', { runtime: 'automatic' }],
                '@babel/preset-typescript',
              ],
            },
          },
        },

        // CSS Modules — scoped styles used by all components.
        {
          test: /\.module\.css$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            {
              loader: 'css-loader',
              options: {
                // Use CommonJS-style exports so the default import resolves
                // correctly regardless of how babel-loader handles ES modules.
                esModule: false,
                modules: {
                  // Readable class names in dev; hashed in production.
                  localIdentName: isProd ? '[hash:base64]' : '[local]__[hash:base64:5]',
                },
              },
            },
          ],
        },

        // SCSS Modules — scoped styles for components using Sass.
        {
          test: /\.module\.scss$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                modules: {
                  localIdentName: isProd ? '[hash:base64]' : '[local]__[hash:base64:5]',
                },
              },
            },
            'sass-loader',
          ],
        },

        // Global CSS (e.g. src/styles/global.css).
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            { loader: 'css-loader', options: { esModule: false } },
          ],
        },

        // Global SCSS (e.g. src/styles/global.scss).
        {
          test: /\.scss$/,
          exclude: /\.module\.scss$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            { loader: 'css-loader', options: { esModule: false } },
            'sass-loader',
          ],
        },

        {
          test: /\.(png|jpe?g|gif|svg|webp|woff2?)$/i,
          type: 'asset/resource',
          generator: {
            filename: isProd ? 'assets/[name].[contenthash][ext]' : 'assets/[name][ext]',
          },
        },
      ],
    },

    plugins: [
      // Module Federation — exposes the indexer as a remote that consuming
      // apps load at runtime. React + ReactDOM are shared as strict singletons
      // so only one React copy ever runs at a time. See
      // /docs/architecture/module-boundaries.md §1.
      new ModuleFederationPlugin({
        name: FEDERATION_NAME,
        filename: 'remoteEntry.js',
        exposes: {
          './IndexerApp': './src/IndexerApp/index.tsx',
          './types': './src/host/types.ts',
        },
        shared: {
          react: { singleton: true, requiredVersion: false, eager: false },
          'react-dom': { singleton: true, requiredVersion: false, eager: false },
          'react-dom/client': { singleton: true, requiredVersion: false, eager: false },
        },
      }),

      // Injects the bundled scripts into index.html automatically.
      new HtmlWebpackPlugin({ template: './index.html' }),

      // Expose environment variables to the browser bundle.
      // Only whitelisted variables are forwarded — never forward the entire process.env.
      // MSAL_CLIENT_ID and friends are read by src/host/realHost.ts in `?real=1` mode.
      new webpack.DefinePlugin({
        'process.env.APPLICATIONINSIGHTS_CONNECTION_STRING': JSON.stringify(
          process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || '',
        ),
        'process.env.MSAL_CLIENT_ID': JSON.stringify(process.env.MSAL_CLIENT_ID || ''),
        'process.env.MSAL_TENANT_ID': JSON.stringify(process.env.MSAL_TENANT_ID || ''),
        'process.env.API_BASE_URL': JSON.stringify(process.env.API_BASE_URL || ''),
      }),

      // Runs TypeScript type-checking in a separate worker so it does not
      // block the webpack compilation.
      new ForkTsCheckerWebpackPlugin(),

      // Extract CSS to separate files in production only.
      ...(isProd ? [new MiniCssExtractPlugin({ filename: '[name].[contenthash].css' })] : []),
    ],

    optimization: isProd
      ? {
          minimize: true,
          minimizer: [
            new TerserPlugin({
              terserOptions: {
                compress: {
                  // Strip all console.* calls and debugger statements from
                  // the production bundle.
                  drop_console: true,
                  drop_debugger: true,
                },
              },
            }),
          ],
          splitChunks: {
            cacheGroups: {
              // Split React + ReactDOM into a separate vendor chunk so it
              // can be cached independently from app code.
              vendor: {
                test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
                name: 'vendor',
                chunks: 'all',
              },
            },
          },
        }
      : {},

    devServer: {
      port: 5174,
      hot: true,
      // Required for client-side routing (SPA fallback).
      historyApiFallback: true,
      open: false,
    },

    // Inline source maps in dev for fast rebuilds; disabled in production.
    devtool: isProd ? false : 'eval-source-map',
  };
};
