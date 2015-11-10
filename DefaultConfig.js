module.exports = {
  clusteringEnabled: false,
  compressionEnabled: true,
  requestLimitKB: 5120,
  keepAliveTimeoutSeconds: 30,

  controllerPath: './Controllers',

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
