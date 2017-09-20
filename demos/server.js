module.exports = (function() {
    // var MvcxApp = require('../src/index');

    // var options = {
    //     configuration: {
    //         base: require('./config'),
    //         current: 'dev',
    //         overrides: {
    //             dev: require('./config-dev'),
    //             // qa: require('./config-qa'),
    //             // prod: require('./config-prod')
    //         }
    //     }
    //     //express: require('express')() //To override the underlying express npm used by mvcx
    // }

    // var app = new MvcxApp(options, function(container){
    //     container.register('q', { value: require('q') }, 'singleton');
    // });

    //Register any middleware using app.express prior to mvcx initialization

    

    var options = {
        //express: require('express')(), //To override the underlying express npm used by mvcx
        configuration: {
            current: 'dev',
            base: require('./config'),            
            overrides: {
                dev: require('./config-dev'),
                // qa: require('./config-qa'),
                // prod: require('./config-prod')
            }
        }        
    }
    
    let mvcx = require('../src/index');
    mvcx.compose(options, () => {
        
    }).create((error, app) => {
        if (error) {
            console.log('Application composition failed due to error: ' + error.message);
            console.log(error);
            process.exit();
        }        
        
        app.logger.info('Registering application dependencies...');
        container = app.container;
        container.register('fs', { dep: require('fs') }, 'singleton');    
        container.register('config', { dep: app.config }, 'singleton');
        container.register('logger', { dep: app.logger }, 'singleton');

        app.logger.info('Starting Http server...');
        let httpServer = app.createHttp();

        /*
        Alternatively a https server can be created as follows

        let fs = require('fs');
        let options = {
        key: fs.readFileSync('test/fixtures/keys/agent2-key.pem'),
        cert: fs.readFileSync('test/fixtures/keys/agent2-cert.cert')
        }
        let httpsServer = app.createHttps(options);
        */

        app.logger.info('Starting Socket.IO...');
        let io = app.createSocketIO(httpServer);            
        container.register('io', { dep: io }, 'singleton');

        //Register middleware using app.express

        httpServer.listen(3000, () => {
            app.logger.info('Listening on http://localhost:3000');
        });
        //httpsServer.listen(443);

        //result.logger.info('');
    })

    // app.initialize(function(error, result) {
    //     if (error) {
    //         console.log('Tests failed.');
    //         console.log(error);
    //     }
    //     else {
    //         var httpServer = app.createHttpServer();
    //         /*
    //          Alternatively a https server can be created as follows

    //          var fs = require('fs');
    //          var options = {
    //             key: fs.readFileSync('test/fixtures/keys/agent2-key.pem'),
    //             cert: fs.readFileSync('test/fixtures/keys/agent2-cert.cert')
    //          }
    //          var httpsServer = app.createHttpsServer(options);
    //         */
    //         var websocket = app.createWebSocket(httpServer);

    //         var hooks = result.config.mvcx.hooks;

    //         var iocContainer = hooks.ioc;
    //         iocContainer.register('config', { value: result.config }, 'singleton');
    //         iocContainer.register('logger', { value: result.logger }, 'singleton');
    //         iocContainer.register('websocket', { value: websocket }, 'singleton');

    //         //Register middleware using app.express

    //         httpServer.listen(3000);
    //         //httpsServer.listen(443);

    //         result.logger.info('Tests completed.');
    //     }
    // });
})();
