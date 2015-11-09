module.exports = (function(){
    var MvcxApp = require('./index');

    var configMetadata = {
      baseConfig: require('./Config'),
      environmentIndicatorVariable: 'MY_APP_ENV',
      environments: {
        dev: './Config.dev',
        qa: './Config.qa',
        prod: './Config.prod'
      }
    };

    var app = new MvcxApp(configMetadata);
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
