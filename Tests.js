module.exports = (function(){
    var MvcxApp = require('./index');

    var mvcxConfig = {
      clusteringEnabled: false,
      compressionEnabled: true,
      requestLimitKB: 5120,
      keepAliveTimeoutSeconds: 30,
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
      ]
    };

    var app = new MvcxApp(mvcxConfig);
    app.initialize(function(err, result){
      if(err){
        throw err;
      }
      else{
        var server = app.createHttpServer();
        var socketio = app.createWebSocketServer(server);

        server.listen(1234);

        app.logger.info('Tests complete');
      }
    });
})();
