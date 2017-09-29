module.exports = (function() {
    
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
    let applicationFactory = new mvcx.ApplicationFactory(options, (container) => {
        container.register('fs', require('fs'), 'singleton');
    });
    
    applicationFactory.create((error, app) => {
        if (error) {
            console.log('Failed to create mvcx application due to error: ' + error.message);
            console.log(error);
            process.exit();
        }        
        
        app.logger.info('Registering application dependencies...');
        container = app.container;
            
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
    });
})();
