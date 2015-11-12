module.exports = {
  autoRoutesEnabled: true,

  clusteringEnabled: false,
  compressionEnabled: true,
  requestLimitKB: 5120,
  keepAliveTimeoutSeconds: 30,
  includeErrorStackInResponse: true,

  controllerSuffix: 'Controller',
  controllerPath: './Controllers',
  viewSuffix: 'View',
  viewPath: './Views',
  baseUrlPrefix: '',
  routes: null,

  loggerAppenders: [
      {
          type: "Console",
          options: {
              level: "silly",
              timestamp: true,
              handleExceptions: false,
              json: false,
              colorize: true,
              prettyPrint: true
          }
      }
  ],

  hooks: require('./Hooks')
};
