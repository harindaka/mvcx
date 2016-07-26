module.exports = (function() {
    var MvcxApp = require('../index');

    var options = {
        configuration: {
            base: require('./config'),
            current: 'dev',
            overrides: {
                dev: require('./config-dev'),
                // qa: require('./config-qa'),
                // prod: require('./config-prod')
            }
        }
        //expressApp: require('express')() //To override the underlying express npm used by mvcx
    }

    var app = new MvcxApp(options, function(container){
        container.register('q', { value: require('q') }, 'singleton');
    });

    //Register any middleware using app.expressApp prior to mvcx initialization

    app.initialize(function(error, result) {
        if (error) {
            console.log('Tests failed.');
            console.log(error);
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
            iocContainer.register('config', { value: result.config }, 'singleton');
            iocContainer.register('logger', { value: result.logger }, 'singleton');
            iocContainer.register('websocket', { value: websocket }, 'singleton');

            //Register middleware using app.expressApp

            httpServer.listen(3000);
            //httpsServer.listen(443);

            result.logger.info('Tests completed.');
        }
    });
})();
