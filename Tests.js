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
    app.initialize().then(function(config){
      app.logger.info('aaa');

      var server = app.createHttpServer();
      var websocket = app.createWebSocketServer(server);

      var iocContainer = config.mvcx.hooks.ioc;
      iocContainer.register({ name: 'websocket', dependency: websocket, lifestyle: 'singleton' })

      server.listen(1234);

      app.logger.info('Tests completed.');

    }).catch(function(e){
      app.logger.info('Tests failed.');
      app.logger.error(e);
    });
})();
