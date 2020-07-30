const path = require('path');
const webpack = require('webpack');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const SAMPLE_ROOT = path.join(__dirname, 'sample');
const SRC = path.join(SAMPLE_ROOT, 'src');

module.exports = {
  mode: 'development',

  entry: {
    app: SRC,
  },

  output: {
    path: path.join(SAMPLE_ROOT, 'dist'),
    filename: '[name].js',
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },

  devServer: {
    port: process.env.PORT || '3200',
    overlay: true,
  },

  devtool: 'eval-cheap-module-source-map',

  module: {
    rules: [
      {
        test: /\.tsx?/,
        include: SRC,
        use: [
          {
            loader: 'ts-loader',
            options: { configFile: 'tsconfig.sample.json' },
          },
        ],
      },
    ],
  },

  plugins: [
    new CleanWebpackPlugin(),

    new HtmlWebpackPlugin({
      template: path.join(SAMPLE_ROOT, 'index.html'),
    }),
  ],
};
