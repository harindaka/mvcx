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
        expressApp: require('express')()
    }*/
    app.initialize(function(error, result) {
        if (error) {
            app.logger.info('Tests failed.');
            app.logger.error(error);
        }
        else {
            var httpServer = app.createHttpServer();
            /*
             Alternatively a https server can be created as follows

             var fs = require('fs');
             var options = {
                key: fs.readFileSync('test/fixtures/keys/agent2-key.pem'),
                cert: fs.readFileSync('test/fixtures/keys/agent2-cert.cert')
             }
             var httpsServer = app.createHttpsServer(options);
             */
            var websocket = app.createWebSocket(httpServer);

            var hooks = result.config.mvcx.hooks;

            var iocContainer = hooks.ioc;
            iocContainer.register('websocket', {value: websocket}, 'singleton');

            var expressApp = result.expressApp;

            //Register middleware using expressApp

            httpServer.listen(3000);
            //httpsServer.listen(443);


            app.logger.info('Tests completed.');
        }
    });
})();
