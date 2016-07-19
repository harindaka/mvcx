module.exports = (function() {
    var MvcxApp = require('../index');

    var configMetadata = {
        baseConfig: require('./Config'),
        environmentIndicatorVariable: 'MY_APP_ENV',
        environments: {
            dev: './Config.dev',
            qa: './Config.qa',
            prod: './Config.prod'
        }
    };

    var app = new MvcxApp(configMetadata); /* Pass optional second argument as {
        express: require('express')
    }*/
    app.initialize(function(error, result) {
        if (error) {
            app.logger.info('Tests failed.');
            app.logger.error(error);
        }
        else {
            var server = app.createHttpServer();
            var websocket = app.createWebSocketServer(server);

            var hooks = result.config.mvcx.hooks;

            var iocContainer = hooks.ioc;
            iocContainer.register('websocket', {value: websocket}, 'singleton');

            var express = result.express;

            //Register middleware

            app.loadRoutes();

            //Register middleware

            server.listen(3000);

            app.logger.info('Tests completed.');
        }
    });
})();
