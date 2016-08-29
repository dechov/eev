module.exports = {
  entry: './src/main.js',
  output: { path: __dirname + '/dist', filename: 'main.js' },
  module: { loaders: [ { test: /\.jsx?$/, loader: 'babel' } ] },
  plugins: [ new require('copy-webpack-plugin')([ { from: './src/index.html' } ]) ],
}
