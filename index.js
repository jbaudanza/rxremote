require('babel-polyfill')
module.exports = {
  Client: require('./lib/client').default,
  Server: require('./lib/server').default
};
